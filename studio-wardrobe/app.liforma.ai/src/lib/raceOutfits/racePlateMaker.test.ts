// LOCAL DEV ONLY: the browser maker must match the Python maker byte for byte. The reference plates are written by
//   sandboxes/sandbox/race-plates/maker/make_mix_plates.py  (see RACE_PLATE_REF below for the layout)
// and the test is skipped when that folder is not on this machine.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeRacePlate, PLATE_SIZE, prepareFace, type FaceOutline, type RaceMix } from './racePlateMaker';
import { decodePng } from './pngCodec';
import { toPlateFrame } from './plateResize';

/**
 * <ref>/in/<set>/anna/<outfit>.png, <ref>/in/<set>/precious/<outfit>.png  the endpoint plates the references were made from
 * <ref>/<set>/<race>/<outfit>.png                                        what the Python maker wrote
 * Faces, outlines and values come from the pair's maker folder (MAKERS).
 */
const RACE_PLATE_REF =
	process.env.RACE_PLATE_REF ??
	'/private/tmp/claude-501/-Users-saizalpreetkaur--Desktop-Liforma-LTD/8a439c4d-2d4d-4478-b003-18555616cdcf/scratchpad/py_ref';
const MAKERS: Record<string, { dir: string; suffix: string }> = {
	female: { dir: path.resolve(process.cwd(), '..', 'sandbox', 'race-plates', 'maker'), suffix: 'female_gpt' },
	male: { dir: '/Users/saizalpreetkaur./Desktop/outfit_plates_male/maker', suffix: 'male_gpt' }
};

async function plate(file: string): Promise<Uint8Array> {
	const image = await decodePng(readFileSync(file));
	return toPlateFrame(image.rgba, image.width, image.height, PLATE_SIZE);
}

function outline(file: string): FaceOutline {
	return JSON.parse(readFileSync(file, 'utf8')) as FaceOutline;
}

const available = existsSync(RACE_PLATE_REF);

describe.skipIf(!available)('racePlateMaker matches the Python maker', () => {
	for (const [set, maker] of Object.entries(MAKERS)) {
		const refDir = path.join(RACE_PLATE_REF, set);
		if (!existsSync(refDir) || !existsSync(maker.dir)) continue;
		const values = JSON.parse(readFileSync(path.join(maker.dir, 'race_values.json'), 'utf8')) as Record<string, RaceMix>;
		const outfits = readdirSync(path.join(RACE_PLATE_REF, 'in', set, 'anna'))
			.filter((f) => f.endsWith('.png'))
			.map((f) => f.slice(0, -4));
		const light = outline(path.join(maker.dir, 'outlines', 'anna_outline.json'));
		const lightBasePath = path.join(RACE_PLATE_REF, 'in', set, 'anna', 'white_t_shirt_and_jeans.png');
		const dark = outline(path.join(maker.dir, 'outlines', 'precious_outline.json'));
		for (const race of Object.keys(values)) {
			it(`${set} ${race}: ${outfits.join(', ')}`, async () => {
				const face = prepareFace(await plate(path.join(maker.dir, 'faces', `${race}_${maker.suffix}.png`)), [
					outline(path.join(maker.dir, 'outlines', `${race}_${maker.suffix}_outline.json`)),
					light,
					dark
				]);
				for (const outfit of outfits) {
					const anna = await plate(path.join(RACE_PLATE_REF, 'in', set, 'anna', `${outfit}.png`));
					const precious = await plate(path.join(RACE_PLATE_REF, 'in', set, 'precious', `${outfit}.png`));
					const lightBase = await plate(lightBasePath);
					const { rgba, report } = makeRacePlate(anna, precious, lightBase, face, values[race]);
					const expected = await decodePng(readFileSync(path.join(refDir, race, `${outfit}.png`)));
					const where: string[] = [];
					for (let i = 0; i < rgba.length; i++) {
						if (rgba[i] !== expected.rgba[i] && where.length < 8) {
							const p = i >> 2;
							where.push(`row ${Math.floor(p / PLATE_SIZE)} col ${p % PLATE_SIZE} ch ${i & 3}: ${rgba[i]} vs ${expected.rgba[i]}`);
						}
					}
					expect(report.ok, `${race}/${outfit} checks`).toBe(true);
					expect(where, `${race}/${outfit}: bytes that differ from the Python plate`).toEqual([]);
				}
			});
		}
	}
});
