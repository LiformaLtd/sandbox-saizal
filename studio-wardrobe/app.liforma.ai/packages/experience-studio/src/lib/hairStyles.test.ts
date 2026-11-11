import { describe, expect, it } from 'vitest';
import {
	groupHairStyles,
	hairColourOf,
	hairIdsForEthnicity,
	hairRaceOfAvatar,
	hairStyleGroupFor,
	hairTiles,
	paletteColours,
	recolouredHairId,
	styleInColour
} from './hairStyles';

const FIVE = ['black', 'darkbrown', 'chestnut', 'honeyblonde', 'copper'];
const label = (s: string) => s.replace(/[-_]+/g, ' ');
// a race's fits in the five, plus a style with only black and copper
const EA = [
	...FIVE.map((c) => `bob-brown.1-${c}--east-asian`),
	...FIVE.map((c) => `topknot-black.1-${c}--east-asian`),
	'halfup-black.1-black--east-asian',
	'halfup-black.1-copper--east-asian'
];
const ADAM = ['cap_beige', 'cap_plaid', ...FIVE.map((c) => `fringe_${c}`)];

describe('the hair picker with the palette at the side', () => {
	it('shows every style in the chosen colour, black where a style was not made in it', () => {
		const g = groupHairStyles(EA);
		expect(hairTiles(g, 'copper', label).map((t) => t.id)).toEqual([
			'bob-brown.1-copper--east-asian',
			'topknot-black.1-copper--east-asian',
			'halfup-black.1-copper--east-asian'
		]);
		expect(hairTiles(g, 'chestnut', label).map((t) => t.id)).toEqual([
			'bob-brown.1-chestnut--east-asian',
			'topknot-black.1-chestnut--east-asian',
			'halfup-black.1-black--east-asian'
		]);
		expect(hairTiles(g, 'copper', label)[0].name).toBe('bob brown.1');
	});
	it('gives a style without the five (a cap) one tile per its own colour', () => {
		const tiles = hairTiles(groupHairStyles(ADAM), 'honeyblonde', label);
		expect(tiles.map((t) => t.id)).toEqual(['cap_beige', 'cap_plaid', 'fringe_honeyblonde']);
		expect(tiles[0].name).toBe('cap (beige)');
	});
	it('re-colours the hair worn when a colour is chosen, and leaves caps, bald and missing colours alone', () => {
		const g = groupHairStyles([...EA, ...ADAM]);
		expect(recolouredHairId(g, 'bob-brown.1-black--east-asian', 'copper')).toBe('bob-brown.1-copper--east-asian');
		expect(recolouredHairId(g, 'bob-brown.1-copper--east-asian', 'copper')).toBeNull();
		expect(recolouredHairId(g, 'halfup-black.1-black--east-asian', 'chestnut')).toBeNull();
		expect(recolouredHairId(g, 'cap_beige', 'copper')).toBeNull();
		expect(recolouredHairId(g, 'bald', 'copper')).toBeNull();
		expect(recolouredHairId(g, '', 'copper')).toBeNull();
	});
	it('re-colours a style\'s plain original too (a new character starts in Anna\'s blue-tipped bob)', () => {
		const g = groupHairStyles([
			'bob-blonde_blue.1',
			...FIVE.map((c) => `bob-blonde_blue.1-${c}`),
			'short_spikey_blonde_with_blue_tips',
			...FIVE.map((c) => `short_spikey_${c}`)
		]);
		expect(recolouredHairId(g, 'bob-blonde_blue.1', 'copper')).toBe('bob-blonde_blue.1-copper');
		expect(recolouredHairId(g, 'bob-blonde_blue.1', 'honeyblonde')).toBe('bob-blonde_blue.1-honeyblonde');
		expect(recolouredHairId(g, 'short_spikey_blonde_with_blue_tips', 'black')).toBe('short_spikey_black');
		expect(hairStyleGroupFor(g, 'bob-blonde_blue.1')?.key).toBe('bob-blonde_blue.1');
		expect(hairStyleGroupFor(g, 'long-black.1')).toBeUndefined();
	});
	it('keeps the blue originals as tiles of their own, beside the style in the chosen colour', () => {
		const ids = [
			'bob-blonde_blue.1', ...FIVE.map((c) => `bob-blonde_blue.1-${c}`),
			'short-blue.1--east-asian', ...FIVE.map((c) => `short-blue.1-${c}--east-asian`),
			'short_spikey_blonde_with_blue_tips', 'short_spikey_blonde', ...FIVE.map((c) => `short_spikey_${c}`)
		];
		const tiles = hairTiles(groupHairStyles(ids), 'copper', label);
		expect(tiles.map((t) => t.id)).toEqual([
			'bob-blonde_blue.1-copper', 'bob-blonde_blue.1',
			'short-blue.1-copper--east-asian', 'short-blue.1--east-asian',
			'short_spikey_copper', 'short_spikey_blonde_with_blue_tips'
		]);
		expect(tiles.map((t) => t.name)).toEqual([
			'bob blonde blue.1', 'bob blonde blue.1 (blue tips)', 'short blue.1', 'short blue.1 (blue)', 'short spikey', 'short spikey (blue tips)'
		]);
		expect(paletteColours(groupHairStyles(ids)).map((c) => c.id)).toEqual(FIVE);   // the originals are not palette colours
		expect(hairColourOf('bob-blonde_blue.1')).toBe('');
	});
	it('keeps Caleb\'s grey too, on his own head and fitted to a race head', () => {
		const ids = ['ponytail_grey', 'ponytail_brown', ...FIVE.map((c) => `ponytail_${c}`), 'short_curly_grey--african', ...FIVE.map((c) => `short_curly_${c}--african`)];
		const tiles = hairTiles(groupHairStyles(ids), 'black', label);
		expect(tiles.map((t) => t.id)).toEqual(['ponytail_black', 'ponytail_grey', 'short_curly_black--african', 'short_curly_grey--african']);
		expect(tiles[1].name).toBe('ponytail (grey)');
		expect(recolouredHairId(groupHairStyles(ids), 'ponytail_grey', 'copper')).toBe('ponytail_copper');
	});
	it('starts from the colour of the hair worn', () => {
		expect(hairColourOf('topknot-black.1-honeyblonde--east-asian')).toBe('honeyblonde');
		expect(hairColourOf('fringe_darkbrown')).toBe('darkbrown');
		expect(hairColourOf('long-black.1')).toBe('black');   // a plain original in its own colour
		expect(hairColourOf('cap_plaid')).toBe('');
		expect(hairColourOf('bald')).toBe('');
	});
	it('lists only the colours some style comes in, in palette order', () => {
		expect(paletteColours(groupHairStyles(['halfup-black.1-copper', 'halfup-black.1-black'])).map((c) => c.id)).toEqual(['black', 'copper']);
		expect(paletteColours(groupHairStyles(ADAM)).map((c) => c.id)).toEqual(FIVE);
	});
	it('falls back to black, then the first colour', () => {
		const [g] = groupHairStyles(['x.1-copper', 'x.1-chestnut']);
		expect(styleInColour(g, 'black').colour).toBe('chestnut');
	});
});

describe('which race an avatar wears hair for', () => {
	it('uses the catalogue ethnicity, else the race pack it is', () => {
		expect(hairRaceOfAvatar({ id: 'dd80126a', ethnicity: 'european' })).toBe('european');
		expect(hairRaceOfAvatar({ id: 'x', ethnicity: 'East Asian' })).toBe('east-asian');
		expect(hairRaceOfAvatar({ id: '9298d617' })).toBe('east-asian');
		expect(hairRaceOfAvatar({ id: 'ac5b0001' })).toBe('pacific-islander');
		expect(hairRaceOfAvatar({ id: 'unknown' })).toBe('');
		expect(hairRaceOfAvatar(null)).toBe('');
	});
	it('so a race pack is offered its own fits, not every race\'s', () => {
		const ids = [...EA, 'bob-brown.1-black--african', 'long-black.1', 'long-black.1-copper'];
		const offered = hairIdsForEthnicity(ids, hairRaceOfAvatar({ id: '9298d617' }));
		expect(offered.some((id) => id.endsWith('--african'))).toBe(false);
		expect(offered).toContain('bob-brown.1-black--east-asian');
		expect(offered).toContain('long-black.1-copper');   // a style the race has no fit for keeps Anna's
	});
});
