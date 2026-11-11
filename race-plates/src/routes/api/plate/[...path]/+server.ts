// Serves a plate from plates/ or out/ (nothing else) so the page can show it.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { OUT, PLATES, ROOT } from '$lib/server/maker';

const TYPES: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp' };

export const GET: RequestHandler = async ({ params }) => {
	const file = path.resolve(ROOT, params.path);
	const allowed = [PLATES, OUT].some((d) => file.startsWith(d + path.sep));
	const type = TYPES[path.extname(file).toLowerCase()];
	if (!allowed || !type) return new Response('not found', { status: 404 });
	try {
		return new Response(await readFile(file), { headers: { 'content-type': type, 'cache-control': 'no-store' } });
	} catch {
		return new Response('not found', { status: 404 });
	}
};
