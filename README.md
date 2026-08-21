# 3dblock

A faithful browser clone of **BlockOut** (1989) — the 3D Tetris where polycubes
fall into a rectangular well, you rotate them around all three axes, and filling
a complete layer clears it.

TypeScript + three.js + Vite. No framework, no backend.

```
yarn install
yarn dev        # play at localhost:5173
yarn test       # game logic
yarn build      # typecheck + production bundle
```

## Controls

| | |
|---|---|
| Arrow keys | move within the pit |
| <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | rotate around X / Y / Z |
| <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> | the same three axes, the other way |
| <kbd>Space</kbd> | hard drop — worth far more points the higher you drop from |
| <kbd>P</kbd> | pause |
| <kbd>M</kbd> | mute |
| <kbd>N</kbd> | new game |
| <kbd>Esc</kbd> | setup — block set, pit size, starting level |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | Flat Fun / 3D Mania / Out of Control |

On a touch device an on-screen pad replaces the keyboard: a d-pad, the six
rotations, drop and pause. Add `?touch=1` to force it on anywhere, which is the
only way to check it outside a real phone.

The pit is configurable through the setup screen across the original's full
range — 3–7 wide and long, 6–18 deep, any block set, starting level 0–10.

## How faithful is it?

The mechanics aren't approximated. The 41 polycube definitions, the scoring
constants, the speed curve and the level thresholds are all transcribed from
BlockOut II's source, whose own comments note they were *"coming from
measurements made with the original BlockOut game"*.

The scoring is checked against an outside source: `lineComponent()` is tested
against the published score tables at blockout.net, and reproduces them exactly
(FLAT 5×5×12 at level 0 → 63 for one layer, 232 for two, 508 for three).

Things worth knowing, all pinned by tests:

- **Depth is the only pit dimension that affects score.** A 3×3×12 pit and a
  5×5×12 pit pay identically; a shallower pit pays more because it's harder.
- **The drop bonus only applies if you actually hard-drop.** Letting a piece
  fall on its own scores the low value no matter how far it travelled.
- **Starting at a high level doesn't shorten the climb.** The promotion
  threshold is tied to the level you're on, so a high start is pure difficulty.
- **The sets are 8 / 7 / 41 pieces** for FLAT / BASIC / EXTENDED, and every FLAT
  piece is exactly one cube thick — that's what makes it flat.
- **Emptying the pit pays a two-layer bonus.**

The falling piece renders as a wireframe and only turns solid once it locks.
That's how the original does it, and it isn't decoration: looking straight down
the well, a solid piece would sit exactly between the camera and the spot it's
about to land on. Being able to see through it is what makes the head-on view
playable.

## Sound

The sound effects are BlockOut II's, which ships two sets: its own, and an
emulation of the 1989 game's. The `*2` files are the second — its source
selects those under `SOUND_BLOCKOUT` — so those are the ones here.

## Credits and licence

BlockOut was created in 1989 by Aleksander Ustaszewski and Mirosław Zabłocki,
published by California Dreams.

The piece definitions and scoring constants here are derived from
[BlockOut II](https://sourceforge.net/projects/blockout/) by Jean-Luc Pons,
which is GPLv2+. This project is therefore **GPLv2+** as well — see `LICENSE`.
No BlockOut II code was copied; the game itself is written from scratch, and
what was taken is the measured game data and the sound effects in
`public/sounds/`, both of which its licence covers.
