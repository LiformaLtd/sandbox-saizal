"""BiRefNet alpha for one green-screen plate, using ComfyUI's vendored BiRefNet (no trust_remote_code).

Loads comfy.background_removal.birefnet with torch.nn as the layer ops. The file calls three comfy
helpers; they are replaced with plain-torch equivalents (the shim the earlier session used):
  comfy.ops.cast_to_input        -> tensor moved to the input's dtype/device
  comfy.ops.CastBiasWeightContext -> yields the conv's own weight and bias
  optimized_attention_for_device -> plain scaled-dot-product attention
usage: run_birefnet.py <in.png> <out_alpha.png> [general|matting]
"""
import sys, glob, types, contextlib, importlib.util
import numpy as np, torch
import torch.nn.functional as F
from PIL import Image
from safetensors.torch import load_file

C='/Users/saizalpreetkaur./Desktop/Liforma_LTD/ComfyUI'
comfy=types.ModuleType('comfy'); comfy.__path__=[]
ops=types.ModuleType('comfy.ops')
ops.cast_to_input=lambda w,x,**k: w.to(dtype=x.dtype,device=x.device)
@contextlib.contextmanager
def _ctx(mod,x,offloadable=False):
    yield mod.weight.to(x.dtype), (mod.bias.to(x.dtype) if mod.bias is not None else None)
ops.CastBiasWeightContext=_ctx
comfy.ops=ops
attn=types.ModuleType('comfy.ldm.modules.attention')
def optimized_attention_for_device(device,mask=False,small_input=False):
    def f(q,k,v,heads,skip_output_reshape=False,skip_reshape=False,**kw):
        return F.scaled_dot_product_attention(q,k,v)            # (B,heads,N,d), like the comfy kernel with skip flags
    return f
attn.optimized_attention_for_device=optimized_attention_for_device
for name,m in {'comfy':comfy,'comfy.ops':ops,'comfy.ldm':types.ModuleType('comfy.ldm'),
               'comfy.ldm.modules':types.ModuleType('comfy.ldm.modules'),'comfy.ldm.modules.attention':attn}.items():
    sys.modules[name]=m
spec=importlib.util.spec_from_file_location('birefnet',f'{C}/comfy/background_removal/birefnet.py')
bn=importlib.util.module_from_spec(spec); spec.loader.exec_module(bn)

def alpha(path, variant='general'):
    repo={'general':'ZhengPeng7--BiRefNet','matting':'ZhengPeng7--BiRefNet-matting'}[variant]
    w=glob.glob(f'/Users/saizalpreetkaur./.cache/huggingface/hub/models--{repo}/snapshots/*/model.safetensors')[0]
    dev='mps' if torch.backends.mps.is_available() else 'cpu'
    m=bn.BiRefNet(operations=torch.nn,device='cpu',dtype=torch.float32)
    sd=load_file(w); missing,unexpected=m.load_state_dict(sd,strict=False)
    assert not missing and not unexpected, (missing[:5],unexpected[:5])
    m=m.to(dev).eval()
    im=Image.open(path).convert('RGB'); W,H=im.size
    x=np.asarray(im.resize((1024,1024),Image.BILINEAR),np.float32)/255.
    x=(x-np.array([0.485,0.456,0.406],np.float32))/np.array([0.229,0.224,0.225],np.float32)
    t=torch.from_numpy(x).permute(2,0,1)[None].to(dev)
    with torch.no_grad(): p=m(t)
    p=p[-1] if isinstance(p,(list,tuple)) else p
    a=torch.sigmoid(p)[0,0].float().cpu().numpy()
    return np.asarray(Image.fromarray(a).resize((W,H),Image.BILINEAR))

if __name__=='__main__':
    a=alpha(sys.argv[1], sys.argv[3] if len(sys.argv)>3 else 'general')
    Image.fromarray(np.uint8(np.round(np.clip(a,0,1)*255))).save(sys.argv[2])
    print('alpha written', a.shape, 'solid share', round(float((a>0.99).mean()),3))
