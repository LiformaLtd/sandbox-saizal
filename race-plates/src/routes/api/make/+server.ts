import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { make } from '$lib/server/maker';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as { outfit?: string; races?: string[]; fixes?: boolean; endpointsOnly?: boolean };
	if (!body.outfit) return json({ error: 'outfit missing' }, { status: 400 });
	try {
		return json(await make(body.outfit, body.races ?? [], body.fixes ?? true, body.endpointsOnly ?? false));
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
};
