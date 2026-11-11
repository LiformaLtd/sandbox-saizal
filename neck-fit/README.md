# Neck fit for high-neck race outfits (Nov 2026)

**What you would see.** On race avatars in high-neck outfits, no gap or line where the head meets the collar. The api
fits the neck on the server; the Studio previews the same fit.

**Status.** Finished, committed on local branches on 10 Nov, never pushed, not on staging. It shows nothing new until the
api half is on staging **and** its 157 input pictures are uploaded (not done; each upload needs a yes).

## How to use

Each `api/` or `app/` folder holds patch files made from the local branch, plus a README that says which repo, which base and which branch. To try one: in a clean checkout of that repo, `git am <folder>/*.patch` (or `git apply` for the single `.patch` files that are not numbered). Nothing here runs on its own. Links that start with `../` in the inner READMEs point to the layout of the team sandbox (`LiformaLtd/sandbox`), so some of them do not open here.
