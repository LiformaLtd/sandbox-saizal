# Wizard suggestions (Nov 2026)

**What you would see.** The new-avatar wizard suggests up to three public sets and labelled outfits that fit the brief,
and opens the right step with the suggestion already filled in. Built for the 11 Nov demo. Plan and AI test notes are in
`api/notes/`.

**Status.** Unfinished, local only. Three review fixes have not been tried with the real AI yet.

## How to use

Each `api/` or `app/` folder holds patch files made from the local branch, plus a README that says which repo, which base and which branch. To try one: in a clean checkout of that repo, `git am <folder>/*.patch` (or `git apply` for the single `.patch` files that are not numbered). Nothing here runs on its own. Links that start with `../` in the inner READMEs point to the layout of the team sandbox (`LiformaLtd/sandbox`), so some of them do not open here.
