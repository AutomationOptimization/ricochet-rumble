# RICOCHET RUMBLE 🎯

Neon arena shooter. One hit kills. Bullets bounce. First to five.

**Play:** https://automationoptimization.github.io/ricochet-rumble/

## Modes
- **2P local** — one keyboard: WASD+Space vs Arrows+Enter
- **VS CPU** — a bot that banks shots and taunts
- **Online duel** — create a named room; it appears live in every player's lobby, one tap to join
- **Mobile** — touch controls: left half = joystick, right half = fire

## Online architecture (all Azure, free/consumption tiers)
- **Azure Web PubSub** (`rr-lobby-*`, Free_F1) — realtime lobby: room announcements and
  WebRTC signaling over pub/sub groups.
- **Azure Function** (`rr-negotiate-*`, Windows consumption) — `/api/negotiate` mints
  short-lived Web PubSub client tokens (hand-signed JWT, zero npm deps). The browser
  never sees a key.
- **Gameplay** stays peer-to-peer WebRTC (STUN + TURN); the host runs the authoritative
  simulation at 25 Hz. Only lobby + signaling touch Azure.

Static game is a single `index.html` — no build step. Deployed via GitHub Pages.

Infra lives in resource group `ricochet-rumble-rg`. The `/negotiate` function source is in `azure-negotiate/`.
