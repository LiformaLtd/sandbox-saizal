import { readFileSync, writeFileSync } from 'node:fs';
import {
	smoothClosedLidLoop,
	untangleClosedLoop,
	insetClosedLidLoop,
	lidStripTris,
	earClipClosedLoop
} from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/animate/render/webgpu/irisGpuLayers.ts';
import {
	LEFT_EYE_CONTOUR_DRAW_INDICES,
	RIGHT_EYE_CONTOUR_DRAW_INDICES
} from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/model/indices/irisLandmarkIndices.ts';
import { innerEyeLidCutSoftEdgePx } from '/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai/src/lib/runtime/morph-engine/animate/render/innerEyeLidCut.ts';

const ids = process.argv.slice(2);
const out: Record<string, unknown> = {};
for (const id of ids) {
	const fm = JSON.parse(readFileSync(`/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/source/avatars/${id}/face-meshes.json`, 'utf8'));
	const sil = fm.visemes.find((v: { id: string }) => v.id === 'sil');
	const lm = (sil.cohortLandmarks ?? sil.landmarks) as { x: number; y: number }[] | number[][];
	const pt = (i: number) => {
		const p = lm[i] as unknown as { x: number; y: number } | number[];
		return Array.isArray(p) ? { x: p[0]! * 1024, y: p[1]! * 1024 } : { x: p.x * 1024, y: p.y * 1024 };
	};
	for (const [side, draw] of [['right', RIGHT_EYE_CONTOUR_DRAW_INDICES], ['left', LEFT_EYE_CONTOUR_DRAW_INDICES]] as const) {
		for (const scale of [1, 2, 3]) {
			const dots = draw.map((i) => ({ x: pt(i).x * scale, y: pt(i).y * scale }));
			const width = Math.hypot(dots[0]!.x - dots[8]!.x, dots[0]!.y - dots[8]!.y);
			const lidLoop0 = smoothClosedLidLoop(dots);
			const lidLoop = untangleClosedLoop(lidLoop0).pts;
			const soft = innerEyeLidCutSoftEdgePx(width);
			const inner = insetClosedLidLoop(lidLoop, soft);
			const tris: number[] = [];
			const strips = lidLoop.length === lidLoop0.length && lidStripTris(inner, tris);
			let used = 'strips';
			if (!strips) used = earClipClosedLoop(inner, tris) ? 'earclip-inner' : earClipClosedLoop(lidLoop, tris) ? 'earclip-outline' : 'centre-fan';
			out[`${id}_${side}_x${scale}`] = { eyeWidthPx: +width.toFixed(1), soft, n: lidLoop.length, used, inner, tris };
			console.log(id, side, 'x' + scale, 'eye width', width.toFixed(1), 'soft', soft.toFixed(2), 'n', lidLoop0.length, lidLoop.length, '->', used);
		}
	}
}
writeFileSync(process.env.OUT ?? '/dev/null', JSON.stringify(out));
