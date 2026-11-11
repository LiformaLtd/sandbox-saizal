# app (Studio): keep the African jaw corners (browser maker)

**What it is.** On African race outfits there was a small notch at the join of the jaw and chin. The African face is 4-7 px wider per side than the outfit outline at rows 336-354, so the join cut a wedge (about 600 px) off each jaw corner. The fix keeps the face pixel above row 361 where the outfit is see-through (alpha under 250) and the face is more solid.

**When.** Found 5 Nov 2026; fix committed locally 10 Nov (1 commit). It started after the 29 Oct change (api PR #83 / app PR #99) that sends European and African looks through the head join too.

**Question.** Saizal: "artifact at the join of jaw and chin" on all African plates.

**What happened.** 12 real outfits x African / European / South Asian: only rows 349-360 change, reports ok, and the app and api give the same bytes. A first trial with alpha under 0.5 left a faint line on the outfit's soft edge, so the limit is 250. The input version goes to `avatar-set-maker-3` and the face stamp to `endpoint-face-2`. The stamp only re-writes catalogue renders, not baked library rows: those need a re-save or re-bake. Before/after sheet: `~/Desktop/Liforma_LTD/notes/african_skin_check_2026-11-05/jaw_notch/fix_2026-11-10_before_after.png` (folder: 37 files, 18 MB, 31 pictures; not copied).

**Status.** Committed locally with `--no-verify` after Saizal said yes (the pre-commit hooks fail for unrelated reasons), not pushed.

**This half.** app commit `376530d`, branch `Saizal-african-jaw-trim`: `src/lib/avatarSetClothes/ethnicityPlateMaker.ts` (+ new `ethnicityPlateMaker.jawCorner.test.ts`), `legacyOutfitInputUrl.ts` (+ test, `RACE_INPUT_VERSION` -> `avatar-set-maker-3`), `plateCache.test.ts`. The server half is `../api-african-jaw-trim`.

**Today's main.** Base `0d54e77` = today's main, so it applies as is. It clashes with `../app-costume-keep-hair` (same join code) and with the neck fit commit in `../app-neck-fit-preview` (`git merge-tree` shows conflicts in `legacyOutfitInputUrl.ts` and its test: both set `RACE_INPUT_VERSION` to `avatar-set-maker-3` for different reasons, so whichever goes in second must take `avatar-set-maker-4`): small hand merges.

**Checked again 11 Nov.** The patch is the same as the branch tip `376530d`; the worktree has nothing uncommitted.

**How to use it.** `git am 0001-*.patch` on a branch from main; `npm test`. This worktree has its own `npm ci` (a worktree with a linked node_modules cannot type-check).

**Left on the Mac.** Worktree `~/Desktop/Liforma_LTD/worktrees/app-jaw-trim`.
