// LOCAL DEV ONLY: keeps the ethnicity plate a user chose (?avatarId=&outfit=&race=, body = the PNG made in the
// browser) and answers the clothes id it is saved under. Written to a local folder only, never uploaded.
import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { saveChosenRacePlate } from '$lib/server/raceOutfits';

import type { RequestHandler } from './$types';

const MAX_BYTES = 16 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, url }) => {
	if (!dev) error(404, 'Not found');
	const body = new Uint8Array(await request.arrayBuffer());
	if (body.byteLength === 0 || body.byteLength > MAX_BYTES) error(413, 'Plate missing or too large');
	try {
		return json(
			await saveChosenRacePlate(
				url.searchParams.get('avatarId') ?? '',
				url.searchParams.get('outfit') ?? '',
				url.searchParams.get('race') ?? '',
				body
			)
		);
	} catch (e) {
		error(400, e instanceof Error ? e.message : String(e));
	}
};
