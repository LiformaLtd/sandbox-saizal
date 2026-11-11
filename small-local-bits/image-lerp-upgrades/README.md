# sandbox: image-lerp tool upgrades (21 Sep - 2 Oct 2026)

**What it is.** The changes Saizal's sessions made to Charles's image-lerp tool (`image-lerp/` in the
LiformaLtd/sandbox repo: a local page that mixes two pictures with sliders). After the changes the tool holds many
A/B picture sets at once, each with its own sliders, loads ready-made sample pairs in bulk, has one button per race
that puts the sliders on that race's mix values, can follow image A's outline the way the race maker does, and shows
the finished race plate next to the live mix. It is all in one code patch against GitHub main's `image-lerp/`.

**When.** 21 Sep - 2 Oct 2026 (files last changed 2 Oct 01:11). All times here are UTC, as in the session records.

**Question.** Saizal used the tool to blend Anna's outfit plates into Precious's (and Caleb's into Malik's) to find each
race's skin colour. With dozens of outfits, one pair at a time was too slow. Saizal (22 Sep): "update the UI for the
image lerp so that we can upload multiple sets of images and then from those we can choose one set at a time to do the
RGB manipulation".

## What happened (steps in order)

1. **20 Sep** (session 18a24f5c): Claude found Charles's new tool on GitHub (sandbox commit `bca2615`, 18 Sep) and
   checked it out into the old sandbox copy on the Mac, `~/Desktop/Liforma_LTD/Liforma/liforma/sandbox` (detached at
   `2272ae4`). Git still has it staged there as a new folder, exactly as in `bca2615`; all the edits below sit on top,
   unstaged. It was first used, unchanged, to fit the race slider values (for example South Asian 0.48 / 0.67 / 0.94
   on the art teacher plates).
2. **21 Sep** (d0d45727, 7115e8e5): the built-in sample pair was replaced several times with Anna's and Precious's
   plates of the outfit being checked (blue cocktail dress, a casual top, last the nurse outfit); the original pair is
   kept as `_orig_a.png` / `_orig_b.png`. The tool ran on port 5199 from the workspace launch settings.
3. **21 Sep 20:31** (d0d45727, continued as 19331641): a `?pair=<slug>` link. It opens the page with the pair in
   `static/samples/pairs/<slug>/` already loaded, so each outfit can sit in its own browser tab. 32 pairs were
   installed and opened in 32 tabs. `+page.svelte.bak` is the page from just before this change. Variants were added
   by hand the same evening (`train_ticket_collector_pxz`, four `_nohands` pairs).
4. **22 Sep 09:19** (19331641): `build_pairs.py` cut out (keyed) 34 of Precious's plates (14 "whole plate" versions,
   20 "mean" versions) and 2 of Anna's, and put them in as pairs.
5. **22 Sep 16:02** (b8bd029d): a note at the top of the tool's README: "Not the production path any more". Mixing two
   finished plates also mixes the clothes and the shading and changes the face; that session moved the skin work to a
   skin-colour target (`skin_target.py`, now in `../../avatar-hair/02-image-to-image-scripts/`).
6. **22 Sep 23:54 - 23 Sep 00:19** (5802e7cc, continued as 75ae8e89; 592c4dea is the next continuation and its
   transcript repeats these steps): the rebuild for many sets.
   - A set strip (`SetStrip.svelte`): pick one set at a time; each set keeps its own mix mode and sliders; rename,
     remove and "New set". "Add files…" takes any number of files and pairs them two at a time by name (four files
     became two named sets in the test).
   - Sets, their pictures and sliders are kept in the browser's own storage (IndexedDB) and come back after a reload.
     An old one-pair store is moved over into one set instead of being dropped.
   - Three bugs fixed on the way: the rename box sat inside a button, so it could not take focus; the strip of 65
     cards made the whole page scroll sideways (`min-width: 0` fix); and each set held a decoded picture, which at 65
     sets would have held about 500 MB. Now a set keeps only the file and decodes it when picked: adding all 65 male
     sets took 6 seconds and the page memory went from 10 MB to 23 MB.
   - "Sample pairs…" list with a filter and an "Add all N" button. The pair list (`pairs/index.json`) records each
     pair's file type (png or webp), so the page no longer guesses and logs 404s. The `?pair=` link still works, but
     now it only fills the first set when nothing is stored yet.
7. **23 Sep** (75ae8e89, dfa134ff): 65 `male_<outfit>` pairs (Caleb is A, Malik is B; `install_male_pairs.py`, stored
   as lossless webp, 79 MB instead of about double as png), one `tennis_outfit_mean2` pair, and 18 `regen_<outfit>`
   pairs for Malik's regenerated plates (`install_regen_pairs.py`, 09:31).
8. **1 Oct 02:35-02:53** (75ae8e89): the 65 male pairs were loaded again (the browser storage had been cleared), then
   their B side was switched to Malik's plates keyed with BiRefNet v4. `male_neutral_bald` was the only png pair and
   dropped out of the list when its B became webp; its A was turned into webp too, so it shows again.
9. **1 Oct 03:41** (75ae8e89): 512 `race_<race>_<outfit>` pairs: Caleb's plate as A and the male race plate made
   from it as B (`install_race_pairs.py`, in `../../avatar-face-plates/8-male-race-outfit-plates-2026-10-01/`).
10. **1 Oct 16:16-17:06** (8a439c4d):
    - Race buttons: eight races, values from `static/race_values.json` (copied from the race-plates maker). The page
      shows the see-through (alpha) weight it uses, the mean of the three channel values (South Asian 0.543, East
      Asian 0.010).
    - The Image A / Image B drop boxes were removed (Saizal: "remove the image a and image b canvases").
    - 37 `female_<outfit>` pairs: Anna's plate with the blue removed as A, Precious's current plate as B.
    - The race buttons work in "Unified RGB" too, without opening the three sliders (16:31).
    - "Follow A's outline" (16:59, `followOutlineA` in `lerpImages.ts`): pixels only B paints are dropped, pixels only
      A paints stay solid in the mixed colour of the nearest pixel both paint. This was the half see-through edge on
      the in-between races. Over the 37 outfits, below the face: 24,105 px solid only on Precious (13,545 of them skin
      coloured), 6,627 px solid only on Anna. The same rule went into the race maker.
    - At t = 1 the result is image B exactly, outline and all (17:05, Saizal: "do not change precious' plates").
11. **1 Oct 19:34** (8a439c4d): finished-plate panel. `src/lib/server/finished.ts` and two small routes read the
    finished race plates (face pasted along the chin, neck shaved) straight from a Mac folder and show the one for the
    picked set and race next to the live mix, with a Download link. 296 women's plates (8 races x 37 outfits).
12. **2 Oct 01:10** (8a439c4d): the same for the men: a `male_<outfit>` set uses `static/race_values_male.json`
    (A = Caleb, B = Malik) and the men's folder (512 plates, 8 races x 64).

## Status

Local only: never committed, pushed or sent as a pull request. GitHub main's `image-lerp/` (and this branch's) is
still Charles's original. The tool was a way to look and measure. The race plates themselves came from the race
maker, which uses the same mix formula and outline rule (`make_mix_plates.py`, see
`../../avatar-outfits/05-blend-pipeline-2026-10-22/`).

**Today's main.** `git apply --check` passes on this branch, whose `image-lerp/` is the same as GitHub main
(`abd5cee`). Type check of main's `image-lerp/` plus this patch, in a throwaway copy on 11 Nov: 304 files, 0 errors,
0 warnings.

## How to run

- From the sandbox repo root: `git apply unmerged-product-changes/sandbox-image-lerp-upgrades/image-lerp-upgrades.patch`,
  then `cd image-lerp && npm install && npm run dev` (the dev server picks port 5173 or the next free one).
- "Add files…" works anywhere (two files make one set). "Sample pairs…" needs `static/samples/pairs/` with its
  `index.json` and pictures; they are not in the patch, so on another machine the list fails to load.
- The finished-plate panel reads `FINISHED_PLATES_DIR` and `FINISHED_PLATES_DIR_MALE` (folders of
  `<race>/<outfit>.png`). Without them it uses two Desktop folders on Saizal's Mac and says "No finished plates found".
- The three `pair-install-scripts/` copy pictures from Mac folders into the tool (run them with the Python inside
  `~/Desktop/Liforma_LTD/ComfyUI/.venv`). Nothing here uploads anything or calls a paid service.

## What is in this folder

| File | What it is |
|---|---|
| `image-lerp-upgrades.patch` | The code change, uncommitted work (apply with `git apply`). 12 files: 6 changed, 6 new |
| `pairs_index.json` | The tool's list of the 672 sample pairs as it stood on 1 Oct, with each pair's file type. Pictures not included |
| `pair-install-scripts/` | Three of the helpers that put sample pairs into the tool (rebuilt, see below) |

The patch, file by file:

| File | Change | Sessions |
|---|---|---|
| `src/routes/+page.svelte` | Sets instead of one pair, sample list and "Add all", `?pair=` link, race buttons, outline switch, finished panel, no drop boxes | d0d45727, 75ae8e89, 8a439c4d |
| `src/lib/SetStrip.svelte` (new) | The strip of set cards: pick, rename, remove, new set | 75ae8e89 |
| `src/lib/imageCache.ts` | Browser storage for many sets and the set order; moves an old one-pair store over | 75ae8e89 |
| `src/lib/loadImage.ts` | A picture no longer stays decoded; `decode()` makes it when needed (the memory fix) | 75ae8e89 |
| `src/lib/lerpImages.ts` | `followOutlineA()` and the t = 1 guard | 8a439c4d |
| `src/lib/index.ts` | Exports for the new storage functions | 75ae8e89 |
| `src/lib/server/finished.ts` (new) | Lists and finds the finished race plates in the two folders | 8a439c4d |
| `src/routes/finished/index.json/+server.ts` (new) | `/finished/index.json`: which finished plates exist | 8a439c4d |
| `src/routes/finished/[set]/[race]/[outfit]/+server.ts` (new) | `/finished/<set>/<race>/<outfit>.png`: one finished plate | 8a439c4d |
| `static/race_values.json` (new) | Women's race mix values (A = Anna, B = Precious) | 8a439c4d |
| `static/race_values_male.json` (new) | Men's race mix values (A = Caleb, B = Malik); the same values as `../../avatar-face-plates/8-male-race-outfit-plates-2026-10-01/male-maker/race_values.json` (that file also holds the skin targets) | 8a439c4d |
| `README.md` | The "Not the production path any more" note | b8bd029d |

Note on `static/race_values.json`: its Pacific Islander values (0.28, 0.5, 0.91) are the 1 Oct refit for the new
Pacific Islander face. GitHub main's `race-plates/maker/race_values.json` still has the older 0.29, 0.5, 0.85. The old
checkout's `race-plates/` folder holds that refit and other unpushed changes; they are not in this patch.

## Rebuilt from the session history

The patch is made from the files on disk, not rebuilt. These three scripts were in session temp folders and are gone;
they were rebuilt from the transcripts:

- `pair-install-scripts/build_pairs.py` (19331641, 22 Sep 09:19): ok, one version.
- `pair-install-scripts/install_male_pairs.py` (75ae8e89, 23 Sep 00:05): ok. The pair list was rewritten with file
  types a few minutes later by a one-off command, not by this script. The script still expects the older list (names
  only): run today, it copies the pictures and then stops with an error when it reads `index.json`.
- `pair-install-scripts/install_regen_pairs.py` (75ae8e89, 23 Sep 09:31): ok, plus the `sed` edit of 09:34 (use the
  head-reference re-run for `marroon_top_and_jeans`), replayed by hand.

The 32 first pairs (21 Sep), the 37 `female_` pairs (1 Oct) and the BiRefNet v4 switch (1 Oct) were one-off commands,
not scripts; they are described above.

## Left out on purpose

| What | Why |
|---|---|
| `static/samples/pairs/` (672 pairs, 1,344 pictures, 398 MB, 716 of them over 300 KB) | Pictures |
| `static/samples/a.png`, `b.png` (Anna / Precious in the nurse outfit, 535 KB each) | Pictures; the patch keeps main's tiny sample pair |
| `static/samples/_orig_a.png`, `_orig_b.png` | Same bytes as main's sample pair |
| `src/routes/+page.svelte.bak` | Same as Charles's original page (`bca2615`) |
| `.claude/launch.json` (port 5173) and the workspace launch entry (port 5199) | Local Claude preview settings; the repo now says not to pin ports |
| The old checkout's `vite.config.ts` and README path line | Older copies of Charles's files, not Saizal's changes; main's newer ones are kept |

`src/lib/ImageDrop.svelte` is unchanged; after 1 Oct the page no longer uses it.

## Left on the Mac

- The working copy: `~/Desktop/Liforma_LTD/Liforma/liforma/sandbox/image-lerp/` (with `node_modules`), including the
  398 MB of sample pairs: 40 early Anna/Precious pairs, 65 `male_`, 18 `regen_`, 37 `female_`, 512 `race_`.
- Finished plates the panel reads: `~/Desktop/Liforma_LTD/plates/outfits/outfit_plates_female/female_race_plates_mix/`
  (172 MB, 296 pictures) and `.../outfit_plates_male/male_race_plates_mix/` (355 MB, 512 pictures). The Desktop
  folders `~/Desktop/outfit_plates_female` and `~/Desktop/outfit_plates_male` are links to them since the 27 Oct
  clean-up.

## Related parts of this sandbox

- The work the tool was used for: `../../avatar-outfits/15-race-skin-mix-and-neck-seam-test-2026-09-20/` (race skin
  mix numbers), `../../avatar-outfits/16-precious-wardrobe-krea2-two-pictures-2026-09-21/` and
  `../../avatar-outfits/17-precious-skin-normalisation-2026-09-21/` (Precious's plates, the B side of the women's
  pairs), `../../avatar-outfits/18-malik-wardrobe-orchestrator-2026-09-22/` (Malik's plates, the B side of the men's
  pairs), `../../avatar-outfits/19-female-race-plate-sets-v1-v4-2026-09-23/` (the women's race plate sets).
- The race maker with the same mix and the same outline rule: `make_mix_plates.py` in
  `../../avatar-outfits/05-blend-pipeline-2026-10-22/python_original/`. The older maker on GitHub main,
  `../../race-plates/maker/make_race_plates.py`, uses the same mix but keeps Anna's outline as it is.

## Words used here

- **lerp**: a straight mix between two pictures: `A + t x (B - A)`, per colour channel. t = 0 is A, t = 1 is B.
- **set / pair**: two pictures to mix, A and B, usually one outfit on two avatars.
- **keyed**: with the background cut out.
- **BiRefNet v4**: the cut-out script the team settled on (`key_biref_v4.py`).
- **webp**: a picture file type that is smaller than png at the same quality ("lossless" keeps every pixel).
