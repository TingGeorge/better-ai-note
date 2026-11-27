# Invic (AI note app)

Read `docs/handoff.md` first: it says what is done, what is next, and what cannot be verified outside the owner's Mac. The design is in `docs/architecture.html`, `docs/backend-architecture.html` and `docs/AI筆記App_技術架構.md`.

## Layout

- `mac/` Swift AppKit shell, kept thin: window, menus, open/save, starting the server, recording. Also the old Swift canvas MCP server (`excalidraw-mcp`); the app's own AI will use the TypeScript one in `server/` instead. Builds on macOS only.
- `web/` React page shown in the app's WKWebView: the Excalidraw canvas and every screen around it (home, sidebar, title bar, status bar, settings, Setup check). Do not build new screens in AppKit.
- `server/` Bun server that will run the Claude Agent SDK and the canvas MCP tools (in-process, TypeScript); bundled into the app later.
- `scripts/build-app.sh` builds `build/Invic.app` (macOS only).

## UI must follow the Figma design

- The final design is in Figma: <https://www.figma.com/design/5DfsHafSo4iqhnIUUlmVWN/Untitled?node-id=0-1> (page `App`, 22 screens plus components and design variables). Build every screen to match it: layout, spacing, colours, text, states.
- If you cannot open Figma, use `docs/images/` and the "畫面" section of `docs/architecture.html`. These cover only part of the design.
- Do not invent UI. If a screen or state you need is not visible to you, stop and ask the owner for it (a Figma export or access) instead of guessing.
- When you report UI work, say which screens you compared against the design and which you could not.

## How the owner wants the work split

- The main session discusses and plans with the owner; it does not write the implementation itself.
- Match the model to the task; not everything needs Opus.
- Coding that needs real logic: a subagent on Opus, effort high.
- Simple tasks (small edits, renames, mechanical changes): a subagent on Sonnet.
- Writing tests: Opus, effort high or medium; simple tests: Sonnet.
- Review of each finished part: a separate subagent on Opus, effort xhigh. Give it the code, not your conclusion. Fix what it finds, then commit once for that part, before the next part.
- Other work: pick whatever subagent fits (pages: Opus, effort medium; Figma work: only when the owner asks for it, with the model they name, otherwise Opus or Sonnet).
- When tasks are different in nature and independent, run several subagents in parallel. Two writers never touch the same files; work that depends on another result waits.
- If your environment cannot set a subagent's model or effort, say so to the owner instead of silently using something else.

## The backend follows the owner's design

- Build `server/` the way `docs/backend-architecture.html` and `docs/handoff.md` describe it. The owner cares most about the backend design and reviews it in detail.
- When an approach marked untested turns out not to work: first look for a way yourself (search the web for how others solved it, try alternatives).
- A fix that only changes frontend code: go ahead, and record it in the handoff.
- A fix that would conflict with the backend design, or no fix at all: stop and ask the owner. Do not drift far from the architecture documents.

## Checks

- `cd server && bun test && bun run typecheck`
- `cd web && bun install --frozen-lockfile && bun run build && bun run typecheck && bun run test` (Node ^20.19 or >=22.12 must be on PATH: the build and tests run on Node, and without it `bun run` silently uses Bun instead and the tests fail. `bun run test` needs Chromium: `bunx playwright-core install chromium-headless-shell`, or set `PW_CHROMIUM`)
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
