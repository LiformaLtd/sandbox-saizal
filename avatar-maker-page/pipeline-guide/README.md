# New race avatar build guide

`pipeline-guide.md` is the whole order of steps for making a new race avatar, the way the 20 GPT-low race avatars
were made: body picture, head close-up, 41 face pictures, pack build, cut-outs and face dots, body join, teeth,
eyes, final rebuild, staging CDN upload and the Studio hook-up. Every fix still in the 20 packs is in its step.
Things that were tried and dropped are listed once at the end, so nobody redoes them.

When: written 6 Nov 2026 from the chain scripts that last rebuilt all 20 packs (30-31 Oct), the first build
scripts (2 Oct), the eye work (8 Oct - 3 Nov) and the upload logs. Every script path in it was checked on disk on
6 Nov. Nothing was run to write it.

## The question

The steps were spread over about 60 notes and many chain scripts, and some older chains copy the E picture's
dots onto the teeth picture, which has been wrong since the separate teeth picture of 30 Oct. What is the one
correct order for the next few avatars?

## What it says (short)

- Sections 0-11: the steps, with the script, the Python to use and the port that must be running for each.
- Section 12, cost per avatar: master ~$0.12, 34 plates ~$0.60-0.90 on fal GPT low, E/SS/teeth ~$0.05 on Azure.
  Machine time ~30-40 min a pack; Saizal's hand passes take the real time.
- Section 13: tried and dropped (pasting GPT's mouth on the master, body-band patches, masks sent to GPT,
  Krea for E, Qwen Image 2.1 and SegFormer for licence reasons, and more).
- Section 14: open problems every new avatar will inherit (blink line-up in labs, teeth pictures carry their own
  lip, nose and mid-face flicker, men's dark lip line, eye "fan" triangles).
- Section 15: what a NEW race needs on top (race name everywhere in the code, outfits, base body prompt, hair).
- Key gap: the Studio code holds one woman and one man per race (api `avatarSetSeed.ts`, app `avatarLooks.ts`).

Status: the guide in use for new avatars. The avatar maker page (`../avatar-maker-page/`) runs steps 1-4.

## scripts_from_scratchpads/

Two eye scripts that only lived in old session scratch folders, saved next to the guide:

- `copy_cut_to_neutral.py <id> ...` (3 Nov): copies Saizal's eye-hole cut (sil lid dots) onto the neutral
  plate's lid dots. It backs up `face-meshes.json` first. Python: any with numpy.
- `run_eye_sync_staging.sh [--apply]` (5 Nov): eye colour sync with stored eye layers against the real
  `liforma-staging` bucket. It reads `S3_API_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_BUCKET`
  from `NEW/liforma/api.liforma.ai/.env` (never printed) and stops unless the bucket is `liforma-staging` and the
  database is the local copy. Without `--apply` it is a dry run. It writes to R2, so it needs a yes before use.
  It runs from an api scratch copy whose path is written in the script (that scratch folder may be gone).

## How to use

Open `pipeline-guide.md` and follow it from section 0. `L` in the guide means `~/Desktop/Liforma_LTD`.
The original is at `~/Desktop/Liforma_LTD/notes/new_avatar_pipeline_2026-11-06/README.md`.

## Left on the Mac

- The packs: `NEW/liforma/source/avatars/<id>/` and `NEW/liforma/cdn.liforma.ai/dist/avatars/<id>/`.
- The 30-31 Oct rebuild chains and logs: `plates/E_regen_azure_2026-10-30/raw_step/` (see `avatar-face-plates/`).

## Related in this sandbox

- `copy_cut_to_neutral.py` bullet: The 3 Nov experiment behind it (cause, before/after numbers, the Precious choice, the staging upload and its backups): `../../avatar-eyes/right-upper-lid-fix-2026-11-03/`.
