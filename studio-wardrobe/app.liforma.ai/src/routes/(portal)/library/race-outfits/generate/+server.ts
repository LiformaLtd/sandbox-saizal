// LOCAL DEV ONLY: start a new outfit for every ethnicity ({avatarId, description}). Only the European plate is asked
// for here; the African one waits for the user's approval (generate/[draftId]). See raceOutfitGeneration.ts.
import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { AVATAR_RACE_SET } from '$lib/server/raceOutfits';
import { startOutfitDraft } from '$lib/server/raceOutfitGeneration';
import { requireStudioSession } from '$lib/server/studioBff';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (!dev) error(404, 'Not found');
	await requireStudioSession(event);
	const body = (await event.request.json().catch(() => null)) as { avatarId?: unknown; description?: unknown } | null;
	const avatarId = typeof body?.avatarId === 'string' ? body.avatarId : '';
	const description = typeof body?.description === 'string' ? body.description : '';
	const set = AVATAR_RACE_SET[avatarId];
	if (!set) error(400, 'this avatar is not drawn in the race plates framing');
	try {
		return json(await startOutfitDraft(set, description));
	} catch (e) {
		error(502, e instanceof Error ? e.message : String(e));
	}
};
