# Smallfolk: design notes

## What it is

An immersion layer for any SillyTavern chat, not a game engine. The chat model tells the story; the extension holds the state a game master would hold on paper and makes sure the model never loses the one fact that matters here: the player is three feet tall and everyone else is ten to a hundred.

Three loops:

1. **Inject.** Before every generation the extension sets one prompt block: the world rules, the player's sheet, the giants he knows with concrete sizes, the turn's dice, and the tag format. It is rebuilt from state each time, so a hand edit on the sheet shows up in the next reply.
2. **Read back.** The model ends a reply with square-bracket tags for what changed. The extension parses them, applies them, logs them and shows them as chips. It keeps a snapshot per applied message, so a swipe or an edit is rolled back and re-applied cleanly.
3. **Roll.** Size classes for new giants and the per-turn d20 come from the extension, seeded per chat, so rarity is enforced and luck is honest.

## Scale

`src/size.js` is the single source of truth. A giant's body parts are fractions of her height (sole 15 %, hand 10.8 %, stride 42 %) and her belongings scale with her body against a 170 cm baseline, so a 12 ft woman's mug is 2.15 times a normal mug. Everything is compared with the player's own height ("up to your waist", "3.2× your height") so the model gets comparisons, not just numbers.

The player defaults to 91 cm. His height is on the sheet and editable, and the whole prompt and the drawing follow it.

## Senses and physics

Beyond lengths, `src/size.js` gives each giant a weight (70 kg scaled by the cube of her height), what the player looks like to her (his height divided by her scale factor, named: a cat at 40 cm, a mouse at 15, a beetle at 8), whether she can hear him from the floor, how her steps and voice arrive at his size, and what sits at his eye level. `physicsText` gives the player's own numbers: falls at two, four and eight times his height, carrying a quarter of his weight, water deeper than six tenths of his height. The point is to hand the model specifics it would otherwise fudge.

Being carried is state, not just a condition: who has him and where. It raises the difficulty of the spot (he is at her mercy) and the prompt says what it limits.

## Window

The sheet opens in its own browser window by default (`window.open`, with the extension's stylesheet linked into the new document; the panel code creates its elements in whichever document it was mounted in). The floating panel over the chat remains as the fallback when pop-ups are blocked and as a choice in the settings.

## Sheet

Meters: health, stamina, nerve, each cur/max. Attributes: might, agility, wits, charm, 1 to 5 by default (0 to 9 allowed), added to a d20. XP: 100 per level, one attribute point per level. Money is a number with a currency string. Items: name, quantity, note. Conditions: a set of short words. Clock and place are free text the model keeps up to date with TIME and PLACE tags. Notes are one-liners.

## Giants

Loose name matching (first name wins) so the model can write "Mara" and "Mara Voss" and get one entry. Class is rolled unless the tag names one or gives a height; a later tag with a class overrides (the story decided). The card's character gets her class on sheet creation, rolled or pinned in the settings. The prompt lists card characters first, then the most recently seen, up to a cap.

## Dice

One d20 per player turn, seeded from the chat seed and the turn number so a regenerate reuses the same luck. The prompt gives the raw roll, the luck word, and the four totals, and tells the model to use a total only when the action could fail and to report with a CHECK tag. The last few checks are echoed back so the model remembers what happened.

## Danger

`src/danger.js` turns a place and a moment into one difficulty: the place's danger, crowd (thinned by the hour) and cover, the dark, the weather, and the player's own state. The same number is told to the model ("this spot is dangerous for someone your size, difficulty 15") and rolled against by the engine whenever the player moves through the world without the model's help: a leg of travel, an hour waiting in the open, a night without cover. A roll picks a concrete hazard from the place's kind, the route's own list, the weather and the dark, and lands its cost on the sheet before the model sees anything; the model gets the outcome as a fact to narrate.

Time is a cost in itself (`passTime` in `src/sheet.js`): hunger every three hours, warmth lost when wet, cold or out at night, tiredness after sixteen hours awake, and health lost while starving or freezing. A TIME tag that skips ten hours or more is treated gently (he rested and found something to eat along the way), so the model's "the next morning" does not kill him.

## Navigation

`src/nav.js` is a graph: places with kind, danger, crowd, cover and a note; routes with a giant's walking minutes and a hazard list. The story grows it through MAP, ROUTE and PLACE tags; the player can add and edit on the map tab. Walking time for the player is a giant's minutes × (170 / his height) × 1.3 for detours. Paths are found by Dijkstra over those minutes. The drawing (`src/mapart.js`) places new nodes around what they connect to, then relaxes the whole graph with repulsion and route springs; positions are stored, so the map stays put between sessions.

Travel, waiting and sleeping all do three things: run the engine (`journey`, `waitHere`, `sleepHere`), store the outcome as `pending`, and post one short line to the chat as the player. The next generation carries the outcome under MUST HAPPEN; the reply clears it.

## Code

```
index.js          SillyTavern glue: settings, events, injection, interceptor, /sf, window
src/size.js       classes, heights, scale maths and text
src/sheet.js      the player sheet and its operations
src/npcs.js       the roster of giants
src/tags.js       tag grammar: parse, apply, strip, labels
src/prompt.js     the injected block
src/dice.js       seeded d20, attributes, luck words
src/clock.js      day and minute, slots, TIME tag parsing, weather
src/nav.js        places, routes, paths, layout, map text
src/danger.js     difficulty, hazards, legs, journeys, waiting, sleeping, hard states
src/mapart.js     the map drawing
src/panel.js      the window (sheet / map / bag / giants / log)
src/scaleart.js   the to-scale pixel drawing
src/chatview.js   tags -> chips in the chat
src/json.js       small parsing helpers
test/             node --test
demo/index.html   the window and the chips with mock data
legacy/           the earlier visual-novel prototype (town map, sprites, feet view)
```
