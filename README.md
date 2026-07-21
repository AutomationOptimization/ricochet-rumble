# RICOCHET RUMBLE 🎯

Neon 8-player arena brawler + co-op zombie defense + ranked Elo ladder.
One hit kills. Bullets ricochet. Level up, loot gear, climb the board.

**Play:** https://automationoptimization.github.io/ricochet-rumble/

## Modes
- **Brawl vs CPU** — you + 7 bots on a big scrolling arena; FFA or Teams 4v4; first to N kills, respawns
- **Zombie Campaign** — defend a town across 5 waves; zombies convert citizens they touch; keep enough alive.
  **Solo or online co-op** — friends join a co-op room and defend together (shared reinforcements, scaled hordes).
  The final boss guarantees a legendary
- **Online brawl** — create a room, friends fill the seats (up to 8), empty seats become bots
- **Ranked** — online FFA whose results feed a persistent global **Elo ladder** with a leaderboard

## Progression (RPG)
- **Levels & EXP** scaled by the level of who you take down; each level grants a stat point
- **Customizable stats** across six axes
- **Loot & rarities**: white → green → blue (unique) → purple (rare) → orange (legendary). Loot quality scales
  with EXP earned; legendaries never drop from normal matches
- **Legendary sources**: the **Shop** (credits), the **zombie campaign boss**, and now the **Ranked ladder** progression
- Everything saves on your device; your build + level follow you online

## Controls
- **Keyboard:** WASD / Arrows move · Space / Enter fire · **Touch:** left half = move, right half = fire

## Backend (all Azure, free/consumption tiers — resource group `ricochet-rumble-rg`)
- **Azure Web PubSub** (`rr-lobby-*`, Free_F1) — live room lobby + WebRTC signaling
- **Azure Functions** (`rr-negotiate-*`, Windows consumption, zero-dep) —
  `/api/negotiate` mints Web PubSub client tokens; `/api/rank` is the Elo ladder + leaderboard,
  persisted in **Azure Table Storage** (hand-signed SharedKeyLite REST, no SDK)
- **Gameplay** is peer-to-peer WebRTC (STUN + TURN); the host runs the authoritative sim (brawl or zombie
  defense) and broadcasts 20Hz snapshots. Guests send inputs; disconnected brawl guests convert to bots

Single-file game (`index.html`), no build step. Function sources in `azure-negotiate/`.
