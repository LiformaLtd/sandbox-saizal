// LOCAL DEV ONLY (2026-10-02): a new outfit for every ethnicity, the way the existing ones were made.
//
//   1. European: the live Studio's clothes edit (Krea 2 identity edit, the live prompt and settings) on the pair's
//      light endpoint in its white tee and jeans, bald, on green. Shown to the user.
//   2. Only once the user approves it, African: the two-picture identity edit the Precious and Malik plates were
//      made with. Picture 1 is the approved European plate on green, picture 2 the dark endpoint (Precious's head;
//      Malik's head, arms and hands), with the short "Picture 1 is the scene. Picture 2 is the person." prompt.
//   3. Both are keyed with the user's BiRefNet v4 recipe and kept as a pair in GENERATED_OUTFITS_DIR, where the
//      ethnicity plate maker reads them like any other outfit; every other ethnicity is the browser's mix of the two.
//
// The live "+ New clothes" route cannot run locally (the local api has no orchestrator key and saves to the public
// CDN bucket), so this sends the edits itself (raceOutfitGpu.ts: the office 4090 for now, or the GPU orchestrator)
// and keeps everything else on this machine.
import { execFile } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	GENERATED_OUTFITS_DIR,
	generatedOutfitDir,
	lightBasePlatePath,
	outfitNames,
	raceSetName
} from './raceOutfits';
import { checkEdit, gpuOfJob, submitEdit, type GpuName } from './raceOutfitGpu';

const WORKSPACE = path.resolve(process.cwd(), '..');
const HELPER = path.join(WORKSPACE, '.local-dev', 'outfit-gen', 'outfit_gen.py');
const REFS = path.join(WORKSPACE, '.local-dev', 'outfit-gen', 'refs');
const DRAFTS = path.join(GENERATED_OUTFITS_DIR, 'drafts');
const PYTHON = process.env.RACE_PLATES_PYTHON ?? '/Users/saizalpreetkaur./Desktop/Liforma_LTD/ComfyUI/.venv/bin/python';

type RaceSetName = ReturnType<typeof raceSetName>;

/**
 * How each pair's African plates were made: precious_plates_final/MANIFEST.txt (head-only picture 2, ref_boost 4,
 * ref_boost_a 1, seed 5353) and the male sweep (skin cut-out picture 2, ref_boost_a 3, seed 9191).
 */
const PAIRS: Record<RaceSetName, { person: string; ref: string; refBoostA: number; firstSeed: number }> = {
	female: { person: 'woman', ref: 'female_dark_ref.png', refBoostA: 1, firstSeed: 5353 },
	male: { person: 'man', ref: 'male_dark_ref.png', refBoostA: 3, firstSeed: 9191 }
};

type Step = 'european' | 'african';
type StepState = {
	status: 'idle' | 'running' | 'keying' | 'ready' | 'failed';
	attempts: number;
	/** "hpc:<prompt id>" or "orch:<job id>" (raceOutfitGpu.ts). */
	jobId?: string;
	/** Where the job runs. */
	gpu?: GpuName;
	seed?: number;
	/** The GPU's own word for the job (queued, running, …). */
	jobStatus?: string;
	error?: string;
	costUsd?: number;
};
type Draft = {
	id: string;
	set: RaceSetName;
	description: string;
	createdAt: string;
	european: StepState;
	african: StepState;
	/** The outfit id once the pair is in the store. */
	outfit: string | null;
};

export type DraftView = {
	id: string;
	set: RaceSetName;
	description: string;
	european: Omit<StepState, 'jobId'>;
	african: Omit<StepState, 'jobId'>;
	outfit: string | null;
};

const DRAFT_ID = /^d[0-9a-z]{6,20}$/;

function draftDir(id: string): string {
	if (!DRAFT_ID.test(id)) throw new Error('bad draft id');
	return path.join(DRAFTS, id);
}

async function readDraft(id: string): Promise<Draft> {
	try {
		return JSON.parse(await readFile(path.join(draftDir(id), 'draft.json'), 'utf8')) as Draft;
	} catch {
		throw new Error('no such draft');
	}
}

async function writeDraft(draft: Draft): Promise<void> {
	await writeFile(path.join(draftDir(draft.id), 'draft.json'), JSON.stringify(draft, null, 1));
}

function publicStep(s: StepState): DraftView['european'] {
	return {
		status: s.status,
		attempts: s.attempts,
		gpu: s.gpu,
		seed: s.seed,
		jobStatus: s.jobStatus,
		error: s.error,
		costUsd: s.costUsd
	};
}

function view(draft: Draft): DraftView {
	return {
		id: draft.id,
		set: draft.set,
		description: draft.description,
		european: publicStep(draft.european),
		african: publicStep(draft.african),
		outfit: draft.outfit
	};
}

// ---------------------------------------------------------------- prompts

/**
 * The prompts sent to the GPU. The user only ever types the outfit; every instruction about what stays the same lives
 * here, and `{outfit}` is replaced by what they typed ({person} by woman/man).
 *
 * european: the live Studio's clothes prompt (api clothesGeneration/labels.ts formatKreaClothesPrompt) word for word,
 *   plus one sentence (2026-10-02, user: "every instruction about keeping the posture, the position same") for what
 *   the live one leaves out: posture, body size, framing and the backdrop.
 * african: the two-picture prompt the Precious and Malik plates were made with, unchanged. "Redraw picture 1" already
 *   keeps the pose and framing of the approved European plate; longer versions of it leaked picture 2's clothes and
 *   moved the garment (measured on the Precious runs).
 */
const PROMPTS = {
	european:
		'Change only the clothes on this avatar only below the head. Keep the identity, pose, scale and position of ' +
		'the head, ears, arms and hands unchanged. Keep the head bald, no hair, and the face clean shaven. ' +
		'Do not add any headwear. Keep the same standing posture, body shape and size, camera framing and plain green ' +
		'background. The new clothes should be: {outfit}',
	african:
		'Picture 1 is the scene. Picture 2 is the person.\n' +
		'Redraw picture 1 as the {person} from picture 2 - their face, their skin, their bald head.\n' +
		'They stay in the same {outfit}, unchanged.'
} as const;

/** What the user typed, as words to drop into a prompt: one line, no "wearing …", no full stop at the end. */
function outfitWords(description: string): string {
	return description
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^(she|he|they)?\s*(is|are)?\s*(wearing|dressed in|in)\s+/i, '')
		.replace(/[.,;:!\s]+$/, '');
}

function europeanPrompt(description: string): string {
	return PROMPTS.european.replace('{outfit}', outfitWords(description) || 'a new outfit');
}

function africanPrompt(description: string, person: string): string {
	// "the same {outfit}": the outfit without its own a/an/the
	const garment = outfitWords(description).replace(/^(a|an|the)\s+/i, '');
	return PROMPTS.african.replace('{person}', person).replace('{outfit}', garment || 'clothes');
}

// ---------------------------------------------------------------- local image steps

function helper(cmd: string, src: string, dst: string): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(PYTHON, [HELPER, cmd, src, dst], { timeout: 180_000 }, (err, _stdout, stderr) => {
			if (err) reject(new Error(`${cmd} failed: ${(stderr || err.message).trim().split('\n').slice(-1)[0]}`));
			else resolve();
		});
	});
}

// ---------------------------------------------------------------- the steps

async function startEuropean(draft: Draft, seed: number): Promise<void> {
	const dir = draftDir(draft.id);
	const source = path.join(dir, 'source.png');
	if (!existsSync(source)) await helper('source', lightBasePlatePath(draft.set), source);
	const attempt = draft.european.attempts + 1;
	// the live clothes edit: one picture, ref_boost 4 (the scene's own dial stays at 1)
	const jobId = await submitEdit({
		name: `${draft.id}-european-${attempt}`,
		prompt: europeanPrompt(draft.description),
		scene: source,
		seed,
		refBoost: 4,
		refBoostA: 1
	});
	draft.european = { status: 'running', attempts: attempt, jobId, gpu: gpuOfJob(jobId), seed };
}

async function startAfrican(draft: Draft, seed: number): Promise<void> {
	const dir = draftDir(draft.id);
	const pair = PAIRS[draft.set];
	const picture1 = path.join(dir, 'picture1.png');
	await helper('on-green', path.join(dir, 'european.png'), picture1);
	const attempt = draft.african.attempts + 1;
	const jobId = await submitEdit({
		name: `${draft.id}-african-${attempt}`,
		prompt: africanPrompt(draft.description, pair.person),
		scene: picture1,
		person: path.join(REFS, pair.ref),
		seed,
		refBoost: 4,
		refBoostA: pair.refBoostA
	});
	draft.african = { status: 'running', attempts: attempt, jobId, gpu: gpuOfJob(jobId), seed };
}

/** Check a running step once; when its picture is back, fetch and key it. */
async function advanceStep(draft: Draft, step: Step): Promise<void> {
	const state = draft[step];
	const dir = draftDir(draft.id);
	if (state.status === 'running' && state.jobId) {
		const job = await checkEdit(state.jobId);
		state.jobStatus = job.jobStatus;
		if (job.state === 'failed') {
			state.status = 'failed';
			state.error = job.error;
			return;
		}
		if (job.state === 'waiting') return;
		state.costUsd = job.costUsd;
		await writeFile(path.join(dir, `${step}_raw.png`), job.png);
		state.status = 'keying';
		await writeDraft(draft);
	}
	if (state.status === 'keying') {
		await helper('key', path.join(dir, `${step}_raw.png`), path.join(dir, `${step}.png`));
		state.status = 'ready';
	}
}

function slug(description: string): string {
	const words = outfitWords(description)
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(' ')
		.filter((w) => w && !['a', 'an', 'the', 'and', 'with', 'of'].includes(w))
		.slice(0, 5);
	const base = words.join('_').slice(0, 40).replace(/_+$/, '');
	return /^[a-z]/.test(base) ? base : `outfit_${base || 'new'}`;
}

/** Put the keyed pair where the plate maker reads outfits, under a new outfit id. */
async function promote(draft: Draft): Promise<void> {
	const taken = new Set(await outfitNames(draft.set));
	const base = slug(draft.description);
	let outfit = base;
	for (let n = 2; taken.has(outfit); n += 1) outfit = `${base}_${n}`;
	const dir = draftDir(draft.id);
	const light = generatedOutfitDir(draft.set, 'light');
	const dark = generatedOutfitDir(draft.set, 'dark');
	await Promise.all([mkdir(light, { recursive: true }), mkdir(dark, { recursive: true })]);
	// dark first: an outfit is listed once both plates exist and is dated by its light plate
	await copyFile(path.join(dir, 'african.png'), path.join(dark, `${outfit}.png`));
	await copyFile(path.join(dir, 'european.png'), path.join(light, `${outfit}.png`));
	draft.outfit = outfit;
}

async function unpromote(draft: Draft): Promise<void> {
	if (!draft.outfit) return;
	await Promise.all(
		(['light', 'dark'] as const).map((side) =>
			rm(path.join(generatedOutfitDir(draft.set, side), `${draft.outfit}.png`), { force: true })
		)
	);
	draft.outfit = null;
}

/** One change to a draft at a time (polls and button presses can overlap). */
const locks = new Map<string, Promise<unknown>>();
function locked<T>(id: string, work: () => Promise<T>): Promise<T> {
	const run = (locks.get(id) ?? Promise.resolve()).then(work, work);
	const tail = run.catch(() => undefined);
	locks.set(id, tail);
	void tail.then(() => {
		if (locks.get(id) === tail) locks.delete(id);
	});
	return run;
}

async function advance(draft: Draft): Promise<void> {
	for (const step of ['european', 'african'] as const) {
		try {
			await advanceStep(draft, step);
		} catch (e) {
			// a passing network error leaves a running job running; anything else fails the step
			if (draft[step].status === 'keying') {
				draft[step].status = 'failed';
				draft[step].error = e instanceof Error ? e.message : String(e);
			}
		}
	}
	if (draft.african.status === 'ready' && !draft.outfit) await promote(draft);
	await writeDraft(draft);
}

// ---------------------------------------------------------------- public

/** Step 1: ask for the European plate only. */
export async function startOutfitDraft(set: string, description: string): Promise<DraftView> {
	const text = description.trim();
	if (text.length < 3 || text.length > 600) throw new Error('describe the outfit in 3 to 600 characters');
	const draft: Draft = {
		id: `d${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
		set: raceSetName(set),
		description: text,
		createdAt: new Date().toISOString(),
		european: { status: 'idle', attempts: 0 },
		african: { status: 'idle', attempts: 0 },
		outfit: null
	};
	await mkdir(draftDir(draft.id), { recursive: true });
	await startEuropean(draft, randomInt(0, 2_147_483_647));
	await writeDraft(draft);
	return view(draft);
}

export function outfitDraft(id: string): Promise<DraftView> {
	return locked(id, async () => {
		const draft = await readDraft(id);
		await advance(draft);
		return view(draft);
	});
}

/**
 * `retry-european`: a new European plate (only before the African one is asked for). `approve`: the user is happy
 * with the European plate, so the African one is made. `retry-african`: make the African plate again; the outfit
 * made from the previous one is taken out of the store and comes back under a new id.
 */
export function actOnOutfitDraft(id: string, action: string): Promise<DraftView> {
	return locked(id, async () => {
		const draft = await readDraft(id);
		if (action === 'retry-european') {
			if (draft.african.status !== 'idle') throw new Error('this outfit is already being finished');
			if (draft.european.status === 'running' || draft.european.status === 'keying') throw new Error('still making it');
			await startEuropean(draft, randomInt(0, 2_147_483_647));
		} else if (action === 'approve') {
			if (draft.european.status !== 'ready') throw new Error('the outfit is not ready yet');
			if (draft.african.status !== 'idle') throw new Error('this outfit is already being finished');
			await startAfrican(draft, PAIRS[draft.set].firstSeed);
		} else if (action === 'retry-african') {
			if (draft.african.status !== 'ready' && draft.african.status !== 'failed') throw new Error('nothing to redo yet');
			await unpromote(draft);
			await startAfrican(draft, randomInt(0, 2_147_483_647));
		} else {
			throw new Error('unknown action');
		}
		await writeDraft(draft);
		return view(draft);
	});
}

/** A draft's keyed European or African plate. */
export async function outfitDraftImage(id: string, step: string): Promise<Uint8Array | null> {
	if (step !== 'european' && step !== 'african') return null;
	try {
		return new Uint8Array(await readFile(path.join(draftDir(id), `${step}.png`)));
	} catch {
		return null;
	}
}
