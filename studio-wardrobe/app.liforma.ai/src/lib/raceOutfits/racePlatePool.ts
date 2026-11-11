// LOCAL DEV ONLY (2026-09-25): a few workers making ethnicity outfit plates (racePlate.worker.ts). Jobs run in the
// order asked, except urgent ones (the plate on the stage, the one being saved), which jump the queue.
import type { RacePlateReport } from './racePlateMaker';
import type { RaceSet } from './raceInputUrl';
import type { RacePlateJob, RacePlateJobResult } from './racePlate.worker';

export type MadeRacePlate = { readonly blob: Blob; readonly report: RacePlateReport | null };

type Pending = {
	readonly job: RacePlateJob;
	readonly resolve: (plate: MadeRacePlate) => void;
	readonly reject: (error: Error) => void;
};

const queue: Pending[] = [];
const idle: Worker[] = [];
const busy = new Map<Worker, Pending>();
let workers = 0;
let nextId = 1;

function maxWorkers(): number {
	const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
	return Math.max(1, Math.min(4, cores - 1));
}

function finish(worker: Worker, outcome: RacePlateJobResult | Error) {
	const pending = busy.get(worker);
	busy.delete(worker);
	if (!pending) return;
	if (outcome instanceof Error) pending.reject(outcome);
	else if ('error' in outcome) pending.reject(new Error(outcome.error));
	else pending.resolve({ blob: outcome.blob, report: outcome.report });
}

function spawn(): Worker {
	const worker = new Worker(new URL('./racePlate.worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = (event: MessageEvent<RacePlateJobResult>) => {
		finish(worker, event.data);
		idle.push(worker);
		pump();
	};
	worker.onerror = (event) => {
		finish(worker, new Error(event.message || 'the plate maker stopped'));
		worker.terminate();
		workers--;
		pump();
	};
	workers++;
	return worker;
}

function pump() {
	while (queue.length > 0) {
		const worker = idle.pop() ?? (workers < maxWorkers() ? spawn() : null);
		if (!worker) return;
		const pending = queue.shift() as Pending;
		busy.set(worker, pending);
		worker.postMessage(pending.job);
	}
}

/** Move a queued plate to the front (it is now on screen where it matters most). */
export function promoteRacePlate(race: string, outfit: string, format: RacePlateJob['format'], set: RaceSet) {
	const at = queue.findIndex(
		(p) => p.job.race === race && p.job.outfit === outfit && p.job.format === format && p.job.set === set
	);
	if (at > 0) queue.unshift(...queue.splice(at, 1));
}

/** Make one ethnicity outfit plate in a worker. */
export function makeRacePlateInWorker(
	race: string,
	outfit: string,
	format: RacePlateJob['format'],
	set: RaceSet,
	urgent = false
): Promise<MadeRacePlate> {
	return new Promise((resolve, reject) => {
		const pending: Pending = { job: { id: nextId++, race, outfit, format, set }, resolve, reject };
		if (urgent) queue.unshift(pending);
		else queue.push(pending);
		pump();
	});
}

/** A new outfit's first picture with the head and bare neck taken away, cropped (bodyPreview.ts), for showing only. */
export function makeBodyPreviewInWorker(bodyUrl: string, set: RaceSet): Promise<MadeRacePlate> {
	return new Promise((resolve, reject) => {
		const job: RacePlateJob = { id: nextId++, race: '', outfit: '', format: 'image/webp', set, bodyOnly: bodyUrl };
		queue.unshift({ job, resolve, reject });
		pump();
	});
}
