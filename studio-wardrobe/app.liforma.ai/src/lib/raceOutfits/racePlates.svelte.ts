// LOCAL DEV ONLY (2026-09-25): ethnicity outfit plates for the character page. European is Anna's plate (the user's
// blue-removed plates) and African is Precious's plate, as they are; every other ethnicity is made in the browser the first time it is
// shown and kept only in memory (object URLs). Nothing is written anywhere until a character is saved wearing one
// (saveChosenRacePlate), and then only to a local folder that the local CDN relay serves.
import { raceInputUrl, setRaceSet, type RaceSet } from './raceInputUrl';
import { makeRacePlateInWorker, promoteRacePlate } from './racePlatePool';
import type { RacePlateReport } from './racePlateMaker';

/** The race whose plates an avatar's own wardrobe already is (mirrors AVATAR_OWN_RACE on the server). */
export const OWN_RACE: Readonly<Record<string, string>> = {
	dd80126a: 'european',
	d9048f3b: 'african',
	'95b4bafb': 'european',
	faa7f0b1: 'african'
};
/**
 * Race packs built on one of a pair's base plates (mirrors RACE_MEMBERS on the server). Their bodies sit on the
 * pair's plate for their race (male packs exactly, female within ~2 px; measured 2026-10-01), so the pair's
 * ethnicity plates fit them. They have no wardrobe of their own, so every ethnicity, their own included, is made
 * and saved like any other (no OWN_RACE entry).
 */
const RACE_MEMBERS: Readonly<Record<RaceSet, readonly string[]>> = {
	// Layla, Priya, Priya (GPT low), Mediterranean (GPT low), Indigenous (GPT low), East Asian, Indigenous avatar; then the
	// 8 newest GPT-low packs (2026-10-05, "connect all 8"): Layla (GPT low), North African, East Asian, Pacific Islander,
	// Precious (GPT low), European (bald Anna) and Southeast Asian women, and the European man (bald Caleb)
	female: ['ae5a0001', '5a5a0001', '5a5a0002', 'ed5a0001', '1d5a0001', '9298d617', '3e621eb8',
		'ae5a0002', '0a5a0001', 'ea5a0002', 'ac5a0001', 'af5a0001', 'e05a0001', '5e5a0001'],
	// the male race packs on Caleb's base (African on Malik's)
	male: ['ea5b0001', '1d5b0001', 'ed5b0001', 'ae5b0001', '0a5b0001', 'ac5b0001', '5a5b0001', '5e5b0001', 'af5b0001',
		'e05b0001']
};
/** Which endpoint pair an avatar belongs to (mirrors AVATAR_RACE_SET on the server). */
export const AVATAR_RACE_SET: Readonly<Record<string, RaceSet>> = {
	dd80126a: 'female',
	d9048f3b: 'female',
	'95b4bafb': 'male',
	faa7f0b1: 'male',
	...Object.fromEntries(
		(Object.entries(RACE_MEMBERS) as [RaceSet, readonly string[]][]).flatMap(([set, ids]) =>
			ids.map((id) => [id, set])
		)
	)
};
/** Avatars drawn in their pair's framing. */
export const RACE_PLATE_AVATARS: readonly string[] = Object.keys(AVATAR_RACE_SET);

/**
 * The talking face for each ethnicity, per pair (2026-10-01, user: "If an ethnicity is changed for a character, the
 * animation plate that is being pasted on it should also change to that ethnicity"). The ethnicity plates change only
 * the body; the player animates the avatar's own face, so the character moves to the pack of the chosen ethnicity.
 * The first pack listed is the one switched to; every listed pack already counts as that ethnicity. Malik is left out
 * because his own outfits are not served locally (af5b0001 sits on his body). Ethnicities with no pack keep the face.
 * The GPT-low pack comes first (2026-10-05, the user's rule "we are only using the GPT low generated plates"); the older
 * packs stay listed so characters on them still count as that ethnicity.
 */
const RACE_FACE_PACKS: Readonly<Record<RaceSet, Readonly<Record<string, readonly string[]>>>> = {
	female: {
		european: ['e05a0001', 'dd80126a'],
		african: ['af5a0001', 'd9048f3b'],
		'east-asian': ['ea5a0002', '9298d617'],
		'southeast-asian': ['5e5a0001'],
		'middle-eastern': ['ae5a0002', 'ae5a0001'],
		'south-asian': ['5a5a0002', '5a5a0001'],
		mediterranean: ['ed5a0001'],
		'north-african': ['0a5a0001'],
		indigenous: ['1d5a0001', '3e621eb8'],
		'pacific-islander': ['ac5a0001']
	},
	male: {
		european: ['e05b0001', '95b4bafb'],
		african: ['af5b0001', 'faa7f0b1'],
		'east-asian': ['ea5b0001'],
		'southeast-asian': ['5e5b0001'],
		mediterranean: ['ed5b0001'],
		'middle-eastern': ['ae5b0001'],
		'north-african': ['0a5b0001'],
		'south-asian': ['5a5b0001'],
		indigenous: ['1d5b0001'],
		'pacific-islander': ['ac5b0001']
	}
};

/** The avatar whose face should talk for this ethnicity: the avatar itself when it already is that ethnicity, else
 * the ethnicity's pack in the same pair, else null (no face made for it yet). */
export function facePackForRace(avatarId: string, race: string): string | null {
	const set = AVATAR_RACE_SET[avatarId];
	if (!set) return null;
	const packs = RACE_FACE_PACKS[set][race] ?? [];
	return packs.includes(avatarId) ? avatarId : (packs[0] ?? null);
}

/**
 * The pair the page is currently showing. Reactive on purpose: the tiles build their addresses
 * while rendering, and the avatar is only known afterwards, so a plain variable left every tile
 * asking for the female pictures after the page switched to a male avatar (2026-10-01).
 */
const current = $state<{ set: RaceSet }>({ set: 'female' });

/** The pair the page is showing; reading this in a template re-runs it when the avatar changes. */
export function currentRaceSet(): RaceSet {
	return current.set;
}

/**
 * Point the maker at the pair this avatar belongs to. The character page calls this when the
 * avatar changes; everything below reads the current pair, and made plates are keyed by it so
 * one pair's plates are never shown for the other.
 */
export function useRaceSetFor(avatarId: string): void {
	const set = AVATAR_RACE_SET[avatarId] ?? 'female';
	current.set = set;
	// the worker's own copy of the module: kept in step for any job that does not carry its set
	setRaceSet(set);
}


export type ShownRacePlate = {
	/** The made plate; empty while it is being made or when it could not be made (never Anna's face instead). */
	readonly url: string;
	readonly ready: boolean;
	readonly report: RacePlateReport | null;
	readonly error: string;
};

const plates = $state<{
	made: Record<string, { url: string; report: RacePlateReport | null }>;
	failed: Record<string, string>;
}>({ made: {}, failed: {} });
/** Not reactive: read while rendering, so asking for a plate must not write state synchronously. */
const requested: Record<string, number> = {};
/** A plate that fails (e.g. the dev server restarting) is tried again this many times, this far apart. */
const TRIES = 3;
const RETRY_MS = 3000;

export function isMadeInBrowser(race: string): boolean {
	return race !== 'european' && race !== 'african';
}

/** An ethnicity's base plate: bald, in a white tee and blue jeans (nothing to make). */
export function raceBasePlateUrl(race: string): string {
	return raceInputUrl('base', race, current.set);
}

/** Anna's plate for every race but African, whose base is Precious's plate. */
export function baseRacePlateUrl(race: string, outfit: string): string {
	return raceInputUrl(race === 'african' ? 'precious' : 'anna', outfit, current.set);
}

function key(race: string, outfit: string): string {
	return `${current.set}|${race}|${outfit}`;
}

function request(race: string, outfit: string, urgent: boolean) {
	const k = key(race, outfit);
	if (requested[k]) {
		if (urgent) promoteRacePlate(race, outfit, 'image/webp', current.set);
		return;
	}
	requested[k] = 1;
	attempt(race, outfit, urgent);
}

function attempt(race: string, outfit: string, urgent: boolean) {
	const k = key(race, outfit);
	const set = current.set;
	makeRacePlateInWorker(race, outfit, 'image/webp', set, urgent)
		.then(({ blob, report }) => {
			plates.made[k] = { url: URL.createObjectURL(blob), report };
			delete plates.failed[k];
		})
		.catch((e: unknown) => {
			const message = e instanceof Error ? e.message : String(e);
			plates.failed[k] = `${message} (tried ${requested[k]} of ${TRIES} times)`;
			if (requested[k] < TRIES) {
				requested[k] += 1;
				setTimeout(() => {
					delete plates.failed[k];
					attempt(race, outfit, true);
				}, RETRY_MS);
			}
		});
}

/** The outfit every ethnicity's base plate already wears (served as a file, never made in the browser). */
export const BASE_OUTFIT = 'white_t_shirt_and_jeans';

/** The plate to show for an outfit in an ethnicity; starts making it when it is not made yet. */
export function racePlate(race: string, outfit: string, urgent = false): ShownRacePlate {
	if (!outfit) return { url: '', ready: false, report: null, error: '' };
	// the white tee and jeans exists for every ethnicity as its own base picture: show that file at once instead of
	// queueing it behind the plate maker (2026-09-29: it waited like every made outfit although it is never made)
	if (outfit === BASE_OUTFIT) return { url: raceBasePlateUrl(race), ready: true, report: null, error: '' };
	if (!isMadeInBrowser(race)) return { url: baseRacePlateUrl(race, outfit), ready: true, report: null, error: '' };
	const k = key(race, outfit);
	const made = plates.made[k];
	if (made) return { url: made.url, ready: true, report: made.report, error: '' };
	request(race, outfit, urgent);
	return { url: '', ready: false, report: null, error: plates.failed[k] ?? '' };
}

/** Words to add to a tile's name while its plate is not there yet. */
export function racePlateNote(plate: ShownRacePlate): string {
	if (plate.ready) return '';
	return plate.error ? " · couldn't make it" : ' · making…';
}

/** The clothes id an avatar wears an outfit under in an ethnicity: its own race's plates are its own clothes. */
export function raceClothesId(avatarId: string, race: string, outfit: string): string {
	return OWN_RACE[avatarId] === race ? outfit : `${outfit}--${race}`;
}

/** `barista--east-asian` -> the outfit and ethnicity, or null for an ordinary clothes id. */
export function parseRaceClothesId(id: string): { outfit: string; race: string } | null {
	const at = id.indexOf('--');
	if (at <= 0) return null;
	return { outfit: id.slice(0, at), race: id.slice(at + 2) };
}

/** Outfits made in the Studio from a description (2026-10-02, NewRaceOutfitPanel): not in any avatar's own folder. */
const customOutfits = $state<Record<string, true>>({});

export function noteCustomOutfits(names: readonly string[]): void {
	for (const name of names) customOutfits[name] = true;
}

/**
 * The ethnicity plate a clothes id stands for: `<outfit>--<race>`, or an outfit made in the Studio worn on the
 * avatar's own race under its plain id (its plate has to be kept on save like any other ethnicity's).
 */
export function raceChoice(avatarId: string, clothesId: string): { outfit: string; race: string } | null {
	const parsed = parseRaceClothesId(clothesId);
	if (parsed) return parsed;
	const own = OWN_RACE[avatarId];
	return own && customOutfits[clothesId] ? { outfit: clothesId, race: own } : null;
}

/**
 * Keep the plate a character was saved wearing (an exact 1024 PNG, made again for the save) and answer its clothes
 * id. An avatar's own race needs nothing saved, unless the outfit was made in the Studio.
 */
export async function saveChosenRacePlate(avatarId: string, race: string, outfit: string): Promise<string> {
	if (OWN_RACE[avatarId] === race && !customOutfits[outfit]) return outfit;
	// built from the avatar's own pair, not whatever the page last looked at
	const set = AVATAR_RACE_SET[avatarId] ?? 'female';
	const png = (await makeRacePlateInWorker(race, outfit, 'image/png', set, true)).blob;
	const query = `avatarId=${encodeURIComponent(avatarId)}&outfit=${encodeURIComponent(outfit)}&race=${encodeURIComponent(race)}`;
	const res = await fetch(`/library/race-outfits/save?${query}`, {
		method: 'POST',
		headers: { 'content-type': 'image/png' },
		body: png
	});
	if (!res.ok) throw new Error(`could not keep the ${race} ${outfit} plate (${res.status})`);
	return ((await res.json()) as { clothesId: string }).clothesId;
}
