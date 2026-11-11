// LOCAL DEV ONLY (2026-09-25): inputs for making an ethnicity's outfit plates in the browser, and the store for the
// one plate a user chooses. Nothing here is read by the live site.
//
// The ethnicity plates themselves are never read from disk: the browser makes them (src/lib/raceOutfits) from
//   - Anna's outfit plate: the user's blue-removed plates (2026-09-25, user: "could you use these plates of anna"),
//     1254 px PNGs the browser brings into the 1024 frame the way the maker's load_rgba does,
//   - Precious's plate of the same outfit, the race face and the mix values: local copies from the sandbox
//     race-plates tool (sandbox branch `Saizal`, pulled from the private authoring bucket; not on the public CDN).
// European is Anna's plate as it is and African is Precious's plate as it is.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const RACE_PLATES_DIR = path.resolve(
	process.env.RACE_PLATES_DIR ?? path.join(process.cwd(), '..', 'sandbox', 'race-plates')
);
/** Where a chosen plate is kept; the local CDN relay serves it as that avatar's clothes. Never uploaded. */
export const SAVED_RACE_OUTFITS_DIR = path.resolve(
	process.env.RACE_OUTFITS_SAVED_DIR ?? path.join(process.cwd(), '..', '.local-dev', 'ethnic-outfits')
);
/**
 * Outfits made in the Studio (2026-10-02, raceOutfitGeneration.ts): `<set>/light/<outfit>.png` and
 * `<set>/dark/<outfit>.png`, keyed 1024 plates, next to the user's own endpoint folders, which are never written.
 */
export const GENERATED_OUTFITS_DIR = path.resolve(
	process.env.RACE_GENERATED_OUTFITS_DIR ?? path.join(process.cwd(), '..', '.local-dev', 'generated-outfits')
);

/**
 * One pair of endpoints and the maker inputs that go with them. The female pair is Anna and
 * Precious; the male pair is Caleb (95b4bafb) and Malik (faa7f0b1), whose plates and mix values
 * were made the same way and live in a local folder (2026-10-01, user: "do not upload anything
 * to the public CDN"). Both are local only; nothing here is read by the live site.
 */
type PlateSet = {
	/** The European endpoint's outfit plates, `<outfit>.png`. */
	light: string;
	/** The African endpoint's outfit plates, `<outfit>.png`. */
	dark: string;
	/** Folder holding race_values.json, faces/ and outlines/. */
	maker: string;
	/** How a race's face file is named inside maker/faces. */
	faceFile: (race: string) => string;
	lightAvatar: string;
	darkAvatar: string;
	/**
	 * Race packs built on one of this pair's base plates (male packs sit on it exactly, female ones within ~2 px;
	 * measured 2026-10-01). They have no wardrobe of their own, so every ethnicity, their own included, is made and
	 * saved for them (no AVATAR_OWN_RACE entry). Mirrors RACE_MEMBERS in racePlates.svelte.ts.
	 */
	members: readonly string[];
};

const FEMALE: PlateSet = {
	light: path.resolve(
		process.env.RACE_ANNA_PLATES_DIR ?? '/Users/saizalpreetkaur./Desktop/outfit_plates_female/anna_plates_blue_removed'
	),
	dark: path.join(RACE_PLATES_DIR, 'plates', 'precious'),
	maker: path.join(RACE_PLATES_DIR, 'maker'),
	faceFile: (race) => `${race}_female_gpt.png`,
	lightAvatar: 'dd80126a',
	darkAvatar: 'd9048f3b',
	// Layla, Priya, Priya (GPT low), Mediterranean (GPT low), Indigenous (GPT low), East Asian, Indigenous avatar; then the
	// 8 newest GPT-low packs' women (2026-10-05, "connect all 8"), as RACE_MEMBERS in racePlates.svelte.ts
	members: ['ae5a0001', '5a5a0001', '5a5a0002', 'ed5a0001', '1d5a0001', '9298d617', '3e621eb8',
		'ae5a0002', '0a5a0001', 'ea5a0002', 'ac5a0001', 'af5a0001', 'e05a0001', '5e5a0001']
};
const MALE_DIR = path.resolve(
	process.env.RACE_MALE_PLATES_DIR ?? '/Users/saizalpreetkaur./Desktop/outfit_plates_male'
);
const MALE: PlateSet = {
	light: path.join(MALE_DIR, 'caleb'),
	dark: path.join(MALE_DIR, 'malik'),
	maker: path.join(MALE_DIR, 'maker'),
	faceFile: (race) => `${race}_male_gpt.png`,
	lightAvatar: '95b4bafb',
	darkAvatar: 'faa7f0b1',
	// the male race packs on Caleb's base (African on Malik's)
	members: ['ea5b0001', '1d5b0001', 'ed5b0001', 'ae5b0001', '0a5b0001', 'ac5b0001', '5a5b0001', '5e5b0001', 'af5b0001',
		'e05b0001']
};

const SETS: Readonly<Record<string, PlateSet>> = { female: FEMALE, male: MALE };
export type RaceSetName = keyof typeof SETS;

function plateSet(name: string): PlateSet {
	return SETS[name] ?? FEMALE;
}

export function raceSetName(name: string): 'female' | 'male' {
	return name === 'male' ? 'male' : 'female';
}

/** The light endpoint's white tee and jeans: the bald base a new outfit's European plate is drawn from. */
export function lightBasePlatePath(set: string): string {
	return path.join(plateSet(set).light, `${BASE_OUTFIT}.png`);
}

/** Where a made outfit's European (light) or African (dark) plate is kept. */
export function generatedOutfitDir(set: string, side: 'light' | 'dark'): string {
	return path.join(GENERATED_OUTFITS_DIR, raceSetName(set), side);
}

/** Avatars drawn in their pair's framing (each endpoint's head and body sit within ~1 px of the other's). */
export const RACE_PLATE_AVATARS: readonly string[] = Object.values(SETS).flatMap((s) => [
	s.lightAvatar,
	s.darkAvatar,
	...s.members
]);
/** The race whose plates an avatar's own wardrobe already is. */
export const AVATAR_OWN_RACE: Readonly<Record<string, string>> = Object.fromEntries(
	Object.values(SETS).flatMap((s) => [
		[s.lightAvatar, 'european'],
		[s.darkAvatar, 'african']
	])
);
/** Which pair an avatar belongs to. */
export const AVATAR_RACE_SET: Readonly<Record<string, string>> = Object.fromEntries(
	Object.entries(SETS).flatMap(([name, s]) => [
		[s.lightAvatar, name],
		[s.darkAvatar, name],
		...s.members.map((id) => [id, name])
	])
);
const ENDPOINT_RACES = ['european', 'african'];

export type RaceOutfitsForRace = {
	available: boolean;
	race: string;
	/** False for ethnicities the maker has no face and mix for (e.g. indigenous, mixed). */
	hasPlates: boolean;
	/** True when the browser has to make the plates (every race except European and African). */
	generated: boolean;
	/** `custom`: made in the Studio from a description (listed first, newest first). */
	outfits: { name: string; custom?: true }[];
};

function makerRaces(set: string = 'female'): string[] {
	try {
		return Object.keys(JSON.parse(readFileSync(path.join(plateSet(set).maker, 'race_values.json'), 'utf8')));
	} catch {
		return [];
	}
}

export function raceList(set: string = 'female'): string[] {
	return [...ENDPOINT_RACES, ...makerRaces(set)];
}

async function pngNames(dir: string): Promise<Set<string>> {
	try {
		return new Set((await readdir(dir)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -'.png'.length)));
	} catch {
		return new Set();
	}
}

/** Outfits in the user's endpoint folders: both endpoints of the pair have a plate of it. */
async function folderOutfitNames(set: string): Promise<string[]> {
	const s = plateSet(set);
	const dark = await pngNames(s.dark);
	return [...(await pngNames(s.light))].filter((id) => dark.has(id)).sort();
}

/** Outfits made in the Studio that have both plates, newest first. */
export async function customOutfitNames(set: string = 'female'): Promise<string[]> {
	const lightDir = generatedOutfitDir(set, 'light');
	const dark = await pngNames(generatedOutfitDir(set, 'dark'));
	const names = [...(await pngNames(lightDir))].filter((id) => dark.has(id));
	const made = await Promise.all(
		names.map(async (name) => ({ name, at: (await stat(path.join(lightDir, `${name}.png`))).mtimeMs }))
	);
	return made.sort((a, b) => b.at - a.at).map((m) => m.name);
}

/** Outfits that can be made: the folder outfits, then the ones made in the Studio. */
export async function outfitNames(set: string = 'female'): Promise<string[]> {
	const folder = await folderOutfitNames(set);
	return [...folder, ...(await customOutfitNames(set)).filter((id) => !folder.includes(id))];
}

export async function outfitsForRace(race: string, set: string = 'female'): Promise<RaceOutfitsForRace> {
	const s = plateSet(set);
	const available =
		existsSync(s.light) && existsSync(s.dark) && existsSync(path.join(s.maker, 'race_values.json'));
	const hasPlates = raceList(set).includes(race);
	const generated = hasPlates && !ENDPOINT_RACES.includes(race);
	if (!available || !hasPlates) return { available, race, hasPlates, generated, outfits: [] };
	const folder = await folderOutfitNames(set);
	const custom = (await customOutfitNames(set)).filter((id) => !folder.includes(id));
	const outfits = [...custom.map((name) => ({ name, custom: true as const })), ...folder.map((name) => ({ name }))];
	return { available, race, hasPlates, generated, outfits };
}

/** An endpoint's plate of an outfit: the user's folder first, else the Studio-made store; null if neither has it. */
async function endpointPlatePath(set: string, side: 'light' | 'dark', outfit: string): Promise<string | null> {
	const s = plateSet(set);
	if ((await folderOutfitNames(set)).includes(outfit)) {
		return path.join(side === 'dark' ? s.dark : s.light, `${outfit}.png`);
	}
	if ((await customOutfitNames(set)).includes(outfit)) return path.join(generatedOutfitDir(set, side), `${outfit}.png`);
	return null;
}

async function isCustomOutfit(set: string, outfit: string): Promise<boolean> {
	return !(await folderOutfitNames(set)).includes(outfit) && (await customOutfitNames(set)).includes(outfit);
}

export type RaceInput = { body: Uint8Array; contentType: string; etag: string };

async function fileInput(file: string, contentType: string): Promise<RaceInput> {
	const [body, info] = await Promise.all([readFile(file), stat(file)]);
	return { body, contentType, etag: `"${Math.round(info.mtimeMs).toString(36)}-${info.size.toString(36)}"` };
}

/** The outfit every base plate wears. */
const BASE_OUTFIT = 'white_t_shirt_and_jeans';

/**
 * One maker input, by name only (never by path): `anna` / `precious` (?outfit=), `face` (?race=), `values`,
 * `outline` (?race=<race>|anna|precious: the face-dot tool's jaw dots the chin cut follows), and
 * `base` (?race=): the ethnicity's base plate, bald in a white tee and blue jeans. The six made ethnicities' base
 * plates are their own pictures (the same files the faces come from); European and African are Anna's and
 * Precious's white-tee plates.
 */
export async function raceInput(
	kind: string,
	outfit: string,
	race: string,
	set: string = 'female'
): Promise<RaceInput | null> {
	const s = plateSet(set);
	if (kind === 'values') {
		return fileInput(path.join(s.maker, 'race_values.json'), 'application/json');
	}
	if (kind === 'face') {
		if (!makerRaces(set).includes(race)) return null;
		return fileInput(path.join(s.maker, 'faces', s.faceFile(race)), 'image/png');
	}
	if (kind === 'outline') {
		// the endpoints' outlines are named anna/precious in both pairs' folders (light/dark endpoint)
		if (race === 'anna' || race === 'precious') {
			return fileInput(path.join(s.maker, 'outlines', `${race}_outline.json`), 'application/json');
		}
		if (!makerRaces(set).includes(race)) return null;
		const stem = s.faceFile(race).replace(/\.png$/, '');
		return fileInput(path.join(s.maker, 'outlines', `${stem}_outline.json`), 'application/json');
	}
	if (kind === 'base') {
		if (race === 'european') return fileInput(path.join(s.light, `${BASE_OUTFIT}.png`), 'image/png');
		if (race === 'african') return fileInput(path.join(s.dark, `${BASE_OUTFIT}.png`), 'image/png');
		if (!makerRaces(set).includes(race)) return null;
		return fileInput(path.join(s.maker, 'faces', s.faceFile(race)), 'image/png');
	}
	// 'anna'/'precious' name the light and dark endpoints of whichever pair is asked for
	if (kind !== 'anna' && kind !== 'precious') return null;
	const file = await endpointPlatePath(set, kind === 'precious' ? 'dark' : 'light', outfit);
	return file ? fileInput(file, 'image/png') : null;
}

/** The clothes id a chosen plate is saved under for an avatar whose own race it is not. */
export function raceClothesId(outfit: string, race: string): string {
	return `${outfit}--${race}`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Keep the plate a user chose (a 1024x1024 PNG made in the browser) as `<avatar>/<outfit>--<race>.png`. An outfit
 * made in the Studio is not in the avatar's own clothes folder, so on the avatar's own race it is kept too, under
 * the plain outfit id the character wears it by.
 */
export async function saveChosenRacePlate(
	avatarId: string,
	outfit: string,
	race: string,
	png: Uint8Array
): Promise<{ clothesId: string }> {
	if (!RACE_PLATE_AVATARS.includes(avatarId)) throw new Error('this avatar is not drawn in the race plates framing');
	const set = AVATAR_RACE_SET[avatarId] ?? 'female';
	const ownRace = AVATAR_OWN_RACE[avatarId] === race;
	if (!raceList(set).includes(race) || (ownRace && !(await isCustomOutfit(set, outfit))))
		throw new Error('no plate to save for this race');
	if (!(await outfitNames(set)).includes(outfit)) throw new Error('unknown outfit');
	const isPng = PNG_SIGNATURE.every((b, i) => png[i] === b);
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	if (!isPng || png.byteLength < 24 || view.getUint32(16) !== 1024 || view.getUint32(20) !== 1024) {
		throw new Error('expected a 1024x1024 PNG');
	}
	const clothesId = ownRace ? outfit : raceClothesId(outfit, race);
	const dir = path.join(SAVED_RACE_OUTFITS_DIR, avatarId);
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, `${clothesId}.png`), png);
	return { clothesId };
}
