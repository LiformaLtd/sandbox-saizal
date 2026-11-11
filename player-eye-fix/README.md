# Player eye fix: race avatars' eyes at full size

The player draws every avatar's inner-eye picture at 90 % (`DEFAULT_IRIS_SCALE_MULTIPLIER = 0.9`). That 0.9 shrinks
the whole eye picture, not just the iris. Our race avatars' eyelid dots sit on the painted eye's edge, so their
eyes came out 15–21 % smaller than painted.

This change draws the eye picture at full size (1.0) for the avatars listed in `FULL_SIZE_EYE_AVATARS`
(`src/lib/runtime/face-session/FaceSessionView.ts`, `getIrisScale`). Every other avatar keeps 0.9, including the live ones.

- `full-size-eye-avatars.patch` is the commit as made in `player.liforma.ai`.
  - It is commit `66d57a0` on that repo's `Saizal` branch, on top of `main` at `68ece50`.
  - To apply it: `git am` it, or `git apply` it, in `player.liforma.ai`.
- Pull request into the player's `main`: https://github.com/LiformaLtd/player.liforma.ai/pull/2

## Avatars in the list

- The 20 GPT-low race avatars: 10 women and 10 men.
- 5 older race test packs: `d9048f3b`, `5a5a0001`, `ae5a0001`, `9298d617`, `3e621eb8`.

## Checked

- Eye area drawn vs painted, on the South Asian woman (`5a5a0001`):
  - at 0.9 it was −15 % / −21 % (left / right);
  - at 1.0 it is +1 % / −3 %.
- In the player repo: `npm run check` gave 0 errors, eslint is clean, 1,342 tests pass, and code-health passes.
