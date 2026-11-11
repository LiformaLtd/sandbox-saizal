#!/usr/bin/env node
// Avatar maker page (local only, 6 Nov 2026): the new-avatar picture steps with model menus, checks and automatic re-tries.
//   cd ~/Desktop/Liforma_LTD/NEW/liforma/.local-dev/avatar-maker && node server.mjs      ->  http://localhost:3055
// The page only shows and starts things; maker.py does the work (calls, checks, files). One job at a time (one avatar at a time).
// Avatars live in ~/Desktop/Liforma_LTD/plates/new_avatars/<id>/. Nothing is uploaded anywhere.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const L = `${HOME}/Desktop/Liforma_LTD`;
const ROOT = `${L}/plates/new_avatars`;
const PY = `${L}/ComfyUI/.venv/bin/python`;
const MAKER = `${HERE}/maker.py`;
const SRC = `${L}/NEW/liforma/source/avatars`;
const PORT = Number(process.env.PORT || 3055);
const ALLOWED = [L, `${HOME}/Desktop/Desktop_cleanup_2026-10-27`].map((p) => fs.realpathSync(p));
const DRY_ID = 'dryrun01';
const LABS_GATE = process.env.LABS_GATE_URL || 'http://127.0.0.1:3019'; // passed on to maker.py (pack build only)
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8' };

fs.mkdirSync(ROOT, { recursive: true });
let job = null; // { avatar, action, step, proc, started }
let lastJob = null; // { avatar, action, step, code, ended }

function send(res, code, body) {
	const isStr = typeof body === 'string';
	res.writeHead(code, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store' });
	res.end(isStr ? body : JSON.stringify(body));
}

function readBody(req, limit = 60e6) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let n = 0;
		req.on('data', (c) => {
			n += c.length;
			if (n > limit) reject(new Error('too large'));
			else chunks.push(c);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

function avatarDir(id) {
	if (!/^[a-z0-9]{8}$/.test(id || '')) throw new Error(`bad avatar id: ${id}`);
	const d = `${ROOT}/${id}`;
	if (!fs.existsSync(`${d}/maker.json`)) throw new Error(`no avatar ${id}`);
	return d;
}

function readJson(p, fallback = null) {
	try {
		return JSON.parse(fs.readFileSync(p, 'utf8'));
	} catch {
		return fallback;
	}
}

function makerSync(args) {
	const r = spawnSync(PY, [MAKER, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const last = (r.stdout || '').trim().split('\n').pop() || '';
	let out = null;
	try {
		out = JSON.parse(last);
	} catch {
		out = null;
	}
	if (!out) throw new Error(`maker.py ${args[0]} failed: ${(r.stderr || r.stdout || '').trim().slice(-800)}`);
	if (out.error) throw new Error(out.error);
	return out;
}

function startJob(avatar, action, opts) {
	if (job) throw new Error(`busy: ${job.action} ${job.step} for ${job.avatar} is still running (one job at a time)`);
	const dir = avatarDir(avatar);
	fs.mkdirSync(`${dir}/maker`, { recursive: true });
	const log = fs.openSync(`${dir}/maker/job.log`, 'a');
	fs.writeSync(log, `\n=== ${new Date().toISOString()} ${action} ${JSON.stringify(opts)}\n`);
	const proc = spawn(PY, ['-u', MAKER, action, dir, JSON.stringify(opts)], { stdio: ['ignore', log, log], cwd: HERE });
	job = { avatar, action, step: opts.step, proc, started: new Date().toISOString() };
	proc.on('exit', (code) => {
		fs.closeSync(log);
		lastJob = { avatar, action, step: opts.step, code, ended: new Date().toISOString() };
		job = null;
		// a runner that died without writing its end (killed hard) must not look "running" on the page
		const sp = `${dir}/maker/${opts.step}.json`;
		const st = readJson(sp);
		if (st && st.status === 'running' && st.pid === proc.pid) {
			st.status = 'stopped';
			st.error = `the runner ended (exit ${code}) before finishing`;
			fs.writeFileSync(sp, JSON.stringify(st, null, 1));
		}
	});
	return job;
}

function portOpen(port) {
	return new Promise((resolve) => {
		const s = net.connect({ host: '127.0.0.1', port });
		const done = (ok) => {
			s.destroy();
			resolve(ok);
		};
		s.setTimeout(400, () => done(false));
		s.on('connect', () => done(true));
		s.on('error', () => done(false));
	});
}

// "listening" is not enough for face points: the old :3011 process listens but cannot read pictures. A real fit, cached 30 s.
const TEST_FACE = `${HOME}/Desktop/Desktop_cleanup_2026-10-27/european_face_plates/european_hd_face_area_neutral.png`;
const pointsCache = {};
async function pointsOk(port) {
	const c = pointsCache[port];
	if (c && Date.now() - c.at < 30000) return c.ok;
	let ok = false;
	try {
		const fd = new FormData();
		fd.append('file', new Blob([fs.readFileSync(TEST_FACE)], { type: 'image/png' }), 'health.png');
		fd.append('item_id', 'health');
		const r = await fetch(`http://127.0.0.1:${port}/v1/face-landmarker/fit-upload`, { method: 'POST', body: fd, signal: AbortSignal.timeout(20000) });
		ok = r.ok && (await r.json()).status === 'ok';
	} catch {
		ok = false;
	}
	pointsCache[port] = { at: Date.now(), ok };
	return ok;
}

// OLD labs behind the gate: its fit-mesh route rejects an empty body with 400 when it works (500 when it cannot read its folder).
let labsCache = null;
async function labsOk() {
	if (labsCache && Date.now() - labsCache.at < 30000) return labsCache.ok;
	let ok = false;
	try {
		const r = await fetch(`${LABS_GATE}/api/avatar-generation/fit-mesh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20000) });
		ok = r.status === 400 && (await r.text()).includes('sourceFile');
	} catch {
		ok = false;
	}
	labsCache = { at: Date.now(), ok };
	return ok;
}

function listAvatars() {
	return fs
		.readdirSync(ROOT)
		.filter((d) => fs.existsSync(`${ROOT}/${d}/maker.json`))
		.map((d) => readJson(`${ROOT}/${d}/maker.json`))
		.filter(Boolean);
}

function mouthInteriors() {
	// existing packs' mouth_interior_E: the first pack build needs one (prep_race_pack.py MOUTH_INTERIOR); guide step 7 later puts the
	// shared "inside only" picture in for every avatar
	const out = [];
	for (const id of fs.existsSync(SRC) ? fs.readdirSync(SRC) : []) {
		const p = `${SRC}/${id}/${id}_mouth_interior_E.webp`;
		if (/^[0-9a-z]{8}$/.test(id) && fs.existsSync(p)) out.push({ id, gender: id.slice(2, 4) === '5b' ? 'male' : 'female', path: p });
	}
	return out;
}

function createAvatar(b) {
	const id = String(b.id || '').trim();
	const slug = String(b.slug || '').trim();
	if (!/^[0-9a-z]{8}$/.test(id)) throw new Error('The id must be 8 letters/digits, e.g. e05a0002 (see the guide, section 0).');
	if (!/^[a-z][a-z-]*$/.test(slug)) throw new Error('The race name must be lower case with dashes, e.g. latin-american.');
	if (!['female', 'male'].includes(b.gender)) throw new Error('Choose woman or man.');
	const dir = `${ROOT}/${id}`;
	if (fs.existsSync(dir)) throw new Error(`${dir} already exists.`);
	if (fs.existsSync(`${SRC}/${id}`) && !b.dry) throw new Error(`A pack ${id} already exists in source/avatars; choose another id.`);
	fs.mkdirSync(`${dir}/maker`, { recursive: true });
	const cfg = { id, slug, gender: b.gender, label: String(b.label || `${slug} ${b.gender === 'male' ? 'man' : 'woman'}`), dry: !!b.dry, created: new Date().toISOString(), prompts: { base: String(b.prompt || '') } };
	fs.writeFileSync(`${dir}/maker.json`, JSON.stringify(cfg, null, 1));
	return cfg;
}

function serveFile(res, p) {
	let real;
	try {
		real = fs.realpathSync(p);
	} catch {
		return send(res, 404, 'not found');
	}
	if (!ALLOWED.some((a) => real === a || real.startsWith(a + path.sep))) return send(res, 403, 'outside the allowed folders');
	res.writeHead(200, { 'Content-Type': TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
	fs.createReadStream(real).pipe(res);
}

let CONFIG = null;

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const q = Object.fromEntries(url.searchParams);
	try {
		if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
			res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
			return fs.createReadStream(`${HERE}/index.html`).pipe(res);
		}
		if (req.method === 'GET' && url.pathname === '/file') return serveFile(res, q.p || '');
		if (req.method === 'GET' && url.pathname === '/painter') {
			const dir = avatarDir(q.avatar);
			const cfg = readJson(`${dir}/maker.json`);
			return serveFile(res, `${dir}/face/mask-editor-${cfg.slug}.html`);
		}
		if (req.method === 'GET' && url.pathname === '/api/config') {
			CONFIG = CONFIG || makerSync(['config']);
			return send(res, 200, { ...CONFIG, mouthInteriors: mouthInteriors(), dryId: DRY_ID });
		}
		if (req.method === 'GET' && url.pathname === '/api/avatars') return send(res, 200, listAvatars());
		if (req.method === 'GET' && url.pathname === '/api/state') {
			const dir = avatarDir(q.avatar);
			const steps = {};
			for (const s of ['base', 'crop', 'master', 'masks', 'painted_mask', 'addpic', 'plates', 'mouth', 'set', 'pack']) steps[s] = readJson(`${dir}/maker/${s}.json`);
			const [p4011, p3019] = await Promise.all([pointsOk(4011), labsOk()]);
			const p3011 = await pointsOk(3011);
			return send(res, 200, {
				cfg: readJson(`${dir}/maker.json`),
				dir,
				steps,
				job: job ? { avatar: job.avatar, action: job.action, step: job.step, started: job.started } : null,
				lastJob,
				services: { 4011: p4011, 3011: p3011, 3019: p3019, labsGate: LABS_GATE },
				packExists: fs.existsSync(`${SRC}/${q.avatar}`)
			});
		}
		if (req.method !== 'POST') return send(res, 404, 'not found');
		const raw = await readBody(req);
		if (url.pathname === '/api/upload') {
			const dir = avatarDir(q.avatar);
			const name = path.basename(q.name || 'picture.png').replace(/[^A-Za-z0-9._-]/g, '_');
			fs.mkdirSync(`${dir}/base/uploads`, { recursive: true });
			const p = `${dir}/base/uploads/${Date.now()}_${name}`;
			fs.writeFileSync(p, raw);
			return send(res, 200, startJob(q.avatar, 'free', { step: 'addpic', path: p }) && { ok: true, path: p });
		}
		const b = raw.length ? JSON.parse(raw.toString('utf8')) : {};
		if (url.pathname === '/api/avatars') return send(res, 200, createAvatar(b));
		if (url.pathname === '/api/avatars/dry') {
			if (fs.existsSync(`${ROOT}/${DRY_ID}/maker.json`)) return send(res, 200, readJson(`${ROOT}/${DRY_ID}/maker.json`));
			const prompt = fs.readFileSync(`${L}/plates/base_plates/european_middle_aged_female/prompt_v4_age38_neck.txt`, 'utf8').trim();
			return send(res, 200, createAvatar({ id: DRY_ID, slug: 'european', gender: 'female', label: 'DRY RUN test (bald Anna stand-ins)', dry: true, prompt }));
		}
		if (url.pathname === '/api/prompt') {
			const dir = avatarDir(b.avatar);
			const cfg = readJson(`${dir}/maker.json`);
			cfg.prompts = { ...(cfg.prompts || {}), base: String(b.text || '') };
			fs.writeFileSync(`${dir}/maker.json`, JSON.stringify(cfg, null, 1));
			return send(res, 200, { ok: true });
		}
		if (url.pathname === '/api/plan') return send(res, 200, makerSync(['plan', avatarDir(b.avatar), JSON.stringify(b.opts)]));
		if (url.pathname === '/api/run' || url.pathname === '/api/free') {
			const j = startJob(b.avatar, url.pathname === '/api/run' ? 'run' : 'free', b.opts);
			return send(res, 200, { ok: true, started: j.started });
		}
		if (url.pathname === '/api/pick') return send(res, 200, makerSync(['pick', avatarDir(b.avatar), JSON.stringify({ step: b.step, item: b.item, try: b.try })]));
		if (url.pathname === '/api/stop') {
			if (!job) return send(res, 200, { ok: true, note: 'nothing running' });
			job.proc.kill('SIGTERM');
			return send(res, 200, { ok: true });
		}
		return send(res, 404, 'not found');
	} catch (e) {
		console.error(`[avatar-maker] ${req.method} ${url.pathname} failed:`, e.message);
		return send(res, 400, { error: e.message });
	}
});

server.listen(PORT, '127.0.0.1', () => console.log(`avatar maker: http://localhost:${PORT}  (avatars in ${ROOT})`));
