// LOCAL DEV ONLY (2026-09-25): where the ethnicity plate maker's inputs are served. The version is part of the
// address so a browser never reuses an answer saved before the inputs changed (Anna's plates switched from the CDN's
// WebP to the user's PNG folder while some browsers still held the old answers for an hour).
const INPUT = '/library/race-outfits/input';
const VERSION = 'malik-mean3-1';

/**
 * Which endpoint pair the inputs come from. The worker has its own module copy, so a job carries
 * its set and passes it in; on the page the current avatar's set is used.
 */
export type RaceSet = 'female' | 'male';
let currentSet: RaceSet = 'female';

export function setRaceSet(set: RaceSet): void {
	currentSet = set;
}

export function raceSet(): RaceSet {
	return currentSet;
}

export function raceInputUrl(
	kind: 'anna' | 'precious' | 'face' | 'base' | 'values' | 'outline',
	name = '',
	set: RaceSet = currentSet
): string {
	const param = kind === 'face' || kind === 'base' || kind === 'outline' ? 'race' : 'outfit';
	return `${INPUT}?v=${VERSION}&set=${set}&kind=${kind}${name ? `&${param}=${encodeURIComponent(name)}` : ''}`;
}
