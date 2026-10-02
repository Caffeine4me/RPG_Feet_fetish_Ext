// Size classes: every woman in the cast is a giant, rolled into one of six classes from 10 ft to 100 ft,
// the taller ones rarer. The player is a normal-sized human. Everything that depends on scale (feet,
// stench, danger, what she can do to you) is derived here so the prompts and the drawings agree.

export const PLAYER_CM = 175;
export const FT = 30.48;

/** The six classes: height range in feet, how common, and how the sheet and the prompt name them. */
export const SIZE_CLASSES = [
    { n: 1, name: 'Big', ft: [10, 15], weight: 40, line: 'twice your height or more: she looks down at you like a child, and her shoes are the size of your chest' },
    { n: 2, name: 'Towering', ft: [15, 25], weight: 27, line: 'three to four times your height: you come up to her knee, and one of her socks could swallow you' },
    { n: 3, name: 'Colossal', ft: [25, 40], weight: 17, line: 'five to seven times your height: her foot is longer than you are tall; she can carry you in one hand' },
    { n: 4, name: 'Titanic', ft: [40, 60], weight: 10, line: 'eight to ten times your height: you stand on her sole like a rug; a toe is the size of your torso' },
    { n: 5, name: 'Monumental', ft: [60, 80], weight: 5, line: 'eleven to fourteen times your height: the sole of her foot is a wall; a step near you is an earthquake' },
    { n: 6, name: 'Mythic', ft: [80, 100], weight: 1, line: 'fifteen to seventeen times your height: her feet are landscape; you are a speck she has to look for' },
];

export const classOf = (n) => SIZE_CLASSES[Math.max(1, Math.min(6, Math.round(Number(n) || 1))) - 1];

/** Roll a class by weight (0..1 random in, class number out). */
export function rollClass(r = Math.random()) {
    const total = SIZE_CLASSES.reduce((a, c) => a + c.weight, 0);
    let x = Math.max(0, Math.min(0.999999, Number(r) || 0)) * total;
    for (const c of SIZE_CLASSES) { if (x < c.weight) return c.n; x -= c.weight; }
    return 1;
}

/** A height in cm inside the class's range (r in 0..1 picks where). */
export function heightFor(n, r = Math.random()) {
    const c = classOf(n);
    const ft = c.ft[0] + (c.ft[1] - c.ft[0]) * Math.max(0, Math.min(1, Number(r) || 0));
    return Math.round(ft * FT);
}

/** The class a height belongs to (for sheets that came with a height). */
export function classForHeight(cm) {
    const ft = (Number(cm) || 0) / FT;
    for (const c of SIZE_CLASSES) if (ft < c.ft[1]) return c.n;
    return 6;
}

const ftIn = (cm) => { const inches = Math.round(cm / 2.54); const f = Math.floor(inches / 12); return `${f} ft${inches % 12 ? ` ${inches % 12} in` : ''}`; };
const len = (cm) => (cm < 100 ? `${Math.round(cm)} cm (${ftIn(cm)})` : `${(cm / 100).toFixed(1)} m (${ftIn(cm)})`);

/**
 * The scale of one giant against the player, with body-part sizes, for the prompt and the panel.
 * Proportions: foot length ≈ 15% of height, foot width ≈ 6%, big toe ≈ 3.5% long, shoe size follows.
 */
export function scaleOf(heightCm, playerCm = PLAYER_CM) {
    const h = Number(heightCm) || PLAYER_CM;
    const ratio = h / (Number(playerCm) || PLAYER_CM);
    const foot = h * 0.15, footWidth = h * 0.06, toe = h * 0.035, hand = h * 0.108, stride = h * 0.4;
    return { ratio, cls: classForHeight(h), height: h, foot, footWidth, toe, hand, stride,
        playerToFoot: (Number(playerCm) || PLAYER_CM) / foot, // 1 = as long as her foot
        playerToToe: (Number(playerCm) || PLAYER_CM) / toe };
}

/** Sentences about her size for the prompt: concrete, in both units, compared with the player. */
export function scaleText(sheet, playerCm = PLAYER_CM) {
    const s = scaleOf(sheet.height_cm, playerCm);
    const c = classOf(sheet.size_class ?? s.cls);
    const where = s.ratio >= 12 ? 'you do not reach her ankle bone' : s.ratio >= 7 ? 'you come up to her ankle' : s.ratio >= 4 ? 'you come up to her shin' : s.ratio >= 2.6 ? 'you come up to her knee' : s.ratio >= 2 ? 'you come up to her thigh' : 'you come up to her hip';
    const feet = s.playerToFoot <= 0.5 ? `each of her feet is ${(1 / s.playerToFoot).toFixed(1)} times your height long` : s.playerToFoot < 1 ? 'her foot is longer than you are tall' : s.playerToFoot < 1.6 ? 'her foot is about as long as you are tall' : 'her foot comes up past your waist when she stands';
    return `${sheet.name} is ${len(s.height)} tall (size class ${c.n}, ${c.name}: ${c.line}); ${where}; ${feet}; her sole is ${len(s.foot)} long and ${len(s.footWidth)} wide, her big toe ${len(s.toe)}, her hand ${len(s.hand)}. A toe can pin you; a sock can hold you; a step can crush you.`;
}

/** One line for lists and the panel. */
export const sizeLine = (sheet) => { const c = classOf(sheet.size_class ?? classForHeight(sheet.height_cm)); return `${c.name} (${c.n}) · ${ftIn(sheet.height_cm)} · ${(sheet.height_cm / PLAYER_CM).toFixed(1)}× you`; };

/** Rarity text for the generator and the cast tab. */
export const rarityTable = () => SIZE_CLASSES.map((c) => `class ${c.n} ${c.name}: ${c.ft[0]}-${c.ft[1]} ft, ${c.weight}% of giants`).join('; ');

/**
 * Assign classes to a cast of `count` with the weights, deterministic for a seed, and at least one
 * class 2+ when there are three or more (a town of only class-1s is dull).
 */
export function rollCast(count, rng) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(rollClass(rng()));
    if (count >= 3 && !out.some((n) => n >= 2)) out[Math.floor(rng() * count)] = 2 + Math.floor(rng() * 2);
    return out;
}
