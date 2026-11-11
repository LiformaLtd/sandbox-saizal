// LOCAL DEV ONLY (2026-10-02): where the new-outfit flow's Krea 2 identity edits run (raceOutfitGeneration.ts).
//
//   hpc           the office RTX 4090 (hpc.liforma.ai:8188, ComfyUI). Default for the time being (2026-10-02, user:
//                 "make it use the 4090 for the time being. For the krea 2"). The graph below is the box's own
//                 "Image to Image Identity Edit (Multi-Reference) (Krea 2).json" flattened for its API: same nodes, ids,
//                 models and widget values; the second reference (nodes 90/92) is only wired for two-picture edits.
//   orchestrator  the GPU orchestrator's i2i (the same Krea 2 graph on rented GPUs, paid per picture).
//
// Set OUTFIT_GPU=orchestrator to switch. A job remembers where it was sent ("hpc:…" / "orch:…"), so a draft started on
// one finishes there even if the setting changes.
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type GpuName = 'hpc' | 'orchestrator';

export function gpuName(): GpuName {
	return process.env.OUTFIT_GPU === 'orchestrator' ? 'orchestrator' : 'hpc';
}

export function gpuOfJob(job: string): GpuName {
	return job.startsWith('hpc:') ? 'hpc' : 'orchestrator';
}

export type EditRequest = {
	/** Unique per attempt; names the uploads and makes the orchestrator submit idempotent. */
	name: string;
	prompt: string;
	/** Picture 1, the scene (a PNG on disk). */
	scene: string;
	/** Picture 2, the person, for two-picture edits. */
	person?: string;
	seed: number;
	refBoost: number;
	/** The scene's own fidelity dial (only does anything in two-picture edits). */
	refBoostA: number;
};

export type EditCheck =
	| { state: 'waiting'; jobStatus: string }
	| { state: 'done'; jobStatus: string; png: Uint8Array; costUsd?: number }
	| { state: 'failed'; jobStatus: string; error: string };

export function submitEdit(req: EditRequest): Promise<string> {
	return gpuName() === 'hpc' ? submitHpc(req) : submitOrchestrator(req);
}

export function checkEdit(job: string): Promise<EditCheck> {
	return gpuOfJob(job) === 'hpc' ? checkHpc(job.slice('hpc:'.length)) : checkOrchestrator(job.replace(/^orch:/, ''));
}

async function fetchPng(url: string, init?: Parameters<typeof fetch>[1]): Promise<Uint8Array> {
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`could not fetch the result (${res.status})`);
	return new Uint8Array(await res.arrayBuffer());
}

// ---------------------------------------------------------------- the 4090 (ComfyUI)

const HPC = (process.env.KREA_HPC_URL ?? 'http://hpc.liforma.ai:8188').replace(/\/$/, '');
const HPC_CLIENT = 'liforma-studio-new-outfit';
const SAVE_NODE = '29';

async function hpcJson<T>(route: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
	const res = await fetch(`${HPC}${route}`, { ...init, signal: AbortSignal.timeout(60_000) });
	const text = await res.text();
	if (!res.ok) throw new Error(`the 4090 ${route.split('?')[0]} ${res.status}: ${text.slice(0, 400)}`);
	return JSON.parse(text) as T;
}

/** Put a picture in the box's input folder (overwriting a file of the same name) and answer its name there. */
async function hpcUpload(file: string, name: string): Promise<string> {
	const form = new FormData();
	form.append('image', new Blob([new Uint8Array(await readFile(file))], { type: 'image/png' }), name);
	form.append('type', 'input');
	form.append('overwrite', 'true');
	const out = await hpcJson<{ name: string; subfolder?: string }>('/upload/image', { method: 'POST', body: form });
	return out.subfolder ? `${out.subfolder}/${out.name}` : out.name;
}

/** The box's Krea 2 identity-edit graph in API form; `person` wires the second reference (nodes 90 and 92). */
function hpcGraph(req: EditRequest, scene: string, person: string | null): Record<string, unknown> {
	const two = person !== null;
	return {
		'55': { class_type: 'UNETLoader', inputs: { unet_name: 'krea2_turbo_int8_convrot.safetensors', weight_dtype: 'default' } },
		'56': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl_4b_fp8_scaled.safetensors', type: 'krea2', device: 'default' } },
		'57': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
		// the box validates the LoRA name against its own list, which spells the folder with a backslash
		'71': {
			class_type: 'LoraLoaderModelOnly',
			inputs: { model: ['55', 0], lora_name: 'Krea2\\krea2_identity_edit_v1_2.safetensors', strength_model: 1 }
		},
		'72': { class_type: 'LoadImage', inputs: { image: scene } },
		'73': { class_type: 'VAEEncode', inputs: { pixels: ['72', 0], vae: ['57', 0] } },
		...(two
			? {
					'90': { class_type: 'LoadImage', inputs: { image: person } },
					'92': { class_type: 'VAEEncode', inputs: { pixels: ['90', 0], vae: ['57', 0] } }
				}
			: {}),
		'82': { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
		'79': {
			class_type: 'Krea2EditModelPatch',
			inputs: {
				model: ['71', 0],
				source_latent: ['73', 0],
				ref_boost: req.refBoost,
				ref_boost_a: req.refBoostA,
				fit_mode: 'fit',
				vae: ['57', 0],
				source_image: ['72', 0],
				target_latent: ['82', 0],
				...(two ? { source_latent_b: ['92', 0], source_image_b: ['90', 0] } : {})
			}
		},
		'84': {
			class_type: 'Krea2EditGroundedEncode',
			inputs: {
				clip: ['56', 0],
				prompt: req.prompt,
				image: ['72', 0],
				grounding_px: 768,
				system_prompt: '',
				...(two ? { image_b: ['90', 0] } : {})
			}
		},
		'85': {
			class_type: 'Krea2EditGroundedEncode',
			inputs: {
				clip: ['56', 0],
				prompt: '',
				image: ['72', 0],
				grounding_px: 768,
				system_prompt: '',
				...(two ? { image_b: ['90', 0] } : {})
			}
		},
		'53': {
			class_type: 'KSampler',
			inputs: {
				model: ['79', 0],
				positive: ['84', 0],
				negative: ['85', 0],
				latent_image: ['82', 0],
				seed: req.seed,
				steps: 10,
				cfg: 1,
				sampler_name: 'euler',
				scheduler: 'simple',
				denoise: 1
			}
		},
		'54': { class_type: 'VAEDecode', inputs: { samples: ['53', 0], vae: ['57', 0] } },
		[SAVE_NODE]: { class_type: 'SaveImage', inputs: { images: ['54', 0], filename_prefix: 'studio_outfit/out' } }
	};
}

async function submitHpc(req: EditRequest): Promise<string> {
	const scene = await hpcUpload(req.scene, `studio_outfit_${req.name}_scene.png`);
	// the person picture never changes, so it keeps one name and is simply overwritten
	const person = req.person ? await hpcUpload(req.person, `studio_outfit_${path.basename(req.person)}`) : null;
	const out = await hpcJson<{ prompt_id: string }>('/prompt', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ prompt: hpcGraph(req, scene, person), client_id: HPC_CLIENT })
	});
	return `hpc:${out.prompt_id}`;
}

type HpcHistory = Record<
	string,
	{
		status?: { status_str?: string; messages?: [string, { exception_message?: string; node_type?: string }][] };
		outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
	}
>;

async function checkHpc(id: string): Promise<EditCheck> {
	const history = await hpcJson<HpcHistory>(`/history/${encodeURIComponent(id)}`);
	const entry = history[id];
	if (entry) {
		if (entry.status?.status_str === 'error') {
			const err = entry.status.messages?.find(([kind]) => kind === 'execution_error')?.[1];
			return {
				state: 'failed',
				jobStatus: 'error',
				error: `the 4090 stopped${err?.node_type ? ` at ${err.node_type}` : ''}: ${err?.exception_message?.trim() ?? 'unknown error'}`
			};
		}
		const image = entry.outputs?.[SAVE_NODE]?.images?.[0];
		if (!image) return { state: 'failed', jobStatus: 'error', error: 'the 4090 finished without a picture' };
		const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type });
		return { state: 'done', jobStatus: 'succeeded', png: await fetchPng(`${HPC}/view?${query}`) };
	}
	const queue = await hpcJson<{ queue_running: unknown[][]; queue_pending: unknown[][] }>('/queue');
	if (queue.queue_running.some((item) => item[1] === id)) return { state: 'waiting', jobStatus: 'running' };
	const ahead = queue.queue_pending.findIndex((item) => item[1] === id);
	if (ahead >= 0) return { state: 'waiting', jobStatus: 'queued' };
	return { state: 'failed', jobStatus: 'lost', error: 'the 4090 no longer has this job (was it restarted?)' };
}

// ---------------------------------------------------------------- the GPU orchestrator

const ORCHESTRATOR = (process.env.ORCHESTRATOR_BASE_URL ?? 'https://liforma-gpu-orchestrator.fly.dev').replace(/\/$/, '');
/** The developer key lives in the old workspace .env (as for the scripts that made the endpoint plates). */
const ORCH_ENV_FILE = process.env.ORCH_ENV_FILE ?? '/Users/saizalpreetkaur./Desktop/Liforma_LTD/Liforma/.env';

function orchestratorKey(): string {
	const fromEnv = process.env.ORCH_DEVELOPER_KEY ?? process.env.ORCH_DEVELOPER_KEYS;
	const line = fromEnv
		? `ORCH_DEVELOPER_KEYS=${fromEnv}`
		: existsSync(ORCH_ENV_FILE)
			? readFileSync(ORCH_ENV_FILE, 'utf8')
					.split('\n')
					.find((l) => l.startsWith('ORCH_DEVELOPER_KEYS='))
			: undefined;
	const key = line?.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '').split(',')[0]?.trim();
	if (!key) throw new Error(`no GPU orchestrator key (ORCH_DEVELOPER_KEYS in ${ORCH_ENV_FILE})`);
	return key;
}

async function orchestrator<T>(method: string, route: string, body?: Uint8Array | object, idempotencyKey?: string): Promise<T> {
	const raw = body instanceof Uint8Array;
	const res = await fetch(`${ORCHESTRATOR}${route}`, {
		method,
		headers: {
			Authorization: `Bearer ${orchestratorKey()}`,
			...(body ? { 'Content-Type': raw ? 'image/png' : 'application/json' } : {}),
			...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
		},
		body: body ? (raw ? (body as Uint8Array<ArrayBuffer>) : JSON.stringify(body)) : undefined,
		signal: AbortSignal.timeout(60_000)
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`GPU service ${route.split('/').slice(0, 3).join('/')} ${res.status}: ${text.slice(0, 300)}`);
	return JSON.parse(text) as T;
}

async function uploadSource(file: string): Promise<string> {
	const { digest } = await orchestrator<{ digest: string }>('POST', '/v1/source-images', new Uint8Array(await readFile(file)));
	return digest;
}

async function submitOrchestrator(req: EditRequest): Promise<string> {
	const [scene, person] = await Promise.all([
		uploadSource(req.scene),
		req.person ? uploadSource(req.person) : Promise.resolve(null)
	]);
	const payload = {
		prompt: req.prompt,
		source_image_digest: scene,
		...(person ? { reference_image_digest: person, ref_boost_a: req.refBoostA } : {}),
		width: 1024,
		height: 1024,
		cfg: 1,
		num_inference_steps: 10,
		ref_boost: req.refBoost,
		grounding_px: 768,
		lora_scale: 1,
		seed: req.seed,
		output_format: 'png'
	};
	const job = await orchestrator<{ job_id: string }>(
		'POST',
		'/v1/jobs',
		{ modality: 'i2i', payload },
		`studio-outfit-${req.name}`
	);
	return `orch:${job.job_id}`;
}

async function checkOrchestrator(id: string): Promise<EditCheck> {
	const job = await orchestrator<{
		status: string;
		result?: { url?: string };
		error?: unknown;
		message?: string;
		cost?: { cost_usd?: number };
	}>('GET', `/v1/jobs/${encodeURIComponent(id)}`);
	if (job.status === 'failed' || job.status === 'cancelled') {
		return {
			state: 'failed',
			jobStatus: job.status,
			error: `the GPU job ${job.status}: ${JSON.stringify(job.error ?? job.message ?? '').slice(0, 200)}`
		};
	}
	if (job.status !== 'succeeded') return { state: 'waiting', jobStatus: job.status };
	if (!job.result?.url) return { state: 'failed', jobStatus: job.status, error: 'the GPU job finished without a picture' };
	return { state: 'done', jobStatus: job.status, png: await fetchPng(job.result.url), costUsd: job.cost?.cost_usd };
}
