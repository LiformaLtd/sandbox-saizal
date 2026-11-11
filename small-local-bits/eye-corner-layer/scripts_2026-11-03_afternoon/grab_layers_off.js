// Pasted into the local player page (localhost:3005/exp_9bo7234l, Indigenous man 1d5b0001) on 3 Nov 2026 12:24 UTC.
// Grabs the face canvas six times, each time with one eye layer switched off (template -> marble, shade 0, corner
// patch off, lid shadow off, sparkle off), keeps the frame with the most white, and posts PNGs to the frame receiver
// on 127.0.0.1:3062 (../scripts_2026-11-03_night/grab/receiver.py). Copied from the session transcript. The
// __liformaSetInnerEye* switches are the local player's test hooks; __liformaSetInnerEyeCornerPatch exists only in
// the local checkout, not on GitHub main.
const RX='http://127.0.0.1:3062';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
window.__diagGrab = async function(name){
  const c=document.querySelector('canvas.liforma-face-canvas-top'); const W=c.width,H=c.height;
  const v=document.createElement('video'); v.muted=true; v.playsInline=true; v.srcObject=c.captureStream(60); await v.play();
  const out=document.createElement('canvas'); out.width=W; out.height=H; const x=out.getContext('2d',{willReadFrequently:true});
  const frames=[];
  for(let i=0;i<5;i++){ await sleep(160); await new Promise(r=>requestAnimationFrame(r)); x.drawImage(v,0,0,W,H);
    const d=x.getImageData(0,Math.round(H*0.1),W,Math.round(H*0.4)); let white=0;
    for(let k=0;k<d.data.length;k+=16){ if(d.data[k]>200&&d.data[k+1]>200&&d.data[k+2]>200&&d.data[k+3]>200) white++; }
    frames.push({white,img:x.getImageData(0,0,W,H)}); }
  frames.sort((a,b)=>b.white-a.white); x.putImageData(frames[0].img,0,0);
  const blob=await new Promise(r=>out.toBlob(r,'image/png')); v.srcObject.getTracks().forEach(t=>t.stop());
  const r=await fetch(RX+'/diag_left_eye/'+name+'.png',{method:'POST',body:blob}); return [name,W,H,frames[0].white,blob.size,await r.text()];
};
const w=window; const res=[];
const reset=()=>{ w.__liformaSetInnerEyeWhiteStyle('painted'); w.__liformaSetInnerEyeShade(null); w.__liformaSetInnerEyeCornerPatch(true); w.__liformaSetInnerEyeLidShadow(null); w.__liformaSetInnerEyeSparkle(null); };
reset(); await sleep(800); res.push(await __diagGrab('1_all_on'));
w.__liformaSetInnerEyeWhiteStyle('marble'); await sleep(800); res.push(await __diagGrab('2_template_off_marble')); reset();
w.__liformaSetInnerEyeShade({strength:0}); await sleep(800); res.push(await __diagGrab('3_shade_strength_0')); reset();
w.__liformaSetInnerEyeCornerPatch(false); await sleep(800); res.push(await __diagGrab('4_corner_patch_off')); reset();
w.__liformaSetInnerEyeLidShadow({alpha:0}); await sleep(800); res.push(await __diagGrab('5_lid_shadow_off')); reset();
w.__liformaSetInnerEyeSparkle({strength:0}); await sleep(800); res.push(await __diagGrab('6_sparkle_off')); reset();
res
