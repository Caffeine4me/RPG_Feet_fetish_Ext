// The text injected into every generation: the world at the player's size, the danger of here and now,
// the sheet, the map, the giants he knows with their scale, the turn's dice, any outcome the engine has
// already decided, and how to report changes. Pure function of the game.

import { TAG_HELP } from './tags.js';
import { sheetText } from './sheet.js';
import { npcsText } from './npcs.js';
import { diceLine } from './dice.js';
import { physicsText, playerText, rarityTable } from './size.js';
import { here, navText } from './nav.js';
import { clockText, weatherLine } from './clock.js';
import { threatText, triggers } from './danger.js';

export function buildPrompt({ sheet, npcs = [], nav = null, weather = 'clear', roll = null, checks = [], pending = null, settings = {}, user = 'the player' }) {
    const playerCm = sheet.height_cm;
    const lethal = settings.lethal !== false;
    const parts = [];
    parts.push(`[Smallfolk: ${user} is a ${Math.round(playerCm / 30.48 * 10) / 10}-foot-tall man in a world of giants]`);
    parts.push(`WORLD: Everyone here except ${user} is a giant. Giants come in six size classes, the taller rarer: ${rarityTable()}. Towns are built for class 1 (doors, stairs, chairs, money, food are all at that scale); class 2 stoops through doors; class 3 and up keep to the tall districts, the outdoors, or the big old halls, and the smaller giants are as careful around them as ${user} is around everyone. Scale is law: keep every height, distance, weight, sound and gesture true to the numbers below, never shrink or grow anyone, and never let ${user} do what a man his size cannot (reach a knob, step onto a chair, be heard across a loud room, carry a giant's coin without effort).${settings.world ? ` ${settings.world}` : ''}`);
    parts.push(`DANGER IS REAL: this world does not make room for him. A boot, a cart wheel, a closing door, a cat, a gutter in rain, a fall from a table or a careless hand can maim or kill him, and giants mostly do not notice him in time. Carelessness has consequences in the same reply, not later: crossing open floor in a crowd, moving in the dark, climbing wet things, being seen by the wrong giant, going hungry or cold. Caution is rewarded: cover, timing, patience, asking the right giant, keeping dry and fed. ${lethal ? `If his health reaches 0 he can die; when it happens, write it.` : 'If his health reaches 0 he is out cold and wakes worse off, somewhere a giant put him.'} Use the sheet: a man with 3 health limps and bleeds; with no stamina he cannot climb; with no nerve he freezes; hungry, cold and tired men make mistakes.`);
    const at = nav ? here(nav) : null;
    const env = { sheet, time: sheet.time, weather };
    parts.push(`NOW: ${clockText(sheet.time)}; weather ${weatherLine(weather)}.${nav ? `\n${navText(nav, playerCm)}` : ''}${sheet.place ? `\nSpot: ${sheet.place}.` : ''}\n${threatText(at, env)}`);
    parts.push(`YOU (${user}): ${playerText(playerCm)} ${physicsText(playerCm)}\n${sheetText(sheet)}`);
    if (npcs.length) parts.push(`GIANTS ${user} KNOWS (sizes are fixed; use them):\n${npcsText(npcs, { playerCm, max: Number(settings.maxNpcs) || 8 })}`);
    const must = triggers(sheet, { lethal });
    const lines = [];
    if (pending) lines.push(pending);
    for (const t of must) lines.push(t.text);
    if (lines.length) parts.push(`MUST HAPPEN IN THIS REPLY (already decided; narrate it, do not undo it):\n${lines.map((l) => `- ${l}`).join('\n')}`);
    if (roll) parts.push(`DICE THIS TURN: ${diceLine(sheet.attrs, roll)} Use the total of the fitting attribute only when ${user}'s action could fail; narrate the outcome without naming numbers, then report it with a CHECK tag. Add the difficulty of this spot (above) to anything done in the open.${checks.length ? ` Last checks: ${checks.slice(-3).join('; ')}.` : ''}`);
    parts.push(`BOOKKEEPING: When the story changes ${user}'s sheet, time, place or map, end your reply with tags, each on its own line, nothing else on those lines. The reader does not see them; the story must still say what happened in prose. Always report time passing and the place when it changes; map a place or a way the first time he learns of it.\n${TAG_HELP}`);
    parts.push(`Write the giants as people with their own lives who happen to be enormous; let them notice or overlook ${user} the way a person notices a cat. Prices, food, furniture and distances are at giant scale, so money and errands cost ${user} real effort. Do not write ${user}'s actions or decisions for him.`);
    return parts.join('\n\n');
}
