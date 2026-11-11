# api: neck fit for race outfits (server side)

**What it is.** When an outfit is made for another ethnicity, the avatar's head is pasted onto the outfit picture. The neck fit makes that join seamless for every kind of outfit (sleeveless to high neck), for women and men, on the server before publishing. It also adds a route that returns the fitted picture, so the Studio preview can show exactly what the server will bake ("bake" = the server making the final outfit picture when a character is saved).

**When.** First version 28 Oct 2026, as uncommitted work. Moved onto today's main and committed on 10 Nov 2026, 23:38.

**Question.** Saizal: "we need the neck paste to be seamless for all types of outfits, be it sleeveless or high necks, for both the genders", done on the server.

**How it works (plain words).** The 40 px band round the jaw is moved so the outfit's jaw lands on the avatar's jaw cut. Both pictures get the same move. One neck brightness gain per avatar. Soft shading under the jaw, matched to the white T-shirt pictures. The head goes on top, cut at its jaw. Over bare necks nothing slides; only cloth or a shaded neck is moved.

**When it runs (committed version).** Only for a catalogue outfit on a mixed ethnicity (not European or African, not a costume, not a "+ New clothes" outfit), and only in an avatar set that has a head shape file (`maker/head_shape.png`). Then the avatar's head+neck picture, the outfit's collar file, the face outlines and the white-tee picture must all be there. If one is missing, the bake fails and the log names the missing file. There is no quiet fall back to the old join. Sets without a head shape file still use the old maker.

**What happened.** Check on 1,144 pictures: gaps no bigger than the neck join everywhere; a light line of 0-2 px in 90% of them. The committed bake gives the same pixels as the 28 Oct pictures on 4 outfits x 8 ethnicities (women and men): 0 values differ. The join was softened twice on 28 Oct after Saizal said it was "wobbly at the juncture". Dead ends, do not retry: full-body row gain (blotchy pink chests), separate moves for the two pictures (orange ghost at collar edges), measuring jaws in each outfit picture (dark collars tore). The test scripts and sheets are in `../../avatar-outfits/07-high-neck-and-neck-fit-2026-10-27/`.

**Status.** Committed locally on 10 Nov (1 commit `26813e6`, branch `Saizal-neck-fit`, signed Sayzal28). Not pushed, not on GitHub, not on staging.

**Today's main.** The commit sits directly on today's main `955a41c`, so it merges cleanly. Read-only merge checks (`git merge-tree`) also merge cleanly with `../api-african-jaw-trim` and `../api-african-lineup-check`. `git apply --check` of `../api-costume-keep-hair` and `../api-krea-nudity-check` on top of it passes.

**Nothing changes on staging until the input files are uploaded.** The fit reads 157 files from the private authoring bucket that are only on this Mac: 2 head shapes, 16 head+neck pictures, 139 collar files, in `~/Desktop/Liforma_LTD/NEW/liforma/.local-dev/avatar-set-maker/avatar-sets/{09hmxcmk,xp8qtdvc}/maker/` (4.5 MB; women's set `09hmxcmk`, men's set `xp8qtdvc`). They were made by `make_final.mjs` (see `../../avatar-outfits/06-head-neck-per-avatar-2026-10-23/`). Uploading them needs Saizal's yes. Not copied here.

**Files.** 9 files: `catalog/neckFit.ts`, `neckFitJaw.ts`, `headNeckPlate.ts` (+ tests), `resolveOrBakeAvatarSetClothes.ts` (+ test), `avatarSets.ts`, and the new route `routes/internal/avatar-sets/[avatarSetId]/fitted-plate/+server.ts`.

**Patches**
1. `0001-Neck-fit-for-ethnicity-outfit-plates-catalogue-outfi.patch` - the committed version (`git format-patch origin/main..Saizal-neck-fit`). Use this one. (A snapshot of the port taken at 23:36, while another session was still working on it, was here before. It differed from this commit by one comment line only, so it was removed.)
2. `earlier-original-on-NEW-api-main-248bd80.patch` - the 28 Oct version, still uncommitted in the NEW api checkout (base `248bd80`). 11 files. Kept for history only. It does NOT apply to today's main (`resolveOrBakeAvatarSetClothes.ts` has moved on).

**Mac-only parts: drop before this goes near staging.** These are only in the earlier 28 Oct patch, not in the commit:
- `localMakerDir()` / `readAvatarSetMakerFile()` in `avatarSetMakerInput.ts`: they read `LOCAL_AVATAR_SET_MAKER_DIR` from the environment or straight from the api `.env` file, and read maker files from that Mac folder before the bucket. Marked "LOCAL ONLY (not for commit)".
- The `headneck`, `headshape` and `collar` inputs on the `maker-input` route (they served those Mac files to the browser).
- Everything marked "LOCAL DEV ONLY": the file headers of `headNeckPlate.ts`, `neckFit.ts`, `neckFitJaw.ts` and the `fitted-plate` route, the neck-fit memory cache, and the bake on character save that used them (it was only switched on by the Mac folder).

The commit has none of these: it reads only the bucket, has no `.env` read, and turns on only when the set's head shape file is in the bucket. Two things to know before staging, both kept on purpose in the commit:
- The neck-fit work per set and per avatar is kept in memory for the life of the server process and is never let go (it grows with each new avatar and mix). A failed load is not kept.
- The `fitted-plate` route keeps its last 240 answers in memory.

**Left out on purpose (Mac-only edits in the same NEW api checkout):** `src/lib/server/cdnUrls.ts` (dev CDN relay) and `src/lib/server/tts/forwardSpeakAnimated.ts` (local speech). The voice-speed edit in the same checkout is in `../api-voice-speed`.

**How to use it.**
```
cd api.liforma.ai && git switch -c Saizal-neck-fit origin/main
git am /path/to/unmerged-product-changes/api-neck-fit/0001-Neck-fit-for-ethnicity-outfit-plates-catalogue-outfi.patch
npx vitest run src/lib/server/catalog
```
The Studio side is `../app-neck-fit-preview`.

**Left on the Mac.** Branch `Saizal-neck-fit` in worktree `~/Desktop/Liforma_LTD/worktrees/api-neck-fit` (clean, nothing uncommitted). The 28 Oct version, uncommitted, in `~/Desktop/Liforma_LTD/NEW/liforma/api.liforma.ai`. The 157 input files in `~/Desktop/Liforma_LTD/NEW/liforma/.local-dev/avatar-set-maker/`. Test pictures and sheets: `~/Desktop/Liforma_LTD/high_neck_outfits_2026-10-27/` (818 MB, 1,071 files, 1,022 pictures; outfits area).
