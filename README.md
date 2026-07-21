# RICOCHET RUMBLE 🎯

Neon 8-player arena brawler + zombie-defense campaign. One hit kills. Bullets ricochet.
Level up, loot gear, build your fighter.

**Play:** https://automationoptimization.github.io/ricochet-rumble/

## Modes
- **Brawl vs CPU** — you + 7 bots on a big scrolling arena; FFA or Teams 4v4; first to N kills, instant respawns
- **Zombie Campaign** — defend a town of citizens across 5 escalating waves; zombies convert any citizen they
  touch (the horde snowballs), keep enough alive to the end. The final **boss** guarantees a legendary drop
- **Online brawl** — create a room, friends fill the seats (up to 8), empty seats become bots

## Progression (RPG)
- **Levels & EXP** — earn EXP scaled by the level of who you take down; each level grants a stat point
- **Customizable stats** — allocate points across Move Speed, Fire Rate, Muzzle Velocity, Magazine, Reload, Vitality
- **Loot & rarities** — white (common) → green (uncommon) → blue (unique) → purple (rare) → orange (legendary).
  Loot quality scales with the EXP you earn. Legendaries never drop from normal matches
- **Legendary sources** — the **Shop** (buy with credits earned each match) and the **Zombie Campaign boss**.
  Ranked is a planned third source (needs real matchmaking)
- Everything saves on your device; your build follows you online (the host applies each player's stats + gear)

## Controls
- **Keyboard:** WASD / Arrows move · Space / Enter fire
- **Touch:** left half = move joystick, right half = fire

## Online architecture (all Azure, free/consumption tiers)
- **Azure Web PubSub** (`rr-lobby-*`, Free_F1) — live room lobby + WebRTC signaling over pub/sub groups
- **Azure Function** (`rr-negotiate-*`, Windows consumption) — `/api/negotiate` mints short-lived Web PubSub
  client tokens (hand-signed JWT, zero deps); the browser never holds a key
- **Gameplay** is peer-to-peer WebRTC (STUN + TURN); the host runs the authoritative sim and broadcasts 20Hz
  snapshots. Guests send inputs; disconnected guests convert to bots

Single-file game (`index.html`), no build step. Infra lives in resource group `ricochet-rumble-rg`;
the `/negotiate` function source is in `azure-negotiate/`.
