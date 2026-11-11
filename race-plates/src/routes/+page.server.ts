import type { PageServerLoad } from './$types';
import { listOutfits, pythonStatus, races } from '$lib/server/maker';

export const load: PageServerLoad = async () => ({
	outfits: await listOutfits(),
	races: races(),
	python: await pythonStatus()
});
