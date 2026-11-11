// LOCAL DEV ONLY: one input for making ethnicity plates in the browser
// (?kind=anna|precious|face|base|values|outline, by name; ?set=female|male picks which endpoint pair).
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { raceInput } from '$lib/server/raceOutfits';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request }) => {
	if (!dev) error(404, 'Not found');
	let input;
	try {
		input = await raceInput(
			url.searchParams.get('kind') ?? '',
			url.searchParams.get('outfit') ?? '',
			url.searchParams.get('race') ?? '',
			url.searchParams.get('set') ?? 'female'
		);
	} catch (e) {
		error(502, e instanceof Error ? e.message : String(e));
	}
	if (!input) error(404, 'No such input');
	// no-cache: the browser keeps a copy but asks every time, so a changed input is picked up at once.
	const headers = { 'content-type': input.contentType, 'cache-control': 'private, no-cache', etag: input.etag };
	if (request.headers.get('if-none-match') === input.etag) return new Response(null, { status: 304, headers });
	return new Response(new Uint8Array(input.body), { headers });
};
