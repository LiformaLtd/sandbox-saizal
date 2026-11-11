# Studio stage: no blinks when changing hair or clothes (23 Oct 2026)

**What you would see.** The character page stops flickering four times when you change hair or clothes.

**Status.** Unfinished and old. A rebase on 23 Oct clashed with Nishit's v2 puppet preview and Charles's saved-character
preview, and was stopped for Saizal to decide. Main later got app PRs #64 and #68, which may cover part of this; not
checked line by line.

## How to use

Each `api/` or `app/` folder holds patch files made from the local branch, plus a README that says which repo, which base and which branch. To try one: in a clean checkout of that repo, `git am <folder>/*.patch` (or `git apply` for the single `.patch` files that are not numbered). Nothing here runs on its own. Links that start with `../` in the inner READMEs point to the layout of the team sandbox (`LiformaLtd/sandbox`), so some of them do not open here.
