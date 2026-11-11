# app (Studio): keep a costume's hair when the face is pasted (browser maker)

**What it is.** Whole costumes are drawn with hair for European and African. For the other ethnicities the bald face picture was pasted on top and covered the hair. The fix keeps the costume's own garment shape (it differs from the bald white-tee picture, is not skin, is a piece of at least 2000 px, and both end pictures line up), with a 1 px soft edge, on top of the face. It also fixes a dark/red band across the chin on costumes (that band was already on main): only the outline fades now, and the colour stays the join's where the face picture is solid.

**When.** 10 Nov 2026. Uncommitted, branch `Saizal-costume-keep-hair` (from main).

**Question.** Saizal: costumes lose their hair on the other ethnicities.

**What happened.** Tested on the only stored costume with hair (men, `black_jumpsuit_pretty_glittery`): hair kept for South Asian, East Asian and Middle Eastern. About 0.4 s per picture, no model. Not tested: women, long hair, hats (none stored); only 1024 px pictures, not the 512 px browser preview. The African step prompt still says "bald head" for costumes. Before/after sheets: `~/Desktop/Liforma_LTD/notes/costume_hair_2026-11-10/` (4 pictures, 4.3 MB: compare.png, zoom.png, chin_fix.png, chin_fix_full.png; not copied).

**Status.** Unfinished: built and tested locally, not committed, not pushed.

**This half.** `src/lib/avatarSetClothes/ethnicityPlateMaker.ts` + `ethnicityPlateCostumeJoin.test.ts`. The server half is `../api-costume-keep-hair`.

**Today's main.** `git apply --check` passes on `0d54e77`. It does not apply on top of `../app-african-jaw-trim` (same join code): one needs a hand merge. It applies on top of the neck fit commit in `../app-neck-fit-preview`.

**Checked again 11 Nov.** The worktree still holds exactly this patch (no change since it was taken on 10 Nov; its files were last changed 10 Nov, 21:33-21:36). Main has not moved since (`0d54e77`).

**How to use it.** `git apply app-costume-keep-hair.patch` on a branch from main; `npm test`.

**Left on the Mac.** Worktree `~/Desktop/Liforma_LTD/worktrees/app-costume-hair`.
