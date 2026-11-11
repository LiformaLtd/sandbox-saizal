# New race avatar pipeline (as of 6 Nov 2026)

How the 20 GPT-low race avatars were made, from the first body picture to the staging CDN, written as one
order to follow for the next few avatars. Every fix that is still in the 20 packs today is in its step.
Things that were tried and later undone are listed once, at the end, so nobody redoes them.

Built from: the chain scripts that last rebuilt all 20 (30-31 Oct, `plates/E_regen_azure_2026-10-30/raw_step/`),
the first build scripts (2 Oct, `ComfyUI/`), the eye work (8 Oct - 3 Nov) and the upload logs. Checked on disk
6 Nov: every script named below exists. Nothing was run to write this.

`L` = `~/Desktop/Liforma_LTD`. Packs live in `L/NEW/liforma/source/avatars/<id>/`; the upload copy in
`L/NEW/liforma/cdn.liforma.ai/dist/avatars/<id>/`.

---

## 0. Before you start

### Decide these first

1. **Same race as one we have, or a new race?** The Studio code holds exactly ONE woman and ONE man per race:
   api `src/lib/server/catalog/avatarSetSeed.ts` (`WOMEN_FACE_PACKS` / `MEN_FACE_PACKS`) and app
   `packages/experience-studio/src/lib/avatarLooks.ts` (`RACE_LOOK_PACKS`). A second avatar for a race we
   already have needs a code change (or replaces the current one). **The next avatars are new races (user,
   6 Nov): see section 15, "New race checklist", for everything a new race needs on top of this pipeline.**
2. **Id.** Pattern `<race code><5a = woman | 5b = man>000<n>`: af African, ea East Asian, e0 European,
   1d Indigenous, ed Mediterranean, ae Middle Eastern, 0a North African, ac Pacific Islander, 5a South Asian,
   5e Southeast Asian. The last digit goes up for a second version (`5a5a0002`, `ae5a0002`, `ea5a0002`).
3. **One avatar at a time** through every step that rebuilds a pack (the dot page, `fits_all.json` and the
   dist index are shared).

### Rules that apply to every step

- Every paid call (fal, Azure, Gemini) needs the user's yes first. Show the inputs sheet before asking.
- Every upload needs the user's yes. Staging only (`liforma-staging`); never the live `liforma` bucket.
- Back up before changing a pack (the chain scripts do it; one-off steps must do it by hand).
- The user checks every result by eye (sheets). No agent judging of faces.
- Prompts say what to KEEP, not what to avoid (the one exception that worked: the "no tongue" line for E).

### What has to be running

| Port | What | Start |
| --- | --- | --- |
| 3011 | face points (MediaPipe fit) | `cd L/NEW/liforma && ./start --all` |
| 3019 | OLD labs, no-generation gate (pack batch + export) | the labs copy at `L/Liforma/labs.liforma.ai` (gate: `node L/NEW/liforma/.local-dev/labs_no_generation_gate.mjs`; copy in `../local-dev-scripts/pack-staging/`) |
| 3020 | dot page | `cd L/NEW/liforma/.local-dev/plate-dots && nohup node server.mjs &` (it lists packs once at start: restart after adding a pack) |
| 3014 | relay (serves the local dist to the player) | restart after rebuilds (copy of `cdn_overlay.mjs` in `../local-dev-scripts/local-relay/`) |
| 3035 | eye patch editor | `cd L/NEW/liforma/.local-dev/eye-patch-editor && nohup node server.mjs &` |
| 3009 | avatar lab page `/lab/avatars` | local app |

Python to use (the scripts expect these):

- `MPY` = `L/hair_work/tools/mpvenv2/bin/python` (MediaPipe; most of `face_mesh_work`)
- `CPY` = `L/ComfyUI/.venv/bin/python` (BiRefNet cut-outs, fal / Azure calls)
- `ZPY` = `L/face_mesh_work/vendor/face-part-segmentation/.venv/bin/python` (face-part segmenter, SegGPT jaw)
- `TPY` = `L/face_mesh_work/trainvenv/bin/python` (outline model, eye edge)
- labs scripts: `cd L/Liforma/labs.liforma.ai && ./node_modules/.bin/vite-node --config vite.scripts.config.ts scripts/<name>.ts <pack dir>`

Keys: fal = `FAL_KEY` in `L/Liforma/labs.liforma.ai/.env`; Azure = `AZURE_MODELS_*` in
`L/worktrees/api-main-a9d4ddc/.env`; Nano Banana goes through labs' own `/api/gemini-image` route
(`ComfyUI/nano-banana-edit.py`).

### Code that exists ONLY on this Mac (the pipeline breaks without it)

- OLD labs copy `L/Liforma/labs.liforma.ai` (commit 3c570c7) with local edits:
  - `src/lib/model/align/topHalfAffineCohortLandmarks.ts`: blink plates line up on the rigid upper-face dots
    (stops the brows jumping at each blink, 31 Oct).
  - `src/lib/tools/faceImageGenerator/renderPrepExport.ts`: the `LIFORMA_SKIP_BLINK_NOSE_PIN=1` switch.
  - untracked scripts: `scripts/export-pack-dir.ts`, `scripts/rebuild-eye-model.ts`, `scripts/rebuild-teeth-from-plate.ts`.
- NEW cdn `L/NEW/liforma/cdn.liforma.ai` (uncommitted): `scripts/lib/avatar-collect-sources.mjs` (copies the
  eye shade + corner pictures) and `scripts/lib/avatar-image-pipeline.mjs` (does not re-key render copies that
  are already cut out; without it the teeth go ~9 % see-through and a dark rim appears).
- Two eye scripts that lived only in old session scratch folders are now copied into
  `scripts_from_scratchpads/` next to this file.

---

## 1. Base body picture (bald, white tee and jeans)

**Input:** Anna for women (`L/Liforma/dd80126a_neutral_bald-blue-sceen.png`, 1254 px, blue screen) or Caleb for
men (`L/plates/base_plates/male_race_base_plates/input_caleb_1254_blue.png`, put on the flat blue `(0,1,123)`,
every solid pixel unchanged). Same body = every outfit fits.

**Prompt:** `L/notes/race_prompts.md`, the general prompt for the race (not the "redo" prompt).
Fixes we added to the wording:
- add the neck sentence: "Keep his neck exactly the same width and outline as in the original picture, from
  under his jaw down to the t-shirt collar, with the same shoulders" (Pacific Islander neck went +15 px -> +3 px);
- say "a rounded face", never "a broad rounded face" (makes the neck wider);
- for a race that comes out too close to European, describe eyes, lids, brows, nose and lips in more detail
  ("change his facial features as well as his skin, so his face clearly reads as ...").

**Where to run it (best first):**
1. ChatGPT in the browser, a FRESH chat per race (free, 1254 px, framing held to 1 px). Edits in the same chat
   drift the skin redder each time; start a new chat instead. Downloads are named by caption now: take the
   newest file in Downloads. Chrome upload only reads session folders: copy the input to the scratchpad first.
2. fal GPT Image 2.5 Sunburst **medium**, at most two tries (`L/plates/base_plates/male_race_base_plates/fal_batch.py`).
3. Nano Banana 2 (`gemini_one_call.py`): skin comes out lighter and colour words are taken literally
   ("green-gold undertone" gave a green face). Use only if the other two fail.

**Checks (sheet for the user):** run, for every try, women or men:
```bash
cd ~/Desktop/Liforma_LTD/plates/base_plates && ~/Desktop/Liforma_LTD/hair_work/tools/mpvenv2/bin/python check_base_body.py <input picture> <new picture>
```
It writes `<new>_check.json`, `<new>_check_sheet.png` (input outline in red on the new picture) and
`<new>_check_neck.png` (neck at 4x: red = input edge, yellow = new edge). Limits: figure edges and head top within
1 px of the input, body below the neck overlapping >= 0.995, **neck width within ~2 px** (it finds the neck rows
itself: the narrowest band between chin and shoulders), flat backdrop, bald. The user picks.
A neck that comes out wider is common (Pacific Islander man +15 px; the 6 Nov late-thirties European woman +5 px):
regenerate in a fresh chat with the neck sentence made stronger ("Her neck stays exactly as slim as in the original
picture: the same slender neck with exactly the same width and the same outline on both sides ..."); do not scale
or warp the picture to fix it.

**Save:** `L/plates/base_plates/race_base_plates/<race>_<female|male>.png` and add a line to `sources.json`.
**Cut out:** BiRefNet v4 recipe, `L/Liforma/liforma/tools/image-to-image/scripts/key_biref_v4_blue.py` (blue) or
`key_biref_v4.py` (green) -> `race_base_plates/keyed/`.

---

## 2. Head close-up ("master") and masks

Work folder: make a new one, e.g. `L/plates/<race>_<gender>_face_plates/`, and pass it as `RACE_DIR` to the
`ComfyUI` scripts. (The old `~/Desktop/<race>_face_plates` folders were moved to
`~/Desktop/Desktop_cleanup_2026-10-27/`; scripts with those paths built in need the path changed.)

1. **Head crop** (`ComfyUI/prep-new-race-avatars.py` shows how): a square from the top of the base picture,
   centred on the face, 570 px wide on a 1254 picture (466 on a 1024), enlarged to 1024 =
   `<slug>_hd_face_area_neutral.plain.png`. Face points from :3011 -> `master_landmarks.json`.
2. **Master** (`ComfyUI/new-race-masters.py`, paid ~12c): fal GPT Image 2.5 Sunburst edit with
   "Increase the resolution of this cropped face image ... Do not zoom, reframe, or change the aspect ratio."
   Women `high`, men `medium`. Writes `<slug>_hd_face_area_neutral.png` (+ the `_face_area_neutral` copy).
   Re-fit `master_landmarks.json` on the master. Gaze/face points move ~1-2 px; foreheads come out a bit lighter.
3. **Masks** (only used for OUR checks; nothing is ever sent to GPT with a mask, "no box"):
   - `ComfyUI/race-transfer-mask.py` moves Layla's painted mouth + eye masks onto the new face;
   - `ComfyUI/make-mask-editors.py` writes a mask painter page with the master loaded (serve it from the
     scratchpad; the pane cannot open `file://`); the user checks / paints `<slug>_mask.png`;
   - `ComfyUI/extend-mouth-mask-to-eyes.py` grows the mouth mask up to the eye mask;
   - `ComfyUI/race-from-chosen-prep.py` with `JAW_SIDE=0 JAW_BELOW=60` (the user's "smaller extended jaw")
     writes the other masks, the run list and `_inputs_sheet.png`. **Show that sheet before any paid run.**

---

## 3. The 41 face pictures

### 3a. 34 pictures on fal GPT Image 2.5 Sunburst LOW (paid, ~$0.60-0.90)

```bash
cd ~/Desktop/Liforma_LTD/ComfyUI && RACE_DIR=<work folder> PROMPTS=<prompts file> PLATES="<all 36>" QUALITY=low TRIES=3 .venv/bin/python -u race-gpt-gated.py <race>
```

- Prompts: women `~/Desktop/Desktop_cleanup_2026-10-27/mediterranean_face_plates/gpt_low_prompts.json`; men
  `L/plates/men/male_face_plates/gpt_low_prompts_male.json` (her->his). CH uses the Nano Banana "square pout"
  wording (already in those files).
- Every try is checked by `ComfyUI/plate_gate.py` (outline moved, skin colour at the edge and inside, seam,
  kink, softness). The softness limit is 0.74 (the user could not see 0.74-0.80). The checker knows blue screens
  (before 1 Oct it read blue as skin and failed good men's plates). The best try is kept.
- If many plates fail on low (Pacific Islander, South Asian, Southeast Asian and African men did), run the
  whole set on `QUALITY=medium` (~$0.8 table price); medium matched the master's mouth colour better.
- A dropped download can be fetched again free by request id from `fal_run.jsonl`. Python uploads to fal can
  stall here; submit with curl if posts fail.
- Assemble the set: women `ComfyUI/finish-new-avatars.py` (add the avatar to its `AV` table), men
  `L/plates/men/male_face_plates/_tools/finish_race.py` -> `<folder>_gpt_low_set/` with 41 plates
  (`face_area_neutral` = `hd_face_area_neutral` = the master; lip crops x1.42 for `mouth_detail_*`).

**The set's pictures are pasted copies** (GPT's mouth pasted onto the master by the checker). They are only used
to build the pack the first time. The pack ends up with the pictures **as GPT returned them** (the `tries/` files),
with ONE multiply per colour channel so the calm skin (forehead, upper cheeks, nose bridge) matches the master;
that swap is step 5b. Do not keep the pasted ones and do not fade the edge: that gave the double chins, the cheek
seams and the blurry body-band patches we spent a week on.

**Gaze pictures come out mirrored:** swap `looking_left` and `looking_right`.
The two 45-degree head turns are not drawn by the player; keep them in the pack anyway.

### 3b. E, SS and the teeth picture on Azure GPT Image 2.5 Sunburst LOW (paid, ~1.5c each)

Folder `L/plates/E_regen_azure_2026-10-30/`. Input = the avatar's master close-up on its own screen
(`inputs/<id>_input.png`). One try each unless it fails.

```bash
cd ~/Desktop/Liforma_LTD/plates/E_regen_azure_2026-10-30 && ~/Desktop/Liforma_LTD/ComfyUI/.venv/bin/python gen.py --plate E --only <id>
```

- **E:** `prompt.json` (Precious's softer E, with the skin line). Make one try with `prompt_v1.json` too and keep
  whichever is closer in skin colour to the input (`select.py`, forehead + temples).
- **SS:** `--prompt-file prompt_ss_narrow.json --out raw_ss_narrow_v3` (v3: a natural "s", teeth together,
  mouth about rest width; the old SS were broad grins). Look for a thin dark line from the mouth corners across
  the cheeks (two men had it in the picture as returned) and regenerate if it is there.
- **Teeth picture (`teeth_structure_sil`):** `prompt_teeth_open.json` ("open the jaw slightly ... narrow dark gap
  between the rows"), input = the avatar's NEW SS as returned, colour-corrected to the master (`inputs_teeth/`),
  output `raw_teeth_open/<id>_TEETH_try1.png`. Never make it from a processed pack picture: GPT copies the faults.
- The teeth rows must be apart (Anna: gap 6 % of mouth width on E, 11 % on the teeth picture). GPT tends to
  close them. If it does, Nano Banana 2 E with the no-tongue sentence
  (`L/plates/men/male_face_plates/_nano_banana_regen/E_no_tongue_prompt.json`, `ComfyUI/nano-banana-E-batch.py`,
  ~7c) gave 8-15 % gaps. Use the NB picture AS RETURNED (`*_E_nb_raw.png`), never the pasted one.

---

## 4. Build the pack (local, free)

`ComfyUI/build-new-avatar-packs.py <name>` (add the avatar to its `IDS` / `AV` tables; `OWN_BODY` and `BLUE` if
needed). Must run unsandboxed. ~3 min. Per avatar:

1. body = the v4 race body the Studio outfits are made on
   (`L/plates/outfits/outfit_plates_female/female_race_plates_v4/<race>/white_t_shirt_and_jeans.png`), or the
   avatar's own base picture resized to 1024 and cut out (men, and races without a v4 body);
2. `L/NEW/liforma/.local-dev/prep_race_pack.py` (cut-out, mouth extras, :3011 fits, `stage_race_plates.py`;
   `KEYER=...key_biref_v4_blue.py` for blue sets; copies of both in `../local-dev-scripts/pack-staging/`);
3. OLD labs `npm run avatars:generate-batch -- ... --through final_mesh`;
4. OLD labs `scripts/export-pack-dir.ts`;
5. `face_mesh_work/rebuild_pack.sh`.

Traps the scripts already handle, keep them if you change anything:
- the generator name must contain `face-image-generator`, otherwise the player takes the broken baked path;
- no `bodyPlateLandmarks` from render prep;
- `buildTeethModel` returns a bare model: the four links (upper/lower texture files, alpha version, stable
  inner mouth) must be carried over, or the player shows a flat dark mouth;
- depth: if `migrate-avatar-depth` says "Depth generation failed", run
  `models.liforma.ai/scripts/generate_avatar_depth.py` directly (`depth-anything-v2` and `depth-pro`) on
  `<id>_neutral.webp` and `<id>_hd_face_area_neutral.webp`.

Add a row to `L/NEW/liforma/.local-dev/avatar-lab/packs.json` so it shows on the lab page.

---

## 5. Cut-outs and face dots

### 5a. First pass

`zsh ComfyUI/run-outline-new-packs.sh <id>` (~6 min, one pack at a time). In order:

1. `face_mesh_work/key_face_plates.py` cuts the screen out of all 38 face pictures (BiRefNet v4; the close-up
   gets a harder edge so it does not leave a ghost on head turns). Must happen BEFORE dots go onto the real edge,
   or the green fringe shows under the ear.
2. fresh fits into `face_mesh_work/fits_all.json` (`ComfyUI/add-pack-fits.py`), outline model start dots
   (`ComfyUI/predict-new-packs.py`), dot page restarted if it does not know the pack.
3. `apply_outline_to_pack.py` (eyes, lips, brows, iris pinned; turned heads skipped; ear-level dots 93/323 keep
   the model's place) then `check_pinned.py` must show 0.00 px.
4. `segment_pack_plates.py` + `apply_zip_parts_to_pack.py` (eyes and iris from the segmenter).
5. `apply_seggpt_jaw_to_pack.py` (jaw, chin, cheeks onto SegGPT's face edge).
6. `place_eyes_on_boundary.py` (eyelid dots ON the eye-opening edge, ~1 px in; do not inset them more),
   `rebuild-eye-model.ts`, `fill_atlas_seams.py`.
7. teeth picture takes E's dots, `rebuild-teeth-from-plate.ts`; `stamp-head-box.py`; rebuild.

Note: this pass (and the older `face_mesh_work/refresh_all_plates.sh`) copies E's dots onto the teeth picture.
That was right when the teeth picture WAS E. Since 30 Oct the teeth picture is its own picture, so it gets its own
dots in 5c.

### 5b. Swap in the pictures as returned + the Azure E and narrow SS

This is what `man_chain.sh` did for all 10 men on 30 Oct (the women went through `women_chain_full.sh`, the same
steps with their old folders). For a new avatar:

1. Add it to `face_mesh_work/seam/packs.json` (`"<id>": ["<slug>", "<work folder, relative to ~/Desktop>"]`) and
   to `face_mesh_work/seam/audit.json` (`set` = its `_gpt_low_set` folder, `master` = its master picture,
   `plates` from `seam/seam_audit.py`). The raw-picture script reads both.
2. Put the picked E at `plates/E_regen_azure_2026-10-30/selected/<id>_E.png` and the narrow SS at
   `raw_ss_narrow_v3/<id>_SS_try1.png`.
3. Run, from `plates/E_regen_azure_2026-10-30/raw_step/`:
   ```bash
   SS_PICK_DIR=raw_ss_narrow_v3 LIPS_NEWPIC=E,SS zsh man_chain.sh <id>
   ```
   It: backs up everything -> `raw_plates_azure.py` (all pictures as returned, colour to the master, picked E/SS)
   -> `key_blue_plates.py` (blue screen; for a green-screen avatar also run
   `face_mesh_work/key_face_plates.py <id> --only <the swapped plates>`, as `women_chain_full.sh` does) ->
   `dots_chain.sh` -> eyelid folds -> labs teeth rebuild + green cut -> `rebuild_chain.sh` -> sheets.

`dots_chain.sh` is where most of the 28-30 Oct dot fixes live:
- lips onto the lip-colour edge, starting from THIS picture's own lips (`pink_lips_newpic.py` via `LIPS_NEWPIC`;
  the older `apply_pink_lips.py` started from the old picture's lips and kept a too-wide mouth on new E/SS);
- `propagate_eye_fit.py` (the close-up's eye fit carried to sil and the body);
- `teeth/steady_cheek_dots.py` (cheek apples follow sil: stops the cheek flutter while talking);
- `brows_on_segmentation.py` (brow dots on the segmenter's brow edge: stops the brow jump at each phrase).

### 5c. The teeth picture

With `raw_teeth_open/<id>_TEETH_try1.png` in place:
```bash
zsh ~/Desktop/Liforma_LTD/plates/E_regen_azure_2026-10-30/raw_step/teeth_plate_men.sh <id>
```
(`teeth_plate_women.sh` is the same but takes the pack's colour instead of the master's.) It swaps the picture in,
cuts it out, gives it its own dots (`LIPS_NEWPIC=teeth_structure_sil`), rebuilds `mouth_detail_E`, the teeth
model and the teeth pictures, cuts the green, rebuilds.

### 5d. The remaining dot steps

As the 30-31 Oct chains did:
- `$MPY face_mesh_work/teeth/steady_face_dots.py <id> --parts cheek,nose` (the nose step);
- `$MPY face_mesh_work/teeth/steady_face_dots.py <id> --parts blinks` (blink pictures' upper-face dots = sil's;
  with the labs blink edit this gives 0.00 px brow movement at blinks);
- `$MPY plates/E_regen_azure_2026-10-30/raw_step/teeth_plate_outline.py <id>` (the teeth picture gets the jaw
  step too; without it the men's chin sat 5-13 px low, on the neck);
- `$MPY face_mesh_work/fix_eyelid_dot_folds.py <pack dir>` (no flipped slivers at the inner eye corners);
- F check: if the F picture's inner lips are shut (gap <= 3 px), `ComfyUI/fix-teeth-on-lip-points.py <id> FF`
  (preview, then `--write`). Re-check after any dot refresh: it comes back shut.

### 5e. The user's hand pass on the dot page

Open `http://localhost:3020/#pack=<id>&plate=<plate>&dots=current` (`dots=current` = the pack's real dots;
without it the page starts from the model's guess and a save moves untouched dots). The user fixes jaw, lips
and the eye-hole cut on `hd_face_area_neutral`. Apply saves with `face_mesh_work/saved_dots_rollout.sh <id>`
(or `apply_plate_dots.sh <id> <plate>`). After any picture swap, move dot-page saves older than the new picture
aside: the page shows a save over the pack even when the picture changed.

---

## 6. Body join and edges (stops the tear beside the ear)

`zsh plates/E_regen_azure_2026-10-30/raw_step/men_edge_chain.sh <id>` (it is not men-only; the women got the
same steps through the Priya recipe):

1. `renderPrep.baseUnderlay = 'body'` (the still body picture is drawn under the face; without it the head
   picture sways and opens a gap next to the ear, worst on bald men);
2. `harden_depth_edge.py` (head depth map edge);
3. `body_edge_colour.py` (soft body-edge pixels get the nearest solid colour);
4. `repair_source_edge_ring.py <pack> --all` (the mesh row just inside the outline sits ~10 px in on EVERY
   picture; without `--all` sil was skipped and the edge stretched when a speech picture came in);
5. `repair_edge_topology.py`;
6. the full rebuild (step 9 below).

---

## 7. Teeth and the inside of the mouth

1. Teeth: done in 5c. If dots change later, re-run `rebuild-teeth-from-plate.ts <pack dir>` (labs) and
   `$CPY plates/E_regen_azure_2026-10-30/raw_step/cut_mouth_detail_green.py <id>` (`teeth_chain.sh` does both plus
   the rebuild). Teeth come from the TEETH picture (slightly-open SS), not from E. The green behind
   `mouth_detail_E` showed as green mouth corners in the Studio preview, so the green cut is not optional.
2. Inside of the mouth: all 20 avatars use ONE shared "inside only" picture (no lips in it, so no second lip can
   ever show when the mouth opens wide). Install it:
   ```bash
   cd ~/Desktop/Liforma_LTD/notes/mouth_inside_lips_2026-10-27/aa_inside_hpc && ~/Desktop/Liforma_LTD/ComfyUI/.venv/bin/python install_aa_inside.py <id> <slug> inside_only/priya_inside_only.png inside_only/priya_inside_only_dots.json
   ```
   Tongue colour on a very different skin tone has not been checked.

---

## 8. Eyes

In this order, one avatar at a time:

1. `$MPY face_mesh_work/fix_eyelid_dot_folds.py <pack dir>` (already in 5b; run again if dots changed).
2. `bash face_mesh_work/eyeball_rollout.sh <id>`: makes the eyeball pictures (iris on a white ball, from
   `face_mesh_work/work/eyeballs_chat_copy.webp`), the shade map and the corner patch, then a local build.
   **Never run `build_eyeball_picture.py` twice on a pack** (it cuts the iris from the current picture).
3. Copy Priya's look: `$MPY face_mesh_work/transfer_eye_patch_masks.py 5a5a0002 <id>`, then write
   `{"shadeFrom": "5a5a0002"}` into `<pack>/_workflow/eye-shade-options.json`, then run `eyeball_rollout.sh <id>`
   again (hand mode). All 19 others use Priya's shading; the corner patch stays the avatar's own.
4. The eye-hole cut is the user's: dot page, plate `hd_face_area_neutral`, eyes -> `apply_saved_eye_dots.py`
   -> `propagate_eye_fit.py` -> `apply_iris_centres.sh`. **Never overwrite the close-up's or sil's eye dots.**
5. Copy that cut onto the body picture's lid dots (the player cuts the hole on these at rest; without it the
   upper lid looks wavy and the inner corner is cut):
   `$MPY notes/new_avatar_pipeline_2026-11-06/scripts_from_scratchpads/copy_cut_to_neutral.py <id>`
   (it writes backups named `...before-neutral-lid-dots-from-cut-20261103` in `L/backups/`; change the tag in
   the script for a new run). Then `npm run build:avatars -- --id <id>` in the cdn folder.
6. If a corner looks wrong, the user paints it in the eye patch editor (:3035, Save + apply). Do not re-guess it.
7. After EVERY `rebuild_pack.sh`: `$CPY face_mesh_work/restore_eyeball_fields.py <id>` (the rebuild drops
   `eyeball: true` and the shading fields, and the player falls back to flat sliding whites).

---

## 9. Final rebuild and local check

```bash
cd ~/Desktop/Liforma_LTD/face_mesh_work && TWO_BAKE=1 LIFORMA_SKIP_BLINK_NOSE_PIN=1 ./rebuild_pack.sh <id>
```
```bash
~/Desktop/Liforma_LTD/ComfyUI/.venv/bin/python ~/Desktop/Liforma_LTD/face_mesh_work/restore_eyeball_fields.py <id>
```
```bash
cd ~/Desktop/Liforma_LTD/NEW/liforma/cdn.liforma.ai && npm run build:avatars -- --id <id> --force
```
```bash
~/Desktop/Liforma_LTD/hair_work/tools/mpvenv2/bin/python ~/Desktop/Liforma_LTD/face_mesh_work/prune_upload_unused.py <id>
```

`plates/E_regen_azure_2026-10-30/raw_step/rebuild_chain.sh <id> <dir>` runs these four plus the dot-page start
files. Why each matters:
- `TWO_BAKE=1`: cut-out pictures baked twice (colour copy + shape copy). With one bake, a strip of the unbent
  picture showed outside the jaw (double edge) and the teeth went see-through. The green-screen version was
  rejected by the user.
- `prune_upload_unused.py`: the build re-makes plain copies the player never loads; prune after EVERY build.

Check before calling it done (sheets for the user):
- `eyeModel.innerEyeTexture.{left,right}.eyeball == true`, `renderPrep.baseUnderlay == 'body'`;
- no green in `mouth_detail_E`; F inner lips open; teeth rows apart;
- in the player: lab page `http://localhost:3009/lab/avatars`, or a standalone page made by copying a test
  experience (memory standalone-experience-per-avatar: set node `appearance` to null, fix the character
  projection, `websitePublication: 'any'`). Use the Hold mouth panel on E, aa, SS, kk, big_smile; blink; talk.
  Use a fresh tab per avatar (a hidden pane never finishes loading);
- sheets: `raw_step/before_after_sheets.py`, `raw_step/teeth_sheet.py`.

---

## 10. Upload to the staging CDN (needs a yes)

```bash
zsh ~/Desktop/Liforma_LTD/plates/E_regen_azure_2026-10-30/raw_step/staging_upload_lane.sh <lane name> <id>
```

Per avatar: teeth pictures to `_v2` names -> build -> prune -> backup of every staging file it will replace
(`L/backups/<id>_staging_before_upload_<date>/`) -> PutObject only (no deletes, no purge, refuses any bucket but
`liforma-staging`) -> byte-for-byte check. Log `raw_step/work/staging_upload_<lane>.log`.

Know this about the CDN:
- Pictures are cached for a year and never re-checked. Any later change to a picture needs a NEW file name
  (teeth/inside-mouth pictures: `_v3` next; the player loads those without a version tag).
- `face-meshes.bin` is re-checked, but browsers can keep an old copy up to 4 h.
- Do not open a CDN address before the file is uploaded: the edge keeps the 404 for hours.
- A "small" rebuild can still move the three blink pictures: compare dist with the copy from before the rebuild
  and upload only what really changed.

---

## 11. Connect it to the Studio (code + database; each is a PR or a yes)

What the first 20 needed, checked against GitHub main on 6 Nov:

- **api** (`src/lib/server/catalog/`): `avatarPublishAllowlist.ts`, `avatarPersona.ts` (gender + ethnicity),
  `avatarCostumeSupport.ts`, `avatars.ts` (the id list), `avatarSetSeed.ts` (`WOMEN_FACE_PACKS` /
  `MEN_FACE_PACKS`; a new race also needs its `[r, g, b]` outfit values), then `npm run db:seed-avatar-sets`.
- **app**: `packages/experience-studio/src/lib/avatarLooks.ts` (`LOOK_IDS`, `RACE_LOOK_PACKS`).
- **Catalogue file** `avatars/index.json` on staging: add the entry by a MERGED update (name "<Race> (female)",
  gender, `costumes` default, `compositeClothes [white_t_shirt_and_jeans]`). Never `publish:avatars-dist` (it
  replaces the whole list). Also upload the white-tee layer
  `avatars/<id>/<size>/costumes/composite/clothes/<id>_neutral_bald-white_t_shirt_and_jeans.{webp,avif}` (the
  Studio hides the Hair button without a clothes layer). This is how it was done on 6-7 Oct; check main for
  changes before repeating it (the avatar name now also lives in the database).
- **Eye colours:** add the id to `avatars` in `eye-colours/v1/eye_colours_list.json` (upload the list), then in
  the api: `npm run db:sync-eye-colour-library -- --cdn https://staging-cdn.liforma.ai --store-layers` (dry run),
  then with `--apply` (makes the 5 colours' stored eye layers and the rows). Example wrapper:
  `scripts_from_scratchpads/run_eye_sync_staging.sh`. Staging rows went in through SQL pasted into the Supabase
  SQL editor (`L/plates/eye_colours/staging_db_rows/`).
- **Hair:** the API makes hair from the shared hair plates (`hair-plates/v1`) and each avatar's hair dots.
  New avatar = place its dots in the race editor -> `hair_work/live_fit/hair_dots/export_hair_dots.py` -> upload
  its dots file -> `npm run db:sync-hair-plate-library` rows (staging rows also went in by SQL). An avatar
  without dots gets no plate hair (the European pair had none on 22 Oct).
- Going live is a separate manual Promote from staging.

---

## 12. Costs and time per avatar (from the first 20)

| Step | Provider | Cost |
| --- | --- | --- |
| Base body | ChatGPT browser (free) or fal GPT medium | 0 - ~$0.10 |
| Master | fal GPT 2.5 Sunburst high/medium | ~$0.12 |
| 34 plates, 3 tries | fal GPT 2.5 Sunburst low (medium if needed) | ~$0.60-0.90 (medium ~$0.8 table, real bill maybe 2x) |
| E, SS, teeth picture | Azure GPT 2.5 Sunburst low | ~$0.05 |
| Nano Banana E (only if needed) | Gemini via labs | ~$0.07 |

Machine time ~30-40 min a pack (build 3, first dots 6, second dots ~5, edges + rebuild ~5, eyes ~3, upload
~5-7). The user's hand passes (masks, dot page, eye cut, sheets) are the real time.

---

## 13. Tried and dropped (do not redo)

- Pasting GPT's mouth onto the master + the 60 px fade -> double chins, cheek seams. Plates go in as returned.
- Body-band patches round the face (`jaw_band_blend_body.py`) -> blurry faceted patches; removed.
- Sending masks to GPT (`mask_url`): GPT ignores them and the skin turns redder.
- Green screen under the render bake -> bright green edge line. Two bakes instead.
- Insetting the eye dots 2-4 px; setting sil eye dots = body eye dots (the user's cut is on the close-up/sil).
- Trimming the lip off the teeth pictures -> notches. Mouth-inside pictures with lips in them -> second lip.
- Krea 2 identity edit for E (never opens the mouth); Qwen Image 2.1 plates (non-commercial licence);
  SegFormer (non-commercial). Use MediaPipe + SAM 2 + BiRefNet v4.
- A full-oval depth pin for the ear tear (the edge ring + body base fixed it).

## 14. Open problems every new avatar will inherit

- Blink pictures are lined up by three dots in labs; our local labs edit hides it, the real fix is not done.
- Teeth pictures carry their own lip; on big grins it can show (local player fix only, not pushed).
- Nose and mid-face flicker between mouth pictures (pictures differ there; not fixed).
- Men: dark line along the inside of the lips while talking (rule not settled).
- Eye hole falls back to a "fan" of long triangles on some eyes -> a diagonal line through the shading
  (fix offered, not done).

---

## 15. New race checklist

The next avatars are new races, not second avatars for the 10 we have. A new race needs everything in sections
1-14 for each avatar (one woman + one man), PLUS the items below. Code facts checked on GitHub main on 6 Nov
(api 3d752b9, app 474375c). Nothing here has been changed yet.

### 15.1 Which races the lessons ask for

From the 2,744 lesson scenarios (local export, 20 Sep; re-check against the database before spending money):
only 89 bios say a race at all. Of those: **Latin American 22**, East Asian 18, **Afro-Caribbean 14**, Middle
Eastern / North African 12, South Asian 10, African 7, mixed 5, Southeast Asian 1.

- Latin American (1st) and Afro-Caribbean (3rd) are the two most asked for that we do NOT have. Liforma's race
  list has neither.
- Gender lean in those bios: Latin American 5 women / 2 men, Afro-Caribbean 8 women / 6 men.
- "Mixed" never gets its own avatar: it means two races at once, which a skin blend already covers.
- Marvely uses its own 9-word race list (`Marvely/marvely_new/src/lib/liforma/sceneRecord.ts`, `normaliseRace`:
  african, afro_caribbean, east_asian, south_asian, southeast_asian, mena, latin_american, white_european, mixed).
  I found no code in our Marvely copy (51a37be, 22 Oct) that turns these words into Liforma's race names, so that
  mapping has to be written, with the new races in it. Trap: its `white_european` pattern matches "British
  English speaker" (an accent, not a face) and "white coat"; only accept descent words.

### 15.2 The race name, everywhere the code lists races

Every one of these needs the new value (e.g. `latin-american`, `afro-caribbean`; same spelling everywhere):

| Repo | File | What to add |
| --- | --- | --- |
| api | `packages/publisher/src/schemas.ts` | `PERSONA_ETHNICITY_VALUES` (11 today) |
| api | `src/lib/server/catalog/persona.ts` | `PERSONA_ETHNICITY_LABELS` (the name people see) |
| api | `openapi/authoring.json` | generated: run `npm run openapi:authoring` (the `verify` check fails if it is stale) |
| api | `src/lib/server/platform/generateExperienceSetupDetails.ts` | `CHARACTER_LOOK_ETHNICITIES`, the `ETHNICITY_LABELS` map, and the prompt line (~119) that lists the allowed `characterEthnicity` values |
| api | `src/lib/server/catalog/avatarSetSeed.ts` | `FEMALE_MIX` / `MALE_MIX` (the outfit skin numbers, 15.3) and `WOMEN_FACE_PACKS` / `MEN_FACE_PACKS` (the two new ids) |
| api | `src/lib/server/catalog/avatarPersona.ts` | each new id with gender + ethnicity |
| api | `src/lib/server/catalog/avatarPublishAllowlist.ts`, `avatarCostumeSupport.ts`, `avatars.ts` | each new id |
| app | `packages/experience-studio/src/lib/persona.ts` | its OWN copy of `PERSONA_ETHNICITY_VALUES` + labels |
| app | `packages/experience-studio/src/lib/avatarLooks.ts` | `LOOK_IDS`, `RACE_LOOK_ETHNICITIES`, `RACE_LOOK_PACKS` |
| player | none | main has no race list |

After the api change: `npm run db:seed-avatar-sets` so the database's avatar sets get the new members and numbers.

### 15.3 Outfits for a new race

The Studio makes each race's outfits from two pictures of every outfit (European + African), a race face, and
three numbers per race. A new race needs these files in the PRIVATE authoring bucket (paths from api
`src/lib/server/catalog/avatarSetMakerInput.ts`), once for women (set `09hmxcmk`) and once for men (`xp8qtdvc`):

| File | What it is | How we made it |
| --- | --- | --- |
| `avatar-sets/<set>/maker/faces/<race>_<female\|male>_gpt.png` | the race's base body (step 1), cut out, 1254 px | step 1 + `key_biref_v4_blue.py` (the blue-screen version). Local copies of the current ones: `L/scripts/race/female-maker/faces/`, `L/plates/outfits/outfit_plates_male/maker/faces/` |
| `avatar-sets/<set>/maker/faces/<race>_<gender>_gpt-head_and_shoulders.webp` | the head and shoulders of that picture; outfit joins read only this | NOT made by our tools: Charles's api commit 67b0d38 (29 Oct) started reading it. Ask Charles how he cut it, or copy the shape of an existing one from the bucket (read only) |
| `avatar-sets/<set>/maker/outlines/<race>_<gender>_gpt_outline.json` | the 36 face-outline dots + all 478 dots of that picture | same file layout as `face_mesh_work/face_parts_plus_outline.py` writes (`width, height, turnedHead, outlineIndices, outline, dots478`). Run it on the 1254 face picture: `face_mesh_work/vendor/face-part-segmentation/.venv/bin/python face_parts_plus_outline.py <picture> --out <folder>` from `face_mesh_work/`. Local copies of the current ones: `L/Liforma/liforma/sandbox/race-plates/maker/outlines/`, `L/plates/outfits/outfit_plates_male/maker/outlines/`. The user should check the jaw line by eye: the outfit join cuts along it |
| `avatar-sets/<set>/maker/race_values.json` | one entry per race: three mix numbers + the hand/forearm colour they aim for | see below |

**The three numbers.** Each outfit picture of the new race = European picture + t x (African picture - European
picture), one t per colour channel, so the race's hands and forearms come out the colour of its own base body:
`t = (target - light) / (dark - light)`, measured in the hand box (rows 800-990, columns 330-700 of the 1024
picture) on solid skin pixels.
- Men: `L/scripts/race/fit_male_values.py` does exactly this with Caleb and Malik; targets are in
  `L/scripts/race/male_hand_targets.json` (add the new race's hand colour, measured on its base body).
- Women: the same formula with Anna and Precious. The script that fitted the current women's numbers lived in an
  old scratch folder and is gone; copy `fit_male_values.py` and point it at Anna/Precious.
- Check with `L/scripts/race/female-maker/make_race_plates.py <Anna.png> <Precious.png> <out> --races <race>`
  (hands must land within 45 shades of the target; good ones are 10-25 away).
- The same numbers go in two places and must match: `race_values.json` in the bucket (the browser maker) and
  `FEMALE_MIX` / `MALE_MIX` in `avatarSetSeed.ts` (the database).
- Uploads to the authoring bucket need the user's yes, like every upload.

### 15.4 Base body prompt

Add the race to `L/notes/race_prompts.md`, under both "Female — full prompt" and "Male — full prompt", written
like the others plus the fixes from step 1:
- the general prompt shape (not the "redo" prompt);
- the neck sentence ("Keep her/his neck exactly the same width and outline as in the original picture ...");
- "rounded" face, never "broad";
- eyes, lids, brows, nose, lips and skin described in detail, saying what to keep, not what to avoid;
- name skin colour in plain words (Nano Banana took "green-gold undertone" literally).
Show the prompt and the input to the user before the first paid call.

### 15.5 Hair

Hair styles are shared by every race and fitted to each avatar from its own dots, so there is nothing to make per
race. Per new avatar:
- place its dots in the race editor, then `L/hair_work/live_fit/hair_dots/export_hair_dots.py` writes its
  `hair_fit_dots.json`; upload that file (needs a yes);
- add the id to `avatars` in the hair list (`L/hair_work/plate_list_2026-10-21/hair_plates_list.json`,
  `{"group": "women"|"men"}`) and upload the list (needs a yes);
- `npm run db:sync-hair-plate-library` for its rows (staging rows went in by SQL last time).
Textured styles already in the shared list: box braids, cornrows, short afro (+ shaved sides), shoulder locs,
tapered natural coils, two-strand twists. Whether more styles are wanted for the new races is the user's call.

### 15.6 Order for one new race

1. Prompt in `race_prompts.md` -> user checks -> base bodies, woman and man (step 1).
2. Measure hand colour -> the three numbers for each -> maker check with `make_race_plates.py`.
3. Outline files (`face_parts_plus_outline.py`) + head-and-shoulders pictures (ask Charles).
4. Both avatars through steps 2-10 of this pipeline, one at a time.
5. Code: race name in every file of 15.2, both ids, both sets of numbers -> PRs (api first, then app).
6. Uploads with the user's yes: maker files to the authoring bucket, packs to staging (step 10), eye list +
   eye sync, hair dots + list + rows.
7. `npm run db:seed-avatar-sets` on staging, then check in the staging Studio: the race shows in the picker, both
   avatars talk, outfits look right on both, hair fits, eye colours work.
