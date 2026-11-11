# Studio wardrobe: clothes generation and hair picker

This folder holds copies of two Studio features built on a local copy of `app.liforma.ai`. They are not merged
into the app. Both were built and tested only on a local stack.

1. **Clothes generation pipeline.** It makes a new outfit in every ethnicity:
   - The user types the outfit, and the European picture is made first.
   - After the user approves it, the darker-skin picture is made from it by an identity edit, and both are cut out.
   - Every other ethnicity is then made in the browser by mixing the two pictures with each race's colour numbers.
     The browser maker is included because the pipeline depends on it.
2. **Hair picker.** It has one style tile per hairstyle and the five hair colours down the side. Picking a style
   keeps the colour, and picking a colour recolours the hair being worn. Each ethnicity sees its own fitted hair.

## What is where

- `app.liforma.ai/` contains the new files, at their paths in the app. The copy was taken from local app commit
  `cb58f82` (2026-09-23).
- `app-edits.patch` contains our edits to five existing app files:
  - `AppearanceIdPicker.svelte`
  - `CustomisableCharacterPanel.svelte`
  - `packages/experience-studio/src/index.ts`
  - `characterAppearance.ts`
  - the character page `library/characters/[charId]/+page.svelte`
- `outfit-gen/outfit_gen.py` is the Python helper for the new-outfit steps:
  - `source` makes the bald base;
  - `key` makes the BiRefNet v4 cut-out;
  - `on-green` puts a picture on flat green.
- `outfit-gen/refs/` holds the two darker-skin reference pictures for the second step (women and men).
- `outfit-gen/keyer/` holds the BiRefNet v4 cut-out (`key_biref_v4.py` and `run_birefnet.py`). It needs ComfyUI's
  BiRefNet code and the `ZhengPeng7/BiRefNet` weights from Hugging Face.

The files for each part:

| Clothes generation pipeline | Hair picker |
|---|---|
| `src/lib/server/raceOutfitGeneration.ts`, `raceOutfitGpu.ts`, `raceOutfits.ts` | `packages/experience-studio/src/components/fields/HairStylePicker.svelte` |
| `src/lib/components/NewRaceOutfitPanel.svelte` | `packages/experience-studio/src/lib/hairStyles.ts` (+ test), `hiddenHairStyles.ts` |
| `src/lib/raceOutfits/` (browser maker: `racePlateMaker.ts` + test, worker, pool, `pngCodec.ts`, `plateResize.ts`, `bodyPreview.ts`, `raceInputUrl.ts`, `racePlates.svelte.ts`) | `src/lib/raceOutfits/raceHair.ts` (+ test) |
| `src/routes/(portal)/library/race-outfits/` (inputs, save, generate) | |

## Settings

These are read from the environment. The defaults point at folders on Saizal's Mac.

| Setting | What it is |
|---|---|
| `RACE_ANNA_PLATES_DIR`, `RACE_PLATES_DIR`, `RACE_MALE_PLATES_DIR` | the two outfit sets and the maker files (colour numbers, faces, outlines) |
| `RACE_OUTFITS_SAVED_DIR`, `RACE_GENERATED_OUTFITS_DIR` | where chosen and newly made outfits are saved |
| `OUTFIT_GPU` | `hpc` (the office 4090, the default) or `orchestrator` |
| `KREA_HPC_URL`, `ORCHESTRATOR_BASE_URL` | where those GPUs are |
| `ORCH_DEVELOPER_KEY` / `ORCH_ENV_FILE` | the orchestrator key, or a .env file to read it from |
| `RACE_PLATES_PYTHON`, `KEYER_SCRIPTS_DIR`, `RACE_MAKER_DIR` | the Python, cut-out scripts and maker used by `outfit_gen.py` |

## Copies on the staging CDN (2026-10-06)

- The outfit inputs, with the files every ethnicity is made from:
  `https://staging-cdn.liforma.ai/race-outfits/v1/female/{anna,precious,maker}/…` and
  `…/race-outfits/v1/male/{caleb,malik,maker}/…`
- The ten GPT-low men's packs, and each man's own race hair at
  `avatars/<id>/<size>/costumes/composite/hair/<id>_hair-<hairId>.{webp,avif}`.
  The avatar list (`avatars/index.json`) was not changed.

## Not ready for the live site yet

- Inputs and saves use folders on disk. On the live site they would be the CDN plus the database.
- The cut-out runs in Python on a Mac.
- The default GPU is the office 4090, which has no password. Live should use the orchestrator.
- On GitHub `main`, the character page moved to `studio/(library)/characters/[charId]` (1 October), and
  `CustomisableCharacterPanel.svelte` changed. `app-edits.patch` will not apply cleanly and needs merging by hand.
