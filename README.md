# Bloom Stack (working title)

An idle-arcade flower farm with a one-tap side mode, built for **YouTube Playables**, **CrazyGames** and the web.
Mobile (Capacitor) comes later. It is made with Three.js and free CC0 KayKit assets, in vanilla ES modules with
no bundler.

- **Farm mode** (the loop from the Gardenscapes ad):
  - Drag anywhere to walk. Mowing tulips stacks them sky-high on your back.
  - Drop them at the florist. Bouquets ride the belt to the counter, customers buy them, and coins pile up.
  - Walk over the coins to collect them, then spend them on unlock pads: the upgrade stand ($50), a second field
    ($200), the rose greenhouse ($1500) and the peony greenhouse ($2000).
- **Flower Tower** (the Flappy-style hook): stack flower beds with one tap, in the style of Ketchapp's *Stack*.
  Perfect drops build a combo, and the height pays cash back into the farm.
- **100 levels** on a Candy Crush-style map. This is the TikTok-style "Level 1 → Level 100" core loop, mixing
  two kinds of level:
  - **Farm levels:** mow a field shaped like a heart, star, ring and so on, before the timer runs out. Colour
    patterns turn each field into a picture.
  - **Tower levels:** build to a target height, with hearts and twists.
  - **Stars and coins:** each win earns 1–3 stars and coins for the garden.
  - **Bosses:** every 10th level is a boss.

## Levels: how they work and how to add more

Levels are **fully procedural**. `levelFor(n)` in `public/src/levels/levels.js` builds level *n* from its
number with a seeded RNG, so the same level is identical for every player.

- **More levels.** Raise `LEVEL_COUNT`. The map, generator and saves all follow, and levels beyond 100 are
  already tested up to 300.
- **Rhythm.** `RHYTHM` sets each block of 10, `F T F T F T T F T BOSS`. Bosses alternate between farm and tower.
- **Difficulty.** `difficulty(n)` is the curve: it rises through each chapter and eases off after the boss.
- **New twists.**
  - Add an entry to `TOWER_TWISTS` or `FARM_TWISTS` with its `from` level. It first appears alone on that
    level, then gets mixed in with the others.
  - Implement the twist in `tower/tower.js` (`has('id')`) or in `levels/arena.js` / `farm` params.
- **New field shapes and patterns.** Add them to `SHAPES` / `PATTERNS` in `levels/shapes.js`.
- **Chapters.** Names and colours live in `CHAPTERS`. Past 100 they cycle ("Tulip Meadow II").
- **Guarantees.** `tests/levels.test.mjs` checks every level stays fair:
  - Determinism, and that each twist is introduced alone.
  - Farm time limits are at least 1.3× the estimated time needed.
  - Field and stack sizes, and tower ranges, stay within limits.

Dev shortcuts: `?level=N` opens level N directly, and `window.__bloom.startLevel(n)` does the same from the console.

## Run it

```bash
npm start          # http://localhost:8123  (no install needed: Node only)
npm test           # unit tests: economy, save, tower maths, platform adapters
npm run build      # dist/{youtube,crazygames,web}/ + zips, with size and network checks
```

Dev URL flags: `?reset` starts a fresh save. `?lowfx` forces the low-quality mode for slow phones.
The dev build also exposes `window.__bloom` (with `step(seconds)`, `startFarm()` and `enterTower()`) for testing.

## Platform layer

`index.html` maps the bare import `platform` to an adapter through the importmap. `npm run build` swaps the
adapter for each target and inserts that platform's SDK `<script>` before any game code.

| Target | Adapter | SDK |
|---|---|---|
| dev / web (itch.io, own site) | `src/platform/local.js` | none (localStorage, fake ad overlay) |
| YouTube Playables | `src/platform/youtube.js` | `https://www.youtube.com/game_api/v1` |
| CrazyGames | `src/platform/crazygames.js` | `https://sdk.crazygames.com/crazygames-sdk-v3.js` |

Every adapter has the same interface:

| Group | Methods |
|---|---|
| Startup | `init`, `firstFrameReady`, `gameReady` |
| Save and locale | `load`, `save`, `getLanguage` |
| Audio | `isAudioEnabled`, `onAudioChange` |
| Pausing | `onPause`, `onResume` |
| Gameplay signals | `gameplayStart`, `gameplayStop`, `celebrate` |
| Ads and scores | `showInterstitial`, `showRewarded(id) → bool`, `submitScore` |

### YouTube Playables checklist (built in)

- **SDK and startup order.** The SDK loads first. The game calls `firstFrameReady` when the loading screen
  shows, and `gameReady` when the title is interactive.
- **Saving.** `loadData` always runs before any `saveData`. Saves are about 1 KB, well under the 500 KiB target
  (the hard limit is 3 MiB).
- **Audio and pause.** Audio follows `isAudioEnabled` and `onAudioEnabledChange`. Pausing uses `onPause` and
  `onResume`.
- **Language.** The game reads the locale through `getLanguage`; strings live in `src/core/i18n.js`, with
  English as the default.
- **Screen and input.** It works at any aspect ratio, with touch, mouse and keyboard.
- **No outside calls.** There are no external calls, links, share prompts, quit button or in-app purchases.
  The build fails if the code references any host other than the SDK.
- **Bundle size.** The bundle is about 7 MiB (2.9 MiB zipped). The limits are 30 MiB initial (15 MiB
  recommended) and 30 MiB per file.
- **Ads.**
  - Rewarded ads: tower revive, 2× tower reward, and 2× cash for 2 minutes.
  - Interstitial ads: only between tower runs, with a 3-minute cooldown, and never during farm play.
  - A failed ad grants nothing and shows "No ad available".

## Making money: the publishing order

1. **CrazyGames.** Upload `dist/bloom-stack-crazygames.zip` in their developer portal, which pays an ad
   revenue share. Use their QA tool there to check the SDK hooks. The real numbers (D1 retention, session length)
   tell you what to tune.
2. **YouTube Playables.** Access is by application (the Playables interest form), and YouTube's own revenue share
   is still a pilot. Upload `dist/bloom-stack-youtube.zip`, or go through a publisher in the pilot (for example
   Playgama).
3. **Web.** `dist/web/` works on itch.io or your own site.
4. **Mobile, later.** Wrap the build with Capacitor, then add a `platform/capacitor.js` adapter with AdMob and a
   "remove ads" purchase.

To help it spread, record satisfying clips (mowing, a giant swaying stack, 50+ layer towers) for Shorts and TikTok.

## Project layout

```
public/
  index.html, style.css      HUD, menus, overlays (Lilita One font, local)
  src/main.js                boot order, modes (title / farm / tower), ads flow, loop
  src/platform/              local, youtube, crazygames adapters
  src/core/                  economy (all balance numbers), save, input, audio (WebAudio synth), i18n, tween, assets
  src/farm/                  layout, world, flowers (instanced + wind), player, stack, stations, unlocks, guide, models
  src/tower/                 stackMath (pure), tower (rendering, level config, hearts, twists)
  src/levels/                levels + shapes (pure generator), arena (farm levels), flow (banner, HUD, results)
  src/ui/levelMap.js         the level map screen
  src/fx/, src/ui/           particles, flyers, HUD, floating text
  assets/                    curated KayKit models (CC0) — licenses in assets/licenses/
  vendor/three/              three.js r170 + GLTFLoader, SkeletonUtils
scripts/build.mjs            per-platform builds, size and network checks, zip
scripts/serve.mjs            tiny static server
tests/                       node --test
Assets/                      original KayKit zips (git-ignored; pick models from here)
```

Tune the balance in `public/src/core/economy.js` (prices, upgrade curves, regrow times and tower rewards) and
the map in `public/src/farm/layout.js`.

## Credits

The 3D models and animations are by Kay Lousberg (KayKit, CC0): Adventurers 2.0, Character Animations 1.1,
Forest Nature Pack, Restaurant Bits, RPG Tools Bits and Board Game Bits. The font is Lilita One (SIL OFL).
The flowers, greenhouses, conveyor and every sound are generated in code.
