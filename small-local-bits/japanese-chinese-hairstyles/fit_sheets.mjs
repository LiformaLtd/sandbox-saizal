// fit_sheets.mjs - 2026-10-23 (user: "use try 2 for all and fit them on all the other races"): the six new plates (plates/<group>/<style>.png)
// fitted on all 10 women / 10 men with the browser-proof code (as older_plates_2026-10-22/fit_sheets.mjs), in one colour on each avatar's
// plain body. Men's styles carry the list's sideways stretch (all three stay above the middle of Caleb's ears, the stretch rule), applied
// as the Studio does: the avatar's "stretch" from the list. Cells show the head and shoulders (x 192-832, y 0-640); hair found below
// row 640 is counted and printed, so nothing below the crop is missed. Usage: COLOUR=black node fit_sheets.mjs
import { readFile, mkdir } from 'node:fs/promises';
const L = '/Users/saizalpreetkaur./Desktop/Liforma_LTD';
const { default: sharp } = await import(`${L}/NEW/liforma/cdn.liforma.ai/node_modules/sharp/lib/index.js`);
const BP = `${L}/hair_work/male_hair/browser_proof`;
const { hairFor } = await import(`${BP}/hair_in_browser.mjs`);
const { stretchX } = await import(`${BP}/men_hair_stretch.mjs`);
const S = `${L}/NEW/liforma/app.liforma.ai/static/hair-plates-local`, BODIES = `${L}/hair_work/older_plates_2026-10-22/bodies`;
const list = JSON.parse(await readFile(`${S}/hair_plates_list.json`, 'utf8'));
const tables = JSON.parse(await readFile(`${S}/colour_tables.json`, 'utf8')).tables;
const dots = async (id) => JSON.parse(await readFile(`${S}/dots/${id}.json`, 'utf8'));
const raw = async (f) => { const b = await sharp(await readFile(f)).ensureAlpha().raw().toBuffer(); return new Uint8ClampedArray(b.buffer, b.byteOffset, b.length); };
const NEW = { women: ['japanese-updo', 'chinese-hairpin-updo', 'double-buns'], men: ['samurai_topknot', 'chinese_topknot', 'two_block_cut'] };
const STRETCH = new Set(['samurai_topknot', 'chinese_topknot', 'two_block_cut']);
const COLOUR = process.env.COLOUR || 'black', T = 260, LABEL = 170, HEAD = 22, CROP = { left: 192, top: 0, width: 640, height: 640 };
await mkdir('fit_sheets', { recursive: true });
for (const group of ['women', 'men']) {
	const source = list.groups[group].source;
	const avatars = [source, ...Object.keys(list.avatars).filter((a) => list.avatars[a].group === group && a !== source)];
	const src = await dots(source);
	const tiles = [], below = {};
	for (const [r, style] of NEW[group].entries()) {
		const plate = await raw(`plates/${group}/${style}.png`);
		for (const [c, av] of avatars.entries()) {
			const dst = await dots(av);
			let hair = hairFor(plate, tables[COLOUR], src, dst, group === 'women' ? `w_${style}` : style);
			const k = list.avatars[av].stretch;
			if (STRETCH.has(style) && k && k !== 1) {
				const g = dst.groups, earTop = Math.min(...g.earL.map((p) => p[1]), ...g.earR.map((p) => p[1]));
				hair = stretchX(hair, { cx: g.face.reduce((t, p) => t + p[0], 0) / g.face.length, scale: k, fadeTop: earTop - 30, fadeBottom: earTop });
			}
			let n = 0;
			for (let i = 640 * 1024 * 4 + 3; i < hair.length; i += 4) if (hair[i] > 25) n++;
			if (n) below[`${style} on ${av}`] = n;
			const hairPng = await sharp(Buffer.from(hair.buffer, hair.byteOffset, hair.length), { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
			const full = await sharp(`${BODIES}/${av}.webp`).composite([{ input: hairPng }]).png().toBuffer();
			tiles.push({ input: await sharp(full).extract(CROP).resize(T, T).png().toBuffer(), left: LABEL + c * T, top: HEAD + r * T });
		}
		tiles.push({ input: Buffer.from(`<svg width="${LABEL}" height="${T}"><text x="6" y="${T / 2}" font-family="Helvetica" font-size="15" fill="#111">${style}</text></svg>`), left: 0, top: HEAD + r * T });
	}
	tiles.push({ input: Buffer.from(`<svg width="${LABEL + avatars.length * T}" height="${HEAD}">${avatars.map((a, c) => `<text x="${LABEL + c * T + 6}" y="16" font-family="Helvetica" font-size="14" fill="#111">${a}${a === source ? ' (source)' : ''}</text>`).join('')}</svg>`), left: 0, top: 0 });
	const out = `fit_sheets/new_${group}_${COLOUR}.jpg`;
	await sharp({ create: { width: LABEL + avatars.length * T, height: HEAD + NEW[group].length * T, channels: 3, background: '#ffffff' } }).composite(tiles).jpeg({ quality: 90 }).toFile(out);
	console.log(out, '| hair below row 640:', Object.keys(below).length ? JSON.stringify(below) : 'none');
}
