#!/usr/bin/env node
/**
 * Pull race-plates/ from the private authoring bucket into plates/.
 *
 *   npm run pull                 # everything under race-plates/
 *   npm run pull -- --dry-run    # list only
 *
 * race-plates/anna/<outfit>.png  -> plates/anna/<outfit>.png, and the same for precious/, faces/ and race_values.json.
 * Files already present with the same size are skipped.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

import { PREFIX, ROOT, client } from './lib/r2.mjs';

const dryRun = process.argv.includes('--dry-run');
const { s3, bucket } = client();
const dest = path.join(ROOT, 'plates');

let token;
let n = 0;
let skipped = 0;
do {
	const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
	for (const o of page.Contents ?? []) {
		const rel = o.Key.slice(PREFIX.length);
		if (!rel || rel.endsWith('/')) continue;
		const local = path.join(dest, rel);
		const have = await stat(local).catch(() => null);
		if (have && have.size === o.Size) {
			skipped++;
			continue;
		}
		console.log(dryRun ? 'would pull' : 'pull', o.Key, '->', path.relative(ROOT, local), o.Size);
		if (dryRun) continue;
		const body = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: o.Key }));
		await mkdir(path.dirname(local), { recursive: true });
		await writeFile(local, Buffer.from(await body.Body.transformToByteArray()));
		n++;
	}
	token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
console.log(`${dryRun ? 'listed' : 'pulled'} ${n} file(s), ${skipped} already present, from ${bucket}/${PREFIX}`);
