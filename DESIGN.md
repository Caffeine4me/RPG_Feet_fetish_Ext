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

## Sheet

Meters: health, stamina, nerve, each cur/max. Attributes: might, agility, wits, charm, 1 to 5 by default (0 to 9 allowed), added to a d20. XP: 100 per level, one attribute point per level. Money is a number with a currency string. Items: name, quantity, note. Conditions: a set of short words. Clock and place are free text the model keeps up to date with TIME and PLACE tags. Notes are one-liners.

## Giants

Loose name matching (first name wins) so the model can write "Mara" and "Mara Voss" and get one entry. Class is rolled unless the tag names one or gives a height; a later tag with a class overrides (the story decided). The card's character gets her class on sheet creation, rolled or pinned in the settings. The prompt lists card characters first, then the most recently seen, up to a cap.

## Dice

One d20 per player turn, seeded from the chat seed and the turn number so a regenerate reuses the same luck. The prompt gives the raw roll, the luck word, and the four totals, and tells the model to use a total only when the action could fail and to report with a CHECK tag. The last few checks are echoed back so the model remembers what happened.

## Code

```
index.js          SillyTavern glue: settings, events, injection, interceptor, /sf, window
src/size.js       classes, heights, scale maths and text
src/sheet.js      the player sheet and its operations
src/npcs.js       the roster of giants
src/tags.js       tag grammar: parse, apply, strip, labels
src/prompt.js     the injected block
src/dice.js       seeded d20, attributes, luck words
src/panel.js      the window (sheet / bag / giants / log)
src/scaleart.js   the to-scale pixel drawing
src/chatview.js   tags -> chips in the chat
src/json.js       small parsing helpers
test/             node --test
demo/index.html   the window and the chips with mock data
legacy/           the earlier visual-novel prototype (town map, sprites, feet view)
```
