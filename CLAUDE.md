# Instructions for AI sessions

This repo is an RTS template: a minimal two-player browser RTS in TypeScript (Node server, Canvas client) that future RTS games are copied from. The owner reviews pull requests and playtests; he does not write the code himself.

## Before doing anything

Read `docs/GDD.md` in full. It is the source of truth. If a request conflicts with it, say so before acting.

## Non-negotiable rules (summary of the GDD's MUST rules)

- **Server-authoritative.** Only the server changes game state. Clients send commands and draw snapshots.
- **Commands as data.** Every player action is a command object: validated by the server, applied on the next tick. AI bots, replays, tests and the local sandbox use the same commands.
- **`shared/` is pure.** No DOM, no Node-only APIs, and no imports from `client/` or `server/`. It must run in both a browser and Node.
- **Fixed tick of 50 ms** (20 per second). Data files use seconds; convert to ticks at load.
- **Content lives in `shared/data/`**, not hard-coded in systems.
- **Server URL is one config value** (`VITE_SERVER_URL`). Never hard-code it.
- **Instant input feedback** on the client, and a "waking up the server" screen instead of a silent hang.
- **Toolchain pinned**: Node version in `.nvmrc`, packages in `package-lock.json`. Upgrades get their own pull request.

## Commands

- `npm ci` — install
- `npm run dev` — server on :8080 plus client dev server on :5173
- `npm test` — Vitest (simulation and server integration tests)
- `npm run typecheck` — TypeScript strict check
- `npm run build` — client to `client/dist`, server to `server/dist`

## How to work

- One pull request per milestone issue. Reference the issue number (`Closes #N`).
- Add or update tests in `tests/` for any simulation or protocol change. `npm test` and `npm run typecheck` must pass before merging.
- If a change affects anything the GDD describes, update `docs/GDD.md` in the same pull request.
- If a task seems to require breaking a MUST rule, stop and explain why instead of working around it.

## Ship and build notes

_Read by the `ship`, `next-build` and `prod-run` skills, which keep no per-game notes of their own. Keep this section current when the deploy or build process changes._

### Shipping (merge, deploy, live check)

- **Default branch:** `main`. **Merge style:** squash.
- **Deploy:** **none.** Live deploys are retired (its Render services are suspended and it has no SiteGround secrets). "CI" (`ci.yml`) still runs typecheck, tests and build; `deploy-marz.yml` runs but skips the upload.
- **Live check:** none. Success = CI passes on the merge commit. Don't try to check marz.gg/games/rts, which belongs to another-rts now.
- **Report:** say there's nothing to playtest live; changes reach games when they pull template updates. Mention any likely merge conflicts for games built from the template (e.g. both GDDs' Decision logs).

### Planning and building the next build

- **Finished at v1.0** and no longer deploys. New work is only core fixes that games need (usually requested from a game session). There's no "next build" to plan: say so, and list any open PRs or issues instead.
