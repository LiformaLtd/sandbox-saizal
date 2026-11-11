# African jaw notch fix (Nov 2026)

**What you would see.** No small dent at the jaw corners on African avatars when the face is joined onto the outfit, in
both the server bake (`api/`) and the Studio's own maker (`app/`).

**Status.** Finished, committed locally on 10 Nov, never pushed, not on staging.

## How to use

Each `api/` or `app/` folder holds patch files made from the local branch, plus a README that says which repo, which base and which branch. To try one: in a clean checkout of that repo, `git am <folder>/*.patch` (or `git apply` for the single `.patch` files that are not numbered). Nothing here runs on its own. Links that start with `../` in the inner READMEs point to the layout of the team sandbox (`LiformaLtd/sandbox`), so some of them do not open here.
