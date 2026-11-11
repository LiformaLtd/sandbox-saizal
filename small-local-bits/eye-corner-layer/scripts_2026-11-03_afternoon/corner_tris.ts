import { readFileSync, writeFileSync } from 'node:fs';
import { smoothClosedLidLoop, untangleClosedLoop, insetClosedLidLoop, lidStripTris, earClipClosedLoop, lidCutShadeLoopUv, resampleClosedLidLoopLinear } from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/animate/render/webgpu/irisGpuLayers.ts';
import { RIGHT_EYE_CONTOUR_DRAW_INDICES, LEFT_EYE_CONTOUR_DRAW_INDICES } from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/model/indices/irisLandmarkIndices.ts';
type P = { x: number; y: number };
// copy of the player's affineLinearPart + lidLoopUvFollowingCurve (not exported)
function lin(from: readonly P[], to: readonly P[]) {
	const n = Math.min(from.length, to.length); let mx = 0, my = 0, mu = 0, mv = 0;
	for (let k = 0; k < n; k++) { mx += from[k]!.x; my += from[k]!.y; mu += to[k]!.x; mv += to[k]!.y; }
	mx /= n; my /= n; mu /= n; mv /= n; let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0, sxv = 0, syv = 0;
	for (let k = 0; k < n; k++) { const x = from[k]!.x - mx, y = from[k]!.y - my, u = to[k]!.x - mu, v = to[k]!.y - mv; sxx += x * x; sxy += x * y; syy += y * y; sxu += x * u; syu += y * u; sxv += x * v; syv += y * v; }
	const det = sxx * syy - sxy * sxy;
	return { a: (sxu * syy - syu * sxy) / det, b: (syu * sxx - sxu * sxy) / det, c: (sxv * syy - syv * sxy) / det, d: (syv * sxx - sxv * sxy) / det };
}
function follow(lidLoop: P[], uv: P[], dotCount: number): P[] {
	const steps = lidLoop.length / dotCount; const dots: P[] = [];
	for (let k = 0; k < dotCount; k++) dots.push(lidLoop[k * steps]!);
	const chord = resampleClosedLidLoopLinear(dots, steps); const L = lin(chord, uv);
	return uv.map((t, k) => { const dx = lidLoop[k]!.x - chord[k]!.x, dy = lidLoop[k]!.y - chord[k]!.y; return { x: t.x + L.a * dx + L.b * dy, y: t.y + L.c * dx + L.d * dy }; });
}
const [id, side, plate] = process.argv.slice(2); // side: screenL | screenR
const ROOT = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/source/avatars/';
const fm = JSON.parse(readFileSync(ROOT + id + '/face-meshes.json', 'utf8'));
const vis = fm.visemes.find((v: { id: string }) => v.id === (plate ?? 'sil'));
const lm = vis.cohortLandmarks ?? vis.landmarks;
const draw = side === 'screenL' ? RIGHT_EYE_CONTOUR_DRAW_INDICES : LEFT_EYE_CONTOUR_DRAW_INDICES;
const tex = fm.eyeModel.innerEyeTexture[side === 'screenL' ? 'right' : 'left'];
const pt = (i: number): P => { const p = lm[i]; return Array.isArray(p) ? { x: p[0] * 1024, y: p[1] * 1024 } : { x: p.x * 1024, y: p.y * 1024 }; };
const dots = draw.map(pt);
const lidLoop0 = smoothClosedLidLoop(dots);
const rawUv = lidCutShadeLoopUv(draw, 478, tex.shadingLandmarkUv)!;
const uv0 = follow(lidLoop0, resampleClosedLidLoopLinear(rawUv), rawUv.length);
const un = untangleClosedLoop(lidLoop0, uv0);
const loop = un.pts, uv = un.uv ?? uv0;
const inner = insetClosedLidLoop(loop, 0);
const strips: number[] = []; const stripsOk = loop.length === lidLoop0.length && lidStripTris(inner, strips);
const fan: number[] = []; earClipClosedLoop(inner, fan);
// strips with every quad allowed through (to draw what strips would give even if one folds)
const n = inner.length, h = n / 2, forced: number[] = [];
for (let k = 0; k < h; k++) { const a = k, b = k + 1, c = (n - k - 1) % n, d = (n - k) % n; if (a === d) forced.push(a, b, c); else if (b === c) forced.push(a, b, d); else forced.push(a, b, c, a, c, d); }
console.log(id, side, plate ?? 'sil', 'n', loop.length, 'player uses', stripsOk ? 'STRIPS' : 'FAN', 'fan tris', fan.length / 3);
writeFileSync(process.argv[5]!, JSON.stringify({ loop, uv, dots, stripsOk, fan, forced, W: tex.shadingWidthPx, H: tex.shadingHeightPx, corner: id + '_inner_eye_corner_' + (side === 'screenL' ? 'right' : 'left') + '.webp' }));
