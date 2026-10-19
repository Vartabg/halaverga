# Halaverga

Browser-first biblical-fantasy flight combat. Since 2026-10-19 (Garo), the approved direction is angels versus demons: a celestial sanctuary over the abyss, a winged warrior, and an abyssal host. This supersedes the modern city and drone setting. Follow docs/plans/2026-10-19-war-in-heaven.md: scripture guides the imagery; original characters, architecture and combat remain clearly labelled game fiction. Holy wheels are never enemies, and seraphim are not generic archangels. Prioritize satisfying assisted flight, iPhone Safari in both orientations, stable cameras, minimal accessible interface, and source/fiction distinctions.

Use task-lifecycle linked worktrees. Keep modules under 200 lines. One authoritative camera writer; movement updates stay outside React state. Every Canvas needs an error boundary and context-loss handling. Never load credentials or commit secrets. Run type checks, movement tests, production build, browser and accessibility checks before task-lifecycle finish. Record physical-device checks honestly; emulation is not iPhone validation. Follow the approved plan in docs/plans/first-flight.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
