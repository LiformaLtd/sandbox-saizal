// all_styles_sheet.mjs - 2026-10-21 (user: "show me all the new hairstyles ... we need to remove a few. There's duplication"). Every
// plate hairstyle, numbered, fitted to one race avatar in dark brown; the versions of one look sit side by side on a yellow band.
// Read-only: plates, dots and colour table from the local Studio's copy (static/hair-plates-local), bodies from the staging CDN.
// Usage: node all_styles_sheet.mjs <out dir>
import { readFileSync } from 'node:fs';
const L = '/Users/saizalpreetkaur./Desktop/Liforma_LTD', BP = `${L}/hair_work/male_hair/browser_proof`;
const { default: sharp } = await import(`${L}/NEW/liforma/cdn.liforma.ai/node_modules/sharp/lib/index.js`);
const { colourPlate } = await import(`${BP}/hair_in_browser.mjs`);
const { buildField, fitHair } = await import(`${BP}/hair_dots_fit.mjs`);
const { jawZone, jawCut } = await import(`${BP}/jaw_cut.mjs`);
const { stretchX } = await import(`${BP}/men_hair_stretch.mjs`);
const OUT = process.argv[2];
const HP = `${L}/NEW/liforma/app.liforma.ai/static/hair-plates-local`, CDN = 'https://staging-cdn.liforma.ai/avatars';
const json = (p) => JSON.parse(readFileSync(`${HP}/${p}`, 'utf8'));
const list = json('hair_plates_list.json'), tables = json('colour_tables.json').tables;
const raw = async (file) => { const b = await sharp(file).ensureAlpha().raw().toBuffer(); return new Uint8ClampedArray(b.buffer, b.byteOffset, b.length); };
const SEED = /(\.(s\d+|gpt\d+|cw|c\d+|gemini\d+|hf\d+|hold\d+|chatgpt\d+)|_(s\d+|gpt\d+|chatgpt\d+|gemini\d+|hf\d+|hold\d+))$/;
const lookOf = (style) => style.replace(SEED, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

for (const [group, avatarId, title] of [['women', 'ea5a0002', 'Women (shown on the East Asian woman)'], ['men', 'af5b0001', 'Men (shown on the African man)']]) {
	const g = list.groups[group], av = list.avatars[avatarId], src = json(`dots/${g.source}.json`), dst = json(`dots/${avatarId}.json`);
	const field = buildField(src, dst);
	const body = await sharp(Buffer.from(await (await fetch(`${CDN}/${avatarId}/1024/${avatarId}_neutral.webp`)).arrayBuffer())).resize(1024, 1024).ensureAlpha().png().toBuffer();
	// looks in list order; the versions of one look together
	const plates = list.plates.filter((p) => p.group === group), looks = [];
	for (const p of plates) { const l = looks.find((x) => x.look === lookOf(p.style)); if (l) l.styles.push(p); else looks.push({ look: lookOf(p.style), styles: [p] }); }
	const W = 560, H = 700, X = 232, S = 0.4, w = Math.round(W * S), h = Math.round(H * S), lab = 40;
	const cells = [];
	let n = 0;
	for (const l of looks) for (const [k, p] of l.styles.entries()) {
		n++;
		let d = colourPlate(await raw(`${HP}/${group}/${p.style}.png`), tables.darkbrown);
		d = fitHair(d, src, dst, field, g.fit).data;
		if (p.stretch && av.stretch) {
			const gg = dst.groups, earTop = Math.min(...gg.earL.map((q) => q[1]), ...gg.earR.map((q) => q[1]));
			d = stretchX(d, { cx: gg.face.reduce((t, q) => t + q[0], 0) / gg.face.length, scale: av.stretch, fadeTop: earTop - 30, fadeBottom: earTop });
		}
		if (p.jawCut) d = jawCut(d, jawZone(dst));
		const hair = await sharp(Buffer.from(d.buffer, d.byteOffset, d.length), { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
		const multi = l.styles.length > 1;
		const full = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: multi ? '#fff6cc' : '#ffffff' } }).composite([{ input: body }, { input: hair }]).png().toBuffer();
		const pic = await sharp(full).extract({ left: X, top: 0, width: W, height: H }).resize(w, h).png().toBuffer();
		const line2 = multi ? `version ${'AB'[k] ?? k + 1} of ${l.styles.length}: ${l.look}` : '';
		const t = Buffer.from(`<svg width="${w}" height="${lab}"><rect width="100%" height="100%" fill="${multi ? '#ffe680' : '#f2f2f2'}"/><text x="6" y="16" font-family="Helvetica" font-size="13" font-weight="bold" fill="#141414">#${n} ${esc(p.style)}</text><text x="6" y="33" font-family="Helvetica" font-size="11" fill="#5a4a00">${esc(line2)}</text></svg>`);
		cells.push(await sharp({ create: { width: w, height: h + lab, channels: 3, background: '#fff' } }).composite([{ input: pic, top: 0, left: 0 }, { input: t, top: h, left: 0 }]).png().toBuffer());
	}
	const cols = 6, rows = Math.ceil(cells.length / cols), head = 44;
	const header = Buffer.from(`<svg width="${cols * (w + 6)}" height="${head}"><rect width="100%" height="100%" fill="#222"/><text x="10" y="29" font-family="Helvetica" font-size="20" fill="#fff">${esc(title)} - ${cells.length} styles, ${looks.length} looks; yellow = a look with more than one version</text></svg>`);
	await sharp({ create: { width: cols * (w + 6), height: head + rows * (h + lab + 6), channels: 3, background: '#ccc' } })
		.composite([{ input: header, top: 0, left: 0 }, ...cells.map((input, i) => ({ input, left: (i % cols) * (w + 6), top: head + Math.floor(i / cols) * (h + lab + 6) }))])
		.jpeg({ quality: 88 }).toFile(`${OUT}/new_hairstyles_${group}.jpg`);
	console.log(`${group}: ${cells.length} styles, ${looks.length} looks`);
}
