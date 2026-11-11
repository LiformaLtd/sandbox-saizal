# sandbox-saizal

Saizal's starting point for personal Liforma code experiments. This is a public, collaborative repository: every Liforma developer is welcome to check out, modify and contribute to any project here. The name indicates an initial curator, not exclusive ownership.

Keep each experiment/application in its own top-level folder, with a README describing its purpose, setup, environment variables and run commands. Dependencies and ports belong to each application; there is no shared root application or deployment. Use an `.env.example` for required configuration and keep real credentials and private assets out of this public repository.

Shared team experiments belong in [LiformaLtd/sandbox](https://github.com/LiformaLtd/sandbox), which lives at `sandboxes/sandbox` in the Liforma workspace. This repository lives at `sandboxes/sandbox-saizal` and can also be cloned independently.

Use an isolated Git worktree for each implementing agent/task. Multiple agents must not share a checkout, switch another agent's branch or share writable dependencies. Coordinate development ports and use branches/PRs for contributions.

## What is here (Saizal, Oct - Nov 2026)

Work that is not on staging or production yet. Each folder has a README with what you would see, its status and how to use it.

| Folder | What it is |
| --- | --- |
| [`avatar-maker-page/`](./avatar-maker-page/) | Local page (port 3055) for testing a robust new-avatar pipeline: pick a model per picture, every answer is checked, failed checks are re-tried by themselves; with the build guide |
| [`neck-fit/`](./neck-fit/) | Neck fit for high-neck race outfits (api + Studio) |
| [`african-jaw-notch/`](./african-jaw-notch/) | No dent at the jaw corners on African avatars (api + Studio) |
| [`wizard-suggestions/`](./wizard-suggestions/) | New-avatar wizard suggests sets and outfits (api + Studio), unfinished |
| [`african-lineup-check/`](./african-lineup-check/) | African outfit pictures must line up with the body; outfit labels; one model setting (api), unfinished |
| [`costume-keep-hair/`](./costume-keep-hair/) | Costumes keep the avatar's hair after the face paste (api + Studio), unfinished |
| [`studio-stage-blinks/`](./studio-stage-blinks/) | No flicker on the character page when changing hair or clothes (Studio), old and unfinished |
| [`small-local-bits/`](./small-local-bits/) | Eye corner layer, blue hair colour, Japanese/Chinese styles, image-lerp upgrades |

