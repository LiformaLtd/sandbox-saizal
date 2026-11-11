# app (Studio): preview race outfits with the server's neck fit

**What it is.** The Studio preview for catalogue outfits on mixed ethnicities fetches the finished picture from the api's fitted-plate route (see `../api-neck-fit`), instead of blending it in the browser. So the preview shows exactly what the server will bake ("bake" = the server making the final outfit picture when a character is saved).

**When.** First version 28 Oct 2026, as uncommitted work. Moved onto today's main and committed on 10 Nov 2026, 23:40.

**What it does (committed version).** New Studio route `/api/studio/avatar-set-clothes/fitted` (it passes the request on to the api). The browser worker passes those bytes through with no blending. New outfits, costumes, European, African and the white tee are still made in the browser as before. `RACE_INPUT_VERSION` goes to `avatar-set-maker-3`, so pictures the browser saved earlier are not reused.

**What happened.** Checked in the signed-in local Studio on 28 Oct: the worker's picture was byte-identical to the route's answer, and the 1024 px route answer matched the checked fit picture. The small grid tiles still use the quick colour mix. Do not save a character to test it: a save runs the bake and publish job (bucket writes). The commit was made with `--no-verify` because 3 gallery/play tests already fail on clean main.

**Status.** Committed locally on 10 Nov (1 commit `a63a793`, branch `Saizal-neck-fit`, signed Sayzal28). Not pushed, not on GitHub, not on staging. It shows nothing new until the api half is on staging and its 157 input files are uploaded (see `../api-neck-fit`).

**Today's main.** The commit sits directly on today's main `0d54e77`, so it merges cleanly. `git apply --check` of `../app-costume-keep-hair` and `../app-avatar-lab-page` on top of it passes. It CLASHES with `../app-african-jaw-trim` (read-only `git merge-tree`): both change `legacyOutfitInputUrl.ts` and its test, and both set `RACE_INPUT_VERSION` to `avatar-set-maker-3` for different reasons. Whichever goes in second must take the next number (`avatar-set-maker-4`), or browsers keep pictures made under the first change.

**Files.** 5 files: `ethnicityPlate.worker.ts`, `legacyOutfitInputUrl.ts` (+ test), `plateCache.test.ts`, new `src/routes/(portal)/api/studio/avatar-set-clothes/fitted/+server.ts`.

**Patches**
1. `0001-Studio-preview-catalogue-plates-on-mixed-ethnicities.patch` - the committed version (`git format-patch origin/main..Saizal-neck-fit`). Use this one. (A snapshot of the port taken at 23:36 was here before. It was identical to this commit, so it was removed.)
2. `earlier-original-on-NEW-app-80b2f05.patch` - the 28 Oct version, still uncommitted in the NEW app checkout (on branch `Saizal-stage-hair-swap`, base `80b2f05`). 6 files. Kept for history only. It does NOT apply to today's main (worker and URL test moved on).

**Mac-only parts: drop before this goes near staging.** These are only in the earlier 28 Oct patch:
- The worker change and the `fitted` route are marked "LOCAL ONLY (2026-10-28)" there. In the commit the same idea is product code with no such mark.
- The `headneck`, `headshape` and `collar` inputs added to `api/studio/avatar-set-clothes/input/+server.ts`: they served the Mac-only maker files from the api's `LOCAL_AVATAR_SET_MAKER_DIR` folder. Not in the commit.
- `RACE_INPUT_VERSION` `avatar-set-maker-4` there (the commit uses `-3`).
- The warm-up change in `legacyEthnicityPlates.svelte.ts` (fetch inputs ahead only for "+ New clothes") is also only in the earlier patch. It is not Mac-only, but the commit leaves it out, so the Studio still fetches maker inputs ahead for catalogue outfits it no longer needs.

**Left out of the NEW app checkout (and why).**
- Dev CDN relay hunks: `packages/experience-studio/src/lib/characterAppearance.ts` and `src/lib/gallerySceneThumb.ts`. Every hunk in both files is relay-only (Mac-only).
- Eye colour files: `EyeColourDialog.svelte`, `EyeColourPicker.svelte`, `EyeColourTileLabel.svelte`, `eyeColours.ts`/`.test.ts`, the eye parts of `libraryCharacter.ts` and `packages/experience-studio/src/lib/types.ts`, the eye-shade layer in `ExperiencePreview*.svelte`, and the eye hunks in `characters/[charId]/+page.svelte`. Checked against GitHub main: they are 4-10 lines away from the old app branch `Saizal` (`603e698`, the pre-merge copy of app PR #108), main has since moved on with app PRs #108, #116 and #117 (main already has the eye-shade layer props), and the only extra is a LOCAL DEV still-picture eye layer. They belong to the eyes area.
- `src/lib/raceOutfits/` and `src/routes/(portal)/lab/`: see `../app-avatar-lab-page`.

**How to use it.**
```
cd app.liforma.ai && git switch -c Saizal-neck-fit origin/main
git am /path/to/unmerged-product-changes/app-neck-fit-preview/0001-Studio-preview-catalogue-plates-on-mixed-ethnicities.patch
npm test
```

**Left on the Mac.** Branch `Saizal-neck-fit` in worktree `~/Desktop/Liforma_LTD/worktrees/app-neck-fit` (clean, nothing uncommitted). The 28 Oct version, uncommitted, in `~/Desktop/Liforma_LTD/NEW/liforma/app.liforma.ai`.
