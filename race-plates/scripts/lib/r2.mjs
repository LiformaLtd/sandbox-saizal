// The private authoring bucket (S3_AUTHORING_BUCKET, no public domain), using the workspace .env like
// cdn.liforma.ai's publish scripts do. Everything for this sandbox lives under race-plates/ in that bucket.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

export const PREFIX = 'race-plates/';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Walk up from the sandbox looking for a .env that names the authoring bucket. */
export function findEnv() {
	let dir = ROOT;
	for (let i = 0; i < 6; i++) {
		const p = path.join(dir, '.env');
		if (existsSync(p) && readFileSync(p, 'utf8').includes('S3_AUTHORING_BUCKET')) return p;
		dir = path.dirname(dir);
	}
	throw new Error('no .env with S3_AUTHORING_BUCKET found above ' + ROOT);
}

export function client() {
	dotenv.config({ path: findEnv(), quiet: true });
	for (const k of ['S3_API_URL', 'S3_AUTHORING_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
		if (!process.env[k]?.trim()) throw new Error(`missing ${k} in the workspace .env`);
	}
	const s3 = new S3Client({
		region: 'auto',
		endpoint: process.env.S3_API_URL,
		credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
	});
	return { s3, bucket: process.env.S3_AUTHORING_BUCKET };
}

export const TYPES = { '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
export const contentType = (f) => TYPES[path.extname(f).toLowerCase()] ?? 'application/octet-stream';
