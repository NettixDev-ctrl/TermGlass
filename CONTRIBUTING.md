# Contributing to TermGlass

Thanks for helping out. TermGlass is a small codebase; the goal is a terminal that is genuinely functional first and beautiful second, without faking either.

## Ground rules

- **No simulated terminal behaviour.** Everything the user types goes to a real PTY. Do not add a JavaScript command parser.
- **Do not claim what you have not run.** If a change affects Windows or macOS and you could not test it there, say so in the PR and keep the *Status* table honest.
- **Keep both READMEs in sync.** `README.md` (English, the default) and `README.ru.md` (Russian) describe the same things and link to each other.
- **Keep the terminal the focus.** Prefer removing chrome over adding it: no emoji, no decorative icons, no neon, no big rounded cards. Match the surrounding CSS tokens in `src/renderer/styles/tokens.css`.
- **Keep the security model intact** (see README → *Security model*). New IPC must be a narrow, validated operation — never a generic "run this" channel. Every new channel needs: a constant in `src/shared/ipc.ts`, a payload check in `src/main/ipc.ts`, and a typed entry in `TermGlassApi` and the preload.

## Setup

```bash
npm install
npm run dev
```

You need Node.js 20+, a C++ toolchain, Python and `make` (for `node-pty`). On Arch/CachyOS: `sudo pacman -S --needed base-devel python`.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/main` | Electron main process: window, PTY manager (`pty-manager.ts`), shell detection (`shell-detect.ts` is pure and unit-tested; `shells.ts` is the catalog), settings/theme stores, IPC |
| `src/preload` | The only bridge to the renderer; bundled to a single CommonJS file for the sandbox |
| `src/shared` | Code used by more than one process. **No Node or DOM imports here** |
| `src/renderer/terminal` | xterm.js + PTY glue (`TerminalSession`, `registry`). No React |
| `src/renderer/state` | Stores, split-tree logic (`layout.ts`, pure), workspace actions, commands |
| `src/renderer/components` | React UI. Never put terminal output in React state |
| `src/renderer/styles` | CSS tokens and component styles |
| `scripts` | Dev runner, esbuild bundling, unit tests, icon and screenshot generators |
| `tests/e2e` | Playwright-driven smoke test of the built app |

## Before you open a PR

```bash
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e      # needs a display and bash + zsh + fish; launches the real app
```

If you change UI, regenerate screenshots with `node scripts/screenshots.mjs` and look at them. If you add a command, add it to `COMMANDS` in `src/shared/keybindings.ts` (the unit tests check shortcuts for duplicates and canonical form), handle it in `src/renderer/state/commands.ts`, and it will appear in the palette and the shortcut editor automatically.

## Writing code

- TypeScript strict mode, no `any`. Shared types live in `src/shared/types.ts`.
- Renderer: keep high-frequency data out of React. Use the small external stores in `src/renderer/state/store.ts` with selectors that return stable values.
- Dispose what you create (xterm instances, addons, observers, timers). `TerminalSession.dispose()` is the pattern.
- Pure logic goes in files that can be bundled and tested without Electron, and gets a case in `scripts/unit-tests.mjs`. Platform discovery takes injected dependencies (`DetectDeps`) so Windows and WSL paths can be tested on Linux.
- Anything that names an executable goes through the shell catalog by id. Never accept a path or a command string from the renderer.
- Platform differences are explicit (`process.platform` / `info.platform`), never inferred from user agents.

## Themes

Built-in themes live in `src/shared/themes.ts`. New palettes must pass `npm run test:unit` (contrast checks). Community themes are better distributed as JSON files — see `themes-examples/` and the README.

## Environment variables

| Variable | Effect |
| --- | --- |
| `TERMGLASS_USER_DATA` | Use a different settings/user-data directory (tests use a temp dir) |
| `TERMGLASS_DEV_URL` | Load the renderer from the dev server (set by `npm run dev`) |
| `TERMGLASS_E2E=1` | Expose read-only terminal handles on `window.__termglass` for the end-to-end test |

## Reporting bugs

Include your OS, desktop environment / compositor, display server (X11 or Wayland), shell, and whether the window is translucent. For rendering problems, try turning *GPU rendering* off in Settings → Terminal.
