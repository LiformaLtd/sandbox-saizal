// LOCAL DEV ONLY (2026-10-02): how a new outfit's first picture is shown for approval (user: "remove the head and just
// show the plate below neck"). The head goes, the bare neck goes, clothing that comes up the neck (collars, hoods,
// turtlenecks) stays, and the empty top is cropped off. For showing only; the picture itself is never changed.

type Pixels = Uint8Array | Uint8ClampedArray;

/** Where the neck meets the shoulders on each pair's bald base, in the 1024 frame (measured 2026-10-02). */
export const NECK_BASE_ROW = { female: 410, male: 390 } as const;

/** A pixel is clothing, not the bald base's own neck, when some channel differs from the base by more than this. */
const CLOTH_DIFF = 45;
const FADE = 6;
const MARGIN = 8;
/** Climbing a column, this many non-clothing pixels in a row end the collar (knit and shine are not all clothing-coloured). */
const GAP = 3;
/** The collar line is smoothed over this many columns either side. */
const SMOOTH = 6;

/** The light endpoint's skin (every first picture is drawn on Anna or Caleb): warm, red over green over blue. */
function skinLike(r: number, g: number, b: number): boolean {
	return r > 60 && r >= g && g >= b && r - b > 0.15 * r;
}

/**
 * @param body the first picture, RGBA in the size x size frame
 * @param base the same person's bald base (white tee and jeans) in the same frame
 * @param below px under the lowest chin line for every pixel (0 on the head), as the plate maker measures it
 * @returns the kept part, cropped to start a few px above its highest pixel
 */
/**
 * @param body the first picture, RGBA in the size x size frame
 * @param base the same person's bald base (white tee and jeans) in the same frame
 * @param below px under the lowest chin line for every pixel (0 on the head), as the plate maker measures it
 * @returns the kept part, cropped to start a few px above its highest pixel
 */
export function bodyBelowNeck(
	body: Pixels,
	base: Pixels,
	below: Float64Array,
	neckBase: number,
	size: number
): { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
	// clothing on the neck: not skin-coloured and unlike the bald base there (a neck edge a pixel off the base's
	// outline differs from it too, hence the skin test)
	const clothAt = (i: number) => {
		const o = i * 4;
		return (
			body[o + 3] > 0 &&
			!skinLike(body[o], body[o + 1], body[o + 2]) &&
			(base[o + 3] < 128 ||
				Math.abs(body[o] - base[o]) > CLOTH_DIFF ||
				Math.abs(body[o + 1] - base[o + 1]) > CLOTH_DIFF ||
				Math.abs(body[o + 2] - base[o + 2]) > CLOTH_DIFF)
		);
	};
	// per column, the collar line: climb from the base of the neck while there is clothing, never into the head;
	// anything not reached this way (ears, specks, the bare neck) goes
	const raw = new Float64Array(size);
	for (let x = 0; x < size; x++) {
		let cut = neckBase;
		let gap = 0;
		for (let y = neckBase - 1; y >= 0 && below[y * size + x] > 0; y--) {
			if (clothAt(y * size + x)) {
				cut = y;
				gap = 0;
			} else if (++gap > GAP) {
				break;
			}
		}
		raw[x] = cut;
	}
	const line = new Float64Array(size);
	for (let x = 0; x < size; x++) {
		const window: number[] = [];
		for (let dx = -SMOOTH; dx <= SMOOTH; dx++) window.push(raw[Math.min(size - 1, Math.max(0, x + dx))]);
		window.sort((a, b) => a - b);
		line[x] = window[SMOOTH];
	}
	const out = new Uint8ClampedArray(size * size * 4);
	let top = size;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = y * size + x;
			const o = i * 4;
			let keep: number;
			if (below[i] <= 0) keep = 0;
			else if (y >= neckBase) keep = 1;
			else if (line[x] < neckBase) keep = Math.min(1, Math.max(0, (y - line[x] + 1) / 2), below[i] / 2);
			else keep = Math.min(1, Math.max(0, (y - (neckBase - FADE)) / FADE)); // bare neck fades out upwards
			out[o] = body[o];
			out[o + 1] = body[o + 1];
			out[o + 2] = body[o + 2];
			out[o + 3] = Math.round(body[o + 3] * keep);
			if (out[o + 3] > 8 && y < top) top = y;
		}
	}
	const from = Math.max(0, Math.min(top, size - 1) - MARGIN);
	const height = size - from;
	return { rgba: out.slice(from * size * 4), width: size, height };
}
