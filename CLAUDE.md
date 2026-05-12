# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # typecheck + start Electron app
npm run typecheck    # run both typecheck:node and typecheck:web
npm run lint         # ESLint with auto-fix
npm run format       # Prettier formatting
npm run test         # run Vitest tests
npm run package      # build distributable
```

Run a single test file:
```bash
npx vitest run src/main/utils/gameHelper.test.ts
```

Requires a `.env` file — copy from `.env.example` and fill in the Supabase and socket server values.

## Architecture

This is a customized fork of ChatGuessr — an Electron app that injects a Vue 3 UI overlay into the GeoGuessr website, adding Twitch chat integration, multiplayer coordination via socket.io, and custom game modes.

### Electron Process Boundaries

**Main process** (`src/main/`): All game logic lives here. `GameHandler.ts` is the core orchestrator — it handles Twitch chat commands, communicates with the socket server, manages round/game state, and writes to SQLite via `Database.ts`. `useSettings.ts` manages 60+ user-configurable options persisted via electron-store.

**Preload** (`src/preload/chatguessrApi.ts`): IPC bridge — exposes ~20 handlers to the renderer. All renderer↔main communication goes through this API.

**Renderer** (`src/renderer/`): Vue 3 app injected into GeoGuessr's page. `rendererApi.ts` handles incoming IPC events and updates reactive state. Components in `src/renderer/components/` render the overlay UI (scoreboard, settings, timer). `src/renderer/mods/` contains game mode plugins that manipulate the GeoGuessr DOM/map.

**Auth window** (`src/auth/`): Separate Electron window for Twitch OAuth flow via Supabase.

### Key Files

- `src/main/GameHandler.ts` — central game loop, Twitch command parsing, round management
- `src/main/utils/useSettings.ts` — all configurable settings with defaults
- `src/main/utils/gameHelper.ts` — coordinate/scoring math utilities (well-tested)
- `src/main/utils/Database.ts` — SQLite abstraction for player stats and game history
- `src/types.d.ts` — shared types: `Player`, `Location`, `RoundResult`, `GameResult`, etc.
- `forge.config.ts` — Electron Forge + Vite build config (5 entry points: main, preload, renderer, auth_preload, auth_impl)

### TypeScript Config Split

- `tsconfig.node.json` — strict config for main process code
- `tsconfig.web.json` — Vue/renderer config; path alias `@/*` → `src/renderer/*`

### Code Style

Prettier: single quotes, no semicolons, 100-char line width, no trailing commas. ESLint enforces Vue 3 + TypeScript rules.
