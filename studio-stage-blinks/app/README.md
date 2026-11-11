# app (Studio): change hair on the stage without reloading the outfit

**What it is.** When you change hair on the Studio character stage, only the hair picture is swapped. The outfit is not reloaded, and the picture does not blink.

**When.** 22 Oct 2026 (6 commits).

**Question.** Can a hair or colour change look instant, with no blank frame?

**What it does, by commit**
1. `fd558bf` Changing the hair swaps it once, without reloading the outfit.
2. `4464d9e` No blink: the new clothes + hair pair is decoded off screen; the last drawn look stays until the new one is loaded (at most 4 s).
3. `30cf355` Change Hair dialog: a colour change re-colours each tile once.
4. `9ce203b` Change Clothes with Show hair: tiles use the 256 px hair picture, the full-screen preview keeps 1024.
5. `1c03266` Changing clothes keeps the stage look while the new outfit is fitted; pointing at a tile starts the fitting.
6. `80b2f05` Accessibility fix for the pointing hint.

**What happened.** Checked in the local Studio frame by frame (bald -> hair, hair -> hair, hair -> bald, bald -> hair): every frame showed a loaded picture, never blank; each change was one swap after 0.1-0.3 s.

**Status.** Unfinished and stale. Never pushed. A rebase tried on 23 Oct conflicted with Nishit's v2 puppet preview and Charles's saved-character preview changes, and was stopped so Saizal could decide.

**Base and today's main.** Base `ae6b066`. Main is now 181 commits ahead. Merging conflicts in 8 files: `ExperiencePreview.svelte`, `HairContactShadow.svelte`, `AppearanceIdPicker.svelte`, `HairStylePicker.svelte`, `hairStyles.ts`, `characterEthnicityTryOn.svelte.ts`, `characterPlateHair.svelte.ts`, `characters/[charId]/+page.svelte`. It would need to be redone on main rather than applied.

**How to look at it.** `git am` onto `ae6b066`:
```
cd app.liforma.ai && git switch -c hair-swap-test ae6b066
git am /path/to/unmerged-product-changes/app-stage-hair-swap/*.patch
```

**Left on the Mac.** Branch `Saizal-stage-hair-swap` (the NEW app checkout `~/Desktop/Liforma_LTD/NEW/liforma/app.liforma.ai` is on it, with other uncommitted work on top; see `../app-neck-fit-preview` and `../app-avatar-lab-page`).
