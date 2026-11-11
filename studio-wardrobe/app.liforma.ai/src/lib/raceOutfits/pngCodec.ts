// LOCAL DEV ONLY (2026-09-25): exact PNG read/write for the ethnicity plate maker. A canvas stores colour
// pre-multiplied by alpha, which rounds the colour of see-through edge pixels; the Python maker reads and writes
// the files exactly, so the browser does too. Handles the 8-bit, non-interlaced RGB/RGBA PNGs the plates use.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type DecodedPng = { readonly width: number; readonly height: number; readonly rgba: Uint8Array };

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const out = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
	return new Uint8Array(await out.arrayBuffer());
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
	if (!SIGNATURE.every((b, i) => bytes[i] === b)) throw new Error('not a PNG');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let width = 0;
	let height = 0;
	let channels = 0;
	const idat: Uint8Array[] = [];
	for (let at = 8; at + 8 <= bytes.byteLength; ) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		const data = bytes.subarray(at + 8, at + 8 + length);
		if (type === 'IHDR') {
			width = view.getUint32(at + 8);
			height = view.getUint32(at + 12);
			const [bitDepth, colourType, , , interlace] = data.subarray(8, 13);
			if (bitDepth !== 8 || interlace !== 0 || (colourType !== 6 && colourType !== 2)) {
				throw new Error('only 8-bit, non-interlaced RGB/RGBA PNGs are supported');
			}
			channels = colourType === 6 ? 4 : 3;
		} else if (type === 'IDAT') {
			idat.push(data);
		} else if (type === 'IEND') {
			break;
		}
		at += 12 + length;
	}
	if (!width || !channels) throw new Error('PNG has no IHDR');
	const joined = new Uint8Array(idat.reduce((n, d) => n + d.byteLength, 0));
	let offset = 0;
	for (const d of idat) {
		joined.set(d, offset);
		offset += d.byteLength;
	}
	const raw = await pipeThrough(joined, new DecompressionStream('deflate'));
	const stride = width * channels;
	const pixels = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const src = y * (stride + 1) + 1;
		const row = y * stride;
		const prev = row - stride;
		for (let x = 0; x < stride; x++) {
			const left = x >= channels ? pixels[row + x - channels] : 0;
			const up = y > 0 ? pixels[prev + x] : 0;
			const upLeft = y > 0 && x >= channels ? pixels[prev + x - channels] : 0;
			const v = raw[src + x];
			pixels[row + x] =
				filter === 0
					? v
					: filter === 1
						? (v + left) & 255
						: filter === 2
							? (v + up) & 255
							: filter === 3
								? (v + ((left + up) >> 1)) & 255
								: (v + paeth(left, up, upLeft)) & 255;
		}
	}
	if (channels === 4) return { width, height, rgba: pixels };
	const rgba = new Uint8Array(width * height * 4);
	for (let i = 0, j = 0; i < width * height; i++, j += 3) {
		rgba[i * 4] = pixels[j];
		rgba[i * 4 + 1] = pixels[j + 1];
		rgba[i * 4 + 2] = pixels[j + 2];
		rgba[i * 4 + 3] = 255;
	}
	return { width, height, rgba };
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.byteLength);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.byteLength);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.byteLength, crc32(out.subarray(4, 8 + data.byteLength)));
	return out;
}

/** An 8-bit RGBA PNG of exactly these pixels. */
export async function encodePng(rgba: ArrayLike<number>, width: number, height: number): Promise<Uint8Array> {
	const stride = width * 4;
	const raw = new Uint8Array((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x];
	}
	const ihdr = new Uint8Array(13);
	const view = new DataView(ihdr.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const parts = [
		new Uint8Array(SIGNATURE),
		chunk('IHDR', ihdr),
		chunk('IDAT', await pipeThrough(raw, new CompressionStream('deflate'))),
		chunk('IEND', new Uint8Array(0))
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.byteLength;
	}
	return out;
}
