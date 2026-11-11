// LOCAL DEV ONLY: a draft's keyed European or African plate (?step=european|african).
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { outfitDraftImage } from '$lib/server/raceOutfitGeneration';
import { requireStudioSession } from '$lib/server/studioBff';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	if (!dev) error(404, 'Not found');
	await requireStudioSession(event);
	let png: Uint8Array | null = null;
	try {
		png = await outfitDraftImage(event.params.draftId, event.url.searchParams.get('step') ?? '');
	} catch {
		png = null;
	}
	if (!png) error(404, 'Not made yet');
	return new Response(png as Uint8Array<ArrayBuffer>, {
		headers: { 'content-type': 'image/png', 'cache-control': 'private, no-cache' }
	});
};
