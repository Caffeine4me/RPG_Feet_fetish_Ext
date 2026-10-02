# Sole Survivor

A [SillyTavern](https://sillytavern.app/) extension that turns the character you are chatting with into
the centre of a small, explorable town, in the spirit of 2000s flash adventure games about bossy girls
with smelly socks. Pixel town map, visual-novel scenes, a rules engine with dice, and sprites, feet cards
and backgrounds generated automatically from the character card.

**Adult content.** Foot fetish, femdom, humiliation, size play. Everyone is an adult. Original cast only:
the extension ships a character *template* and a town *framework*; nothing from any existing game is included.

## What it does

1. **New game** reads the character card(s) in the chat (a single card or a whole group) and writes a
   *sheet* for each: an attitude (Princess, Slacker, Drill, Viper), six dials 0–11 (bossy, bratty, friendly,
   smelly, sweaty, dirty), a foot-odor profile (cheesy / lemony / fishy / meaty), her usual shoes and socks,
   what she likes done to her feet and what sets her off. Everything already on the card is kept.
2. It then asks the model for a **town** built around those characters: where they live and hang out,
   their friends and rivals as extra residents (each with a full sheet), 10–14 places with opening hours,
   a few that start **CLOSED** until a quest, a day or a favor threshold opens them, and a handful of quests.
3. The **map** is drawn by the extension itself (procedural pixel buildings, CLOSED signs, paths, trees,
   a plaza, a lighthouse, a farm plot). Click a building to go there. A day has four slots; travelling
   costs one. Residents follow schedules, so the gym has the sporty one in the morning and the cinema
   fills up in the evening. **Where is everyone?** shows the markers.
4. Entering a place where someone is starts a **scene**: the chat model writes it as a visual novel
   (`Name [smug]: "..."`) and ends with a `[CHOICES]` block. The panel shows the background, the
   character's sprite with the right expression, the dialogue, and the choices as buttons. Picking one
   sends it as your message. You can always type anything instead.
5. The **rules engine** decides outcomes, not the model: a choice marked as a check (sniff, lick, rub,
   kiss, talk; climb, hide, sneak when you are tiny; chores) rolls a d20 against her dials, applies the
   result to your meters (stamina, composure, dirt, money, size) and her relationship (favor, irritation,
   fear), and tells the model what happened so it narrates it. A verb bar (KISS SNIFF LICK RUB TALK) does
   the same from the panel. Irritation leads to punishments; fear, when tiny, to bad ends.
6. After every reply a cheap **bookkeeping** call reads what the story changed: favor, items, money,
   quests given or done, shoes off, a new place that was mentioned (added to the map, CLOSED), time passing.
7. **Sprites**: a 3×2 expression sheet (neutral, smug, annoyed, laughing, bored, disgusted) is drawn
   from the card's avatar as a reference, keyed out and cut into six sprites. Feet cards (shoes / socks /
   bare soles from floor level) and place backgrounds are made the same way. The camera button makes a
   floor-level picture of the current moment and posts it in the chat as a message the AI does not read.

## Install

**Extensions → Install extension** → paste `https://github.com/caffeine4me/RPG_Feet_fetish_Ext`.

Pictures use the same backends as Scene Mapper and Nano Banana POV: Google AI Studio (Nano Banana),
OpenRouter, NanoGPT, or any OpenAI-compatible API. Paste the key in **Extensions → Sole Survivor**;
it goes into SillyTavern's secret store. Everything else works without pictures.

## Use

- Wand menu → **Sole Survivor**, or `/sole`, opens the game window. Press ✨ **New game**.
- Map: click a building. **Wait** passes a slot, **Sleep** ends the day, **Look around** starts a scene without moving.
- Scene: click the dialogue box to step through lines; choose an option, press a verb, or type.
- Cast: every sheet, editable dials, **Make sprites**, **Make feet card**.
- Journal: quests, inventory, places and their CLOSED reasons; export / import the town as JSON.
- ↶ **Rewind** undoes the last game step (the chat message stays; swipe or send something new).
- Slash: `/sole new`, `/sole go gym`, `/sole wait`, `/sole sleep`, `/sole look`, `/sole sniff [name]`, `/sole picture`, `/sole rewind`.

## SillyTavern settings that matter

The extension's settings drawer has a **SillyTavern check** with a Fix button for each of these.

| User Setting | Set it to | Why |
| --- | --- | --- |
| Relax message trim in Groups | on (group chats) | Otherwise SillyTavern cuts a reply where another member's name appears, and a scene with two girls talking loses its second half. |
| Auto-scroll Chat | on | The choices sit at the end of the newest message. |
| Collapse Consecutive Newlines | off | Blank lines separate narration, dialogue and the `[CHOICES]` block. |
| Chat Width | 50 or less | Leaves room for the game window beside the chat. |
| Forbid External Media | either | Sprites and backgrounds are saved inside your SillyTavern, so they are not external. |
| Streaming | either | The game reads the reply once it is complete. |

Choices also appear as buttons inside the chat message itself, with `Name [expression]:` lines given a
coloured nameplate, so the game is playable with the window closed. A **Connection Profile** for
"building and bookkeeping" (a fast, cheap model) keeps the after-reply bookkeeping off your main model.

## Settings

| Setting | What it does |
| --- | --- |
| Extra residents | How many characters the town generator invents around your card |
| Model for building and bookkeeping | A Connection Profile (a fast model is fine) for the sheet, the town and the after-reply bookkeeping |
| What you want the town to be like | Free text: "seaside college town", "make her a Viper", "she runs the gym" |
| Cruelty / Smell / Scene length / Lethal | Tone knobs in the brief |
| Your moves | Send at once, or put in the message box to edit first |
| Brief position / depth / role | Where the game state is injected |
| Pictures | Source, model, resolution, key; auto sprites and auto backgrounds |
| Choices in the chat / Auto-open | Buttons inside the message; open the window when a chat with a game opens |

## Development

The game logic has no SillyTavern dependency and is unit-tested:

```
npm test
```

- `src/sheet.js` the character sheet: template, prompt, normalisation
- `src/world.js` the town: location types, generation prompt, validation, clock, schedules, quests
- `src/map.js` the pixel map: layout, 3×5 pixel font, icons, drawing
- `src/rules.js` the dice: checks against dials, deltas, triggers
- `src/scene.js` the brief, the reply parser, the bookkeeping request
- `src/sprites.js` / `src/picture.js` prompts, slicing and keying; picture backends
- `src/panel.js` the game window
- `index.js` the SillyTavern side

MIT licence.
