# Sole Survivor — a foot-fetish RPG extension for SillyTavern

Working title. Inspired by the games of tastysox (itch.io): tiny protagonists, bossy girls with
smelly socked feet, short comedic scenes, many endings. Original characters only: the extension
ships a *character template* and *scenario rules*, and generates a new cast for every game.

## 1. What the review found

Ten games, one universe, four recurring loops:

| Loop | Source games | What it is |
| --- | --- | --- |
| **Service row** | Foot Service at the Movies, Zeta Beta Zeta Sorority, The Yellow Socks | A row of girls. Arrows move you from one pair of feet to the next. Verbs: Kiss, Sniff, Lick, Rub, Talk, Info. Each girl secretly wants a specific mix; get it right and she rewards you (socks come off, a pass), get it wrong and she punishes you. Stations: Boudoir (nail painting), Closet (shoe cleaning), Laundry (sock worship), a scent-matching minigame. |
| **Tiny expedition** | Avril's Ex 1 & 2, Smelly Adventure, Stuck in the ZBZ Mansion | Shrunk to a few cm. Explore under a bed, a locker room, a mansion. Point-and-click inventory puzzles (find the cord, find the dagger). You can be crushed by wandering. Each girl has a "pass"; finding it unlocks the next girl (the "Altar"). Many endings, most of them bad in a fun way. |
| **Seduction clock** | Socks, Seduction and Shrinking | Dating sim: pick one of six targets, raise affection with talk and chore minigames, while a shrink timer runs. Steal her socks to stop shrinking. |
| **Validation / tasks** | Stinky Validation | A list of tasks, one per girl, to earn a prestigious validation. Dominant girls make each task humiliating. |
| **Management** | Gts Management | Keep giantesses happy day by day, earn money, random events. |

The cast is the real engine. Every girl on the creator's site has the same sheet:

- attitude archetype (four: Stuck Up, Chillax, Tough Love, Wicked)
- six dials, 0–11: Bossy, Bratty, Friendly, Smelly, Sweaty, Dirty
- a foot-odor profile as percentages of four notes: cheesy, lemony, fishy, meaty
- signature shoes and signature socks (UGGs + "Princess" socks; Crocs + toe socks; Doc Martens + polka dots; loose Adidas + oversized socks; nylons + boots)
- a one-line personality hook, hobbies, a kink, a sorority job, a silly "superpower"

That sheet drives everything: how dangerous she is to a tiny, what she rewards, what her feet
are like, how she talks. We copy the *shape* of the sheet, not the girls.

### Visual language (from the screenshots)

- 2000s flash-game pixel art: chunky outlines, flat warm palette (oranges, browns, dusty pinks),
  no gradients, big readable shapes.
- **Camera on the floor.** The tiny is a 30-px sprite at the bottom edge; the feet fill the frame.
  Socks are read as giant textured walls with the sock text ("PRINCESS") running vertically.
- **Stink is drawn**: green/yellow wisps rising off socks, sweat droplets, a hazy tint on the air.
- **UI in the picture**: a verb bar of rounded orange pills along the top (KISS SNIFF LICK RUB INFO),
  left/right arrows to move along the row, a text box along the bottom.
- **Bad-end cards**: portrait panel, the girl's face in a corner, the tiny taped to a sole or
  pinned under toes, one short cruel line in a speech bubble ("I give you one week or two in my
  boots. LOL. I hope you die.").
- **Loops**: toes wiggle, wisps drift, droplets fall, the sole slowly lowers. Two to four frames,
  looped forever.
- Tinies are blue-skinned little people; the girls are normal-skinned giants by comparison.

## 2. What the extension does

A SillyTavern extension that turns a chat into one of these games. The chat model narrates and
voices the girls; the extension owns the rules, the numbers, the pictures and the endings.

1. **New game** → pick a scenario, cast size, and tone sliders (how cruel, how smelly, how lethal).
   The extension asks the model for a fresh cast using the sheet template, and generates a
   portrait and a "feet card" (shoes, socks, soles) per girl as reference images.
2. **Play** → a game panel (dockable, pop-out like Scene Mapper) shows the current picture, the
   verb bar, your meters and the girl's meters. Clicking a verb posts your action into the chat as
   your message, the rules engine rolls the outcome and injects it into the prompt, and the model
   writes the scene *around the outcome the engine already decided*.
3. **See it** → after each scene a pixel-art picture is generated in the house style, optionally as
   a 4-frame loop. Bad ends get their card.
4. **Endings** → when a meter crosses a line the engine declares an ending (good, tasty, or dead),
   shows the card, and offers *rewind to checkpoint* (a chat branch) or *continue as a new chapter*
   (you stay shrunk in her boot and the story goes on).

## 3. The character sheet

```json
{
  "name": "Marisol Reyes", "age": 21, "from": "Spain", "height_cm": 173, "shoe_us": 9,
  "archetype": "Princess",          // Princess | Slacker | Drill | Viper (= Stuck Up / Chillax / Tough Love / Wicked)
  "dials": { "bossy": 7, "bratty": 10, "friendly": 2, "smelly": 9, "sweaty": 8, "dirty": 4 },
  "odor":  { "cheesy": 50, "lemony": 20, "fishy": 10, "meaty": 20 },
  "shoes": "white platform sneakers, worn all day", "socks": "pink ankle socks with a crown logo",
  "hook": "Daddy's money, a tennis scholarship she doesn't need, and a tiny she doesn't ask about",
  "job": "President", "hobby": "tennis, shopping", "kink": "sweat", "quirk": "says 'ew' as a greeting",
  "wants": { "verbs": ["rub", "sniff"], "hates": ["lick"], "praise": "her arches", "trigger": "being ignored" }
}
```

- The model fills it from a seed line ("a Spanish tennis princess") or from an existing
  character card ("sheet this card"). Group chat members can be sheeted in bulk, so an existing
  group becomes the cast.
- Dials are mechanics, not flavour. **Smelly** sets the stench damage of Sniff/Lick. **Sweaty** and
  **Dirty** set how slippery and grimy a sole is (climb checks, "dirt" status). **Bossy** sets how
  many orders she gives per scene. **Bratty** sets how fast irritation rises. **Friendly** is the
  only thing standing between a tiny and a bad end.
- The odor profile is text the model must use when it describes a smell, so every girl smells
  different and consistently so. It also powers the scent-matching minigame.

## 4. Meters and the rules engine

The engine is pure JS in `src/rules.js`, deterministic given a seed, unit-tested. The model never
decides outcomes; it is told them.

**You** — Size (cm; 175 → 8 → 2), Stamina, Composure (stench tolerance), Favor (per girl),
Dirt (how filthy you are), Inventory, Location, and a Clock (turns left in the scene).

**Each girl** — Mood, Attention (is she aware of you right now), Irritation, Reward progress,
Status of her feet (shoes on / socked / barefoot, resting / wiggling / stomping).

**A turn**: you pick a verb (or type anything; free text is classified into a verb + target by a
cheap quiet prompt). The engine computes `roll + your mods vs her dials`, applies deltas, checks
for triggers (irritation > X → punishment; attention + bossy → an order; size < 3 cm → crush risk
on every move), and emits an **outcome block**:

```
[GAME] Turn 7 of 12 · Marisol (socked, wiggling) · You: 8 cm, Composure 3/10, Favor 4
You sniffed her left sock. She felt it. Success: she liked it (+2 favor) but the stench hit hard (-3 composure).
Marisol gives an order: "Rub the toes. Both feet. Don't stop." (refusing: +3 irritation)
Describe this in 2–4 paragraphs from the tiny's point of view, then stop and wait for the player.
```

This goes in through a `generate_interceptor` the way Scene Mapper does it, so the narration
always matches the state. After the reply, a quiet prompt reads the text for anything the model
added on its own (she took her shoe off, she put you in her pocket) and reconciles the state.

## 5. Scenarios (each is a module in `src/scenarios/`)

1. **Service Row** (ship first). Three to six girls on a couch/row of seats. Arrows move you
   between pairs of feet. Verbs: Kiss, Sniff, Lick, Rub, Talk, Look. Clock = the movie / the
   study session / the bus ride. Win: every girl satisfied → the reward reveal. Lose: a girl's
   irritation maxes → punishment scene; two punishments → bad end card.
2. **Tiny Expedition.** A place (under a bed, a locker room, a dorm bathroom) as a small graph of
   zones with items and hazards. Verbs: Go, Climb, Hide (in a shoe, under a sock), Search, Take,
   Use. Each girl guards a zone; her "pass" (something she wants) unlocks the next. Crush rolls
   when a girl with high Attention moves. Items solve puzzles the way the point-and-clicks do.
   Can read the Scene Mapper map when that extension is present (optional, later).
3. **Seduction Clock.** Pick a target among the cast. Affection vs a shrink timer (you lose a
   step of size every N turns). Chores as minigame turns (clean her shoes, match her socks, paint
   her nails) that pay affection. Get her socks before you hit 2 cm.
4. **Validation.** A board of one task per girl, each with a humiliation cost. Finish the board to
   earn the validation; fail three and the board flips to a bad end.
5. **Management** (later). Day loop, money, events, happiness per giantess.

A scenario = { setup prompt, verbs, zone/graph, win/lose rules, ending table, picture presets }.

## 6. Pictures

- **Style prompt** (fixed, prepended to every picture): *"2000s flash game pixel art, chunky dark
  outlines, flat warm palette, no gradients, no text, camera on the floor at the tiny's eye level,
  the socked feet fill the frame, a small blue-skinned tiny person at the bottom edge for scale,
  green stink wisps rising, 16:10."* Plus per-scene lines from the engine (which girl, shoes on or
  off, wiggling or stomping, where you are standing, how far away).
- **Consistency**: each girl's portrait and feet card are sent as reference images, the same way
  Nano Banana POV sends avatars. The tiny's sprite is a fixed reference.
- **Backends**: reuse what the other two extensions already have — Google AI Studio (Nano Banana)
  via SillyTavern's secret store, OpenRouter / NanoGPT / any OpenAI-compatible API, NovelAI, or
  SillyTavern's own Image Generation. Keys never live in the extension settings.
- **Bad-end cards**: portrait aspect, "her face in the top corner looking down, the tiny [taped to
  her sole / under her toes / inside her boot], one speech bubble" — the bubble text is drawn by the
  extension as an overlay, not by the model, so it is always legible.
- **Loops**: ask the model for a **2×2 sprite sheet** of the same frame with small changes (toes
  curl, wisp drifts, droplet falls), slice it client-side, play it as a 4-frame loop in the panel
  and in the chat message. Export to GIF with a tiny encoder for sharing. On top of any picture,
  cheap CSS layers: drifting wisps, falling droplets, a slow heave on a sole, screen shake on a
  stomp. These cost nothing and run even without image generation.
- Pictures are posted as hidden chat messages (the model does not read them), like the sibling
  extensions do.

## 7. The panel

```
┌──────────────────────────────────────────────┐
│ [picture / loop]                             │
│  KISS  SNIFF  LICK  RUB  TALK  LOOK   ◀  ▶   │
├──────────────────────────────────────────────┤
│ You  8 cm  Stamina ▮▮▮▮▯  Composure ▮▮▯▯▯    │
│ Marisol  socked · wiggling   Mood 😒  Irrit ▮▮▮▯│
│ Favor ▮▮▮▮▯   wants: rub, sniff   hates: lick │
│ Turn 7/12   📦 bobby pin, popcorn kernel      │
└──────────────────────────────────────────────┘
```

Dockable in the extensions drawer, pop-out window like Scene Mapper, a mobile layout. A cast tab
shows every sheet (editable). A log tab shows the engine's rolls. A gallery tab keeps the pictures
and endings unlocked this game (the "endings" list is a tastysox staple).

Slash commands: `/sole start [scenario]`, `/sole cast [seed]`, `/sole sheet <name>`,
`/sole <verb> [target]`, `/sole picture`, `/sole loop`, `/sole rewind`.

## 8. Code layout (same conventions as nanoban and st_ext_3d)

```
manifest.json         generate_interceptor: soleSurvivorInterceptor
index.js              SillyTavern glue: settings, panel, slash commands, events, injection
style.css
src/sheet.js          template, generation prompt, forgiving JSON parsing, validation
src/rules.js          seeded RNG, verb resolution, meters, triggers, outcome block
src/scenarios/*.js    service.js, expedition.js, seduction.js, validation.js
src/endings.js        ending table, card text, checkpoint/rewind helpers
src/picture.js        style prompt + scene lines + reference handling
src/frames.js         sprite-sheet slicing, loop playback, GIF export
src/panel.js          DOM for the panel (pure functions returning HTML/state)
test/*.test.js        node --test, no SillyTavern dependency
```

## 9. Order of work

1. **MVP** — sheet generator, rules engine, Service Row, panel with verb bar and meters, prompt
   injection and reconciliation, text-only endings with rewind. Tests for sheet parsing and rules.
2. **Pictures** — style prompt, references, Nano Banana first, then the other backends. Bad-end
   cards with overlay bubbles.
3. **Loops** — sprite-sheet frames, CSS layers, GIF export.
4. **Tiny Expedition**, then **Seduction Clock**.
5. **Validation**, **Management**, Scene Mapper link, cast import/export as JSON.

## 10. Decisions taken (change any of them)

- Original cast every game; no tastysox characters or art shipped.
- The engine, not the model, decides outcomes. The model only narrates.
- Verbs post as the user's own message (like Scene Mapper's adventure mode), so the chat log stays
  a readable story and swipes/branches keep working.
- Comedic-cruel tone by default, with sliders for lethality and smell intensity; a "no death"
  switch turns bad ends into "kept" ends.
- Working title "Sole Survivor" (manifest key `soleSurvivor`, command `/sole`).
