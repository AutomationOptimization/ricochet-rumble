# RICOCHET RUMBLE 🎯

Neon 8-player arena brawler. One hit kills. Bullets ricochet. Grab loot, build your fighter.

**Play:** https://automationoptimization.github.io/ricochet-rumble/

## Modes
- **Brawl vs CPU** — you + 7 bots on a big scrolling arena; FFA or Teams 4v4
- **Online brawl** — create a room, friends fill the seats (up to 8), empty seats become bots
- Every match: **first to N kills**, instant respawns, camera follows you, minimap + kill feed

## Progression (RPG loadout)
- **Customizable stats** — allocate points across Move Speed, Fire Rate, Muzzle Velocity, Magazine, Reload, Vitality
- **Loot** — weapons (Pistol/Burst/Scatter/Rail/Ricochet patterns) and armor drop after every match,
  with rarity tiers common→legendary that roll stat mods. Equip from your stash. Saved on your device.
- Your build follows you online — the host applies each player's chosen stats + gear.

## Controls
- **Keyboard:** WASD / Arrows move · Space / Enter fire
- **Touch:** left half = move joystick, right half = fire

## Online architecture (all Azure, free/consumption tiers)
- **Azure Web PubSub** (`rr-lobby-*`, Free_F1) — live room lobby + WebRTC signaling over pub/sub groups
- **Azure Function** (`rr-negotiate-*`, Windows consumption) — `/api/negotiate` mints short-lived
  Web PubSub client tokens (hand-signed JWT, zero deps); the browser never holds a key
- **Gameplay** is peer-to-peer WebRTC (STUN + TURN); the host runs the authoritative 8-player sim
  and broadcasts 20Hz snapshots. Guests send inputs; disconnected guests convert to bots.

Single-file game (`index.html`), no build step. Infra lives in resource group `ricochet-rumble-rg`;
the `/negotiate` function source is in `azure-negotiate/`.
