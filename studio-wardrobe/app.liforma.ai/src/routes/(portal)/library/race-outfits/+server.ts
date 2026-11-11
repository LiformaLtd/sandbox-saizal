// LOCAL DEV ONLY: the outfits an ethnicity's plates can be made for (?race=<ethnicity id>), for the character page.
import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { outfitsForRace } from '$lib/server/raceOutfits';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	try {
		return json(
			await outfitsForRace(url.searchParams.get('race') ?? '', url.searchParams.get('set') ?? 'female')
		);
	} catch (e) {
		error(502, e instanceof Error ? e.message : String(e));
	}
};
