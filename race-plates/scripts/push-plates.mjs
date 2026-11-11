#!/usr/bin/env node
/**
 * Push plate folders to race-plates/ in the private authoring bucket (never the public CDN bucket).
 *
 *   npm run push -- --anna DIR --precious DIR [--faces DIR] [--values FILE] [--dry-run]
 *
 * DIR/<outfit>.png -> race-plates/anna/<outfit>.png (and precious/, faces/); the values file -> race-plates/race_values.json.
 * Anna's and Precious's folders must hold the same outfit names; the script refuses otherwise.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import { PREFIX, client, contentType } from './lib/r2.mjs';

const argv = process.argv.slice(2);
const opt = (name) => {
	const i = argv.indexOf(name);
	return i >= 0 ? argv[i + 1] : undefined;
};
const dryRun = argv.includes('--dry-run');
const dirs = { anna: opt('--anna'), precious: opt('--precious'), faces: opt('--faces') };
const values = opt('--values');
if (!values && !dirs.faces && !(dirs.anna && dirs.precious)) {
	console.error('usage: npm run push -- [--anna DIR --precious DIR] [--faces DIR] [--values FILE] [--dry-run]');
	process.exit(2);
}
if (Boolean(dirs.anna) !== Boolean(dirs.precious)) {
	console.error('--anna and --precious go together; nothing pushed');
	process.exit(2);
}

const images = async (dir) => (await readdir(dir)).filter((f) => /\.(png|webp)$/i.test(f)).sort();
const names = (files) => files.map((f) => f.replace(/\.(png|webp)$/i, ''));
if (dirs.anna) {
	const annaFiles = await images(dirs.anna);
	const preciousFiles = await images(dirs.precious);
	if (names(annaFiles).join() !== names(preciousFiles).join()) {
		console.error('anna and precious folders do not hold the same outfit names; nothing pushed');
		process.exit(1);
	}
}

/** @type {{key: string, file: string}[]} */
const jobs = [];
for (const [sub, dir] of Object.entries(dirs)) {
	if (!dir) continue;
	for (const f of await images(dir)) jobs.push({ key: `${PREFIX}${sub}/${f}`, file: path.join(dir, f) });
}
if (values) jobs.push({ key: `${PREFIX}race_values.json`, file: values });

const { s3, bucket } = client();
let bytes = 0;
for (const j of jobs) {
	const body = await readFile(j.file);
	bytes += body.length;
	console.log(dryRun ? 'would push' : 'push', j.file, '->', `${bucket}/${j.key}`, body.length);
	if (dryRun) continue;
	await s3.send(new PutObjectCommand({ Bucket: bucket, Key: j.key, Body: body, ContentType: contentType(j.file) }));
}
console.log(`${dryRun ? 'listed' : 'pushed'} ${jobs.length} file(s), ${(bytes / 1e6).toFixed(1)} MB, to ${bucket}/${PREFIX}`);
