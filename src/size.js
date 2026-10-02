// Scale. The player is a small man (3 ft by default) in a world where everyone else is a giant of one
// of six size classes, 10 ft to 100 ft, the taller ones rarer. Everything that depends on size (how
// tall she is next to you, how big her cup, her step, her hand) is computed here so that the prompt,
// the panel and the scale drawing agree.

export const FT = 30.48;
export const PLAYER_CM = 91; // 3 ft
export const HUMAN_CM = 170; // the proportions a giant's body and belongings are scaled from

/** The six classes: height range in feet and how common each is. */
export const SIZE_CLASSES = [
    { n: 1, name: 'Big', ft: [10, 15], weight: 40, line: 'the common size; the world is built for her' },
    { n: 2, name: 'Towering', ft: [15, 25], weight: 27, line: 'ducks through ordinary doors' },
    { n: 3, name: 'Colossal', ft: [25, 40], weight: 17, line: 'lives in the tall districts; a hand can carry you' },
    { n: 4, name: 'Titanic', ft: [40, 60], weight: 10, line: 'rare; a step near you shakes the floor' },
    { n: 5, name: 'Monumental', ft: [60, 80], weight: 5, line: 'very rare; she has to look for you' },
    { n: 6, name: 'Mythic', ft: [80, 100], weight: 1, line: 'one in a hundred; a walking landmark' },
];

export const classOf = (n) => SIZE_CLASSES[Math.max(1, Math.min(6, Math.round(Number(n) || 1))) - 1];

/** Roll a class by weight (r in 0..1). */
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
    return Math.ceil(ft * FT);
}

/** The class a height belongs to. */
export function classForHeight(cm) {
    const ft = (Number(cm) || 0) / FT;
    for (const c of SIZE_CLASSES) if (ft < c.ft[1]) return c.n;
    return 6;
}

/** "12 ft 4 in" */
export const ftIn = (cm) => {
    const inches = Math.round((Number(cm) || 0) / 2.54);
    const f = Math.floor(inches / 12);
    return f ? `${f} ft${inches % 12 ? ` ${inches % 12} in` : ''}` : `${inches} in`;
};

/** Both units: "3.7 m (12 ft 2 in)" or "48 cm (1 ft 7 in)". */
export const len = (cm) => (cm < 100 ? `${Math.round(cm)} cm (${ftIn(cm)})` : `${(cm / 100).toFixed(1)} m (${ftIn(cm)})`);

/** "about half your height", "2.3× your height" */
export function vsYou(cm, playerCm = PLAYER_CM) {
    const r = cm / (Number(playerCm) || PLAYER_CM);
    if (r >= 1.5) return `${r.toFixed(r >= 10 ? 0 : 1)}× your height`;
    if (r >= 0.9) return 'about your height';
    if (r >= 0.6) return 'up to your chest';
    if (r >= 0.4) return 'up to your waist';
    if (r >= 0.2) return 'up to your knee';
    if (r >= 0.08) return 'the size of your hand';
    return 'small enough to pocket';
}

/**
 * Parts of a giant's body and belongings, as a fraction of her height (human proportions), with the
 * ratio against the player. Everything she owns is scaled to her body (HUMAN_CM) so her cup, chair
 * and stairs are as big to her as yours would be to you.
 */
const BODY = [
    ['foot (sole length)', 0.15], ['foot width', 0.06], ['big toe', 0.035], ['hand', 0.108], ['stride', 0.42], ['eye height', 0.93],
];
const THINGS = [
    ['a stair step', 17], ['a chair seat', 45], ['a table top', 75], ['a door knob', 100], ['a door', 205], ['a kitchen counter', 90], ['a coffee mug', 10], ['a coin', 2.5], ['a phone', 15], ['a shoe (hers)', 26],
];

export function scaleOf(heightCm, playerCm = PLAYER_CM) {
    const h = Number(heightCm) || HUMAN_CM;
    const p = Number(playerCm) || PLAYER_CM;
    const k = h / HUMAN_CM;
    return {
        height: h, cls: classForHeight(h), ratio: h / p, k,
        body: BODY.map(([name, f]) => ({ name, cm: h * f, vs: vsYou(h * f, p) })),
        things: THINGS.map(([name, cm]) => ({ name, cm: cm * k, vs: vsYou(cm * k, p) })),
    };
}

/** Where you reach on her. */
export function reach(ratio) {
    if (ratio >= 20) return 'you do not reach the top of her foot';
    if (ratio >= 12) return 'you do not reach her ankle bone';
    if (ratio >= 7) return 'you come up to her ankle';
    if (ratio >= 4.5) return 'you come up to her shin';
    if (ratio >= 3) return 'you come up to her knee';
    if (ratio >= 2.2) return 'you come up to her thigh';
    if (ratio >= 1.6) return 'you come up to her hip';
    return 'you come up to her chest';
}

/** One paragraph about one giant for the prompt: concrete, both units, compared with the player. */
export function scaleText(npc, playerCm = PLAYER_CM) {
    const s = scaleOf(npc.height_cm, playerCm);
    const c = classOf(npc.size_class ?? s.cls);
    const foot = s.body[0].cm, hand = s.body[3].cm, toe = s.body[2].cm;
    const footLine = foot >= playerCm * 2 ? `her foot is ${(foot / playerCm).toFixed(1)} times your height long` : foot >= playerCm ? 'her foot is longer than you are tall' : foot >= playerCm * 0.6 ? 'her foot comes up past your waist when she stands' : 'her foot reaches your knee when she stands';
    const handLine = hand >= playerCm * 1.2 ? 'she can close one hand around you' : hand >= playerCm * 0.7 ? 'she can lift you in one hand' : 'she needs both hands to pick you up';
    return `${npc.name}: ${len(s.height)} tall, size class ${c.n} (${c.name}; ${c.line}), ${s.ratio.toFixed(1)}× your height; ${reach(s.ratio)}; ${footLine}; ${handLine}. Sole ${len(foot)}, big toe ${len(toe)}, hand ${len(hand)}, stride ${len(s.body[4].cm)}. Her stair step is ${len(s.things[0].cm)} (${s.things[0].vs}), her chair seat ${len(s.things[1].cm)}, her table ${len(s.things[2].cm)} up, her mug ${len(s.things[6].cm)} (${s.things[6].vs}), her coin ${len(s.things[7].cm)}.`;
}

/** Short tag for lists: "Colossal (3) · 31 ft · 10.4× you". */
export const sizeLine = (npc, playerCm = PLAYER_CM) => {
    const c = classOf(npc.size_class ?? classForHeight(npc.height_cm));
    return `${c.name} (${c.n}) · ${ftIn(npc.height_cm)} · ${(npc.height_cm / (playerCm || PLAYER_CM)).toFixed(1)}× you`;
};

export const rarityTable = () => SIZE_CLASSES.map((c) => `class ${c.n} ${c.name}: ${c.ft[0]}-${c.ft[1]} ft, ${c.weight} in 100`).join('; ');

/** What a 3 ft man is next to the common world (class 1 scale), for the YOU section. */
export function playerText(playerCm = PLAYER_CM) {
    const p = Number(playerCm) || PLAYER_CM;
    const s = scaleOf(heightFor(1, 0.3), p); // a typical class 1 at 11.5 ft
    return `You are ${len(p)} tall and weigh about ${Math.round(70 * (p / HUMAN_CM) ** 3)} kg. The world is built for class 1 giants, so to you a stair step is ${s.things[0].vs}, a chair seat ${s.things[1].vs}, a table top ${s.things[2].vs}, a door knob ${s.things[3].vs}, a mug ${s.things[6].vs}, and a coin is ${len(s.things[7].cm)} across (${s.things[7].vs}). Crowds are forests of legs; a dropped bag can pin you; a puddle is a pond.`;
}
