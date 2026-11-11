"""Remove the green background from plates with the BiRefNet 'v4' recipe the user chose for Precious's base plate.
  alpha  : BiRefNet general (ComfyUI's vendored model, loaded once)
  colour : solid pixels keep the picture's colour; see-through pixels take the nearest solid pixel's colour
  edge   : within 6 px of the outline, pixels greener than the skin 8 px inside (same material) are pulled to that inside
           colour at their own red level - removes the screen's green light painted onto the edge
usage: key_biref_v4.py <in_dir of green RGB plates> <out_dir>"""
import os, sys, glob, numpy as np, torch
from PIL import Image
from scipy.ndimage import distance_transform_edt
from safetensors.torch import load_file
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_birefnet as RB          # sets up the stub modules and imports ComfyUI's birefnet

def model():
    w=glob.glob('/Users/saizalpreetkaur./.cache/huggingface/hub/models--ZhengPeng7--BiRefNet/snapshots/*/model.safetensors')[0]
    dev='mps' if torch.backends.mps.is_available() else 'cpu'
    m=RB.bn.BiRefNet(operations=torch.nn,device='cpu',dtype=torch.float32)
    mi,un=m.load_state_dict(load_file(w),strict=False); assert not mi and not un
    return m.to(dev).eval(), dev

def alpha(m, dev, im):
    W,H=im.size
    x=np.asarray(im.convert('RGB').resize((1024,1024),Image.BILINEAR),np.float32)/255.
    x=(x-np.array([0.485,0.456,0.406],np.float32))/np.array([0.229,0.224,0.225],np.float32)
    with torch.no_grad(): p=m(torch.from_numpy(x).permute(2,0,1)[None].to(dev))
    p=p[-1] if isinstance(p,(list,tuple)) else p
    a=torch.sigmoid(p)[0,0].float().cpu().numpy()
    return np.asarray(Image.fromarray(a).resize((W,H),Image.BILINEAR),np.float64)

def v4(I, a):
    I=I.astype(np.float64)
    solid=a>=0.99; si=distance_transform_edt(~solid,return_indices=True)[1]
    F=I.copy(); part=(a>0.004)&~solid; F[part]=I[si[0],si[1]][part]; F[a<=0.004]=0
    fg=a>0.02; d=distance_transform_edt(fg)
    inner=d>=8; ii=distance_transform_edt(~inner,return_indices=True)[1]; ref=F[ii[0],ii[1]]
    r=np.maximum(F[...,0],1); rr=np.maximum(ref[...,0],1)
    greener=F[...,1]/r-ref[...,1]/rr
    same=np.abs(np.log((F[...,0]+10)/(F[...,2]+10))-np.log((ref[...,0]+10)/(ref[...,2]+10)))<0.35
    w=np.clip((greener-0.01)/0.05,0,1)*np.clip((6-d)/5,0,1)*fg*same
    F=F+w[...,None]*(ref*(F[...,0]/rr)[...,None]-F)
    return np.dstack([np.round(np.clip(F,0,255)),np.round(np.clip(a,0,1)*255)]).astype(np.uint8)

if __name__=='__main__':
    src,dst=sys.argv[1:3]; os.makedirs(dst,exist_ok=True)
    m,dev=model()
    fs=sorted(f for f in os.listdir(src) if f.endswith('.png'))
    for f in fs:
        im=Image.open(f'{src}/{f}').convert('RGB')
        Image.fromarray(v4(np.asarray(im),alpha(m,dev,im)),'RGBA').save(f'{dst}/{f}')
    print('keyed',len(fs))
