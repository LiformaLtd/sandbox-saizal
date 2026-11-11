# Line-up check for African outfits (Nov 2026)

**What you would see.** A new African outfit picture is only accepted when it lines up with the body; new set outfits
are saved with labels; one setting picks the image models for clothes and costumes.

**Status.** Unfinished: committed locally (5 patches), never pushed. The backdrop switch is not built.

## How to use

Each `api/` or `app/` folder holds patch files made from the local branch, plus a README that says which repo, which base and which branch. To try one: in a clean checkout of that repo, `git am <folder>/*.patch` (or `git apply` for the single `.patch` files that are not numbered). Nothing here runs on its own. Links that start with `../` in the inner READMEs point to the layout of the team sandbox (`LiformaLtd/sandbox`), so some of them do not open here.
