# Smallfolk

A SillyTavern extension for playing a three-foot-tall man in a world of giants. It is not a game of its own: the story is whatever chat, character card and lorebook you already use. Smallfolk adds the part a tabletop GM would keep on paper, and keeps the model honest about scale.

- **Your sheet.** Health, stamina and nerve meters; might, agility, wits and charm; money, items with notes, conditions (soaked, hidden, carried, bruised …), the time and where you are, notes to remember, xp and levels.
- **The giants you know.** Every giant the story names gets a size class the moment she appears, rolled by the extension so the tall ones stay rare, and her numbers (height, sole, hand, stride, her stairs, her mug, her coin) go into the prompt next to you for comparison. A to-scale pixel drawing shows you beside whoever you pick.
- **Dice.** Each of your turns the model gets a d20 and your totals; it uses them only when what you try could fail, then reports the check.
- **Bookkeeping.** The model ends its reply with short tags when something on the sheet changes (`[HEALTH -2]`, `[MONEY +5]`, `[ITEM +brass key]`, `[NPC Mara class 3]` …). The extension applies them, hides them in the chat behind small chips, and rolls them back on a swipe or an edit.

## Size classes

| Class | Name | Height | How common |
| --- | --- | --- | --- |
| 1 | Big | 10–15 ft | 40 in 100 |
| 2 | Towering | 15–25 ft | 27 in 100 |
| 3 | Colossal | 25–40 ft | 17 in 100 |
| 4 | Titanic | 40–60 ft | 10 in 100 |
| 5 | Monumental | 60–80 ft | 5 in 100 |
| 6 | Mythic | 80–100 ft | 1 in 100 |

Towns are built for class 1. A class 2 stoops through doors; class 3 and above keep to the tall districts and the outdoors. Everything a giant owns is scaled to her body, so a class 1's stair step comes up to your waist and a class 3's coffee mug is a barrel.

## Install

Extensions → Install extension → paste `https://github.com/caffeine4me/RPG_Feet_fetish_Ext`. Needs SillyTavern 1.12 or newer (tested against 1.19).

## Use

1. Open a chat. A sheet starts by itself (switch that off in the settings) and the character card gets her class, rolled or pinned.
2. Open the sheet from the wand menu or with `/sf`. Drag it anywhere; the `–` button collapses it to its header.
3. Play. Edit anything on the sheet by hand at any time; the model only sees the sheet through the prompt, so what you set is what it plays by.

### Slash commands

`/sf` toggles the window. Everything else is one tag's worth of change:

```
/sf new                      start the sheet over
/sf health -2                also stamina, nerve
/sf money +5
/sf item +rope x2            /sf item -rope
/sf cond +soaked             /sf cond -hidden
/sf xp +10
/sf npc Mara class 3         /sf npc Mara (rolls her class)   /sf npc Mara: runs the bakery
/sf time Day 2, evening      /sf place under the table      /sf note she owes you
/sf rest                     meters back to full
/sf undo                     undo the last change
/sf roll                     a new d20 for this turn
```

### Settings

| Setting | What it does |
| --- | --- |
| Enabled | Injects the world, your sheet, the giants and the dice into every prompt. |
| Start a sheet when a chat opens | Otherwise press New sheet in the window. |
| Dice | Give the model a d20 for each of your turns. |
| Hide the tags | Show the model's bookkeeping as chips instead of raw tags. |
| Your height, currency, starting money | For new sheets. 91 cm is 3 ft. |
| The character card's class | Roll it (rarer the taller) or pin 1–6. |
| About the world | Free text that goes into the prompt: the town, the money, how giants treat smallfolk. |
| Prompt position / depth / role | Where the injection lands. The default is in-chat at depth 1 as system. |

## How the prompt looks

```
[Smallfolk: Tom is a 3-foot-tall man in a world of giants]

WORLD: Everyone here except Tom is a giant. Giants come in six size classes, the taller rarer: …

YOU (Tom): You are 91 cm (3 ft) tall and weigh about 11 kg. The world is built for class 1 giants, so to you a stair step is up to your waist, a chair seat 1.5× your height, … a coin is 5 cm across.
Tom, level 2 (130 xp). health 7/10, stamina 4/10, nerve 10/10. might 2, agility 3, wits 2, charm 2.
Money: $14.50. Carrying: brass key (opens her pantry); coin ×3.
Conditions: soaked, hidden.
Time: Day 2, late evening. Where: Mara's kitchen, under the table.

GIANTS Tom KNOWS (sizes are fixed; use them):
- Mara Voss: 10.8 m (35 ft 4 in) tall, size class 3 (Colossal; …), 11.8× your height; you come up to her ankle; her foot is longer than you are tall; she can close one hand around you. Sole 1.6 m (5 ft 4 in), big toe 38 cm, hand 1.2 m, stride 4.5 m. Her stair step is 1.1 m (3 ft 7 in) (about your height), her mug 63 cm (up to your chest), her coin 16 cm.

DICE THIS TURN: 14 (fair) -> might 16, agility 17, wits 16, charm 16. Easy 8, normal 12, hard 16, extreme 20. …

BOOKKEEPING: When the story changes Tom's sheet, end your reply with tags …
```

## Development

Pure ES modules, no build step. `npm test` runs the unit tests with Node's own runner. `demo/index.html` shows the window and the chat chips with mock data (serve the folder over http). The earlier visual-novel prototype lives in `legacy/`.
