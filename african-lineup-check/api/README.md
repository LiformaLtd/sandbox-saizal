# api: African line-up check, labels for new set outfits, one image-model setting

**What it is.** Three outfit pipeline changes that were parked on 9 Nov and built on 10 Nov (5 commits, branch `Saizal-african-lineup-check`).

**When.** 10 Nov 2026.

**What it does, by commit**
1. `15b755a` **Line-up check.** The 14 Oct Python check (`outfit_lineup/build.py`) now runs in the api on every African try of a race outfit, after the size, cut-out and head checks (`clothesGeneration/plateLineUp.ts`). It fails when clothes or skin below the neck moved more than 10 px (`IMAGE_EDIT_NOT_LINED_UP`); the same model draws again. When no try is left, the try that moved least is kept and the log says so (`clothes.lineup kept closest`).
2. `ae95b5c` **Labels for new avatar-set outfits** (`catalog/setOutfitLabels.ts`). The European row gets two AI reads (name + picture, 10 s each); the African row and the race plates copy its labels. The name is cleaned by the word list. Failed reads log `clothes.labels failed`.
3. `1ad17f8` **One setting picks the image models** (`imageProviders/imageModelChoice.ts`): `IMAGE_MODELS_CLOTHES` = a comma list, first choice first. Unset = the code list (4 GPT Image models, then Krea 2). Krea 2 only last or alone. Each job keeps its own list. A wrong value stops the job start (`IMAGE_MODELS_SETTING_INVALID`).
4. `3d6c278` A brand is taken out of a saved outfit name without the image model's "no logos" note.
5. `826ecaa` A closest picture that cannot be read back fails the step instead of ending the poll.

**What happened.** The api line-up check gives the same numbers and boxes as the Python check on all 102 old pairs (3 fail), about 65 ms a pair. Full suite: 3,164 tests pass. Nothing run end to end, and no paid picture made.

**Not built.** The same model setting for backdrops (`IMAGE_MODELS_BACKDROPS`): it needs a new database column and a paid test; Saizal was asked, no answer recorded. Name clean-up misses names the word list does not hold.

**Status.** Unfinished: committed locally, not pushed.

**Today's main.** Base `955a41c` = today's main; applies as is. Merges cleanly with `../api-african-jaw-trim` and with the neck fit commit in `../api-neck-fit`.

**Checked again 11 Nov.** The 5 patches are the same as the branch tip `826ecaa`; the worktree has nothing uncommitted.

**Environment.** Optional `IMAGE_MODELS_CLOTHES` (added to `.env.example`).

**How to use it.** `git am *.patch` on a branch from main; `npx vitest run src/lib/server/clothesGeneration src/lib/server/imageProviders src/lib/server/catalog`.

**Left on the Mac.** Worktree `~/Desktop/Liforma_LTD/worktrees/api-lineup-check` (its node_modules is a link to another worktree's).

## Related in this sandbox

- **Background.** Why a pixel line-up check and not body points: `../../avatar-outfits/checks-2026-11/body-points-check-2026-11-10/`. The plan these commits came from (line-up check, labels, one model setting): `../../avatar-outfits/checks-2026-11/model-switch-plan-2026-11-10/`.
