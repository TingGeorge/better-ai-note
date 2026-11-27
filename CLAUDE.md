# Invic (AI note app)

Read `docs/handoff.md` first: it says what is done, what is next, and what cannot be verified outside the owner's Mac. The design is in `docs/architecture.html`, `docs/backend-architecture.html` and `docs/AI筆記App_技術架構.md`.

## Layout

- `mac/` Swift AppKit shell and the canvas MCP server (`excalidraw-mcp`). Builds on macOS only.
- `web/` React + Excalidraw page shown in the app's WKWebView.
- `server/` Bun server that will run the Claude Agent SDK; bundled into the app later.
- `scripts/build-app.sh` builds `build/Invic.app` (macOS only).

## UI must follow the Figma design

- The final design is in Figma: <https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1> (page `App`, 22 screens plus components and design variables). Build every screen to match it: layout, spacing, colours, text, states.
- If you cannot open Figma, use `docs/images/` and the "畫面" section of `docs/architecture.html`. These cover only part of the design.
- Do not invent UI. If a screen or state you need is not visible to you, stop and ask the owner for it (a Figma export or access) instead of guessing.
- When you report UI work, say which screens you compared against the design and which you could not.

## Checks

- `cd server && bun test && bun run typecheck`
- `cd web && npm ci && npm run build && npm run typecheck && npm test` (`npm test` needs Chromium: `npx playwright-core install chromium-headless-shell`, or set `PW_CHROMIUM`)
- `cd mac && swift build` and `scripts/build-app.sh` (macOS)
- Never run `web/test/*-mac*` or `mouse.swift` on a person's Mac: they send keys and clicks to the frontmost app. CI runners only.

## Rules

- Reply to the owner in Traditional Chinese. Show ideas as pictures first; keep text short.
- Minimum code that works. No speculative features, abstractions or new dependencies. Mark intentional shortcuts with a `ponytail:` comment that names the ceiling.
- Each module folder has one main file `index.ts`; other files are helpers used only inside that module; other modules import only the main file.
- Functions ordered top-down (caller before callee), early returns, always braces, one statement per line, comments say why.
- Bun-native APIs (`Bun.env`, `Bun.file`, `Bun.serve`) and `bun:test` in `server/`.
- Surgical changes: do not refactor or reformat code you were not asked to change.
- Non-trivial logic leaves one small runnable test behind.
- Outdated documents move to `docs/archive/`; keep what is still valid in the current docs.
- Say plainly what was not verified. Do not report something as passing unless it was run.
- Never touch the original Excalidraw app (`/Applications/Excalidraw.app`, process `Excalidraw`, `~/Library/Application Support/Excalidraw/`).
- Ask before deleting anything that is not a tracked file removed with `git rm`.
- Commit messages are in English and say what changed and why.
