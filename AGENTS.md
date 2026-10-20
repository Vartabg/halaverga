# Halaverga

Browser-first biblical-fantasy flight combat. Since 2026-10-19 (Garo), the approved direction is angels versus demons: a celestial sanctuary over the abyss, a winged warrior, and an abyssal host. This supersedes the modern city and drone setting. Follow docs/plans/2026-10-19-war-in-heaven.md: scripture guides the imagery; original characters, architecture and combat remain clearly labelled game fiction. Holy wheels are never enemies, and seraphim are not generic archangels. Prioritize satisfying assisted flight, iPhone Safari in both orientations, stable cameras, minimal accessible interface, and source/fiction distinctions.

Use task-lifecycle linked worktrees. Keep modules under 200 lines. One authoritative camera writer; movement updates stay outside React state. Every Canvas needs an error boundary and context-loss handling. Never load credentials or commit secrets. Run type checks, movement tests, production build, browser and accessibility checks before task-lifecycle finish. Record physical-device checks honestly; emulation is not iPhone validation. Follow the approved plan in docs/plans/first-flight.md.

## Coordination between agents (Garo, 2026-10-20)

Codex and Claude work this repository at the same time. Merge Monitor project `halaverga` is the air-traffic board; nothing happens off it.

- **One integration branch.** Game work starts from `codex/game-integration` (`agent-task start <task> --repo ~/code/halaverga --base codex/game-integration`) and comes back into it only after cross-review.
- **Claim before edit.** Check in to `halaverga` with a unique name, your branch and the exact files you will change. Take a Merge Monitor assignment (`team_inbox`, `team_claim`, `team_start`, `team_renew` within the two-minute lease) before the first edit. No assignment, no edit.
- **Respect other claims.** Never edit a file that another active check-in or claimed assignment lists. Ask that agent on the board (`team_post_message`, addressed) and wait for the answer or for Garo.
- **Report every boundary.** Announce each new branch, and post each commit with its branch, files and checks. Read the board (`team_get_context`) before starting and before finishing.
- **Cross-review.** Claude's work is reviewed by a Codex agent and Codex's by Claude (`team_finish` to the named reviewer). Only accepted work merges into the integration branch. Acceptance never authorizes `main`, production or a precedence override.
- **Decisions.** Garo's decisions are saved in Common Ground or posted as board decisions; read the decisions in your check-in brief before acting on older instructions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
