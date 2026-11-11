// LOCAL DEV ONLY (2026-09-25): the race maker's load_rgba for plates that are not 1024 px (Anna's 1254 px plates,
// one 512 px plate, the race faces), reproduced step for step so browser plates match the Python maker's:
//   1. colour pre-multiplied by alpha in floats and truncated to bytes (numpy astype(uint8)),
//   2. Pillow's LANCZOS resize, which pre-multiplies RGBA again, resizes in two 8-bit passes (horizontal first) with
//      22-bit fixed-point weights, and divides back with integer division,
//   3. divided by alpha again in floats and rounded half-to-even (numpy round).
const PRECISION_BITS = 32 - 8 - 2;
const HALF = 1 << (PRECISION_BITS - 1);

function sinc(x: number): number {
	if (x === 0) return 1;
	const px = x * Math.PI;
	return Math.sin(px) / px;
}

function lanczos(x: number): number {
	return x >= -3 && x < 3 ? sinc(x) * sinc(x / 3) : 0;
}

/** Pillow's precompute_coeffs + normalize_coeffs_8bpc for LANCZOS. */
function coefficients(inSize: number, outSize: number) {
	const scale = inSize / outSize;
	const filterscale = Math.max(scale, 1);
	const support = 3 * filterscale;
	const ksize = Math.ceil(support) * 2 + 1;
	const kk = new Int32Array(outSize * ksize);
	const bounds = new Int32Array(outSize * 2);
	const k = new Float64Array(ksize);
	for (let xx = 0; xx < outSize; xx++) {
		const center = (xx + 0.5) * scale;
		const ss = 1 / filterscale;
		const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
		const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
		let ww = 0;
		for (let x = 0; x < xmax; x++) {
			k[x] = lanczos((x + xmin - center + 0.5) * ss);
			ww += k[x];
		}
		for (let x = 0; x < xmax; x++) {
			const v = ww !== 0 ? k[x] / ww : k[x];
			kk[xx * ksize + x] = v < 0 ? Math.trunc(-0.5 + v * (1 << PRECISION_BITS)) : Math.trunc(0.5 + v * (1 << PRECISION_BITS));
		}
		bounds[xx * 2] = xmin;
		bounds[xx * 2 + 1] = xmax;
	}
	return { kk, bounds, ksize };
}

function clip8(v: number): number {
	const s = v >> PRECISION_BITS;
	return s < 0 ? 0 : s > 255 ? 255 : s;
}

/** Pillow Image.resize(size, LANCZOS) on an 'RGBa' (pre-multiplied) image, as bytes. */
function pillowLanczos(src: Uint8Array, inW: number, inH: number, outW: number, outH: number): Uint8Array {
	const h = coefficients(inW, outW);
	const v = coefficients(inH, outH);
	const tmp = new Uint8Array(outW * inH * 4);
	for (let y = 0; y < inH; y++) {
		for (let xx = 0; xx < outW; xx++) {
			const xmin = h.bounds[xx * 2];
			const xmax = h.bounds[xx * 2 + 1];
			const base = xx * h.ksize;
			let s0 = HALF;
			let s1 = HALF;
			let s2 = HALF;
			let s3 = HALF;
			for (let x = 0; x < xmax; x++) {
				const w = h.kk[base + x];
				const p = (y * inW + x + xmin) * 4;
				s0 += src[p] * w;
				s1 += src[p + 1] * w;
				s2 += src[p + 2] * w;
				s3 += src[p + 3] * w;
			}
			const o = (y * outW + xx) * 4;
			tmp[o] = clip8(s0);
			tmp[o + 1] = clip8(s1);
			tmp[o + 2] = clip8(s2);
			tmp[o + 3] = clip8(s3);
		}
	}
	const out = new Uint8Array(outW * outH * 4);
	for (let yy = 0; yy < outH; yy++) {
		const ymin = v.bounds[yy * 2];
		const ymax = v.bounds[yy * 2 + 1];
		const base = yy * v.ksize;
		for (let xx = 0; xx < outW; xx++) {
			let s0 = HALF;
			let s1 = HALF;
			let s2 = HALF;
			let s3 = HALF;
			for (let y = 0; y < ymax; y++) {
				const w = v.kk[base + y];
				const p = ((y + ymin) * outW + xx) * 4;
				s0 += tmp[p] * w;
				s1 += tmp[p + 1] * w;
				s2 += tmp[p + 2] * w;
				s3 += tmp[p + 3] * w;
			}
			const o = (yy * outW + xx) * 4;
			out[o] = clip8(s0);
			out[o + 1] = clip8(s1);
			out[o + 2] = clip8(s2);
			out[o + 3] = clip8(s3);
		}
	}
	return out;
}

/** numpy's round: halves go to the even neighbour. */
function rint(x: number): number {
	const r = Math.round(x);
	return r - x === 0.5 && (r & 1) !== 0 ? r - 1 : r;
}

/** load_rgba: any plate as RGBA in the size x size frame (plates already that size are returned as they are). */
export function toPlateFrame(rgba: Uint8Array, width: number, height: number, size: number): Uint8Array {
	if (width === size && height === size) return rgba;
	const n = width * height;
	// 1. the maker's own pre-multiply, then 2a. Pillow's RGBA -> RGBa (MULDIV255)
	const pre = new Uint8Array(n * 4);
	for (let i = 0; i < n * 4; i += 4) {
		const a = rgba[i + 3] / 255;
		const alpha = Math.trunc(a * 255);
		pre[i + 3] = alpha;
		for (let c = 0; c < 3; c++) {
			const m = Math.trunc((rgba[i + c] / 255) * a * 255);
			const t = m * alpha + 128;
			pre[i + c] = ((t >> 8) + t) >> 8;
		}
	}
	const resized = pillowLanczos(pre, width, height, size, size);
	const out = new Uint8Array(size * size * 4);
	for (let i = 0; i < size * size * 4; i += 4) {
		const a = resized[i + 3];
		const al = Math.min(Math.max(a / 255, 0), 1);
		out[i + 3] = rint(al * 255);
		for (let c = 0; c < 3; c++) {
			// 2c. Pillow's RGBa -> RGBA: integer division unless fully solid or fully clear
			const u = a === 0 || a === 255 ? resized[i + c] : Math.min(Math.trunc((255 * resized[i + c]) / a), 255);
			// 3. the maker's divide-back
			const rgb = al > 1e-4 ? Math.min(Math.max(u / 255 / Math.max(al, 1e-4), 0), 1) : 0;
			out[i + c] = rint(rgb * 255);
		}
	}
	return out;
}
