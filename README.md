# Smallfolk

A SillyTavern extension for playing a three-foot-tall man in a world of giants. It is not a game of its own: the story is whatever chat, character card and lorebook you already use. Smallfolk adds the part a tabletop GM would keep on paper, and keeps the model honest about scale.

- **Your sheet.** Health, stamina, nerve, food and warmth; might, agility, wits and charm; money, items with notes, conditions (soaked, hidden, carried, bruised …), injuries that heal with time, notes to remember, xp and levels.
- **A clock and weather.** Every reply moves the clock (the model says how long, or a default passes). Hunger comes on every three hours, cold when you are wet or out at night, tiredness after sixteen hours awake. Each day rolls its weather, and rain or wind change what the streets are.
- **Danger that is computed, not just described.** Every place has a danger, a crowd and a cover rating. With the hour, the weather, the dark and your own state (soaked, exhausted, hidden, shaking) that becomes one difficulty number the model is told to use, and that the extension itself rolls against when you travel, wait in the open or sleep rough.
- **A map.** The story names places and ways (MAP and ROUTE tags), the extension keeps them as a graph, draws it, finds the quickest path, and converts a giant's walking time into yours. Press Go and each leg is rolled against its hazards (a boot, a cart wheel, a cat, a gutter in flood), time passes, the cost lands on your sheet, and the outcome is handed to the model as something that already happened.
- **The giants you know.** Every giant the story names gets a size class the moment she appears, rolled by the extension so the tall ones stay rare, and her numbers go into the prompt next to you for comparison: height, weight, sole, hand, stride, her stairs, her mug, her coin; what you are to her eye (a cat, a mouse, a beetle); whether she can hear you from the floor; how her steps and her voice reach you; what is at your eye level. A to-scale pixel drawing shows you beside whoever you pick.
- **The physics of being small.** Fall heights that bruise, break and kill at your size, what you can carry, what a giant's step, breath and closing hand mean, how deep water is swimming, and how fast cold reaches a small body. Being carried is a tracked state (`[CARRIED Mara: in her apron pocket]`), with who has you and where.
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

## Being careful

The world does not make room for you, and the prompt says so: consequences land in the same reply, caution is rewarded, and at 0 health you can die (switch Lethal off to be knocked out instead). The numbers behind it:

| What | How it works |
| --- | --- |
| Difficulty of a spot | 6 + danger×2 + crowd×2 − cover×2, plus dark +3, rain +3, wind +2, cold +2 outdoors; soaked +1, tired +1, exhausted +3, starving +2, carried +2, shaking (nerve ≤ 3) +2; hidden −3. Crowds thin at night and at dawn. |
| A leg of travel, an hour in the open, a night without cover | d20 + agility + half wits against that difficulty. Clean, fine, a close call (stamina and nerve), hurt (1–2 health, maybe bruised), or a disaster on a 1 or far below (3–5 health, shaken, maybe noticed). |
| Food | One point every three hours. At 3 you are hungry; at 0 starving, and health drains. Eat from the bag, or the story feeds you with an EAT tag. |
| Warmth | Drops when soaked, when out in rain or cold, and outdoors at night. Recovers indoors and dry. At 0 health drains every hour. You dry off after two hours inside or in clear weather. |
| Tiredness | Tired after 16 hours awake, exhausted after 24 (every attribute −1). Sleep until morning restores stamina, half your nerve and some health if you are fed and warm. |
| Injuries | `[INJURY sprained ankle: agility -1, 2 days]` lowers an attribute until it heals. |
| Hard states | At 3 health or less, no stamina, no nerve, starving or freezing, the prompt tells the model exactly how that limits you this turn. |

Places get a kind when they are named (kitchen → indoors, square → open square, drawer → hideout), with default danger, crowd and cover you can edit on the map tab.

## Install

Extensions → Install extension → paste `https://github.com/caffeine4me/RPG_Feet_fetish_Ext`. Needs SillyTavern 1.12 or newer (tested against 1.19).

## Use

1. Open a chat. A sheet starts by itself (switch that off in the settings) and the character card gets her class, rolled or pinned.
2. Open the sheet from the wand menu or with `/sf`. By default it opens in its own browser window, so it can sit beside the chat or on another screen; allow pop-ups for your SillyTavern address if the browser blocks it. The ⇲ button docks it back as a panel over the chat (draggable; `–` collapses it), and ⧉ pops it out again.
3. Play. Edit anything on the sheet by hand at any time; the model only sees the sheet through the prompt, so what you set is what it plays by.
4. Move on the map tab. Click a place (or one of the ways listed from where you are), read the plan, press Go. The extension rolls the journey, posts a short line to the chat as you ("*Tom sets out for the market…*"), and the model's next reply tells what happened on the way. Wait 1 h and Sleep on the sheet tab work the same way. Set as here tells the sheet you are already somewhere without a roll.

### Slash commands

`/sf` toggles the window. Everything else is one tag's worth of change:

```
/sf new                      start the sheet over
/sf go <place>               travel there by the quickest known way
/sf wait [minutes]           let time pass here (an hour by default)
/sf sleep                    sleep here until morning
/sf eat                      eat something from the bag
/sf health -2                also stamina, nerve, food, warmth
/sf money +5
/sf item +rope x2            /sf item -rope
/sf cond +soaked             /sf cond -hidden
/sf xp +10
/sf npc Mara class 3         /sf npc Mara (rolls her class)   /sf npc Mara: runs the bakery
/sf time +2 hours            /sf time Day 2, evening
/sf place Market square: under a cart
/sf map Market square: square, danger 3, crowd 3, cover 0: stalls and a drain
/sf route Back step - Market square: 6 min, hazards: gutter, cats
/sf injury sprained ankle: agility -1, 2 days
/sf carried Mara: in her hand     /sf carried -
/sf note she owes you
/sf rest                     meters back to full
/sf undo                     undo the last change
/sf roll                     a new d20 for this turn
```

### Settings

| Setting | What it does |
| --- | --- |
| Enabled | Injects the world, your sheet, the giants and the dice into every prompt. |
| Start a sheet when a chat opens | Otherwise press New sheet in the window. |
| The sheet opens | In its own browser window, or as a panel over the chat. |
| Dice | Give the model a d20 for each of your turns. |
| Lethal | At 0 health he can die. Off: out cold, wakes worse off. |
| Minutes a reply covers | When the model gives no TIME tag, this much time passes anyway. |
| Travel, wait and sleep messages | Sent at once, or left in the message box for you to edit. |
| Hide the tags | Show the model's bookkeeping as chips instead of raw tags. |
| Your height, currency, starting money | For new sheets. 91 cm is 3 ft. |
| The character card's class | Roll it (rarer the taller) or pin 1–6. |
| About the world | Free text that goes into the prompt: the town, the money, how giants treat smallfolk. |
| Prompt position / depth / role | Where the injection lands. The default is in-chat at depth 1 as system. |

## How the prompt looks

```
[Smallfolk: Tom is a 3-foot-tall man in a world of giants]

WORLD: Everyone here except Tom is a giant. Giants come in six size classes, the taller rarer: …

DANGER IS REAL: this world does not make room for him. …

NOW: Day 2, 21:10 (evening); weather rain: every drop a cupful, gutters running like rivers.
Here: Mara's kitchen (indoors; danger 1/5, crowd 1/3, cover 2/3; warm; the cat sleeps by the stove).
Ways from here: The drawer (2 min for you); Back step (5 min for you; the cat, a closing door).
Other places known: Market square, Tess's bakery, Mill road, The river wall.
Spot: under the table.
This spot is fairly safe for someone your size (difficulty 6: indoors, danger 1 +8, crowd 2 +4, cover 2 -4, soaked +1, hidden -3).

YOU (Tom): You are 91 cm (3 ft) tall and weigh about 11 kg. The world is built for class 1 giants, so to you a stair step is up to your waist, a chair seat 1.5× your height, … a coin is 5 cm across.
Tom, level 2 (130 xp). health 7/10, stamina 4/10, nerve 10/10, food 3/10, warmth 6/10. might 2, agility 3, wits 2, charm 2.
Money: $14.50. Carrying: brass key (opens her pantry); coin ×3.
Conditions: soaked, hidden, hungry.
Injuries: sprained ankle (agility -1).

GIANTS Tom KNOWS (sizes are fixed; use them):
- Mara Voss: 10.8 m (35 ft 4 in) tall, size class 3 (Colossal; …), 11.8× your height; you come up to her ankle; her foot is longer than you are tall; she can close one hand around you. Sole 1.6 m (5 ft 4 in), big toe 38 cm, hand 1.2 m, stride 4.5 m. Her stair step is 1.1 m (3 ft 7 in) (about your height), her mug 63 cm (up to your chest), her coin 16 cm.

MUST HAPPEN IN THIS REPLY (already decided; narrate it, do not undo it):
- Tom travelled to Market square, 20 minutes on foot at his size. Mara's kitchen to Back step (5 min): a close call with the cat: unhurt, but it cost you breath and nerve. Then Back step to Market square (15 min): a gutter in flood got you: 2 health and a scare. He arrives at Day 2, 21:30 (evening).

DICE THIS TURN: 14 (fair) -> might 16, agility 17, wits 16, charm 16. Easy 8, normal 12, hard 16, extreme 20. … Add the difficulty of this spot (above) to anything done in the open.

BOOKKEEPING: When the story changes Tom's sheet, end your reply with tags …
```

## Development

Pure ES modules, no build step. `npm test` runs the unit tests with Node's own runner. `demo/index.html` shows the window and the chat chips with mock data (serve the folder over http). The earlier visual-novel prototype lives in `legacy/`.
