# RICOCHET RUMBLE 🎯

Neon arena shooter. One hit kills. Bullets bounce. First to five.

**Play:** https://automationoptimization.github.io/ricochet-rumble/

- **2P local** — one keyboard: WASD+Space vs Arrows+Enter
- **VS CPU** — a bot that banks shots and taunts
- **Online duel** — create a room, it appears in every player's lobby, one tap to join.
  Lobby runs over public MQTT; gameplay is P2P WebRTC with STUN/TURN.
- **Mobile** — touch controls: left half = joystick, right half = fire

Single-file game (`index.html`) + `mqtt.min.js` (lobby transport). No build step, no backend.
