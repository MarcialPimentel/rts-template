# RTS Template

A minimal two-player online RTS for the browser, written in TypeScript, meant to be copied as the starting point for future RTS games.

The proof-of-concept game is deliberately tiny (one Town Hall, one Barracks, one Soldier). What it proves is the hard part: two people in different places playing the same match in their browsers, with a server-authoritative simulation and responsive controls.

Work is tracked in [milestones](../../milestones) M1 to M5.

## Read this first

- **[docs/GDD.md](docs/GDD.md)** is the game design document and the source of truth. It defines the architecture rules (marked MUST/SHOULD), the command and network protocols, the folder layout, and the milestones.
- **[CLAUDE.md](CLAUDE.md)** is the short version for AI coding sessions.

## How it works

- Clients send **commands** (move, attack, train…) over secure WebSockets.
- A Node **server** validates them and runs the only real simulation at 20 ticks per second.
- The server sends **snapshots** of the world back; clients interpolate and draw them on a Canvas.
- The simulation, commands, protocol and game data live in `shared/`, imported by both client and server.

## Running it locally

```
npm ci
npm run dev
```

Then open http://localhost:5173 in two browser tabs: create a room in one, join with the code in the other. Add `?sandbox` to the URL to play both sides offline on one screen.

## Starting a new game from this template

1. Copy this repo (GitHub "Use this template" or a fresh clone).
2. Keep every section of `docs/GDD.md` marked *Core*.
3. Rewrite the *Game layer* section: your units, buildings, map and win condition.
4. Replace the definitions in `shared/data/`.
5. Record any change to a Core rule in the GDD's Decision log.

When starting an AI session on a new game, point it at this repo and `docs/GDD.md`.

## Stack

| Piece | Choice |
| --- | --- |
| Language | TypeScript (strict), Node 22 |
| Client | Canvas 2D, bundled with Vite, hosted as a Render static site |
| Server | Node with `ws`, hosted as a Render free web service (Dockerfile included for other hosts) |
| Tests | Vitest, run in GitHub Actions |
