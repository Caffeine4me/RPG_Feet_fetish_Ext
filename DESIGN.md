# Sole Survivor — a living-world foot-fetish RPG for SillyTavern

Working title. Inspired by the games of tastysox (itch.io), especially the overworld of *The
Yellow Socks* and *Smelly Adventure*: a pixel-art town you travel around, buildings that start
CLOSED and open as the story moves, and visual-novel scenes inside each one. Original characters
only. The extension ships a world framework and a character template; every game generates its own
town and cast.

## 1. The shape of the game

Three layers, outermost first:

1. **World (overworld map).** A pixel-art town drawn by the extension: an island of grass and
   paths, 10–16 buildings, a park, a lighthouse or landmark, a farm plot. You click a building to
   travel there. Buildings show their name or CLOSED. A day/time clock runs; travel costs time.
2. **Scene (visual novel).** Entering an open building where someone is drops you into a VN
   screen: a pixel-art interior background, the character's sprite with an expression, a
   nameplate, the dialogue box, and 3–4 choice buttons plus a free-text line. The chat model
   writes the dialogue; the extension turns its choice block into buttons.
3. **Event (the foot stuff).** Inside a scene, the rules engine can open an event: a service row
   at the cinema, a sock-sorting chore at the laundromat, a shoe-cleaning job at the sports hall,
   a punishment, a shrink sequence that turns one building's interior into a tiny expedition. Events
   have verbs, meters, and rolls. They are the tastysox games, each one a module.

The RPG state (relationships, money, size, inventory, quests, flags, unlocked endings) persists
across all three and lives in the chat's metadata, so it saves with the chat.

## 2. What the review found (kept short)

- **Recurring loops**: service row (verbs Kiss/Sniff/Lick/Rub/Talk along a row of feet), tiny
  expedition (shrunk, inventory puzzles, crush risk, a "pass" per girl unlocks the next), seduction
  clock (affection vs shrink timer, chores pay affection), validation (one humiliating task per
  girl), management (keep giantesses happy by the day). These become **event types**.
- **The cast sheet** every girl has on the creator's site: an attitude archetype (four), six dials
  0–11 (Bossy, Bratty, Friendly, Smelly, Sweaty, Dirty), a foot-odor profile as percentages of
  cheesy/lemony/fishy/meaty, signature shoes and socks, a job, a hobby, a kink, a one-line hook,
  a silly superpower. We copy the shape of the sheet, not the girls.
- **Visual language**: 2000s flash-game pixel art, chunky outlines, flat warm palette. Floor-level
  camera in foot scenes, a blue tiny for scale, green stink wisps drawn in. Verb bar of rounded
  orange pills. Portrait bad-end cards with one cruel speech bubble. Two-to-four-frame loops.
- **Overworld** (The Yellow Socks): top-down pixel town, each building a facade with a sign plaque,
  CLOSED until unlocked, paths joining them, a cursor arrow, a strip for time/day along the top.

## 3. The world

### Generation
At *New game* the model is asked for a town as JSON: a name and vibe (college town, seaside resort,
boarding school), 10–16 **locations**, 6–12 **residents** with full sheets, a **schedule** per
resident (where she is in each time slot), each location's **opening rule** (open from the start,
opens on day N, opens when a quest completes, opens when favor with X ≥ Y), and 3–5 **opening
quests**. The extension validates it, fixes gaps (every resident has a home, every closed building
has a way to open), and lays out the map.

### Locations
```json
{ "id": "laundromat", "name": "Suds & Socks", "type": "laundromat",
  "open": { "when": "quest", "quest": "lost_sock" }, "hours": ["morning", "afternoon", "evening"],
  "residents": ["dolores"], "interior": "rows of dryers, a folding table piled with socks, warm lint air",
  "events": ["sock_sorting", "service_row"], "items": ["bobby pin"], "notes": "" }
```
Types give defaults for everything (icon, palette, event list, interior prompt): sorority house,
dorm, gym, cinema, laundromat, spa, cafe, burger joint, shoe store, library, park, bus stop,
lighthouse, farm plot, pool, tennis court, boutique, thrift store, your flat. The model may invent
a type; it falls back to a generic facade.

New locations appear during play: when a conversation mentions a place that is not on the map
("come by the pool tomorrow"), the reconcile step proposes it, and it is added CLOSED with an
opening rule. The town grows with the story, as the CLOSED signs do in The Yellow Socks.

### Time
A day counter and four slots: morning, afternoon, evening, night. Travelling to another building
costs a slot; a scene costs a slot; sleeping at home ends the day. Residents follow their schedule
so the gym has the sporty girl in the morning and the cinema fills up in the evening. Deadlines
(a quest due by day 7, a shrink that gets worse every night) use the clock. The top strip shows
day, slot, money, and your size.

### Travel and exploring
Click a building: if CLOSED the sign tells you what it needs (or "?" if the rule is hidden); if
open and empty you get a short look-around with a chance to find an item; if someone is there a
scene starts. The park and streets are explorable too: random encounters by slot, drawn from the
residents' schedules. A **Where is everyone?** toggle shows resident markers on the map for the
current slot (once you know their routine).

### Drawing the map
The extension draws the overworld itself on a canvas, so it is clickable, consistent and updates
instantly. Procedural pixel buildings in the screenshot's style: a facade in the type's palette, a
roof band, a sign plaque reading the name or CLOSED, windows, a door, a type icon (dumbbell, film
reel, sock, cup, burger arches, books). Paths are routed between doors on a grass island with
trees, a fountain plaza, a lighthouse, a crop field. Residents and you are small sprites; the cursor
arrow sits over your target. Drawn at 1× and scaled with nearest-neighbour, so it stays crisp.
AI image generation is **not** used for the map; it is used for interiors and sprites (below).

## 4. The scene (visual novel)

- **Background**: one pixel-art interior per location, generated once from the location's interior
  line and cached (with a night variant). Pixel style prompt is fixed; see §6.
- **Sprites**: per resident, a sprite sheet of a standing pose with 6 expressions (neutral, smug,
  annoyed, laughing, bored, disgusted), generated once from her sheet and cached. The extension
  slices it and shows the right one from an `[expr]` tag in the dialogue. A **feet card** per
  resident (her shoes, socks, soles, drawn floor-level) is the reference for event pictures.
- **Dialogue**: the model writes the scene as VN lines (`Name [smug]: ...`, narration in italics)
  and ends with a choice block:
  ```
  [CHOICES]
  1. Offer to carry her gym bag
  2. Ask about the laundromat key
  3. (Sniff check) Lean in and compliment her sneakers
  4. Leave
  ```
  The extension renders buttons; a check shows its odds from the engine before you click. Picking
  one posts it as your chat message. Free text is always allowed. The chat log stays a readable
  story and SillyTavern swipes and branches keep working.
- **Group scenes**: two or three residents at a location at once (the sorority lounge in the
  evening) show stacked sprites; the model voices all of them.

## 5. The events (the tastysox games as modules)

Each event is `{ trigger, verbs, meters, resolve(), endings, picturePreset }` in
`src/events/`. The engine opens one when its trigger fires inside a scene (a location event list
+ relationship state + the model asking for it with an `[EVENT service_row]` tag).

| Event | Where | Loop |
| --- | --- | --- |
| **Service row** | cinema, lounge, bus | Arrows between pairs of feet, verbs Kiss/Sniff/Lick/Rub/Talk, each girl's hidden wants, a clock, reward reveal or punishment. |
| **Chore** | laundromat, sports hall, boudoir | Sock sorting by scent description (the matching minigame), shoe cleaning, nail painting. Pays favor or money. |
| **Tiny expedition** | any interior, once shrunk | The building's interior becomes a small zone graph: climb, hide in a shoe, search, take, use; crush rolls when a resident with high Attention moves; her "pass" opens the next zone. |
| **Seduction clock** | a quest line | Affection vs shrink timer across days; chores pay affection; get her socks before you hit 2 cm. |
| **Validation** | sorority house | A board of one task per resident; three failures flip the board. |
| **Punishment / bad end** | anywhere | Irritation maxed: a punishment scene; twice in a row, or a lethal roll, a bad-end card. |

The verb bar from the service games appears over the picture during an event; outside events the
scene shows choices instead.

## 6. The character sheet (mechanics, not flavour)

```json
{ "id": "marisol", "name": "Marisol Reyes", "age": 21, "from": "Spain", "height_cm": 173, "shoe_us": 9,
  "archetype": "Princess",          // Princess | Slacker | Drill | Viper (Stuck Up / Chillax / Tough Love / Wicked)
  "dials": { "bossy": 7, "bratty": 10, "friendly": 2, "smelly": 9, "sweaty": 8, "dirty": 4 },
  "odor":  { "cheesy": 50, "lemony": 20, "fishy": 10, "meaty": 20 },
  "shoes": "white platform sneakers, worn all day", "socks": "pink ankle socks with a crown logo",
  "hook": "Daddy's money, a tennis scholarship she doesn't need", "job": "sorority president",
  "hobby": "tennis, shopping", "kink": "sweat", "quirk": "says 'ew' as a greeting",
  "home": "sorority_house", "schedule": { "morning": "tennis_court", "afternoon": "cafe", "evening": "sorority_house", "night": "sorority_house" },
  "wants": { "verbs": ["rub", "sniff"], "hates": ["lick"], "praise": "her arches", "trigger": "being ignored" } }
```
Smelly sets stench damage of Sniff/Lick; Sweaty and Dirty set how slippery and grimy a sole is
(climb checks, the Dirt status); Bossy sets orders per scene; Bratty sets how fast irritation
rises; Friendly is what stands between a tiny and a bad end. The odor profile is text the model
must use whenever it describes her feet, so every girl smells different and consistently so.
Sheets can also be derived from existing character cards or a whole group ("sheet this group").

## 7. The rules engine and the model

- **The engine decides, the model narrates.** `src/rules.js` is pure, seeded, unit-tested. Each
  turn it builds a **brief** that goes in through a `generate_interceptor` (the Scene Mapper
  pattern): location, slot, who is here with sheet and relationship, active quests, any event state
  and the outcome it already rolled, the format rules (VN lines, `[expr]` tags, a `[CHOICES]`
  block, 2–4 paragraphs then stop).
- **Reconcile** after each reply with a cheap quiet prompt (or a Connection Profile): favor and
  irritation deltas, items given or taken, quest progress, time passed, new places or people
  mentioned, a shrink or grow, which building opened. Deltas are clamped; anything odd is logged.
- **You**: Size (cm), Money, Stamina, Composure (stench tolerance), Dirt, Reputation; per resident
  Favor and Irritation (and Fear, once tiny); Inventory; a Journal of quests; Flags; Endings seen.

## 8. Pictures and loops

- Fixed **style prompt** for everything: *"2000s flash game pixel art, chunky dark outlines, flat
  warm palette, no gradients, no text."* Interiors add *"visual novel background, eye level, empty
  room"*; event pictures add *"camera on the floor at a tiny's eye level, the socked feet fill the
  frame, a small blue-skinned tiny at the bottom edge for scale, green stink wisps rising"*.
- **Consistency**: the resident's sprite and feet card go along as reference images (as Nano
  Banana POV sends avatars). The tiny sprite is a fixed reference.
- **Backends**: the ones the sibling extensions already wire up: Google AI Studio (Nano Banana)
  through SillyTavern's secret store, OpenRouter, NanoGPT, any OpenAI-compatible API, NovelAI,
  SillyTavern's own Image Generation. Keys never live in extension settings. Everything is cached
  per location/resident/variant so a town costs a few dozen images, not one per turn.
- **Bad-end cards**: portrait, her face in a top corner looking down, the tiny where the engine
  put him; the speech bubble is an overlay drawn by the extension so it is always legible.
- **Loops**: a 2×2 **sprite sheet** of near-identical frames (toes curl, wisp drifts, droplet
  falls), sliced client-side and played as a 4-frame loop in the panel and the chat; GIF export.
  Free CSS layers over any picture: drifting wisps, falling droplets, a slow heave, screen shake on
  a stomp. The map itself has idle animation (sign flicker, smoke from the burger joint, waves).
- Pictures post as hidden chat messages the model does not read.

## 9. The panel

```
┌ Day 3 · Evening · $42 · 175 cm ──────────────── Map | Scene | Cast | Journal | Gallery ┐
│                                                                                       │
│   [ overworld canvas: island, buildings, CLOSED signs, paths, you, cursor arrow ]      │
│                                                                                       │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Suds & Socks — CLOSED — "Find Dolores's lost sock" (Journal)         [Go]  [Wait]  [Sleep]│
└───────────────────────────────────────────────────────────────────────────────────────┘
```
Scene tab: background, sprite, nameplate, dialogue box, choice buttons; verb bar during events.
Cast: every sheet, editable, with relationship meters and known schedule. Journal: quests and
flags. Gallery: pictures, loops, endings unlocked. Dockable in the extensions drawer, pop-out
window like Scene Mapper, mobile layout.

Slash commands: `/sole new [seed]`, `/sole go <place>`, `/sole wait`, `/sole sleep`,
`/sole talk <name>`, `/sole <verb> [target]`, `/sole picture`, `/sole loop`, `/sole rewind`,
`/sole export` (town + cast as JSON, importable).

## 10. Code layout (same conventions as nanoban and st_ext_3d)

```
manifest.json           generate_interceptor: soleSurvivorInterceptor
index.js                SillyTavern glue: settings, panel host, slash commands, events, injection
style.css
src/world.js            town generation prompt, validation, opening rules, time, schedules
src/map.js              layout (island, path routing) and canvas drawing of procedural pixel buildings
src/scene.js            VN brief, dialogue parsing ([expr], [CHOICES], [EVENT]), choice rendering
src/sheet.js            character template, generation, forgiving JSON parsing, card → sheet
src/rules.js            seeded RNG, checks, meters, triggers, outcome text
src/events/*.js         service_row, chore, expedition, seduction, validation, punishment
src/endings.js          ending table, cards, checkpoints and rewind
src/picture.js          style prompts, references, caching, backends (shared with the siblings)
src/frames.js           sprite-sheet slicing, loops, GIF export
src/panel.js            pure DOM builders for the tabs
test/*.test.js          node --test, no SillyTavern dependency
```

## 11. Order of work

1. **World MVP** — town generation + validation, procedural pixel map on a canvas with CLOSED
   signs and travel, the clock and schedules, the VN scene with parsed choices, the interceptor
   brief and reconcile, cast sheets, the journal. No pictures yet (placeholder backgrounds and
   coloured silhouettes). Tests for world validation, map layout, dialogue parsing, rules.
2. **Pictures** — interiors and sprite sheets with caching, Nano Banana first, other backends
   next. Bad-end cards.
3. **Events** — service row and chores, then punishment and endings with rewind.
4. **Tiny** — shrink arc and the expedition event inside interiors; seduction clock quest line.
5. **Loops**, validation board, management day loop, Scene Mapper link, import/export.

## 12. Decisions taken (change any of them)

- The overworld is drawn by code, not by an image model, so it is clickable and stable; AI
  pictures are for interiors, sprites, event shots and cards.
- Original town and cast every game; nothing of tastysox's shipped.
- The engine, not the model, decides outcomes and time. The model writes dialogue and choices.
- Choices and verbs post as your own chat message, so the log is a readable story and swipes and
  branches keep working.
- Comedic-cruel tone by default, sliders for cruelty, smell intensity, and lethality; a "no death"
  switch turns bad ends into "kept" ends.
- Working title "Sole Survivor", manifest key `soleSurvivor`, command `/sole`.
