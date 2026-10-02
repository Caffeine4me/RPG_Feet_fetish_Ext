// Dice. A seeded d20 is rolled for every player turn and handed to the model as the turn's luck. The
// model applies it when the action is uncertain and reports the check with a tag; the extension keeps
// the record. Attributes are 1 to 5 and add to the roll.

export const ATTRS = ['might', 'agility', 'wits', 'charm'];
export const ATTR_HELP = {
    might: 'lifting, holding on, forcing, enduring',
    agility: 'climbing, dodging, balance, sneaking',
    wits: 'noticing, figuring, bargaining, remembering',
    charm: 'persuading, pleading, charming, bluffing',
};

/** mulberry32: a small seeded random source. */
export function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const d20 = (r = Math.random()) => 1 + Math.floor(Math.max(0, Math.min(0.999999, r)) * 20);

/** The luck word the prompt uses for a raw d20. */
export function luck(roll) {
    if (roll === 20) return 'a stroke of luck';
    if (roll >= 16) return 'good';
    if (roll >= 11) return 'fair';
    if (roll >= 6) return 'poor';
    if (roll >= 2) return 'bad';
    return 'a disaster';
}

/** Difficulty words to numbers, for the prompt and for parsing tags. */
export const DIFFICULTY = { easy: 8, normal: 12, hard: 16, extreme: 20 };

/** Totals for each attribute with this roll, for the prompt. */
export function totals(attrs, roll) {
    return ATTRS.map((a) => ({ attr: a, mod: Number(attrs?.[a]) || 0, total: roll + (Number(attrs?.[a]) || 0) }));
}

/** One line for the brief: "Dice this turn: 14 (fair) -> might 16, agility 17, wits 15, charm 16." */
export function diceLine(attrs, roll) {
    return `${roll} (${luck(roll)}) -> ${totals(attrs, roll).map((t) => `${t.attr} ${t.total}`).join(', ')}. Easy ${DIFFICULTY.easy}, normal ${DIFFICULTY.normal}, hard ${DIFFICULTY.hard}, extreme ${DIFFICULTY.extreme}.`;
}
