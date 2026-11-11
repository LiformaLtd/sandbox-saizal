# Keep the hair when a face is pasted onto a costume (Nov 2026)

**What you would see.** A costume keeps the avatar's hair after the face paste, instead of losing it. Server bake in
`api/`, Studio maker in `app/`.

**Status.** Unfinished: works locally on one men's pair, never committed or pushed.

## How to use

Each `api/` or `app/` folder holds patch files made from the local branch, plus a README that says which repo, which base and which branch. To try one: in a clean checkout of that repo, `git am <folder>/*.patch` (or `git apply` for the single `.patch` files that are not numbered). Nothing here runs on its own. Links that start with `../` in the inner READMEs point to the layout of the team sandbox (`LiformaLtd/sandbox`), so some of them do not open here.
