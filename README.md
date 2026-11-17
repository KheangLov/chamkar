# Chamkar (ចំការ)

A farm time-management game set in a Khmer village: water the grass, raise chickens, ducks and cows,
turn their eggs and milk into cakes, salted eggs, yogurt and desserts, and send the tuk-tuk to market
to fill each order. **150 levels in six worlds**, from the village to the Water Festival, with a short
story between worlds and cheeky monkeys to chase off. All the art is drawn in code from the game's own
vector sprites.

- **Khmer and English**: Khmer by default, with Khmer digits.
- **Made for phones**: tap the pen to water grass, tap goods to collect them, tap workshops to make
  things, tap the tuk-tuk or the barn to load it for market. Keyboard: 1–3 buy animals, M market,
  Space pause.
- **Stars for speed**: finish an order within the three-star time, or the two-star time. There is no
  losing: every level can be finished, and if you're ever left with nothing, Ta gives you a chicken.
- **Saved on the device**: progress, best times and settings stay in the browser (localStorage).
- **Installable and offline**: once opened, it plays with no connection.
- **Plays inside the [gaming gateway](https://github.com/KheangLov/gaming-gateway)**, loaded with
  Module Federation (`modules/gateway-remote/`, the same folder as in the other games).

Built with Nuxt 4, Nuxt UI and [Motion for Vue](https://motion.dev/docs/vue) for interface animation,
on the same base as [garden-guard](https://github.com/KheangLov/garden-guard).

## How it's built

- **The rules are separate from the drawing** (`shared/game/engine.ts`): a plain TypeScript engine,
  stepped at a fixed 60 steps a second, emits events (goods dropped and collected, the tuk-tuk back,
  monkeys chased off) that drive the effects, sounds and top bar. Deterministic, so tests play whole
  levels.
- **The farm is one canvas** (`app/game/renderer.ts`): each sprite is drawn once per screen size into a
  bitmap and copied each frame; the yard, fence and decorations are one cached bitmap; particles live
  in a fixed pool; the canvas has no alpha channel and a pixel budget.
- **Vue stays out of the frame loop**: the top bar's values update only when they change.
- **Sound and music are synthesised** with Web Audio: no audio files to download.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm lint` / `pnpm lint:fix` | ESLint (includes code style) |
| `pnpm typecheck` | Type-check the app and the unit tests |
| `pnpm test` | Unit tests (`test/unit`: levels, engine, a simple player that plays all 150 levels, star times) and Nuxt tests (`test/nuxt`) |
| `pnpm par` | Plays every level with the simple player and writes the star times (`shared/game/par.ts`) |
| `pnpm build` | Production build (Cloudflare Workers; Vercel's preset on Vercel) |
| `pnpm build:federation` | The gaming gateway's remote (`/mf/remoteEntry.js`), copied into the site's build |
| `pnpm run deploy` | Build both and deploy to Cloudflare |
| `pnpm layout [base URL] [folder]` | Screenshots at four screen sizes in both languages, failing on sideways scrolling or a board that doesn't fit |
| `pnpm icons [chromium]` | Regenerate the PNG icons from `public/icon.svg` |

## Project layout

```
shared/game/      The game: goods, animals and workshops (data.ts), the 150 levels (levels.ts), star times
                  (par.ts), sprites, the story, the engine
app/game/         The canvas renderer and the synthesised audio
app/pages/        Home, levels (/map), and a level (/play/<n>)
app/components/   Story scenes, the board, market panel, briefing and result, settings
app/stores/       Progress and settings, saved in localStorage
modules/          gateway-remote: the gaming gateway's Module Federation remote
test/             unit/ and nuxt/ tests (test/unit/helpers/autoplay.ts is the simple player)
```

## Levels and balance

Levels are generated from their number with a seeded random generator (`shared/game/levels.ts`), so
they're the same everywhere. Each world opens with levels that teach what it brings (a new animal or
workshop, monkeys, the dry season, the festival), has rush levels at its 10th and 20th (start rich,
finish fast), a monkey raid at its 15th and a festival order at its 25th. Tuning numbers are in
`shared/game/data.ts`. The star times are half again as long as the simple player takes; after changing
levels or numbers, run `pnpm par` to remake them, then `pnpm test` (the simple player must still finish
every level).

## Deploying

- **Vercel**: import the repository; `vercel.json` builds the site and the gateway remote.
- **Cloudflare Workers**: `pnpm run deploy`, or push to `main` with the `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` secrets set.

Then set the game's `siteUrl` in the gateway's registry entry (`chamkar` in `app/games/registry.ts`) to
the deployed address.

## Credits

- Fonts: [Kantumruy Pro](https://fonts.google.com/specimen/Kantumruy+Pro) and [Koulen](https://fonts.google.com/specimen/Koulen) (SIL Open Font License 1.1), bundled via Fontsource
- Icons: [Lucide](https://lucide.dev) (ISC License)
- An original game in the farm time-management genre; all characters, art, names and story are its own.
