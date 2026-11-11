// LOCAL DEV ONLY: one new-outfit draft. GET checks its GPU jobs (and keys a finished picture); POST {action} is
// retry-european | approve (make the African plate) | retry-african. See raceOutfitGeneration.ts.
import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { actOnOutfitDraft, outfitDraft } from '$lib/server/raceOutfitGeneration';
import { requireStudioSession } from '$lib/server/studioBff';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	if (!dev) error(404, 'Not found');
	await requireStudioSession(event);
	try {
		return json(await outfitDraft(event.params.draftId));
	} catch (e) {
		error(404, e instanceof Error ? e.message : String(e));
	}
};

export const POST: RequestHandler = async (event) => {
	if (!dev) error(404, 'Not found');
	await requireStudioSession(event);
	const body = (await event.request.json().catch(() => null)) as { action?: unknown } | null;
	try {
		return json(await actOnOutfitDraft(event.params.draftId, typeof body?.action === 'string' ? body.action : ''));
	} catch (e) {
		error(400, e instanceof Error ? e.message : String(e));
	}
};
