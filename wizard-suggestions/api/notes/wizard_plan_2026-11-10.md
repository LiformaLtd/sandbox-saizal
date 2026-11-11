# Wizard work plan (10 Nov 2026)

Three P0 rows from the task sheet: search results open the wizard (row 7), the wizard suggests a set (row 9), the wizard suggests clothes (row 8).
Checked against GitHub main on 10 Nov (app 03f2df7, api 8118931). Earlier plan: task_plans_2026-11-02.md sections 4-6.
Claude does the work; the user makes the decisions. Times below are Claude's working time plus waits.

## What changed since 2 Nov (Charles, 8-9 Nov)
- app #126/#127/#128: wizard steps are now character -> situation -> set -> details; new brief form (ExperienceCreationBriefForm.svelte); setup suggestions regenerate unless the author touched a field.
- api 4b1dd6f (9 Nov): the one setup AI call now also returns characterGender, characterAge, characterEthnicity, characterClothesId, characterHairId. Clothes/hair ids are chosen from the published avatars' wardrobe for that gender (bare ids only, characterWardrobeChoices.ts). The app uses the clothes id as the starting outfit if that avatar's set has it, else the white T-shirt.
- No open PRs from anyone in these areas on 10 Nov.

## A. Search results open the wizard (app only) - about 2 h
Today: a suggestion card's Generate still opens "Generating an experience from a suggestion is coming soon!" (packages/public-experience-chooser/src/ExperienceSearchSuggestions.svelte:407). The brief -> creation job -> wizard path already works from New experience.
1. Chooser: an `onGenerate(suggestion)` callback prop (the package may not import app code; same pattern as Remix); contract test.
2. Turn the card into a brief (title, who, where, goal), clamped to the 2000-character prompt limit; unit test.
3. Studio search page: per decision 1, open the brief form filled in or start the creation job; the wizard opens (?setup=...&creationJob=).
4. Hide Generate for viewers; reuse the existing retry dialog for 400/429. www signed out: link to Studio sign-in (picked as default).
5. Check on the local stack: empty search -> suggestion -> Generate -> wizard with the suggestion's content.
Done when: Generate opens the wizard with the card's content, viewers never see it, and "coming soon" is gone.

## B. Wizard suggests a set (api, then app) - about 3-4 h
Today: the AI returns setName + setDescription as free text. They only prefill "New set" (which makes a new backdrop). The set picker opens with nothing chosen; nothing matches the AI text to public sets. The api set list already filters by universe, era, domains, useCases, country, city, sides.
1. api: add set hints to the same setup AI call (no extra call): universe, era, domains, use cases as fixed taxonomy slugs, plus up to 5 place words; update the strict schema and its test.
2. api: rank public sets with those hints (label filters + word match on name/description); return 1 suggested set + up to 2 alternatives, or none.
3. app: keep the suggestion in the setup draft; per decision 2, the set step opens on it or lists it first; a public set is copied into the project only on Next; regenerate never replaces an author's own pick.
4. Read-only check of label coverage on staging's public sets; tune on 5 briefs (5 setup AI calls, a few cents).
Done when: 4 of 5 test briefs show a fitting public set, and nothing is copied before Next. The api PR merges first.

## C. Wizard suggests clothes (improve the 9 Nov pick) - about 3 h + the labels landing
Today: the AI sees only file names (e.g. business_woman_in_suit.3), only catalogue outfits, and returns one id that is silently used; an id that is not in the avatar's set falls back to the white T-shirt with no log.
0. First: outfit labels on staging. Bring our local label work (api Saizal-wardrobe-names, app Saizal-outfit-pages) up to today's main, open the PRs, then the staging SQL is pasted. Staging outfits have no labels today.
1. api: give the AI each outfit's name, role, outfit type and formality instead of bare ids; check the returned id is in the list (log it and leave it empty if not).
2. app: per decision 3, the clothes step shows "Suggested for <role>": the AI's pick plus up to 3 more ranked by the same labels, or tiles only. Clicking uses the normal selection.
3. Staging check: 4 roles x Anna, Caleb and 2 race avatars; race avatars only get outfits their set has.
Later: public collection (custom public outfits and whole costumes) in the choices.
Done when: the clothes step shows a fitting, labelled suggestion for 4 test roles on 4 avatars, and a bad id is logged, never silently swapped.

## Order
A, then B (api before app), then C. The label PRs (C0) open early because they wait on review and the staging SQL.
- Tue 10: A built and its PR opened; label branches brought up to main and their PRs opened.
- Wed 11: B api + app PRs; label SQL on staging once the label PRs are merged.
- Thu 12: C; check all three on staging.
- Fri 13: room for fixes from review.
Before touching ExperienceSetupWizard.svelte and generateExperienceSetupDetails.ts, tell Charles (he changed both on 8-9 Nov).

## Decisions (made 10 Nov)
1. Search Generate opens the brief form filled in (no AI spend until the author confirms).
2. The set step opens on the suggested set; copied into the project only on Next.
3. Clothes: keep the AI's pick as the starting outfit and add a "Suggested for <role>" row.
4. Label PRs: open them now.
Picked as default: signed-out visitors on www get a link to the Studio sign-in.

## The user's part
- Decisions: (1) search Generate opens the brief form filled in, or starts straight away; (2) set step opens on the suggestion, or lists it first; (3) clothes keeps the AI pick plus suggested tiles, or tiles only; (4) open the label PRs now.
- Yeses: each push and merge (about 7 PRs), and pasting the label SQL in the Supabase SQL Editor once.
- A look at staging at the end.

Cost: no new paid AI calls in the product (set hints and clothes labels ride in the existing setup call). Testing = a few setup generations; no image generation.

## Progress (10 Nov)
- A built and checked on a local copy of the database: app branch Saizal-search-generate (056632d), local only.
- Labels: api branch Saizal-wardrobe-labels brought up to main (6960a97) and opened as api PR #124 before the "don't push" instruction; app branch Saizal-wardrobe-labels brought up to main (901bab7), local only.
- Nothing else is pushed. Next: B (set suggestion), locally.
- api PR #124 closed later on 10 Nov at the user's request ("dont push anything"). Everything below is local only, on branch Saizal-wizard-suggestions (api worktrees/api-main-wizard, app worktrees/app-search-generate stacked on A).
- B built (api 9d6fb6d, app 569a328). The setup AI picks up to 3 public sets from a numbered list of the 329 public sets (no ranking code; public sets have almost no use-case labels). Set step opens on the first, "Or:" swaps the others, copied into the project only on Next. Checked on the database copy: Back copies nothing, Next copies once (project sets 50 -> 51 -> 52), the experience points at the project copy, a second Next does not copy again. The wizard file grew past its size limit; rules moved into experienceSetupWizard.ts + SuggestedSetChoices.svelte and the baseline raised to 2049 with a dated reason.
- C built (api 8c3ed28, app 12acc95). The AI now sees each outfit as "id: name (role; outfit; formality)" from the public catalogue rows and returns up to 3 more ids; every id is checked against that gender's list (unknown = logged + dropped). Studio lists the pick + suggestions first in Clothes, captioned "Suggested for <role>"; a pick the avatar lacks starts in the white T-shirt with a console warning. Database copy: 41/75 women's and 64/64 men's outfits have rows with labels; the numbered women's outfits (business_woman_in_suit.N) have no row. Prompt grows ~8.9k characters (~2.2k tokens).
- Not checked: real AI answers (no OpenRouter key in the local api), so "4 of 5 briefs get a fitting set" and "fitting outfit for 4 roles on 4 avatars" are untested. Staging has no outfit labels yet, so there the AI would see names only until the label work lands.
- Seen in passing: the setup call also sends 832 women's + 635 men's hair ids (~45k characters, ~11k tokens per call), already on main.
- Real AI test, 10 Nov evening (13 calls, $0.215, user's personal OpenRouter key, removed from the api .env afterwards). Full table and screenshots: notes/wizard_ai_test_2026-11-10/README.md.
  - Sets fit all 6 briefs that have a matching place (hotel, GP, interview, café, airport).
  - Outfit picks fit every role once the two outfit bugs were fixed in api 6a55ca6: a whole line copied as the id, and a list that didn't match the Studio's avatar set list.
  - Still open: when no fitting set exists (police roadside), the AI can still offer another world's set. A server world check is the option; it needs a decision.
- World check added (user said yes): api ac90066. The AI names the brief's universe from the platform labels, and the server keeps only sets in it (drops logged). Unlabelled sets are not offered.
  - 5 real calls ($0.085): police → modern only, mechanic → none, hotel → hotel lobby, dwarf blacksmith → fantasy, 1940s radio operator → 1940s. No set needed dropping.
  - Details are in the README above.
- Review and fixes, 10 Nov night (local commits on Saizal-wizard-suggestions, not pushed: api 4808e03, app e2aa157).
  - Sets: each public set now carries the side of the desk its view is drawn from (the reviewed who-stands-where record on its backdrop: 14 customer-side, 7 staff-side, 102 both, 206 with no record). One-sided lines say so, the AI names the participant's side, and the server drops and logs a set from the other side. Yesterday's airport answer (behind desk, in front of desk, behind service counter) now keeps only "Standing In Front Of Desk".
  - Hair: one id per style and colour is sent (873 -> 106 women's, 665 -> 116 men's), the returned hair id is checked on the server, and the Studio puts on the chosen ethnicity's own copy. The whole request is 45% smaller (106.6k -> 58.8k characters). Hair ids a look can wear: women 92 of 873 before, about 91 of 106 now.
  - Outfits: an outfit name used on both bodies is now described from its own body (women's teacher = "School Teacher Cardigan", not the men's "Shirt Tie").
  - Checked live and left alone: saved race outfits already get the "Suggested" caption.
  - Tests: api 3062 pass; Studio 1562 pass plus the same 3 that fail on clean main.
  - Not checked with real AI answers yet (about 10 calls, ~17 cents).
  - Still open from the review: 34 of 75 women's outfits have no name or labels (no database row); main has no role / outfit type / formality sections until the label work lands; "historical" is one world for 13 periods; no fantasy or period clothes.

