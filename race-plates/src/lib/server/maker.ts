// Runs the Python maker (maker/make_race_plates.py) for one outfit and reads its report.
// Folders, relative to this sandbox: plates/anna, plates/precious (pulled from the private bucket), maker/, out/.
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const PLATES = path.join(ROOT, 'plates');
export const OUT = path.join(ROOT, 'out');
export const MAKER = path.join(ROOT, 'maker');

export type Report = {
	fixes: string;
	plates: Record<
		string,
		{
			ok: boolean;
			values: number[];
			file: string;
			outline_not_anna_below_neck: number;
			clothing_changed: number;
			face_not_exact: number;
			hands: string | { miss: number[]; problem?: string };
		}
	>;
};

export function races(): string[] {
	const values = JSON.parse(readFileSync(path.join(MAKER, 'race_values.json'), 'utf8'));
	return Object.keys(values);
}

async function plateFiles(dir: string): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	try {
		for (const f of await readdir(dir)) {
			if (/\.(png|webp)$/i.test(f)) out.set(f.replace(/\.(png|webp)$/i, ''), path.join(dir, f));
		}
	} catch {
		/* folder not pulled yet */
	}
	return out;
}

/** Outfits present in both plates/anna and plates/precious. */
export async function listOutfits(): Promise<string[]> {
	const anna = await plateFiles(path.join(PLATES, 'anna'));
	const precious = await plateFiles(path.join(PLATES, 'precious'));
	return [...anna.keys()].filter((n) => precious.has(n)).sort();
}

export function pythonCandidates(): string[] {
	return [
		process.env.RACE_PLATES_PYTHON,
		path.resolve(ROOT, '../../../../ComfyUI/.venv/bin/python'), // the only Python on the authoring Mac with numpy/scipy
		'python3'
	].filter((p): p is string => Boolean(p));
}

function run(cmd: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
	return new Promise((resolve, reject) => {
		let out = '';
		let err = '';
		let child;
		try {
			child = spawn(cmd, args, { cwd: ROOT });
		} catch (e) {
			reject(e);
			return;
		}
		child.stdout.on('data', (d) => (out += d));
		child.stderr.on('data', (d) => (err += d));
		child.on('error', reject);
		child.on('close', (code) => resolve({ code: code ?? -1, out, err }));
	});
}

let pythonCache: { ok: boolean; python: string | null; candidates: string[] } | null = null;

/** The first candidate that can import numpy, scipy and pillow. */
export async function pythonStatus() {
	if (pythonCache?.ok) return pythonCache;
	const candidates = pythonCandidates();
	for (const py of candidates) {
		if (py.includes('/') && !existsSync(py)) continue;
		try {
			const r = await run(py, ['-c', 'import numpy, scipy, PIL']);
			if (r.code === 0) return (pythonCache = { ok: true, python: py, candidates });
		} catch {
			/* try the next one */
		}
	}
	return (pythonCache = { ok: false, python: null, candidates });
}

export async function make(outfit: string, chosen: string[], fixes: boolean, endpointsOnly = false) {
	const anna = (await plateFiles(path.join(PLATES, 'anna'))).get(outfit);
	const precious = (await plateFiles(path.join(PLATES, 'precious'))).get(outfit);
	if (!anna || !precious) throw new Error(`no plates for "${outfit}" in plates/anna and plates/precious`);
	const rel = (p: string) => '/api/plate/' + path.relative(ROOT, p).split(path.sep).join('/');
	if (endpointsOnly) {
		// nothing to make: only Anna's and/or Precious's own plates were asked for
		return { outfit, exit: 0, log: '', report: { fixes: fixes ? 'on' : 'off', plates: {} } as Report, images: { anna: rel(anna), precious: rel(precious), races: {} } };
	}
	const py = await pythonStatus();
	if (!py.ok) throw new Error(`no Python with numpy, scipy and pillow found (tried ${py.candidates.join(', ')})`);
	const outDir = path.join(OUT, outfit);
	const args = [
		path.join(MAKER, 'make_race_plates.py'),
		anna,
		precious,
		outDir,
		'--name',
		outfit,
		'--fixes',
		fixes ? 'on' : 'off'
	];
	if (chosen.length) args.push('--races', chosen.join(','));
	const r = await run(py.python!, args);
	let report: Report | null = null;
	try {
		report = JSON.parse(await readFile(path.join(outDir, `${outfit}_report.json`), 'utf8'));
	} catch {
		/* no report: the run failed before writing one */
	}
	if (!report) throw new Error(`the maker failed (exit ${r.code}):\n${r.err || r.out}`);
	const stamp = Date.now();
	return {
		outfit,
		exit: r.code,
		log: r.out,
		report,
		images: {
			anna: rel(anna),
			precious: rel(precious),
			races: Object.fromEntries(Object.entries(report.plates).map(([race, p]) => [race, `${rel(path.resolve(ROOT, p.file))}?t=${stamp}`]))
		}
	};
}
