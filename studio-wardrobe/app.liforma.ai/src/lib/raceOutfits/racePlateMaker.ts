// LOCAL DEV ONLY (2026-09-25, rewritten 2026-10-01): the sandbox race-plates maker
// (`sandboxes/sandbox/race-plates/maker/make_mix_plates.py`, branch Saizal) ported so an ethnicity's outfit plate is made in the
// browser when it is looked at, instead of being read from pre-made files. Same method, constants and checks:
//
//   mix      the image-lerp tool's mix, out = A + t*(B-A) per channel with the race's fixed t, browser canvas rounding
//   outline  Anna's (the light endpoint's): pixels solid only on the dark endpoint disappear, pixels solid only on the
//            light one take the mixed colour of the nearest pixel both plates paint
//   face     the race face cut along its own chin outline (the face-dot tool's jaw dots). The endpoints' chins end a few
//            px lower, so per column the cut sits CUT_PX below the lowest of the three chin lines; below it everything is
//            the body, colour-matched to the face along the cut (skin only). Collars stay the body's. The outline is the
//            face's above ALPHA_FADE and the body's below, with the face plate's neck shaved to the body's outline from
//            SHAVE_FROM down. The base plates are never changed.
//   garments garments the bald face plate does not cover (the astronaut's collar ring, a scarf beside the neck, a high
//            collar) would be cut off by the face's see-through shape. A garment pixel is solid on the light endpoint's
//            outfit plate, differs from the light endpoint's white-tee base plate, is not skin by the normaliser's
//            two-signal skin test, sits in a connected piece of >= GARMENT_MIN_PX
//            whose two endpoint versions line up (a hat drawn elsewhere on the dark endpoint is left out), small holes
//            filled, plus a 1 px rim. Those pixels come from the light endpoint's plate wherever the join would have
//            changed them and the face plate does not cover them.
//
// Pure functions on 1024x1024 RGBA arrays, no DOM, so it runs in a worker and under vitest. Byte-identical to the Python
// maker (racePlateMaker.test.ts compares against plates it wrote).

export const PLATE_SIZE = 1024;
const W = PLATE_SIZE;
const H = PLATE_SIZE;
const N = W * H;
/** MediaPipe jaw dots from the left jaw angle to the right one; the chin line runs through them. */
const JAW = [136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365];
const CUT_PX = 3; // the cut sits this far below the lowest chin line
const FEATHER = 4;
const MATCH_FADE = 40; // the colour match fades out over this many px below the cut
const MATCH_BAND: readonly [number, number] = [CUT_PX + 2, CUT_PX + 10]; // where it is measured
const ALPHA_FADE: readonly [number, number] = [361, 369]; // face outline above, the body's below
const SHAVE_FROM = 354; // from here down the face plate's neck is shaved to the body's outline
const SHAVE_SOFT = 6;
const CLOTH_FROM_ROW = 355; // the collar rule never reaches above the neck
const SHIFT_SIGMA = 8; // smoothing of the per-column colour match along the cut
const CHECK_FACE_ROW = 340;
// garments that rise above the chin: see garmentMask
const GARMENT_DIFF = 30;
const GARMENT_RIM_DIFF = 12;
const GARMENT_MIN_PX = 2000;
const GARMENT_MAX_MISFIT = 30;
const GARMENT_HOLE_PX = 400;
const SKIN_IDENTITY: readonly [number, number] = [20, 35];
const SKIN_SEED_IDENTITY = 28;
const SKIN_SEED_SAT: readonly [number, number] = [0.15, 0.97];
const SKIN_COLOUR: readonly [number, number] = [1.5, 3.5];
const SKIN_BLUR = 4;
const CHECK_BODY_ROW = 430;

export type RaceMix = {
	readonly values: readonly [number, number, number];
	/** Left over from the skin-test maker's hands check; not read any more. */
	readonly target?: { readonly hands: readonly [number, number, number] };
};

/** The face-dot tool's `*_outline.json`: 478 dots in the picture's own pixels. */
export type FaceOutline = { readonly width: number; readonly dots478: readonly (readonly number[])[] };

export type RacePlateReport = {
	readonly ok: boolean;
	/** face pixels above row 340 that are not the face plate's */
	readonly faceExactAbove340: number;
	/** see-through values below row 369 that are not the body's */
	readonly outlineIsAnnaBelow369: number;
	/** pixels from row 354 down that are more solid than the body */
	readonly widerThanAnnaFrom354: number;
	/** pixels from row 430 down that are not the plain mix */
	readonly bodyIsMixBelow430: number;
};

/** A race face in the 1024 frame (colour and alpha as bytes) plus, per pixel, how far it lies below the chin cut line
 * (0 on the head). The cut line is the lowest of the race's, the light endpoint's and the dark endpoint's chin lines. */
export type PreparedFace = { readonly rgb: Uint8Array; readonly alpha: Uint8Array; readonly below: Float64Array };

type Rgba = ArrayLike<number>;

/** numpy's round: halves go to the even neighbour. */
function rint(x: number): number {
	const r = Math.round(x);
	return r - x === 0.5 && (r & 1) !== 0 ? r - 1 : r;
}

function clamp(x: number, lo: number, hi: number): number {
	return x < lo ? lo : x > hi ? hi : x;
}

function ramp(x: number, a: number, b: number): number {
	return clamp((x - a) / (b - a), 0, 1);
}

/** Smootherstep of row y between a and b. */
function ss(y: number, a: number, b: number): number {
	const t = clamp((y - a) / (b - a), 0, 1);
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function skinColourAt(r: number, g: number, b: number): number {
	const rr = Math.max(r, 1);
	return (
		ramp(r - g, -4, 4) *
		ramp(g - b, -4, 4) *
		ramp(g / rr, 0.3, 0.4) *
		ramp((r - b) / rr, 0.1, 0.18) *
		ramp(r, 50, 70)
	);
}

/** The canvas round trip: colour pre-multiplied by alpha and back, as drawImage/getImageData/putImageData do. */
function browserRound(src: Rgba): Uint8Array {
	const out = new Uint8Array(N * 4);
	for (let i = 0; i < N * 4; i += 4) {
		const a = src[i + 3];
		out[i + 3] = a;
		if (a <= 0) continue;
		for (let c = 0; c < 3; c++) {
			let p = src[i + c] * a + 128;
			p = (p + (p >> 8)) >> 8;
			out[i + c] = clamp(rint((p * 255) / Math.max(a, 1)), 0, 255);
		}
	}
	return out;
}

function lerpTool(A: Rgba, B: Rgba, t: readonly [number, number, number]): Uint8Array {
	const t0 = clamp(t[0], -0.25, 1.25);
	const t1 = clamp(t[1], -0.25, 1.25);
	const t2 = clamp(t[2], -0.25, 1.25);
	const tt = [t0, t1, t2, (t0 + t1 + t2) / 3];
	const a = browserRound(A);
	const b = browserRound(B);
	const out = new Uint8Array(N * 4);
	for (let i = 0; i < N * 4; i += 4) {
		for (let c = 0; c < 4; c++) out[i + c] = rint(clamp(a[i + c] + tt[c] * (b[i + c] - a[i + c]), 0, 255));
	}
	return browserRound(out);
}

/** Binary erosion with the 4-neighbour cross, outside the image counting as false (scipy's default). */
function erodeCross(mask: Uint8Array, iterations: number): Uint8Array {
	let cur = mask;
	for (let it = 0; it < iterations; it++) {
		const out = new Uint8Array(N);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const i = y * W + x;
				out[i] =
					cur[i] && y > 0 && y < H - 1 && x > 0 && x < W - 1 && cur[i - 1] && cur[i + 1] && cur[i - W] && cur[i + W]
						? 1
						: 0;
			}
		}
		cur = out;
	}
	return cur;
}

/**
 * Exact Euclidean nearest-feature transform (Felzenszwalb-Huttenlocher), the stand-in for
 * scipy's distance_transform_edt(~feature, return_indices=True): for every pixel, the index of the nearest pixel
 * where `feature` is set, and the squared distance to it. -1 / Infinity when there is no feature at all.
 */
function nearestFeature(feature: Uint8Array): { index: Int32Array; dist2: Float64Array } {
	const colRow = new Int32Array(N).fill(-1); // nearest feature row in the same column
	for (let x = 0; x < W; x++) {
		let last = -1;
		for (let y = 0; y < H; y++) {
			if (feature[y * W + x]) last = y;
			colRow[y * W + x] = last;
		}
		last = -1;
		for (let y = H - 1; y >= 0; y--) {
			const i = y * W + x;
			if (feature[i]) last = y;
			if (last >= 0 && (colRow[i] < 0 || last - y < y - colRow[i])) colRow[i] = last;
		}
	}
	const index = new Int32Array(N).fill(-1);
	const dist2 = new Float64Array(N).fill(Infinity);
	const f = new Float64Array(W);
	const v = new Int32Array(W);
	const z = new Float64Array(W + 1);
	for (let y = 0; y < H; y++) {
		const row = y * W;
		let k = -1;
		for (let q = 0; q < W; q++) {
			const fr = colRow[row + q];
			if (fr < 0) continue;
			f[q] = (y - fr) * (y - fr);
			if (k < 0) {
				k = 0;
				v[0] = q;
				z[0] = -Infinity;
				z[1] = Infinity;
				continue;
			}
			let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			while (s <= z[k]) {
				k--;
				s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			}
			k++;
			v[k] = q;
			z[k] = s;
			z[k + 1] = Infinity;
		}
		if (k < 0) continue;
		let j = 0;
		for (let x = 0; x < W; x++) {
			while (z[j + 1] < x) j++;
			const q = v[j];
			index[row + x] = colRow[row + q] * W + q;
			dist2[row + x] = (x - q) * (x - q) + f[q];
		}
	}
	return { index, dist2 };
}

function gaussianKernel(sigma: number): Float64Array {
	const radius = Math.floor(4 * sigma + 0.5); // scipy truncate=4.0
	const k = new Float64Array(2 * radius + 1);
	let sum = 0;
	for (let i = -radius; i <= radius; i++) {
		k[i + radius] = Math.exp((-0.5 * i * i) / (sigma * sigma));
		sum += k[i + radius];
	}
	for (let i = 0; i < k.length; i++) k[i] /= sum;
	return k;
}

function edgeIndex(i: number, n: number, mode: 'reflect' | 'nearest'): number {
	if (i >= 0 && i < n) return i;
	if (mode === 'nearest') return i < 0 ? 0 : n - 1;
	// scipy 'reflect': d c b a | a b c d | d c b a
	let j = i;
	while (j < 0 || j >= n) j = j < 0 ? -j - 1 : 2 * n - j - 1;
	return j;
}

/** scipy.ndimage.gaussian_filter1d with mode 'reflect' along one line of values, summed the way scipy sums a
 * symmetric kernel: the centre first, then each pair of mirrored neighbours added together, outermost pair first. */
function gaussian1d(src: Float64Array, sigma: number): Float64Array {
	const k = gaussianKernel(sigma);
	const R = (k.length - 1) / 2;
	const n = src.length;
	const out = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let acc = src[i] * k[R];
		for (let j = R; j >= 1; j--) {
			acc += (src[edgeIndex(i - j, n, 'reflect')] + src[edgeIndex(i + j, n, 'reflect')]) * k[R - j];
		}
		out[i] = acc;
	}
	return out;
}

/** scipy.ndimage.gaussian_filter on one 1024x1024 channel, mode 'reflect': axis 0 (down the columns) then axis 1
 * (along the rows), each pass summed the way gaussian1d does. */
function gaussianBlur2d(src: Float64Array, sigma: number): Float64Array {
	const k = gaussianKernel(sigma);
	const R = (k.length - 1) / 2;
	const tmp = new Float64Array(N);
	for (let x = 0; x < W; x++) {
		for (let y = 0; y < H; y++) {
			let acc = src[y * W + x] * k[R];
			for (let j = R; j >= 1; j--) {
				acc += (src[edgeIndex(y - j, H, 'reflect') * W + x] + src[edgeIndex(y + j, H, 'reflect') * W + x]) * k[R - j];
			}
			tmp[y * W + x] = acc;
		}
	}
	const out = new Float64Array(N);
	for (let y = 0; y < H; y++) {
		const row = y * W;
		for (let x = 0; x < W; x++) {
			let acc = tmp[row + x] * k[R];
			for (let j = R; j >= 1; j--) {
				acc += (tmp[row + edgeIndex(x - j, W, 'reflect')] + tmp[row + edgeIndex(x + j, W, 'reflect')]) * k[R - j];
			}
			out[row + x] = acc;
		}
	}
	return out;
}

/** numpy.interp for increasing xp: level beyond the ends, straight lines between. */
function interp(x: number, xp: readonly number[], fp: readonly number[]): number {
	const last = xp.length - 1;
	if (x <= xp[0]) return fp[0];
	if (x >= xp[last]) return fp[last];
	let lo = 0;
	let hi = last;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (xp[mid] <= x) lo = mid;
		else hi = mid;
	}
	const slope = (fp[lo + 1] - fp[lo]) / (xp[lo + 1] - xp[lo]);
	return slope * (x - xp[lo]) + fp[lo];
}

function median(values: readonly number[]): number {
	const s = [...values].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------- the chin line

/** Row of the chin line at each pixel-centre column: the polyline through the jaw dots, level beyond the end dots. */
function chinLine(outline: FaceOutline): Float64Array {
	const k = PLATE_SIZE / outline.width;
	const xp = JAW.map((i) => outline.dots478[i][0] * k);
	const fp = JAW.map((i) => outline.dots478[i][1] * k);
	const line = new Float64Array(W);
	for (let x = 0; x < W; x++) line[x] = interp(x + 0.5, xp, fp);
	return line;
}

/** Px below the lowest of the chin lines (0 on the head), the Python maker's below_chins. */
function belowChins(outlines: readonly FaceOutline[]): Float64Array {
	const lines = outlines.map(chinLine);
	const head = new Uint8Array(N);
	for (let y = 0; y < H; y++) {
		const yc = y + 0.5;
		for (let x = 0; x < W; x++) {
			let inside = 0;
			for (const line of lines) if (yc < line[x]) inside = 1;
			head[y * W + x] = inside;
		}
	}
	const { dist2 } = nearestFeature(head);
	const d = new Float64Array(N);
	for (let i = 0; i < N; i++) d[i] = Math.sqrt(dist2[i]);
	return d;
}

/** The race face as the maker reads it, with the chin cut distances for this pair's endpoints. */
export function prepareFace(face: Rgba, outlines: readonly FaceOutline[]): PreparedFace {
	const rgb = new Uint8Array(N * 3);
	const alpha = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		alpha[i] = face[i * 4 + 3];
		for (let c = 0; c < 3; c++) rgb[i * 3 + c] = face[i * 4 + c];
	}
	return { rgb, alpha, below: belowChins(outlines) };
}

// ---------------------------------------------------------------- the mix on the light endpoint's outline

/** mix_anna_outline: the lerp-tool mix with A's see-through channel. */
function mixAnnaOutline(A: Rgba, B: Rgba, t: readonly [number, number, number]): Uint8Array {
	const L = lerpTool(A, B, t);
	const both = new Uint8Array(N);
	const fix = new Uint8Array(N);
	let anyBoth = 0;
	let anyFix = 0;
	for (let i = 0; i < N; i++) {
		const aA = A[i * 4 + 3];
		const aB = B[i * 4 + 3];
		both[i] = aA >= 250 && aB >= 250 ? 1 : 0;
		fix[i] = aA > 0 && aB < 250 ? 1 : 0;
		anyBoth |= both[i];
		anyFix |= fix[i];
	}
	if (anyBoth && anyFix) {
		const idx = nearestFeature(both).index;
		for (let i = 0; i < N; i++) {
			if (!fix[i]) continue;
			const j = idx[i];
			for (let c = 0; c < 3; c++) {
				const ratio = clamp((L[j * 4 + c] + 1) / (A[j * 4 + c] + 1), 0.2, 2);
				L[i * 4 + c] = rint(clamp(A[i * 4 + c] * ratio, 0, 255));
			}
		}
	}
	for (let i = 0; i < N; i++) L[i * 4 + 3] = A[i * 4 + 3];
	return L;
}

// ---------------------------------------------------------------- garments above the chin

function smoothstep(e0: number, e1: number, x: number): number {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
}

/** sRGB 0-255 to OKLab, through the transfer function (skin_mean_normalise.convert_to_oklab). */
function oklabAt(r8: number, g8: number, b8: number, out: Float64Array, o: number): void {
	const lin = (c8: number) => {
		const c = clamp(c8, 0, 255) / 255;
		return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};
	const r = lin(r8);
	const g = lin(g8);
	const b = lin(b8);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/**
 * The normaliser's two-signal skin test (skin_mean_normalise.py) on the dark endpoint B with the light endpoint A as the
 * same-outfit source: skin CHANGED between the two (fabric did not) AND its chroma over lightness in OKLab sits inside
 * the model learned from B's own confident skin. Blurred SKIN_BLUR px.
 */
function skinWeight(A: Rgba, B: Rgba): Float64Array {
	const idW = new Float64Array(N);
	const difference = new Float64Array(N);
	const uv = new Float64Array(N * 2);
	const seed = new Uint8Array(N);
	const lab = new Float64Array(3);
	let seeds = 0;
	for (let i = 0; i < N; i++) {
		const r = B[i * 4];
		const g = B[i * 4 + 1];
		const b = B[i * 4 + 2];
		const alpha = B[i * 4 + 3];
		const dd = Math.max(Math.abs(r - A[i * 4]), Math.abs(g - A[i * 4 + 1]), Math.abs(b - A[i * 4 + 2]));
		difference[i] = dd;
		idW[i] = smoothstep(SKIN_IDENTITY[0], SKIN_IDENTITY[1], dd);
		const sat = (r - b) / Math.max(r, 1);
		if (
			alpha > 250 &&
			dd > SKIN_SEED_IDENTITY &&
			r >= g &&
			g >= b &&
			r > 30 &&
			r < 250 &&
			sat > SKIN_SEED_SAT[0] &&
			sat < SKIN_SEED_SAT[1]
		) {
			seed[i] = 1;
			seeds++;
		}
		oklabAt(r, g, b, lab, 0);
		const denom = Math.max(lab[0], 0.05);
		uv[i * 2] = lab[1] / denom;
		uv[i * 2 + 1] = lab[2] / denom;
	}
	const w = new Float64Array(N);
	if (seeds < 500) return w;
	// mean and sample covariance (numpy.cov, N-1) of the seeds' (a/L, b/L)
	let mu = 0;
	let mv = 0;
	for (let i = 0; i < N; i++) {
		if (seed[i]) {
			mu += uv[i * 2];
			mv += uv[i * 2 + 1];
		}
	}
	mu /= seeds;
	mv /= seeds;
	let cuu = 0;
	let cuv = 0;
	let cvv = 0;
	for (let i = 0; i < N; i++) {
		if (seed[i]) {
			const du = uv[i * 2] - mu;
			const dv = uv[i * 2 + 1] - mv;
			cuu += du * du;
			cuv += du * dv;
			cvv += dv * dv;
		}
	}
	cuu /= seeds - 1;
	cuv /= seeds - 1;
	cvv /= seeds - 1;
	const eps = Math.max((cuu + cvv) * 1e-4, 1e-8);
	cuu += eps;
	cvv += eps;
	const det = cuu * cvv - cuv * cuv;
	const iuu = cvv / det;
	const iuv = -cuv / det;
	const ivv = cuu / det;
	for (let i = 0; i < N; i++) {
		const du = uv[i * 2] - mu;
		const dv = uv[i * 2 + 1] - mv;
		const q = du * (iuu * du + iuv * dv) + dv * (iuv * du + ivv * dv);
		const dist = Math.sqrt(Math.max(q, 0));
		const colW = 1 - smoothstep(SKIN_COLOUR[0], SKIN_COLOUR[1], dist);
		w[i] = B[i * 4 + 3] > 0 ? idW[i] * colW : 0;
	}
	const blurred = gaussianBlur2d(w, SKIN_BLUR);
	for (let i = 0; i < N; i++) blurred[i] = clamp(blurred[i], 0, 1);
	return blurred;
}

/** Connected pieces of a mask with the 4-neighbour cross (scipy.ndimage.label's default). Labels start at 1. */
function labelCross(mask: Uint8Array): { labels: Int32Array; sizes: number[] } {
	const labels = new Int32Array(N);
	const sizes: number[] = [0];
	const stack = new Int32Array(N);
	let next = 0;
	for (let p = 0; p < N; p++) {
		if (!mask[p] || labels[p]) continue;
		const id = ++next;
		let top = 0;
		stack[top++] = p;
		labels[p] = id;
		let size = 0;
		while (top) {
			const q = stack[--top];
			size++;
			const x = q % W;
			if (x > 0 && mask[q - 1] && !labels[q - 1]) {
				labels[q - 1] = id;
				stack[top++] = q - 1;
			}
			if (x < W - 1 && mask[q + 1] && !labels[q + 1]) {
				labels[q + 1] = id;
				stack[top++] = q + 1;
			}
			if (q >= W && mask[q - W] && !labels[q - W]) {
				labels[q - W] = id;
				stack[top++] = q - W;
			}
			if (q < N - W && mask[q + W] && !labels[q + W]) {
				labels[q + W] = id;
				stack[top++] = q + W;
			}
		}
		sizes.push(size);
	}
	return { labels, sizes };
}

/** Garment pixels of the outfit that the face plate must not cut off; see the header. */
function garmentMask(A: Rgba, B: Rgba, Abase: Rgba): Uint8Array {
	const skin = skinWeight(A, B);
	const solid = new Uint8Array(N);
	const differsRim = new Uint8Array(N); // differs from the base by more than the rim threshold, or the base is see-through
	const misfit = new Float64Array(N);
	const g = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		solid[i] = A[i * 4 + 3] >= 250 ? 1 : 0;
		const diff = Math.max(
			Math.abs(A[i * 4] - Abase[i * 4]),
			Math.abs(A[i * 4 + 1] - Abase[i * 4 + 1]),
			Math.abs(A[i * 4 + 2] - Abase[i * 4 + 2])
		);
		const baseClear = Abase[i * 4 + 3] < 128;
		differsRim[i] = diff > GARMENT_RIM_DIFF || baseClear ? 1 : 0;
		misfit[i] = Math.max(
			Math.abs(A[i * 4] - B[i * 4]),
			Math.abs(A[i * 4 + 1] - B[i * 4 + 1]),
			Math.abs(A[i * 4 + 2] - B[i * 4 + 2])
		);
		const isSkin = skin[i] >= 0.5; // a per-pixel |A-B| test here punched holes in scarves: the two renders differ at folds
		g[i] = solid[i] && (diff > GARMENT_DIFF || baseClear) && !isSkin ? 1 : 0;
	}
	const { labels, sizes } = labelCross(g);
	if (sizes.length === 1) return g;
	// keep the big pieces whose two endpoint versions line up
	const keep = new Uint8Array(sizes.length);
	const perPiece: number[][] = sizes.map(() => []);
	for (let i = 0; i < N; i++) if (labels[i] && sizes[labels[i]] >= GARMENT_MIN_PX) perPiece[labels[i]].push(misfit[i]);
	for (let id = 1; id < sizes.length; id++) {
		if (sizes[id] >= GARMENT_MIN_PX && median(perPiece[id]) <= GARMENT_MAX_MISFIT) keep[id] = 1;
	}
	for (let i = 0; i < N; i++) g[i] = labels[i] && keep[labels[i]] ? 1 : 0;
	// small holes (braid, buttons) are filled; a neck inside a scarf is a big hole and stays skin
	const bg = new Uint8Array(N);
	for (let i = 0; i < N; i++) bg[i] = g[i] ? 0 : 1;
	const { labels: bgLabels, sizes: bgSizes } = labelCross(bg);
	const touchesBorder = new Uint8Array(bgSizes.length);
	for (let x = 0; x < W; x++) {
		touchesBorder[bgLabels[x]] = 1;
		touchesBorder[bgLabels[(H - 1) * W + x]] = 1;
	}
	for (let y = 0; y < H; y++) {
		touchesBorder[bgLabels[y * W]] = 1;
		touchesBorder[bgLabels[y * W + W - 1]] = 1;
	}
	for (let i = 0; i < N; i++) {
		const id = bgLabels[i];
		if (id && !touchesBorder[id] && bgSizes[id] < GARMENT_HOLE_PX) g[i] = 1;
	}
	// the 1 px anti-aliased rim, but not the skin under it
	const out = new Uint8Array(g);
	for (let p = 0; p < N; p++) {
		if (g[p] || !solid[p] || !differsRim[p]) continue;
		const x = p % W;
		if ((x > 0 && g[p - 1]) || (x < W - 1 && g[p + 1]) || (p >= W && g[p - W]) || (p < N - W && g[p + W])) out[p] = 1;
	}
	return out;
}

// ---------------------------------------------------------------- the chin cut

/** face_join: the face above the chin cut, the body below, matched along the cut. */
function faceJoin(face: PreparedFace, L: Uint8Array, A: Rgba, garment: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
	const d = face.below;
	const aL = new Float64Array(N);
	const aF = new Float64Array(N);
	const sw = new Float64Array(N);
	const solidL = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		aL[i] = L[i * 4 + 3] / 255;
		aF[i] = face.alpha[i] / 255;
		sw[i] = A[i * 4 + 3] >= 250 ? skinColourAt(A[i * 4], A[i * 4 + 1], A[i * 4 + 2]) : 0;
		solidL[i] = aL[i] > 0.99 ? 1 : 0;
	}
	const eroded = erodeCross(solidL, 2);
	const w = new Float64Array(N);
	const cloth = new Uint8Array(N);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = y * W + x;
			cloth[i] = eroded[i] && sw[i] < 0.5 && d[i] > 2 && y >= CLOTH_FROM_ROW ? 1 : 0;
			w[i] = cloth[i] ? 0 : 1 - ss(d[i], CUT_PX, CUT_PX + FEATHER);
		}
	}
	// colour-match the body to the face along the cut: per-column median difference just under it, smoothed
	const shift = [new Float64Array(W), new Float64Array(W), new Float64Array(W)];
	const has: number[] = [];
	for (let x = 0; x < W; x++) {
		const diffs: number[][] = [[], [], []];
		for (let y = 0; y < H; y++) {
			const i = y * W + x;
			if (aF[i] > 0.99 && aL[i] > 0.99 && sw[i] > 0.9 && d[i] >= MATCH_BAND[0] && d[i] <= MATCH_BAND[1]) {
				for (let c = 0; c < 3; c++) diffs[c].push(face.rgb[i * 3 + c] - L[i * 4 + c]);
			}
		}
		if (diffs[0].length >= 4) {
			for (let c = 0; c < 3; c++) shift[c][x] = median(diffs[c]);
			has.push(x);
		}
	}
	let smooth: Float64Array[] = shift;
	if (has.length) {
		smooth = shift.map((s) => {
			const fp = has.map((x) => s[x]);
			const filled = new Float64Array(W);
			for (let x = 0; x < W; x++) filled[x] = interp(x, has, fp);
			return gaussian1d(filled, SHIFT_SIGMA);
		});
	}
	const out = new Uint8ClampedArray(N * 4);
	for (let y = 0; y < H; y++) {
		const wa = ss(y, ALPHA_FADE[0], ALPHA_FADE[1]);
		const wsh = ss(y, SHAVE_FROM - SHAVE_SOFT, SHAVE_FROM);
		for (let x = 0; x < W; x++) {
			const i = y * W + x;
			const fw = (1 - ss(d[i], CUT_PX, CUT_PX + MATCH_FADE)) * clamp(sw[i], 0, 1);
			for (let c = 0; c < 3; c++) {
				const Bc = L[i * 4 + c] + smooth[c][x] * fw;
				const rgb = Bc * (1 - w[i]) + face.rgb[i * 3 + c] * w[i];
				out[i * 4 + c] = rint(clamp(rgb, 0, 255));
			}
			const aA = A[i * 4 + 3] / 255;
			const aFs = aF[i] * (1 - wsh) + Math.min(aF[i], aA) * wsh;
			let al = clamp(aFs * (1 - wa) + aL[i] * wa, 0, 1);
			if (cloth[i]) al = aL[i];
			out[i * 4 + 3] = rint(al * 255);
			// a garment the join would have changed, where the face plate does not cover it, is the light endpoint's
			if (garment[i] && aF[i] <= 0.5) {
				const changed = out[i * 4] !== L[i * 4] || out[i * 4 + 1] !== L[i * 4 + 1] || out[i * 4 + 2] !== L[i * 4 + 2] || out[i * 4 + 3] !== L[i * 4 + 3];
				if (changed) for (let c = 0; c < 4; c++) out[i * 4 + c] = A[i * 4 + c];
			}
		}
	}
	return out;
}

// ---------------------------------------------------------------- checks

function checks(out: Uint8ClampedArray, A: Rgba, face: PreparedFace, L: Uint8Array, garment: Uint8Array): RacePlateReport {
	let faceMiss = 0;
	let outline = 0;
	let wider = 0;
	let body = 0;
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = y * W + x;
			if (y < CHECK_FACE_ROW && face.alpha[i] / 255 > 0.99 && !garment[i]) {
				for (let c = 0; c < 3; c++) {
					if (out[i * 4 + c] !== face.rgb[i * 3 + c]) {
						faceMiss++;
						break;
					}
				}
			}
			if (y >= ALPHA_FADE[1] && out[i * 4 + 3] !== A[i * 4 + 3]) outline++;
			if (y >= SHAVE_FROM && out[i * 4 + 3] > A[i * 4 + 3] + 1) wider++;
			if (y >= CHECK_BODY_ROW && !garment[i]) {
				for (let c = 0; c < 4; c++) {
					if (out[i * 4 + c] !== L[i * 4 + c]) {
						body++;
						break;
					}
				}
			}
		}
	}
	return {
		ok: faceMiss === 0 && outline === 0 && wider === 0 && body === 0,
		faceExactAbove340: faceMiss,
		outlineIsAnnaBelow369: outline,
		widerThanAnnaFrom354: wider,
		bodyIsMixBelow430: body
	};
}

// ---------------------------------------------------------------- one plate

/**
 * One race plate. `anna` and `precious` are the pair's light and dark endpoint plates of the same outfit, 1024x1024
 * RGBA; `lightBase` is the light endpoint's white-tee plate (the garment test compares against it); `face` is the race
 * face from prepareFace (with this pair's chin cut); `mix` is the race's entry in race_values.json.
 */
export function makeRacePlate(
	anna: Rgba,
	precious: Rgba,
	lightBase: Rgba,
	face: PreparedFace,
	mix: RaceMix
): { rgba: Uint8ClampedArray<ArrayBuffer>; report: RacePlateReport } {
	if (anna.length !== N * 4 || precious.length !== N * 4 || lightBase.length !== N * 4) {
		throw new Error(`race plates need ${PLATE_SIZE}x${PLATE_SIZE} RGBA inputs`);
	}
	const garment = garmentMask(anna, precious, lightBase);
	const L = mixAnnaOutline(anna, precious, mix.values);
	const rgba = faceJoin(face, L, anna, garment);
	return { rgba, report: checks(rgba, anna, face, L, garment) };
}
