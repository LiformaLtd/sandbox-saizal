import { describe, expect, it } from 'vitest';
import { hairIdsForEthnicity, parseRaceHairId, raceHairBaseId } from './raceHair';

const ANNA = ['bob-brown.1', 'long-black.1', 'halfup-black.1', 'halfup-black.1--south-asian', 'topknot-black.1--south-asian'];

describe('race-tagged hair', () => {
	it('parses <hair>--<race> and leaves ordinary ids alone', () => {
		expect(parseRaceHairId('halfup-black.1--south-asian')).toEqual({ hair: 'halfup-black.1', race: 'south-asian' });
		expect(parseRaceHairId('long-black.1')).toBeNull();
		expect(parseRaceHairId('--south-asian')).toBeNull();
		expect(raceHairBaseId('topknot-black.1--south-asian')).toBe('topknot-black.1');
	});
	it('offers the ethnicity\'s own fits first, then Anna\'s hair for every style it has no fit for', () => {
		expect(hairIdsForEthnicity(ANNA, 'south-asian')).toEqual(['halfup-black.1--south-asian', 'topknot-black.1--south-asian', 'bob-brown.1', 'long-black.1']);
	});
	it('keeps Anna\'s other styles for a race whose only fit is the bob', () => {
		const ids = [...ANNA, 'bob-brown.1--east-asian', 'bob-brown.1-black--east-asian'];
		expect(hairIdsForEthnicity(ids, 'east-asian')).toEqual(['bob-brown.1--east-asian', 'bob-brown.1-black--east-asian', 'long-black.1', 'halfup-black.1']);
	});
	it('drops all of Anna\'s colours of a style the race has a fit for', () => {
		const ids = ['long-black.1', 'long-black.1-darkbrown', 'long-brown.2', 'long-black.1--middle-eastern'];
		expect(hairIdsForEthnicity(ids, 'middle-eastern')).toEqual(['long-black.1--middle-eastern', 'long-brown.2']);
	});
	it('offers only untagged hair for other ethnicities and for none', () => {
		expect(hairIdsForEthnicity(ANNA, 'european')).toEqual(['bob-brown.1', 'long-black.1', 'halfup-black.1']);
		expect(hairIdsForEthnicity(ANNA, 'east-asian')).toEqual(['bob-brown.1', 'long-black.1', 'halfup-black.1']);
		expect(hairIdsForEthnicity(ANNA, '')).toEqual(['bob-brown.1', 'long-black.1', 'halfup-black.1']);
	});
	it('keeps an avatar whose own hair is untagged (Priya) as it is', () => {
		expect(hairIdsForEthnicity(['halfup-black.1', 'lob-honeyblonde.1'], 'south-asian')).toEqual(['halfup-black.1', 'lob-honeyblonde.1']);
	});
	it('never offers the elf princess or long-blonde.1, in any colour or fit, and keeps long-blonde.3', () => {
		const ids = ['long-blonde.1', 'long-blonde.1-black', 'long-blonde-elf_princess', 'long-blonde-elf_princess-copper', 'long-blonde.3',
			'long-blonde.1--african', 'long-blonde-elf_princess--african', 'long-black.2--african'];
		expect(hairIdsForEthnicity(ids, 'european')).toEqual(['long-blonde.3']);
		expect(hairIdsForEthnicity(ids, 'african')).toEqual(['long-black.2--african', 'long-blonde.3']);
	});
});

import { groupHairStyles, hairStyleGroupOf, parseHairColourId } from './raceHair';

const ME = [
	'halfup-black.1--middle-eastern',
	'halfup-black.1-chestnut--middle-eastern',
	'halfup-black.1-copper--middle-eastern',
	'sweptback-brown.1--middle-eastern',
	'sweptback-brown.1-black--middle-eastern',
	'sweptback-brown.1-honeyblonde--middle-eastern',
	'short-blue.1--middle-eastern',
	'short-blue.1-black--middle-eastern',
	'short-blue.1-copper--middle-eastern'
];

describe('hair colours grouped by style', () => {
	it('parses the colour and keeps names that only look like colours', () => {
		expect(parseHairColourId('sweptback-brown.1-black--middle-eastern')).toEqual({ style: 'sweptback-brown.1', colour: 'black', race: 'middle-eastern' });
		expect(parseHairColourId('sweptback-brown.1--middle-eastern')).toEqual({ style: 'sweptback-brown.1', colour: 'darkbrown', race: 'middle-eastern' });
		expect(parseHairColourId('long-black.1')).toEqual({ style: 'long-black.1', colour: 'black', race: '' });
	});
	it('shows one tile per style, the black version', () => {
		const g = groupHairStyles(ME);
		expect(g.map((x) => x.tileId)).toEqual([
			'halfup-black.1--middle-eastern',
			'sweptback-brown.1-black--middle-eastern',
			'short-blue.1-black--middle-eastern'
		]);
	});
	it('lists every colour of the selected style in palette order', () => {
		const g = groupHairStyles(ME);
		expect(g[1].choices.map((c) => c.colour)).toEqual(['black', 'darkbrown', 'honeyblonde']);
		expect(g[2].choices.map((c) => c.colour)).toEqual(['black', 'copper', 'blue']);   // short-blue keeps its original blue, after the five
		expect(hairStyleGroupOf(g, 'halfup-black.1-copper--middle-eastern')?.tileId).toBe('halfup-black.1--middle-eastern');
	});
	it('offers the matched <style>-<colour> over the style\'s plain original of the same colour', () => {
		const g = groupHairStyles(['halfup-black.1', 'halfup-black.1-black', 'halfup-black.1-copper', 'bob-brown.1--african', 'bob-brown.1-darkbrown--african']);
		expect(g[0].choices.map((c) => c.id)).toEqual(['halfup-black.1-black', 'halfup-black.1-copper']);
		expect(g[0].tileId).toBe('halfup-black.1-black');
		expect(g[1].choices.map((c) => c.id)).toEqual(['bob-brown.1-darkbrown--african']);
	});
	it('keeps untagged hair one per tile', () => {
		const g = groupHairStyles(['long-black.1', 'long-black.2', 'bob-brown.1']);
		expect(g.map((x) => x.choices.length)).toEqual([1, 1, 1]);
	});
	it('groups Anna\'s own colours under her style', () => {
		const g = groupHairStyles(['long-black.1', 'long-brown.2', 'long-black.1-darkbrown', 'long-brown.2-black', 'long-brown.2-copper']);
		expect(g.map((x) => x.tileId)).toEqual(['long-black.1', 'long-brown.2-black']);
		expect(g[1].choices.map((c) => c.colour)).toEqual(['black', 'darkbrown', 'copper']);
	});
});

const FIVE = ['black', 'darkbrown', 'chestnut', 'honeyblonde', 'copper'];
// Adam's live layers (old colours) plus the five from the local folder
const ADAM = ['cap_beige', 'cap_plaid', 'fringe_black', 'fringe_blonde', 'fringe_brown', 'fringe_ginger', 'fringe_grey', 'long_blonde',
	'long_blonde_with_blue_tips', 'long_black', 'short_afro_brown', 'short_afroshaved_sides_blonde', 'short_afroshaved_sides_brown',
	...['fringe', 'long', 'short_afro', 'short_afroshaved_sides'].flatMap((s) => FIVE.map((c) => `${s}_${c}`))];

describe('men\'s hair colours grouped by style', () => {
	it('parses <style>_<colour>, the longest style first', () => {
		expect(parseHairColourId('short_afroshaved_sides_blonde')).toEqual({ style: 'short_afroshaved_sides', colour: 'blonde', race: '' });
		expect(parseHairColourId('short_afro_honeyblonde')).toEqual({ style: 'short_afro', colour: 'honeyblonde', race: '' });
		expect(parseHairColourId('short_spikey_blonde_with_blue_tips')).toEqual({ style: 'short_spikey', colour: 'blonde_with_blue_tips', race: '' });
		expect(parseHairColourId('cap_plaid')).toEqual({ style: 'cap', colour: 'plaid', race: '' });
		expect(parseHairColourId('long-brown_blonde.1')).toEqual({ style: 'long-brown_blonde.1', colour: 'chestnut', race: '' });
	});
	it('shows one tile per style, black, with the five circles; old colours drop out, blue tips and grey stay; the caps keep theirs', () => {
		const g = groupHairStyles(ADAM);
		expect(g.map((x) => x.tileId)).toEqual(['cap_beige', 'fringe_black', 'long_black', 'short_afro_black', 'short_afroshaved_sides_black']);
		for (const x of [g[3], g[4]]) expect(x.choices.map((c) => c.colour)).toEqual(FIVE);
		expect(g[1].choices.map((c) => c.colour)).toEqual([...FIVE, 'grey']);
		expect(g[2].choices.map((c) => c.colour)).toEqual([...FIVE, 'blonde_with_blue_tips']);
		expect(g[0].choices.map((c) => c.label)).toEqual(['Beige', 'Plaid']);
	});
});

import { hairIdForEthnicity } from './raceHair';

const ALL = [
	'halfup-black.1', 'long-black.1',
	'halfup-black.1--middle-eastern', 'halfup-black.1-chestnut--middle-eastern', 'long-black.1--middle-eastern',
	'halfup-black.1--mediterranean', 'halfup-black.1-chestnut--mediterranean',
	'halfup-black.1--south-asian', 'bob-brown.1--mediterranean'
];

describe('hair follows the ethnicity', () => {
	it('keeps the style and colour, swapping only the fit', () => {
		expect(hairIdForEthnicity('halfup-black.1-chestnut--middle-eastern', ALL, 'mediterranean')).toBe('halfup-black.1-chestnut--mediterranean');
		expect(hairIdForEthnicity('halfup-black.1--south-asian', ALL, 'middle-eastern')).toBe('halfup-black.1--middle-eastern');
	});
	it('goes back to Anna\'s own hair for an ethnicity with no fits of its own', () => {
		expect(hairIdForEthnicity('halfup-black.1-chestnut--mediterranean', ALL, 'european')).toBe('halfup-black.1');
		expect(hairIdForEthnicity('long-black.1', ALL, 'middle-eastern')).toBe('long-black.1--middle-eastern');
	});
	it('keeps the colour when going back to Anna\'s own hair', () => {
		expect(hairIdForEthnicity('halfup-black.1-chestnut--mediterranean', [...ALL, 'halfup-black.1-chestnut'], 'european')).toBe('halfup-black.1-chestnut');
	});
	it('falls back to black when the colour was not made there, and to nothing when the style was not', () => {
		expect(hairIdForEthnicity('halfup-black.1-chestnut--mediterranean', ALL, 'south-asian')).toBe('halfup-black.1--south-asian');
		expect(hairIdForEthnicity('bob-brown.1--mediterranean', ALL, 'south-asian')).toBeNull();
	});
});
