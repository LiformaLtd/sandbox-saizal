# api: wizard suggestions (sets and outfits)

**What it is.** The api half of three "New experience" wizard changes. The setup AI now suggests up to three public sets that fit the brief, and it picks the character's outfit from a list of labelled outfits. The server checks every id the AI sends back.

**When.** 10 Nov 2026 (5 commits).

**Question.** Can the one existing setup AI call also pick a fitting set and a fitting outfit, with no extra paid call?

**What it does, by commit**
1. `9d6fb6d` Suggest up to three public sets from the experience setup step (numbered list of the 329 public sets).
2. `8c3ed28` The AI sees each outfit as "id: name (role; outfit type; formality)" and returns up to 3 more ids. Unknown ids are logged and dropped.
3. `6a55ca6` The outfit list comes from the avatar set list the Studio dresses from (75 women's, 64 men's), keyed by id.
4. `ac90066` Only sets from the brief's own universe (contemporary, historical, fantasy, science-fiction) are kept. Drops are logged.
5. `4808e03` Sets from the wrong side of the desk (staff view vs customer view) are dropped. One hair id per style and colour (women 873 -> 106, men 665 -> 116), checked on the server. Outfit names are read from their own body. The request got 45% smaller (106.6k -> 58.8k characters).

**What happened.** Real AI test on a local copy of the database, 10 Nov: 18 calls, about $0.30 in total (about 1.7 cents a call, 5.6-8.1 s each).
- Sets fitted all briefs that have a matching place (hotel, GP, job interview, cafe, airport).
- Outfit picks fitted every role after the fixes in commit 3.
- With the world check: police stop -> modern parks only, mechanic -> no set (there is no garage set), 1940s radio operator -> 1940s sets.
- Not tested with real AI answers yet: the side-of-desk rule and the new hair ids (commit 5). About 10 calls, about 17 cents.
- Still open (needs a decision): the AI picks a woman for every brief that does not say "he" (9 of 9), always age 35. Missing content: no garage set, no roadside set, no mechanic outfit.
Full tables: `notes/wizard_ai_test_2026-11-10.md` and the plan with progress: `notes/wizard_plan_2026-11-10.md` (copies of the notes on the Mac).

**Status.** Unfinished, local only. Not pushed (Saizal said "don't push" on 10 Nov). The Studio half is in `../app-wizard-suggestions`.

**Base and today's main.** Base `8118931`. GitHub main is now 9 commits ahead (`955a41c`). The branch merges with today's main with no conflicts (checked with `git merge-tree`). It also merges cleanly with `../api-wardrobe-labels`. Without the labels branch the AI sees outfit names only, because main has no role / outfit type / formality labels.

**Files touched.** `src/lib/server/platform/{generateExperienceSetupDetails,setSuggestionChoices,characterWardrobeChoices}.ts` (+ tests), `src/lib/server/places/locationPreview.ts`, `src/routes/internal/{experiences,projects}/.../setup-details/generate/+server.ts`, `projectSetupDetailsGenerationEndpoint.test.ts`.

**How to use it.**
```
cd api.liforma.ai && git switch -c Saizal-wizard-suggestions origin/main
git am /path/to/unmerged-product-changes/api-wizard-suggestions/*.patch
npx vitest run src/lib/server/platform
```
The AI call needs `OPENROUTER_API_KEY` in the api `.env` (each call is paid).

**Left on the Mac.** Branch `Saizal-wizard-suggestions` in `~/Desktop/Liforma_LTD/worktrees/api-main-wizard`. Two screenshots (about 120 KB) in `~/Desktop/Liforma_LTD/notes/wizard_ai_test_2026-11-10/`. The local test database is the Prisma dev instance `liforma-wizard-test`.
