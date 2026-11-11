import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { smoothClosedLidLoop, untangleClosedLoop, insetClosedLidLoop, lidStripTris } from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/animate/render/webgpu/irisGpuLayers.ts';
import { LEFT_EYE_CONTOUR_DRAW_INDICES, RIGHT_EYE_CONTOUR_DRAW_INDICES } from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/model/indices/irisLandmarkIndices.ts';
import { innerEyeLidCutSoftEdgePx } from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/animate/render/innerEyeLidCut.ts';
type P = { x: number; y: number };
const ROOT = '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/source/avatars/';
const ids = process.argv[2] === 'all' ? readdirSync(ROOT).filter((d) => /^[0-9a-f]{8}$/.test(d) && existsSync(ROOT + d + '/face-meshes.json')) : process.argv.slice(2);
const cross = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
for (const id of ids) {
	const fm = JSON.parse(readFileSync(ROOT + id + '/face-meshes.json', 'utf8'));
	const sil = fm.visemes.find((v: { id: string }) => v.id === 'sil');
	if (!sil) continue;
	const lm = sil.cohortLandmarks ?? sil.landmarks;
	const pt = (i: number): P => { const p = lm[i]; return Array.isArray(p) ? { x: p[0] * 1024, y: p[1] * 1024 } : { x: p.x * 1024, y: p.y * 1024 }; };
	const res: string[] = [];
	for (const [side, draw] of [['screenL(right)', RIGHT_EYE_CONTOUR_DRAW_INDICES], ['screenR(left)', LEFT_EYE_CONTOUR_DRAW_INDICES]] as const) {
		const dots = draw.map((i) => { const q = pt(i); return { x: q.x * 2, y: q.y * 2 }; });
		const w = Math.hypot(dots[0]!.x - dots[8]!.x, dots[0]!.y - dots[8]!.y);
		const loop = untangleClosedLoop(smoothClosedLidLoop(dots)).pts;
		const inner = insetClosedLidLoop(loop, innerEyeLidCutSoftEdgePx(w));
		const ok = lidStripTris(inner, []);
		let why = '';
		if (!ok) {
			const n = inner.length, h = n / 2;
			let area2 = 0; for (let k = 0; k < n; k++) { const p = inner[k]!, q = inner[(k + 1) % n]!; area2 += p.x * q.y - q.x * p.y; }
			const o = area2 > 0 ? 1 : -1;
			for (let k = 0; k < h; k++) {
				const a = k, b = k + 1, c = (n - k - 1) % n, d = (n - k) % n;
				const t1 = a === d ? [a, b, c] : b === c ? [a, b, d] : [a, b, c];
				const c1 = cross(inner[t1[0]!]!, inner[t1[1]!]!, inner[t1[2]!]!) * o;
				const c2 = a !== d && b !== c ? cross(inner[a]!, inner[c]!, inner[d]!) * o : 1;
				if (c1 < -1e-9 || c2 < -1e-9) { why = `strip k=${k} (pts ${a},${b},${c},${d}; dot near ${draw[Math.round(a / 4)]}/${draw[Math.round(c / 4) % 16]}) folds: ${c1.toFixed(3)} ${c2.toFixed(3)}`; break; }
			}
		}
		res.push(`${side}: ${ok ? 'strips' : 'FAN (' + why + ')'}`);
	}
	console.log(id, '|', res.join(' | '));
}
