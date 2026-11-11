"""Key every plate and install it as b.png in its image-lerp pair.
The 14 whole-plate outfits come from precious_plates_wholeplate, the other 20 from
precious_plates_mean. Anna's a.png is keyed from her source plate where the pair is new.
"""
import os, shutil, subprocess
W='/Users/saizalpreetkaur./Desktop/precious_plates_wholeplate'
M='/Users/saizalpreetkaur./Desktop/precious_plates_mean'
AN='/private/tmp/claude-501/-Users-saizalpreetkaur--Desktop-Liforma-LTD/d0d45727-3f75-4b82-8224-df92e4225f38/scratchpad/batch_pic1'
L='/Users/saizalpreetkaur./Desktop/Liforma_LTD/Liforma/liforma/sandbox/image-lerp/static/samples/pairs'
SP='/private/tmp/claude-501/-Users-saizalpreetkaur--Desktop-Liforma-LTD/19331641-3f9f-49e0-84b9-5780f06ab1ff/scratchpad'
BG='/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW_JOB/bg_Rem'
PY_='/Users/saizalpreetkaur./Desktop/Liforma_LTD/ComfyUI/.venv/bin/python3'
STG=f'{SP}/pk_in'; DST=f'{SP}/pk_out'
whole=set(f[:-4] for f in os.listdir(W) if f.endswith('.png'))
allm =sorted(f[:-4] for f in os.listdir(M) if f.endswith('.png'))
src={s:(f'{W}/{s}.png' if s in whole else f'{M}/{s}.png') for s in allm}
os.makedirs(STG,exist_ok=True); os.makedirs(DST,exist_ok=True)
for x in os.listdir(STG): os.remove(f'{STG}/{x}')
for s,p in src.items(): shutil.copy(p,f'{STG}/{s}.png')
need_anna=[s for s in allm if not os.path.exists(f'{L}/{s}/a.png')]
for s in need_anna: shutil.copy(f'{AN}/{s}.png',f'{STG}/ANNA__{s}.png')
print('keying %d precious + %d anna ...'%(len(src),len(need_anna)),flush=True)
r=subprocess.run([PY_,'remove_background.py','-i',STG,'-o',DST,'--mode','QUALITY'],cwd=BG,capture_output=True,text=True)
done=0
for s in allm:
    os.makedirs(f'{L}/{s}',exist_ok=True)
    if os.path.exists(f'{DST}/{s}.png'):
        shutil.copy(f'{DST}/{s}.png',f'{L}/{s}/b.png'); done+=1
    if s in need_anna and os.path.exists(f'{DST}/ANNA__{s}.png'):
        shutil.copy(f'{DST}/ANNA__{s}.png',f'{L}/{s}/a.png')
print('installed b.png for %d pairs'%done)
miss=[s for s in allm if not (os.path.exists(f'{L}/{s}/a.png') and os.path.exists(f'{L}/{s}/b.png'))]
print('incomplete:',miss if miss else 'none')
print('\nwhole-plate versions used for:', ', '.join(sorted(whole)))
