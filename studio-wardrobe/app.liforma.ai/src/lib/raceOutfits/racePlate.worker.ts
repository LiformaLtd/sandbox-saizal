// LOCAL DEV ONLY (2026-09-25): makes one ethnicity outfit plate off the main thread (racePlateMaker.ts) from the
// inputs served by /library/race-outfits/input (the two endpoint plates, the race face, its chin outline and the
// endpoints' outlines, the mix values), and answers it as an image blob. Nothing is stored.
// Inputs are read and resized exactly as the Python maker does (pngCodec.ts, plateResize.ts), so the plates match
// it byte for byte. European answers Anna's plate and African Precious's plate, in the 1024 frame.
import { decodePng, encodePng } from './pngCodec';
import { raceInputUrl, type RaceSet } from './raceInputUrl';
import { toPlateFrame } from './plateResize';
import { bodyBelowNeck, NECK_BASE_ROW } from './bodyPreview';
import {
	makeRacePlate,
	PLATE_SIZE,
	prepareFace,
	type FaceOutline,
	type PreparedFace,
	type RaceMix,
	type RacePlateReport
} from './racePlateMaker';

export type RacePlateJob = {
	readonly id: number;
	readonly race: string;
	readonly outfit: string;
	/** Which endpoint pair to build from; the worker has its own module scope, so it is carried here. */
	readonly set: RaceSet;
	/** image/webp to show it, image/png (exact) to keep it. */
	readonly format: 'image/webp' | 'image/png';
	/**
	 * A new outfit's first picture to show for approval with the head and bare neck taken away and the empty top cropped
	 * off (bodyPreview.ts, NewRaceOutfitPanel). `race` and `outfit` are not read then.
	 */
	readonly bodyOnly?: string;
};

export type RacePlateJobResult =
	| { readonly id: number; readonly blob: Blob; readonly report: RacePlateReport | null }
	| { readonly id: number; readonly error: string };

type WorkerScope = {
	onmessage: ((event: MessageEvent<RacePlateJob>) => void) | null;
	postMessage(message: RacePlateJobResult): void;
};

const scope = self as unknown as WorkerScope;
const KEEP_PLATES = 6;
/** Mirrors BASE_OUTFIT in racePlates.svelte.ts (a worker cannot import a .svelte.ts module). */
const BASE_OUTFIT = 'white_t_shirt_and_jeans';

const faces = new Map<string, Promise<PreparedFace>>();
/** The face-dot outlines the chin cut follows: one per race face and one per endpoint, per pair. */
const outlines = new Map<string, Promise<FaceOutline>>();
const plates = new Map<string, Promise<Uint8Array>>();
/** Mix values per pair; each pair has its own file. */
const values = new Map<RaceSet, Promise<Record<string, RaceMix>>>();

async function fetchOk(url: string): Promise<Response> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
	return res;
}

const PNG_START = [0x89, 0x50, 0x4e, 0x47];

/** Any other image format, through the browser's decoder (colour rounded at soft edges; PNGs are read exactly). */
async function decodeOther(bytes: Uint8Array): Promise<{ width: number; height: number; rgba: Uint8Array }> {
	const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]), { colorSpaceConversion: 'none' });
	const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('no 2d canvas in this worker');
	ctx.drawImage(bitmap, 0, 0);
	const { width, height } = bitmap;
	bitmap.close();
	return { width, height, rgba: new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer) };
}

/** An input image as RGBA in the 1024 frame, exactly as the maker's load_rgba reads it. */
async function pixels(url: string): Promise<Uint8Array> {
	const bytes = new Uint8Array(await (await fetchOk(url)).arrayBuffer());
	const image = PNG_START.every((b, i) => bytes[i] === b) ? await decodePng(bytes) : await decodeOther(bytes);
	return toPlateFrame(image.rgba, image.width, image.height, PLATE_SIZE);
}

function plate(kind: 'anna' | 'precious', outfit: string, set: RaceSet): Promise<Uint8Array> {
	const key = `${set}:${kind}:${outfit}`;
	let hit = plates.get(key);
	if (hit) {
		plates.delete(key);
	} else {
		hit = pixels(raceInputUrl(kind, outfit, set));
		hit.catch(() => plates.delete(key));
	}
	plates.set(key, hit);
	while (plates.size > KEEP_PLATES) plates.delete(plates.keys().next().value as string);
	return hit;
}

function outline(name: string, set: RaceSet): Promise<FaceOutline> {
	const key = `${set}:${name}`;
	let hit = outlines.get(key);
	if (!hit) {
		hit = fetchOk(raceInputUrl('outline', name, set)).then((r) => r.json() as Promise<FaceOutline>);
		hit.catch(() => outlines.delete(key));
		outlines.set(key, hit);
	}
	return hit;
}

/** The race face with its chin cut: the lowest of its own, the light and the dark endpoint's chin lines. */
function face(race: string, set: RaceSet): Promise<PreparedFace> {
	const key = `${set}:${race}`;
	let hit = faces.get(key);
	if (!hit) {
		hit = Promise.all([
			pixels(raceInputUrl('face', race, set)),
			outline(race, set),
			outline('anna', set),
			outline('precious', set)
		]).then(([rgba, own, light, dark]) => prepareFace(rgba, [own, light, dark]));
		hit.catch(() => faces.delete(key));
		faces.set(key, hit);
	}
	return hit;
}

function mixes(set: RaceSet): Promise<Record<string, RaceMix>> {
	let hit = values.get(set);
	if (!hit) {
		hit = fetchOk(raceInputUrl('values', '', set)).then((r) => r.json() as Promise<Record<string, RaceMix>>);
		hit.catch(() => values.delete(set));
		values.set(set, hit);
	}
	return hit;
}

async function makePlate(
	race: string,
	outfit: string,
	set: RaceSet
): Promise<{ rgba: Uint8Array | Uint8ClampedArray; report: RacePlateReport | null }> {
	if (race === 'european') return { rgba: await plate('anna', outfit, set), report: null };
	if (race === 'african') return { rgba: await plate('precious', outfit, set), report: null };
	// the white tee and jeans is the ethnicity's own base picture: read it in the 1024 frame, nothing to make
	if (outfit === BASE_OUTFIT) return { rgba: await pixels(raceInputUrl('base', race, set)), report: null };
	const [all, anna, precious, lightBase, raceFace] = await Promise.all([
		mixes(set),
		plate('anna', outfit, set),
		plate('precious', outfit, set),
		plate('anna', BASE_OUTFIT, set), // the garment test compares the outfit with the same man in the white tee
		face(race, set)
	]);
	const mix = all[race];
	if (!mix) throw new Error(`no mix values for ${race}`);
	return makeRacePlate(anna, precious, lightBase, raceFace, mix);
}

async function encode(rgba: Uint8Array | Uint8ClampedArray, format: RacePlateJob['format']): Promise<Blob> {
	if (format === 'image/png') {
		return new Blob([(await encodePng(rgba, PLATE_SIZE, PLATE_SIZE)) as Uint8Array<ArrayBuffer>], { type: format });
	}
	const canvas = new OffscreenCanvas(PLATE_SIZE, PLATE_SIZE);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d canvas in this worker');
	ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), PLATE_SIZE, PLATE_SIZE), 0, 0);
	return canvas.convertToBlob({ type: format, quality: 0.92 });
}

/** The first picture below the neck, as an image of its own (cropped, so not in the plate frame). */
async function bodyOnlyPreview(bodyUrl: string, set: RaceSet, format: RacePlateJob['format']): Promise<Blob> {
	const [body, base, light] = await Promise.all([
		pixels(bodyUrl),
		plate('anna', BASE_OUTFIT, set),
		outline('anna', set)
	]);
	const { below } = prepareFace(body, [light]);
	const cut = bodyBelowNeck(body, base, below, NECK_BASE_ROW[set], PLATE_SIZE);
	const canvas = new OffscreenCanvas(cut.width, cut.height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d canvas in this worker');
	ctx.putImageData(new ImageData(cut.rgba, cut.width, cut.height), 0, 0);
	return canvas.convertToBlob({ type: format, quality: 0.92 });
}

scope.onmessage = async (event) => {
	const { id, race, outfit, format, set, bodyOnly } = event.data;
	try {
		if (bodyOnly) {
			scope.postMessage({ id, blob: await bodyOnlyPreview(bodyOnly, set ?? 'female', format), report: null });
			return;
		}
		const { rgba, report } = await makePlate(race, outfit, set ?? 'female');
		scope.postMessage({ id, blob: await encode(rgba, format), report });
	} catch (e) {
		scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
	}
};
