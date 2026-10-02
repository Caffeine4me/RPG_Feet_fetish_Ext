// The text injected into every generation: the world at the player's size, the sheet, the giants he
// knows with their scale, the turn's dice, and how to report changes. Pure function of the game.

import { TAG_HELP } from './tags.js';
import { sheetText } from './sheet.js';
import { npcsText } from './npcs.js';
import { diceLine } from './dice.js';
import { playerText, rarityTable } from './size.js';

export function buildPrompt({ sheet, npcs = [], roll = null, checks = [], settings = {}, user = 'the player' }) {
    const playerCm = sheet.height_cm;
    const parts = [];
    parts.push(`[Smallfolk: ${user} is a ${Math.round(playerCm / 30.48 * 10) / 10}-foot-tall man in a world of giants]`);
    parts.push(`WORLD: Everyone here except ${user} is a giant. Giants come in six size classes, the taller rarer: ${rarityTable()}. Towns are built for class 1 (doors, stairs, chairs, money, food are all at that scale); class 2 stoops through doors; class 3 and up keep to the tall districts, the outdoors, or the big old halls, and the smaller giants are as careful around them as ${user} is around everyone. Scale is law: keep every height, distance, weight, sound and gesture true to the numbers below, never shrink or grow anyone, and never let ${user} do what a man his size cannot (reach a knob, step onto a chair, be heard across a loud room, carry a giant's coin without effort). Being small is never forgotten: shoes, ankles and the undersides of tables are his skyline; a voice from above is loud; a careless step, a dropped bag, a closing door, a puddle or a cat are dangers; a giant's hand is a vehicle, a cage or a shield.${settings.world ? ` ${settings.world}` : ''}`);
    parts.push(`YOU (${user}): ${playerText(playerCm)}\n${sheetText(sheet)}`);
    if (npcs.length) parts.push(`GIANTS ${user} KNOWS (sizes are fixed; use them):\n${npcsText(npcs, { playerCm, max: Number(settings.maxNpcs) || 8 })}`);
    if (roll) parts.push(`DICE THIS TURN: ${diceLine(sheet.attrs, roll)} Use the total of the fitting attribute only when ${user}'s action could fail; narrate the outcome without naming numbers, then report it with a CHECK tag.${checks.length ? ` Last checks: ${checks.slice(-3).join('; ')}.` : ''}`);
    parts.push(`BOOKKEEPING: When the story changes ${user}'s sheet, end your reply with tags, each on its own line, nothing else on those lines. The reader does not see them; the story must still say what happened in prose. Report only real changes; most replies need none or one.\n${TAG_HELP}`);
    parts.push(`Write the giants as people with their own lives who happen to be enormous; let them notice or overlook ${user} the way a person notices a cat. Prices, food, furniture and distances are at giant scale, so money and errands cost ${user} real effort. Do not write ${user}'s actions or decisions for him.`);
    return parts.join('\n\n');
}
