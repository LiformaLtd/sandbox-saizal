// LOCAL DEV ONLY: how hair ids group into styles and colours, which ones an ethnicity is offered, and what the hair picker shows.
// Moved here from the app's src/lib/raceOutfits/raceHair.ts (which now re-exports it) so the Experience Studio's character panel
// and the character page share one picker (2026-10-04, user: "make sure that the color palette appears in every character that
// is made. So we need to update the whole UX that exists, not just for specific characters").
//
// Race-tagged hair (2026-09-25): hair layers made for one ethnicity's head are listed as `<hair>--<race>` (e.g.
// `halfup-black.1--south-asian`, from ~/Desktop/hair_layers/dd80126a), the way an ethnicity outfit is `<outfit>--<race>`.
// The user's rule: "only show those hair if a South Asian ethnicity is chosen".

import { isHiddenHairStyle } from './hiddenHairStyles';

export type RaceHairId = { readonly hair: string; readonly race: string };

/** `<hair>--<race>` -> its parts, or null for an ordinary hair id. */
export function parseRaceHairId(id: string): RaceHairId | null {
	const at = id.lastIndexOf('--');
	if (at < 1 || at + 2 >= id.length) return null;
	return { hair: id.slice(0, at), race: id.slice(at + 2) };
}

// 2026-10-02: the fitted bob went to every race, and four of them (East Asian, Southeast Asian, Indigenous, Pacific
// Islander) had no other fits. The user chose "a race's fitted style replaces Anna's version of that style, and styles it has
// no fit for still show Anna's". So an ethnicity's own fits come first, then every untagged style it has no fit for (all of
// that style's colours). The hidden styles (hiddenHairStyles.ts: the elf princess and long-blonde.1) are never offered.

/** The hair ids to offer for an ethnicity: its own fits, then the untagged hair of every style it has no fit for. */
export function hairIdsForEthnicity(ids: readonly string[], ethnicity: string): string[] {
	const race = ethnicity.trim();
	const visible = ids.filter((id) => !isHiddenHairStyle(id));
	const untagged = visible.filter((id) => !parseRaceHairId(id));
	const own = race ? visible.filter((id) => parseRaceHairId(id)?.race === race) : [];
	if (!own.length) return untagged;
	const fitted = new Set(own.map((id) => parseHairColourId(id).style));
	return [...own, ...untagged.filter((id) => !fitted.has(parseHairColourId(id).style))];
}

/** The hair part of a race-tagged id, for labels; an ordinary id unchanged. */
export function raceHairBaseId(id: string): string {
	return parseRaceHairId(id)?.hair ?? id;
}

// Colours (2026-09-29, then 2026-10-04): every style, men's and women's, comes in these five, each the same shade on every style
// (hair_work/colour_unify: all five of a style made from one picture of it; the shades are the user's picks in the colour
// picker: "i have chosen for anna, use the same choices for all"). A style offers these five; its colours outside them (the men's
// old brown/blonde/ginger) are not offered, except the blue and grey originals kept beside the five (KEPT_ORIGINALS, below), and
// where a style has both its plain original
// and the matched `<style>-<colour>` / `<style>_<colour>` of the same colour, the matched one is offered. A style with none of
// the five (the caps) keeps its own. Each swatch is its shade two-thirds of the way up its lightness, except dark brown, taken
// from its brighter strands: the dark brown pick is as dark as the black one and differs in its warmer highlights.
export const HAIR_COLOURS = [
	{ id: 'black', label: 'Black', swatch: '#1c1715' },
	{ id: 'darkbrown', label: 'Dark brown', swatch: '#3f2c27' },
	{ id: 'chestnut', label: 'Chestnut', swatch: '#432010' },
	{ id: 'honeyblonde', label: 'Honey blonde', swatch: '#d29b5f' },
	{ id: 'copper', label: 'Copper', swatch: '#83330b' }
] as const;
export type HairColourId = (typeof HAIR_COLOURS)[number]['id'];

/** The colour a style was made in, i.e. what its plain `<style>--<race>` layer is. */
const STYLE_COLOUR: Readonly<Record<string, string>> = {
	'halfup-black.1': 'black',
	'sweptback-brown.1': 'darkbrown',
	'slickback-blonde.1': 'honeyblonde',
	'lob-honeyblonde.1': 'honeyblonde',
	'topknot-black.1': 'black',
	'bob-blonde_blue.1': 'bluetips',
	'bob-brown.1': 'darkbrown',
	'long-black.1': 'black',
	'long-black.2': 'black',
	'long-blonde.1': 'honeyblonde',
	'long-blonde.3': 'honeyblonde',
	'long-brown_blonde.1': 'chestnut',
	'long-brown.2': 'darkbrown',
	'long-ginger.1': 'copper',
	'short-blue.1': 'blue'
};
/** the original looks kept beside the five (user 2026-10-04, on the styles that had blue: "keep all the og hairstyles/ colours"):
 * Anna's blue-tipped bob and blue short cut, Caleb's blue-tipped spiky and long; and Caleb's grey (2026-10-05, "keep the gray as
 * well": fringe, long, mullet, pompadour, ponytail, short curly, short spiky), the one original colour the five lack. Each gets
 * its own tile next to the style's tile */
const KEPT_ORIGINALS = new Set(['blue', 'bluetips', 'blonde_with_blue_tips', 'grey']);
const BLUE_TIPS = 'linear-gradient(180deg, #e2bd7d 0 55%, #1f8fff 55% 100%)';
/** colours outside the five: the kept originals, and the caps' own (a style with none of the five) */
const OTHER_SWATCH: Readonly<Record<string, { label: string; swatch: string }>> = {
	blue: { label: 'Blue', swatch: '#1f8fff' },
	bluetips: { label: 'Blue tips', swatch: BLUE_TIPS },
	blonde_with_blue_tips: { label: 'Blue tips', swatch: BLUE_TIPS },
	grey: { label: 'Grey', swatch: '#a9abb0' },
	beige: { label: 'Beige', swatch: '#cdb48e' },
	plaid: { label: 'Plaid', swatch: 'repeating-linear-gradient(45deg, #7b2d26 0 4px, #2f3e5c 4px 8px)' }
};
const COLOUR_SUFFIX = new RegExp(`^(.+)-(${HAIR_COLOURS.map((c) => c.id).join('|')})$`);

// The men's hair (Adam's live layers, borrowed by every male race pack) is named `<style>_<colour>` (`fringe_black`,
// `short_spikey_blonde_with_blue_tips`, `cap_plaid`); since 2026-10-04 it also comes in the five (`fringe_darkbrown`, ... from
// the local folder) and its old colours still parse, so they group and drop out.
const OLD_MALE_COLOURS = ['blonde_with_blue_tips', 'brown', 'blonde', 'ginger', 'grey', 'beige', 'plaid'];
const MALE_COLOUR_SUFFIX = new RegExp(`^(.+?)_(${[...HAIR_COLOURS.map((c) => c.id), ...OLD_MALE_COLOURS].join('|')})$`);

export type HairColourChoice = {
	readonly id: string;
	readonly colour: string;
	readonly label: string;
	readonly swatch: string;
};
export type HairStyleGroup = {
	/** `<style>--<race>`, or the style for untagged hair (Anna's own colours, `<style>-<colour>`, group under it) */
	readonly key: string;
	/** the style name without its race tag or colour, for labels */
	readonly style: string;
	/** the id shown in the inventory: the black version when there is one */
	readonly tileId: string;
	/** every colour of the style, palette order */
	readonly choices: readonly HairColourChoice[];
};

/** `<style>[-<colour>]--<race>` -> its style, colour and race, and whether the colour is in the id (not just the style's own). */
function parseHair(id: string): { style: string; colour: string; race: string; named: boolean } {
	const tagged = parseRaceHairId(id);
	const hair = tagged?.hair ?? id;
	const m = COLOUR_SUFFIX.exec(hair) ?? MALE_COLOUR_SUFFIX.exec(hair);
	if (m) return { style: m[1], colour: m[2], race: tagged?.race ?? '', named: true };
	return { style: hair, colour: STYLE_COLOUR[hair] ?? 'original', race: tagged?.race ?? '', named: false };
}

/** `<style>[-<colour>]--<race>` -> its style, colour and race. */
export function parseHairColourId(id: string): { style: string; colour: string; race: string } {
	const { style, colour, race } = parseHair(id);
	return { style, colour, race };
}

/** One group per style, in the order the styles first appear. */
export function groupHairStyles(ids: readonly string[]): HairStyleGroup[] {
	const order: string[] = [];
	const members = new Map<string, { style: string; byColour: Map<string, { id: string; named: boolean }> }>();
	for (const id of ids) {
		const { style, colour, race, named } = parseHair(id);
		const key = race ? `${style}--${race}` : style;
		if (!members.has(key)) {
			members.set(key, { style, byColour: new Map() });
			order.push(key);
		}
		const g = members.get(key)!;
		const had = g.byColour.get(colour);
		// the matched `<style>-<colour>` wins over the style's plain original of the same colour
		if (!had || (named && !had.named)) g.byColour.set(colour, { id, named });
	}
	return order.map((key) => {
		const { style, byColour } = members.get(key)!;
		let choices: HairColourChoice[] = HAIR_COLOURS.filter((c) => byColour.has(c.id)).map((c) => ({
			id: byColour.get(c.id)!.id,
			colour: c.id,
			label: c.label,
			swatch: c.swatch
		}));
		if (choices.length) {
			for (const [colour, { id }] of byColour) {
				if (KEPT_ORIGINALS.has(colour)) choices.push({ id, colour, ...OTHER_SWATCH[colour] });
			}
		} else {
			choices = [...byColour].map(([colour, { id }]) => {
				const other = OTHER_SWATCH[colour] ?? { label: 'Original', swatch: '#8a8a8a' };
				return { id, colour, label: other.label, swatch: other.swatch };
			});
		}
		const black = choices.find((c) => c.colour === 'black');
		return { key, style, tileId: (black ?? choices[0]).id, choices };
	});
}

/** The group a hair id belongs to, if any. */
export function hairStyleGroupOf(groups: readonly HairStyleGroup[], id: string): HairStyleGroup | undefined {
	return groups.find((g) => g.choices.some((c) => c.id === id));
}

/** The same hairstyle, and colour when it exists, made for another ethnicity's head: the id to wear after the
 * character's ethnicity changes (2026-09-29, user: "if Anna is changed to some other ethnicity, her hairstyle carries;
 * it does not change to the new ethnicity's fit for the same hairstyle"). Picks, among the ids offered for the new
 * ethnicity (hairIdsForEthnicity), the one with the same style and colour; else the same style in black; else the
 * style's first colour. Null when the new ethnicity has no version of the style (keep what is worn). */
export function hairIdForEthnicity(current: string, available: readonly string[], ethnicity: string): string | null {
	if (!current) return null;
	const { style, colour } = parseHairColourId(current);
	const offered = hairIdsForEthnicity(available, ethnicity);
	if (offered.includes(current)) return current;
	const group = groupHairStyles(offered).find((g) => g.style === style);
	if (!group) return null;
	return (
		group.choices.find((c) => c.colour === colour)?.id ??
		group.choices.find((c) => c.colour === 'black')?.id ??
		group.choices[0].id
	);
}

// ---------------------------------------------------------------------------------------------------------------------------
// The hair picker with the palette at the side (2026-10-04, user: "the palette should be laid on the side. So that once a color
// is chosen, all the hairstyles are converted to that color. And if another hairstyle is chosen after that, it stays in the
// chosen color"). The picker keeps one chosen colour; every style tile shows that colour; choosing a style wears it in that
// colour; choosing a colour re-colours what is worn.

const FIVE = new Set<string>(HAIR_COLOURS.map((c) => c.id));

/** Whether a group comes in the five colours (the caps do not: they keep their own two). */
export function hasHouseColours(group: HairStyleGroup): boolean {
	return group.choices.some((c) => FIVE.has(c.colour));
}

/** The colour a hair id is in, when it is one of the five; '' otherwise (bald, a cap, an unknown id). */
export function hairColourOf(id: string): HairColourId | '' {
	if (!id) return '';
	const { colour } = parseHairColourId(id);
	return FIVE.has(colour) ? (colour as HairColourId) : '';
}

/** The colours worth showing in the palette: the five, in order, that at least one style comes in. */
export function paletteColours(groups: readonly HairStyleGroup[]): (typeof HAIR_COLOURS)[number][] {
	const present = new Set(groups.flatMap((g) => g.choices.map((c) => c.colour)));
	return HAIR_COLOURS.filter((c) => present.has(c.id));
}

/** A style in the chosen colour; its black version, then its first colour, when it was not made in that one. */
export function styleInColour(group: HairStyleGroup, colour: string): HairColourChoice {
	return (
		group.choices.find((c) => c.colour === colour) ??
		group.choices.find((c) => c.colour === 'black') ??
		group.choices[0]
	);
}

export type HairTile = {
	/** the id worn when the tile is chosen */
	readonly id: string;
	/** the label under the tile: the style (its colour is in the palette); a cap names its own colour */
	readonly name: string;
	readonly group: HairStyleGroup;
};

/** One tile per style in the chosen colour, plus a tile for each original look it keeps (the blue ones); a style without the
 * five (a cap) gives one tile per own colour. */
export function hairTiles(groups: readonly HairStyleGroup[], colour: string, label: (style: string) => string): HairTile[] {
	const own = (group: HairStyleGroup, c: HairColourChoice) => ({ id: c.id, name: `${label(group.style)} (${c.label.toLowerCase()})`, group });
	return groups.flatMap((group) =>
		hasHouseColours(group)
			? [
					{ id: styleInColour(group, colour).id, name: label(group.style), group },
					...group.choices.filter((c) => KEPT_ORIGINALS.has(c.colour)).map((c) => own(group, c))
				]
			: group.choices.map((c) => own(group, c))
	);
}

/** The style group of the hair worn: the group it is in, else its style's group. A style's plain original that gave way to
 * the matched colour (Anna's blue-tipped `bob-blonde_blue.1`, the default a new character starts in, or a man's old
 * `short_spikey_blonde_with_blue_tips`) is still that style, so the palette re-colours it and its style's tile shows worn. */
export function hairStyleGroupFor(groups: readonly HairStyleGroup[], id: string): HairStyleGroup | undefined {
	if (!id) return undefined;
	const exact = hairStyleGroupOf(groups, id);
	if (exact) return exact;
	const { style, race } = parseHair(id);
	const key = race ? `${style}--${race}` : style;
	return groups.find((g) => g.key === key);
}

/** What is worn after a colour is chosen: the worn style in that colour; null when nothing changes (bald, a cap, the style
 * was not made in it, or it is already worn in it). */
export function recolouredHairId(groups: readonly HairStyleGroup[], worn: string, colour: string): string | null {
	const group = hairStyleGroupFor(groups, worn);
	if (!group || !hasHouseColours(group)) return null;
	const next = group.choices.find((c) => c.colour === colour)?.id;
	return next && next !== worn ? next : null;
}

// Which ethnicity's fits an avatar is offered when nothing else says (the Experience Studio's character panel has no ethnicity
// picker): the avatar's own catalogue ethnicity when it has one, else the race pack it is (mirrors RACE_FACE_PACKS / OWN_RACE in
// the app's src/lib/raceOutfits/racePlates.svelte.ts; the catalogue only carries Anna's).
const RACE_OF_AVATAR: Readonly<Record<string, string>> = {
	dd80126a: 'european',
	'95b4bafb': 'european',
	d9048f3b: 'african',
	faa7f0b1: 'african',
	'9298d617': 'east-asian',
	ae5a0001: 'middle-eastern',
	'5a5a0001': 'south-asian',
	'5a5a0002': 'south-asian',
	ed5a0001: 'mediterranean',
	'3e621eb8': 'indigenous',
	'1d5a0001': 'indigenous',
	af5b0001: 'african',
	ea5b0001: 'east-asian',
	'5e5b0001': 'southeast-asian',
	ed5b0001: 'mediterranean',
	ae5b0001: 'middle-eastern',
	'0a5b0001': 'north-african',
	'5a5b0001': 'south-asian',
	'1d5b0001': 'indigenous',
	ac5b0001: 'pacific-islander',
	// the 8 newest GPT-low packs (2026-10-05, "connect all 8"); the European pair wear Anna's and Caleb's own hair
	ae5a0002: 'middle-eastern',
	'0a5a0001': 'north-african',
	ea5a0002: 'east-asian',
	ac5a0001: 'pacific-islander',
	af5a0001: 'african',
	e05a0001: 'european',
	'5e5a0001': 'southeast-asian',
	e05b0001: 'european'
};

/** The ethnicity whose hair fits an avatar wears by default ('' = untagged hair only). */
export function hairRaceOfAvatar(avatar: { readonly id: string; readonly ethnicity?: string } | null | undefined): string {
	if (!avatar) return '';
	const own = avatar.ethnicity?.trim().toLowerCase().replace(/\s+/g, '-');
	return own || RACE_OF_AVATAR[avatar.id] || '';
}
