# RICOCHET RUMBLE 🎯

Neon 8-player arena brawler + co-op zombie survival + Heaven's Arena duel ladder.
Arena hits are lethal. Bullets ricochet. Outbreak adds full survival-horror condition and infection systems.

**Play:** https://automationoptimization.github.io/ricochet-rumble/

## Modes
- **Brawl vs CPU** — you + 7 bots on a big scrolling arena; FFA or Teams 4v4; first to N kills, respawns
- **Zombie Survival** — defend a town across **8 waves** against **eleven infected classes** (walker, runner, brute,
  ranged spitter, exploding bloater, leaping crawler, horde-calling screamer, hound, licker, regenerator, and the behemoth boss). Zombies hunt both citizens **and** you (runners and
  the boss actively chase players); drops restock ammo/shields; chain kills for a combo bonus. **Pick a roguelite
  field upgrade after every wave.** **Solo or online co-op** — friends defend together (shared reinforcements,
  scaled hordes). The final boss guarantees a legendary
- **Raccoon Outbreak (open-world survival-horror campaign)** — a full seven-act homage to the old WC3 “Resident
  Evil” custom games, rebuilt across a streaming **64,000 × 64,000** city and a 71,000-unit critical route. Search
  Convoy 9B, breach St. Mary’s Clinic, reopen Central Station, descend into Sewer Control 4, restore the southern
  grid, call evacuation, secure aviation fuel, rescue twelve survivors, and defend the hub through extraction.
  - **Story campaign:** cinematic prologue, act transitions, radio conversations, a Tyrant confrontation, bad ending,
    standard epilogue, and an unlockable true epilogue. Six selectable protagonists have individual histories,
    field perks, portraits, and character-specific dialogue. Named survivors—including Dr. Aya Bell, Kenji Sato,
    Sgt. Imani Mercer, June Hale, and pilot Naomi Velez—carry the story through the playable missions.
  - **Project Crown secret case:** every recovered document contains part of a seven-file cipher. Completing it
    reveals Umbra Lab B-12 as a playable secret objective; surviving its purge protocol secures the Crown ledger
    and changes the ending.
  - **Survival systems:** condition damage, persistent infection, herbs, first-aid spray, antivirals, finite ammo,
    magazine reserves, manual reloads, downed/bleed-out states, co-op revives, reinforcements, and fortifications.
  - **Exploration:** nine named districts, fifteen authored landmark compounds, seven optional operations,
    repeatable field incidents, searchable containers, medical, ammunition and tool caches, seven interconnected
    lore files, key-item inventory, named survivor records, patrol/service-truck road traversal, an objective
    compass, minimap, and full-screen city operations map.
  - **Visibility:** Outbreak uses the Brawl-style overhead view with persistent fog of war. Nearby space is visible,
    buildings and barricades block sight, and explored city blocks remain dimly remembered as the squad travels.
  - **Dynamic campaign:** specialist survivors (medics, officers, and engineers), a secured clinic safe room,
    blackouts, roaming hordes, distress calls, infested nests, armored convoys, hound ambushes, noise-driven
    pressure, eleven enemy classes, multiple unlockable safe rooms, and a 60-second, three-wave extraction siege
    with a two-phase **Tyrant**. The complete mission and combat state synchronize in
    **solo or online co-op**.
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
- **Brawl / Zombie Survival:** WASD / Arrows move · Space / mouse fire · **Shift / E** ability
- **Raccoon Outbreak:** click ground to move; visible infected are attacked automatically. **C**, then click =
  attack-move · **M**, then click = move · **P**, then click = patrol · **X** stop · **V** hold position ·
  **T** toggle auto-fire · Shift-click queues orders · WASD / Arrows directly override an order · **F** interact/revive ·
  **R** reload · **H** heal · **Tab** case file. The bottom command card also exposes every order and field action.
- **Touch:** left half = move, right half = aim/fire, with dedicated ability, interact, and heal buttons

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
