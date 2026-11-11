# Eye corner layer: the dark wedge, the diagonal cut, fan vs strips (2-3 Nov 2026)

## What it is
The corner layer (corner patch) is the part of each painted eye that Saizal paints by hand in the eye patch editor
(`../eye-patch-editor/`): the pink inner corner and the lower lid rim, drawn by the player over the still white. When
Saizal turned it back on, the Indigenous man (1d5b0001) showed a dark wedge, a corner cut in half and a straight diagonal cut
at the inner corner. This part records how each was traced, the fixes tried, the lid-to-lid "strips" change in the player,
and why the corner layer was parked. Its first finding (about 55 % of the painted area lies outside the eye hole) is
already in `../checks-2026-11/README.md`; the rest is here.

## When
2 Nov 2026 14:28 UTC to 3 Nov 2026 14:17 UTC. Sessions `e7be9061` (2 Nov), then one conversation stored in three session
files (`d576f58c`, `0a97b955`, `64a8ea51`, 2-3 Nov night), then `4e3c79ce` (3 Nov afternoon).

## Question
- 2 Nov: "Can you turn on the eye layer that we had, which added some pixels from the edges of the eyes?"
- 3 Nov night: "the corner layer turned on is a bit funny ... it isnt displaying everything"; "theres a black shadow along
  the inner right edge of the left eye and the corner is cut into half"; "Why are you not pasting the corner picture just as
  it is?"; "It's a straight sharp cut in the middle happening diagonally."
- 3 Nov afternoon: "what is causing the diagonal line on the left eye"; "when we are laying on the corner layer, why are
  the triangles affecting how much of that [shows]"; "Can you see the small triangle on the right edge of the eye? That is
  what we need to be there."

## What happened
2 Nov
- 14:40: corner layer back on by default in the local player (port 3005); it had been off since 27 Oct. Player sheets of
  all 20, off vs on (`scripts_2026-11-02/corner_sheet.py`). Eye holes measured on the Studio picture
  (`measure_holes.py`; numbers in `../checks-2026-11/eye_corner_layer_20261102/studio_eye_holes_1024.csv`): the right eye is
  narrower on all 20 (by 0.2-4.4 %) and shorter on 15 (by up to 6.8 %). The session said "shorter on 14"; the saved table
  gives 15 shorter, 1 the same (5e5b0001) and 4 taller.
- 16:41-16:42: Studio-preview sheets with the corner layer on (`studio_sheet.py`) and the openings with it on
  (`measure_corner_on.py`; `studio_eye_openings_corner_on_1024.csv` in the same checks folder): the layer takes mostly width,
  2-3 px per eye and up to 4.7 px, and at most 1.3 px of height; the right eye is then narrower on 18 of 20.
- 16:53-17:09, Indigenous man, 1024 px picture: painted eye 44.1 x 24.8 (left) and 43.5 x 25.9 px (right); Studio hole
  45.4 x 26.7 and 45.2 x 26.5; with the corner layer 44.4 x 25.7 and 42.0 x 26.0. The eye white is 25 px top to bottom on
  both eyes (`measure_white_height.py`). The right eye only looks bigger: its white is brighter and its outline thinner.
- 17:18-18:03: the eye patch editor was changed to show the player's iris (see `../eye-patch-editor/`); Saizal repainted
  his corners and saved at 18:03 (`before_after_corner_edit.py`).

3 Nov, night
- 00:29-00:53: about 55 % of the painted area is outside the hole and never drawn (626 of 1080 px on one eye, 469 of 971 on
  the other; `scripts_2026-11-03_night/corner_on_check.py`). Inside the hole the patch is a copy of the painting, so most of
  it is white on white; only about 56 px per eye look different (`corner_decompose.py`). The Studio layer builder was changed
  to cut the patch hard at the hole line, like the player.
- 01:35: full-size grab of the local player (3600 x 3000, `grab/receiver.py` + a grab pasted into the page): a dark grey
  wedge at the inner edge of one eye and a pink corner split in two on the other, in the player only (the Studio and the
  editor showed neither). Switching the eye layers off one at a time: only "corner patch off" removes them. A first reading
  said the player's hole followed the sil picture's eye dots; on that basis his sil dots were set to the neutral picture's
  dots, then the other 19 were done the same way (rebuilt 01:52). This reading was wrong; it was corrected the same
  afternoon (see 14:00 below).
- 02:02-02:10: Saizal: paste the corner picture as it is, and work on one avatar only. The 19 other packs were put back from
  their backups. The patch was placed with one scale, turn and shift for the whole picture ("rigid") instead of being bent
  dot by dot, in the player and the Studio builder.
- 02:12-02:28: "it adds white between two layers of skin" and "for every avatar, the right eye is a bit warped".
  - The seam: the editor builds everything from the close-up picture; the player and the Studio show the 1024 rest picture.
    The two paintings' lids sit 1-2 px apart, so a patch cut from the close-up always lands 1-2 px off the hole.
  - The warp in that step: Claude had replaced the sil dots (which carry Saizal's own cut) with the neutral dots (up to
    3.8 px off the cut) and had also overwritten his close-up dots. All of that was undone on all 20, and so was the rigid
    paste in the player.
  - Kept, for him only: the corner patch is now coloured from the rest picture the player shows (`plate_in_eye_frame.py`,
    `build_eye_shade_map.py`), the editor paints on that same picture (`eye_patch_editor_prep.py`), and the Studio hole
    follows his cut (`build_stage_eye_layers.py`, sil dots). These scripts are in
    `../../avatar-face-dots/12-eye-dots-and-eye-model/eyeball-white-and-shading/`.
- 02:32: a jagged line at the corner was the edge of the brush stroke: the player's own white shows between the stroke and
  his painted white.
- 02:36-02:44, **the straight diagonal cut**: the player cut the eye hole into a fan of long thin triangles (ear clipping)
  that all ended at the inner corner. Whatever is laid on them (the corner patch, the white's shading) is stretched a
  little differently in each, so a straight cut shows along one triangle edge. **Fix:** cut the hole into short strips from
  one lid to the other (`lidStripTris` in `irisGpuLayers.ts`, for the eye and its shading; ear clipping only if a strip
  folds), and the same in the Python builders (`lid_strips` in `build_stage_eye_layers.py`). The player's shade tests passed
  (15 of 15). Sheets: `fan_vs_ladder.py`, `corner_cut_why.py`. This changed every avatar's eyes in the local player.
- 02:47: Saizal: "I need you to sideline these two issues. The wobbly right eye and the wrong corner plate." Both were
  parked and kept out of the eye push.

3 Nov, afternoon
- 12:28: the diagonal line was still there on one eye. The strips give up for the whole eye if a single strip folds, and
  then the old fan is used. Running the player's own functions on every pack (`scripts_2026-11-03_afternoon/strips_check.ts`,
  `strips_why.ts`): on the Indigenous man the left eye on screen falls back (the strip next to the inner-corner dot 133
  folds). **9 of the 20 GPT-low avatars** have at least one eye on the fan, mostly at the inner corner (the session said 10;
  its own printed list, which also covered the older packs, shows 9 of the 20 plus 4 older packs: 3e621eb8, 5a5a0001,
  9298d617, ae5a0001). The line itself comes from the shared white template, which is pinned only
  at the hole outline: with shade strength 0 the line goes (`grab_layers_off.js`). Fix offered, not done: split a folding
  strip the other way before giving up.
- 13:42: the triangles change how much of the corner layer shows only when the hole on screen and the eye in the corner
  picture have different shapes. On his rest plate they are the same (0.00 px), so fan and strips match. On other plates
  the hole moves 2-5 px off at the inner corner while talking and 12-14 px on blinks. Corner flesh shown, fan vs strips:
  SS 18.8 vs 16.6 px, ih 19.3 vs 16.9 px, big_smile 20.6 vs 15.8 px. The corner layer picks its cut by itself and falls back
  to the fan on 9 of his 40 plates on that eye (`corner_tris.ts`).
- 14:00, **correction**: at rest the player cuts the eye hole on the **neutral** picture's automatic eye dots (read from the
  running player: within 0.17 px), up to about 4 px (on his face) off Saizal's cut at the inner corner. The pink-brown wedge
  Saizal wanted is painted in the corner picture, inside Saizal's cut line; the fan showed part of it, cut by the
  diagonal; the strips squeezed it into a sliver. With the hole on the cut, both show the whole wedge. This led to the right
  upper lid fix of the same afternoon: `../right-upper-lid-fix-2026-11-03/`.
- 14:16-14:17: Saizal: "we keep the corner layer off for now". Off by default in the local player again.

## Status
- **Parked** (3 Nov 02:47) and **off** in the local player (3 Nov 14:17). Not recorded: any later decision on the corner
  layer or on the "other diagonal" strip fix.
- **Local player only** (`~/Desktop/Liforma_LTD/NEW/liforma/player.liforma.ai`, branch `Saizal`, uncommitted): `lidStripTris`
  in `irisGpuLayers.ts`, and a corner layer switch that is off by default (`innerEyeStillWhite.ts`,
  `__liformaSetInnerEyeCornerPatch`). Checked 11 Nov: `git log --all -S lidStripTris` finds no commit, and the other player
  working copies in `worktrees/` do not have it.
- **GitHub main** (146d8df, after player PR #80): ear clipping only, and no corner switch: the player draws each pack's
  corner picture whenever the pack names one (the Pacific Islander man ac5b0001 has none since 22 Oct).
- Python side: `lid_strips` and the rest-picture corner patch are in `face_mesh_work/` and in the sandbox copies named above.
  The Indigenous man's rebuilt corner pictures and Studio layers stayed local; on 3 Nov 16:03 his staging pack kept
  staging's own corner picture tags (see `../right-upper-lid-fix-2026-11-03/`).

## How to run
- `lid-strips-cut-on-main-146d8df.patch`: the three player edits of 3 Nov 02:43, taken from the transcript and applied to
  main's `irisGpuLayers.ts`. `git apply --check` passes on GitHub main 146d8df (11 Nov); not built or tested there (the local
  version passed the player's 15 shade tests on 3 Nov).
  ```
  cd player.liforma.ai          # a copy at main
  git apply --check /path/to/lid-strips-cut-on-main-146d8df.patch
  ```
- Python sheets (`scripts_2026-11-02/`, `scripts_2026-11-03_night/`): `~/Desktop/Liforma_LTD/face_mesh_work/trainvenv/bin/python`
  or `ComfyUI/.venv/bin/python` (numpy, opencv, Pillow). They import `build_stage_eye_layers` from `face_mesh_work/`, and
  several read grabs from old session folders that are gone, so they need new grabs first.
- `scripts_2026-11-03_night/grab/receiver.py`: frame receiver on 127.0.0.1:3062. Its `POST /switch/<id>` runs
  `plates/pack_builds/indigenous_pack_build/edge_check_set_avatar.py`, which points the local test experience
  (`exp_9bo7234l`) at that avatar in the **local** database.
- `scripts_2026-11-03_afternoon/*.ts`: `npx vite-node <file> <args>` from the player folder; they import the local
  checkout's `irisGpuLayers.ts` (they need `lidStripTris`). `grab_layers_off.js` is pasted into the local player page.
- Nothing here calls a paid service or writes to a bucket.

## Rebuilt from the session history
All scripts here were in the sessions' temporary folders and were rebuilt from the transcripts.
- Replayed by hand after the rebuild (one small in-session edit each): `scripts_2026-11-03_night/fan_vs_ladder.py`,
  `grab/player_vs_studio_sheet.py`, `scripts_2026-11-02/studio_sheet.py`.
- **Partial**: `scripts_2026-11-03_night/corner_decompose.py` (a later edit could not be replayed) and
  `scripts_2026-11-02/corner_sheet.py` (four later in-session edits to its eye-finding rules were not replayed).
- Copied from code pasted into the browser: `scripts_2026-11-03_afternoon/grab_layers_off.js`.
- Not copied: `measure_raw_eyes.py` (rewritten many times in the session; its result is
  `../checks-2026-11/eye_corner_layer_20261102/indigenous_man_base_plate_eyes_measured.json`) and the push-plan sheet
  scripts of the same night.

## Left on the Mac
- `~/Desktop/Liforma_LTD/notes/eye_corner_layer_20261102/` (43 MB, 46 PNG; the 4 small number files are in
  `../checks-2026-11/`). For this part: `corner_layer_off_vs_on_1/2.png`, `studio_preview_corner_on_1/2.png`,
  `indigenous_man_player_layers_1/2.png`, `indigenous_man_player_hole_vs_dots.png`, `indigenous_man_corner_pasted_as_is.png`,
  `indigenous_man_one_picture_patch.png`, `indigenous_man_fan_vs_strips.png`, `indigenous_man_strips_before_after.png`,
  `indigenous_man_diagonal_cut_layers.png`, `indigenous_man_corner_layer_fan_vs_strips_plates.png`,
  `indigenous_man_corner_wedge_in_corner_picture.png`, `indigenous_man_corner_wedge_rest_vs_neutral_dots.png`,
  `indigenous_man_black_wedge_source.png`, `player_frame_1d5b0001_corner_on_20261103.png` (3.1 MB).
- Backups in `~/Desktop/Liforma_LTD/backups/`: `1d5b0001_face-meshes.before-sil-eye-dots-20261103.json` (before the wrong
  sil change), `1d5b0001_tonight_wrong_dots_20261103/` (the wrong state, kept), `1d5b0001_face-meshes.before-hd-eye-dots-20261103.json`,
  `1d5b0001_eye_frame_before_hd_dots_20261103/`.
- The uncommitted player changes in the local checkout named above.

## Words used here
- **eye hole**: the opening the player cuts between the eyelid dots; the eye is drawn only inside it.
- **sil / neutral / close-up dots**: the eye dots of three pictures of the same face. Saizal's own cut is on the close-up
  and was carried onto the sil (resting) picture; the neutral picture's eye dots were placed automatically.
- **fan / strips**: two ways to cut the eye hole into triangles: long thin triangles that all meet at one corner, or short
  triangles that join the upper lid to the lower lid.
- **left / right eye**: as you look at the picture, as in the sessions' tables (so the "right eye" is the avatar's own
  left eye).
