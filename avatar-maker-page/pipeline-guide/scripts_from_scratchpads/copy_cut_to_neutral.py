# Copy the user's eye-hole cut (sil cohortLandmarks lid dots) onto the neutral plate's lid dots, one pack at a time.
# neutral cohortLandmarks lid x,y := sil cohort x,y (text copied); neutral landmarks lid x,y moved by the same amount
# (through the local linear relation near each eye); z, iris dots, sil and close-up untouched. Text edit only.
import json, sys, shutil, numpy as np
ROOT='/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/'; BK='/Users/saizalpreetkaur./Desktop/Liforma_LTD/backups/'
RE=[263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466]; LE=[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]
for aid in sys.argv[1:]:
    p=f'{ROOT}source/avatars/{aid}/face-meshes.json'; tag='before-neutral-lid-dots-from-cut-20261103'
    shutil.copy2(p,f'{BK}{aid}_face-meshes.{tag}.json'); shutil.copy2(f'{ROOT}cdn.liforma.ai/dist/avatars/{aid}/face-meshes.bin',f'{BK}{aid}_face-meshes.bin.{tag}')
    raw=open(p,encoding='utf-8').read(); lines=raw.split('\n'); fm=json.loads(raw)
    V={v['id']:v for v in fm['visemes'] if 'error' not in v}
    def vline(vid):
        h=[i for i,l in enumerate(lines) if l.strip()==f'"id": "{vid}",']; assert len(h)==1,(aid,vid,h); return h[0]
    def astart(fr,key):
        for i in range(fr,len(lines)):
            s=lines[i].strip()
            if s==f'"{key}": [': return i
            if i>fr and s.startswith('"id": '): raise RuntimeError((aid,key))
    def rows(st,k):
        b=st+1+5*k; assert lines[b].strip()=='[' and lines[b+4].strip() in (']','],'),(aid,k); return b+1,b+2
    nL=astart(vline('neutral'),'landmarks'); nC=astart(vline('neutral'),'cohortLandmarks'); sC=astart(vline('sil'),'cohortLandmarks')
    nl=np.array(V['neutral']['landmarks'])[:,:2]; nc=np.array(V['neutral']['cohortLandmarks'])[:,:2]; sc=np.array(V['sil']['cohortLandmarks'])[:,:2]
    for st,arr in ((nL,nl),(nC,nc),(sC,sc)):
        for k in (0,33,263,477):
            xl,yl=rows(st,k); assert abs(float(lines[xl].strip().rstrip(','))-arr[k][0])<1e-12 and abs(float(lines[yl].strip().rstrip(','))-arr[k][1])<1e-12
    def put(line_no,text):
        ind=lines[line_no][:len(lines[line_no])-len(lines[line_no].lstrip())]; lines[line_no]=ind+text.rstrip(',')+','
    for idx in (RE,LE):
        c=nc[idx].mean(0); near=np.where(np.linalg.norm((nc-c)*1024,axis=1)<45)[0]
        A=np.c_[nc[near],np.ones(len(near))]; co,*_=np.linalg.lstsq(A,nl[near],rcond=None); Lin=co[:2].T
        for k in idx:
            sx,sy=rows(sC,k); cx,cy=rows(nC,k); lx,ly=rows(nL,k)
            put(cx,lines[sx].strip()); put(cy,lines[sy].strip())
            d=Lin@(sc[k]-nc[k]); new=nl[k]+d
            put(lx,f'{new[0]:.6f}'); put(ly,f'{new[1]:.6f}')
    out='\n'.join(lines); fm2=json.loads(out); V2={v['id']:v for v in fm2['visemes'] if 'error' not in v}
    LID=RE+LE
    for vid in V:
        for key in ('landmarks','cohortLandmarks'):
            if key not in V[vid]: continue
            for k in range(len(V[vid][key])):
                if vid=='neutral' and k in LID: continue
                assert V2[vid][key][k]==V[vid][key][k],(aid,vid,key,k)
    for k in LID:
        assert V2['neutral']['cohortLandmarks'][k][:2]==V['sil']['cohortLandmarks'][k][:2] and V2['neutral']['cohortLandmarks'][k][2]==V['neutral']['cohortLandmarks'][k][2]
        assert V2['neutral']['landmarks'][k][2]==V['neutral']['landmarks'][k][2]
    assert {k:v for k,v in fm2.items() if k!='visemes'}=={k:v for k,v in fm.items() if k!='visemes'}
    open(p,'w',encoding='utf-8').write(out)
    nmove=np.abs(np.array(V2['neutral']['landmarks'])[LID,:2]-nl[LID]).max()*1024
    print(aid,'ok | changed number lines',sum(1 for a,b in zip(raw.split('\n'),lines) if a!=b),'| picture-frame list moved max %.2f px'%nmove)
