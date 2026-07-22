# RICOCHET RUMBLE 🎯

Neon 8-player arena brawler + co-op zombie survival + Heaven's Arena duel ladder.
One hit kills. Bullets ricochet. Level up, loot gear, climb the tower.

**Play:** https://automationoptimization.github.io/ricochet-rumble/

## Modes
- **Brawl vs CPU** — you + 7 bots on a big scrolling arena; FFA or Teams 4v4; first to N kills, respawns
- **Zombie Survival** — defend a town across **8 waves** against **six undead breeds** (walker, runner, brute,
  ranged spitter, exploding bloater, and the behemoth boss). Zombies hunt both citizens **and** you (runners and
  the boss actively chase players); drops restock ammo/shields; chain kills for a combo bonus. **Pick a roguelite
  field upgrade after every wave.** **Solo or online co-op** — friends defend together (shared reinforcements,
  scaled hordes). The final boss guarantees a legendary
- **Outbreak (open world)** — a WC3-"Resident Evil"-style escort. A **procedurally generated city streams in as
  you push outward** (deterministic from a shared seed, so co-op stays in sync with no per-chunk network cost).
  Walk up to **survivors** — they follow you — and **escort them to the central hub to extract**. Secure **signal
  beacons** (hold points) to surface more survivors + supplies. A rolling horde director ramps the threat. Rescue
  the quota to win. **Solo or online co-op**
- **Online brawl** — create a room, friends fill the seats (up to 8), empty seats become bots
- **Ranked — Heaven's Arena** — **1v1 duels only**. Win to climb the **floor tower (1 → 200)**; lose and you slip.
  **Go inactive and your floor decays** (enforced server-side), so you have to keep defending your rank. A
  **practice duel vs CPU** lets you warm up unranked

## Accounts
- **Username + password** sign-in (optional — you can play as a guest). Passwords are hashed server-side with
  PBKDF2 (per-user salt, constant-time compare) and never stored or logged in plaintext; sessions use signed JWTs.
- **Email confirmation** on signup (a 6-digit code via Azure Communication Services). One account per email.
  Everything is playable before confirming; **ranked requires a confirmed email**, enforced server-side.
- Your account carries a **cloud save** (level, EXP, inventory, credits) that syncs across devices, plus your
  ranked identity. Ranked submissions are token-verified, so a rating can't be spoofed onto someone else's account.
- No password reset (no support desk) — the sign-in screen says so.

## Progression (RPG)
- **Levels & EXP** scaled by the level of who you take down; each level grants a stat point
- **Customizable stats** across six axes
- **Four equipment slots**: **Weapon**, **Armor**, **Trinket** (passive stat core), and **Gadget** (an active
  ability on a cooldown — Blink Dash, Pulse Nova, Overclock, Phase Cloak — bound to **Shift/E** or the touch button)
- **Loot & rarities**: white → green → blue (unique) → purple (rare) → orange (legendary). Every slot type drops
  and appears in the shop. Loot quality scales with EXP earned; legendaries never drop from normal matches
- **Legendary sources**: the **Shop** (credits) and the **zombie survival boss**
- Everything saves on your device; your full build + level follow you online

## Controls
- **Keyboard:** WASD / Arrows move · Space / Enter fire · **Shift / E** ability · **Touch:** left half = move,
  right half = fire, bottom-center button = ability

## Backend (all Azure, free/consumption tiers — resource group `ricochet-rumble-rg`)
- **Azure Web PubSub** (`rr-lobby-*`, Free_F1) — live room lobby + WebRTC signaling
- **Azure Functions** (`rr-negotiate-*`, Windows consumption, zero-dep) —
  `/api/negotiate` mints Web PubSub tokens; `/api/rank` is the Heaven's Arena floor tower (Elo-seeded, with
  server-enforced inactivity decay); `/api/account` is username+password
  accounts with PBKDF2 hashing, JWT sessions, cloud saves, and email confirmation via **Azure Communication
  Services Email** (`rr-email`/`rr-comms`, hand-signed HMAC REST). Ranks + accounts persist in **Azure Table Storage**
  (hand-signed SharedKeyLite REST, zero SDK)
- **Gameplay** is peer-to-peer WebRTC (STUN + TURN); the host runs the authoritative sim (brawl or zombie
  defense) and broadcasts 20Hz snapshots. Guests send inputs; disconnected brawl guests convert to bots

Single-file game (`index.html`), no build step. Function sources in `azure-negotiate/`.
