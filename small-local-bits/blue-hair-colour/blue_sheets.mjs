// blue_sheets.mjs - 2026-10-21: what the new blue colour table looks like. Read-only (reads staging plates/dots, the local table).
//   compare_8_originals.jpg  the 8 styles made in blue: their original blue layer on Anna | the plate in the new blue table on Anna
//   women_in_blue_<avatar>.jpg  all 29 women's plate styles in blue, fitted to the avatar (jaw cut as the list says)
//   men_in_blue_<avatar>.jpg    all 38 men's plate styles in blue, fitted (stretch as the list says)
// Usage: node blue_sheets.mjs <colour_tables.json with blue> <out dir>
import { readFileSync } from 'node:fs';
const L = '/Users/saizalpreetkaur./Desktop/Liforma_LTD', BP = `${L}/hair_work/male_hair/browser_proof`;
const { default: sharp } = await import(`${L}/NEW/liforma/cdn.liforma.ai/node_modules/sharp/lib/index.js`);
const { colourPlate } = await import(`${BP}/hair_in_browser.mjs`);
const { buildField, fitHair } = await import(`${BP}/hair_dots_fit.mjs`);
const { jawZone, jawCut } = await import(`${BP}/jaw_cut.mjs`);
const { stretchX } = await import(`${BP}/men_hair_stretch.mjs`);
const [TABLES, OUT] = process.argv.slice(2);
const tables = JSON.parse(readFileSync(TABLES, 'utf8')).tables;
const HP = 'https://staging-cdn.liforma.ai/hair-plates/v1', CDN = 'https://staging-cdn.liforma.ai/avatars';
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return Buffer.from(await r.arrayBuffer()); };
const json = async (u) => JSON.parse((await get(u)).toString());
const raw = async (buf) => { const b = await sharp(buf).ensureAlpha().raw().toBuffer(); return new Uint8ClampedArray(b.buffer, b.byteOffset, b.length); };
const png = (d) => sharp(Buffer.from(d.buffer, d.byteOffset, d.length), { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
const list = await json(`${HP}/hair_plates_list.json`);
const dotsCache = new Map(), dots = async (id) => dotsCache.get(id) ?? dotsCache.set(id, await json(`${HP}/dots/${id}.json`)).get(id);
const bodies = new Map(), body = async (id) => bodies.get(id) ?? bodies.set(id, await sharp(await get(`${CDN}/${id}/1024/${id}_neutral.webp`)).resize(1024, 1024).ensureAlpha().png().toBuffer()).get(id);
const fields = new Map();
async function inBlue(style, group, avatarId) {
	const p = list.plates.find((q) => q.style === style && q.group === group), g = list.groups[group];
	let d = colourPlate(await raw(await get(`${HP}/${group}/${style}.png`)), tables.blue);
	if (avatarId !== g.source) {
		const src = await dots(g.source), dst = await dots(avatarId), k = `${g.source}>${avatarId}`;
		if (!fields.has(k)) fields.set(k, buildField(src, dst));
		d = fitHair(d, src, dst, fields.get(k), g.fit).data;
		const av = list.avatars[avatarId];
		if (p.stretch && av.stretch) {
			const gg = dst.groups, earTop = Math.min(...gg.earL.map((q) => q[1]), ...gg.earR.map((q) => q[1]));
			d = stretchX(d, { cx: gg.face.reduce((t, q) => t + q[0], 0) / gg.face.length, scale: av.stretch, fadeTop: earTop - 30, fadeBottom: earTop });
		}
		if (p.jawCut) d = jawCut(d, jawZone(dst));
	}
	return png(d);
}
async function cell(avatarId, hairPng, label, X = 232, Y = 0, W = 560, H = 700, S = 0.42) {
	const full = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#ffffff' } }).composite([{ input: await body(avatarId) }, { input: hairPng }]).png().toBuffer();
	const w = Math.round(W * S), h = Math.round(H * S), lab = 34;
	const pic = await sharp(full).extract({ left: X, top: Y, width: W, height: H }).resize(w, h).png().toBuffer();
	const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
	const t = Buffer.from(`<svg width="${w}" height="${lab}"><rect width="100%" height="100%" fill="#f5f5f5"/>${label.split('\n').map((line, i) => `<text x="6" y="${14 + i * 14}" font-family="Helvetica" font-size="12" fill="#141414">${esc(line)}</text>`).join('')}</svg>`);
	return { buf: await sharp({ create: { width: w, height: h + lab, channels: 3, background: '#fff' } }).composite([{ input: pic, top: 0, left: 0 }, { input: t, top: h, left: 0 }]).png().toBuffer(), w, h: h + lab };
}
async function sheet(cells, cols, file) {
	const w = cells[0].w, h = cells[0].h, rows = Math.ceil(cells.length / cols);
	await sharp({ create: { width: cols * (w + 4), height: rows * (h + 4), channels: 3, background: '#ddd' } })
		.composite(cells.map((c, i) => ({ input: c.buf, left: (i % cols) * (w + 4), top: Math.floor(i / cols) * (h + 4) }))).jpeg({ quality: 88 }).toFile(file);
	console.log('wrote', file);
}
// 1. the 8 originals vs the plate in the new blue, both on Anna (the plates' own avatar, no fit)
const EIGHT = ['half-up-half-down.gpt2', 'half-up.s404', 'high-top-knot.s1234', 'long-sleek.s1234', 'long-wavy-textured.s1234', 'straight-shoulder.gpt1', 'swept-back-low-ponytail.s404', 'tapered-afro.gpt1'];
const cmp = [];
for (const s of EIGHT) {
	const orig = await sharp(`${process.env.HOME}/Desktop/hair_layers/dd80126a/${s}-blue.png`).ensureAlpha().png().toBuffer();
	cmp.push(await cell('dd80126a', orig, `${s}\noriginal blue`));
	cmp.push(await cell('dd80126a', await inBlue(s, 'women', 'dd80126a'), `${s}\nnew blue table`));
}
await sheet(cmp, 4, `${OUT}/compare_8_originals_on_anna.jpg`);
// 2. every women's style in blue on a race woman, 3. every men's style on a race man
for (const [group, avatarId, file] of [['women', 'ea5a0002', 'women_in_blue_ea5a0002.jpg'], ['men', 'af5b0001', 'men_in_blue_af5b0001.jpg']]) {
	const cells = [];
	for (const p of list.plates.filter((q) => q.group === group)) cells.push(await cell(avatarId, await inBlue(p.style, group, avatarId), p.style));
	await sheet(cells, 6, `${OUT}/${file}`);
}
