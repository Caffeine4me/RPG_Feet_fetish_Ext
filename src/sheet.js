// The character sheet: the same shape for the character card you are chatting with and for every
// resident the world generator invents. The dials are mechanics (see rules.js), not flavour.

import { extractJson, list, num, slug, str } from './json.js';
import { PLAYER_CM, classForHeight, classOf, heightFor, rollClass, scaleText } from './size.js';

/** Four attitudes. The key is what the sheet stores; `line` is what the model is told it means. */
export const ARCHETYPES = {
    Princess: { line: 'spoiled and entitled; expects to be admired and served; punishes with contempt and makes you grovel' },
    Slacker: { line: 'easy-going and lazy; lets things slide and barely notices you, until you touch what is hers' },
    Drill: { line: 'strict and demanding; gives orders, rewards obedience with rough affection, punishes sloppiness hard' },
    Viper: { line: 'cruel for fun; humiliates and bullies, lies sweetly, the most dangerous to be small around' },
};
export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

export const DIALS = ['bossy', 'bratty', 'friendly', 'smelly', 'sweaty', 'dirty'];
export const DIAL_MAX = 11;
export const ODOR = ['cheesy', 'lemony', 'fishy', 'meaty'];
export const VERBS = ['kiss', 'sniff', 'lick', 'rub', 'talk'];
export const EXPRESSIONS = ['neutral', 'smug', 'annoyed', 'laughing', 'bored', 'disgusted'];
export const SLOTS = ['morning', 'afternoon', 'evening', 'night'];

const SHAPE = `{
  "name": "full name",
  "age": 21,
  "from": "country or town",
  "shoe_us": 8,
  "archetype": "Princess | Slacker | Drill | Viper",
  "dials": { "bossy": 0-11, "bratty": 0-11, "friendly": 0-11, "smelly": 0-11, "sweaty": 0-11, "dirty": 0-11 },
  "odor": { "cheesy": 40, "lemony": 30, "fishy": 10, "meaty": 20 },
  "shoes": "her usual shoes, with wear and condition",
  "socks": "her usual socks: colour, pattern, length, condition",
  "look": "hair, skin, build, face, and the outfit she is usually seen in (one line, for drawing her)",
  "hook": "one line that makes her who she is",
  "job": "what she does in town (student, sorority president, barista, coach...)",
  "hobby": "two or three hobbies",
  "kink": "what she gets out of having someone at her feet",
  "quirk": "a verbal or physical tic",
  "voice": "how she talks: register, favourite words, how she says no",
  "wants": { "verbs": ["rub", "sniff"], "hates": ["lick"], "praise": "what to compliment", "trigger": "what sets her off" }
}`;

export const SHEET_RULES = `You write a game character sheet for a giantess foot-fetish comedy RPG in the style of 2000s flash games: bratty, bossy, smelly-socked giant women in a town built to their scale, and a normal-sized human player who comes up to their ankle or knee, played for laughs and humiliation, never romance-novel sincerity. The sheet is JSON only.

Rules:
- Keep everything that is already known about the character (name, age, looks, personality, history, way of speaking). Invent only what is missing, in character.
- Her SIZE is given to you below and is not yours to change: write her as a giant of that height, used to looking down at normal-sized people, with everything she owns at her scale.
- Dials are 0-11. 11 is extreme. Spread them: a character is not 11 at everything. "smelly" is how strong her foot smell is; "sweaty" how damp her socks get; "dirty" how grimy her soles are; "bossy" how many orders she gives; "bratty" how fast she gets irritated; "friendly" how safe it is to be small near her.
- odor percentages add up to 100.
- wants.verbs and wants.hates are from: kiss, sniff, lick, rub, talk.
- Concrete, visual words. No code fence, no commentary: the JSON object only.`;

/**
 * Messages that derive a sheet from a character card.
 * @param {object} o
 * @param {{name: string, description?: string, personality?: string, scenario?: string, first_mes?: string, mes_example?: string}} o.card
 * @param {string} [o.persona] the user's persona
 * @param {string} o.user the user's name
 * @param {string} [o.extra] the player's own notes ("make her a Viper", "she works at the gym")
 */
export function buildSheetMessages({ card, persona = '', user, extra = '', size = null }) {
    const parts = [`CHARACTER: ${card.name}`];
    if (size) parts.push(`SIZE (fixed): ${scaleText({ name: card.name, height_cm: size.height_cm, size_class: size.size_class }, PLAYER_CM)}`);
    if (card.description) parts.push(`Description:\n${str(card.description, 6000)}`);
    if (card.personality) parts.push(`Personality:\n${str(card.personality, 2000)}`);
    if (card.scenario) parts.push(`Scenario:\n${str(card.scenario, 2000)}`);
    if (card.first_mes) parts.push(`Opening message (for voice and setting):\n${str(card.first_mes, 2500)}`);
    if (card.mes_example) parts.push(`Example dialogue:\n${str(card.mes_example, 2000)}`);
    if (persona) parts.push(`THE PLAYER (${user}):\n${str(persona, 2000)}`);
    if (extra) parts.push(`PLAYER'S NOTES: ${str(extra, 1000)}`);
    parts.push(`Write ${card.name}'s sheet. Shape (replace every value):\n${SHAPE}`);
    return [
        { role: 'system', content: SHEET_RULES },
        { role: 'user', content: parts.join('\n\n') },
    ];
}

const clampDial = (v, dflt = 5) => Math.round(num(v, 0, DIAL_MAX, dflt));

/** Percentages that add up to 100, from whatever the model sent. */
export function normalizeOdor(raw) {
    const vals = ODOR.map((k) => Math.max(0, Number(raw?.[k]) || 0));
    let total = vals.reduce((a, b) => a + b, 0);
    if (!total) return { cheesy: 40, lemony: 30, fishy: 10, meaty: 20 };
    const out = {};
    let acc = 0;
    ODOR.forEach((k, i) => { out[k] = i === ODOR.length - 1 ? 100 - acc : Math.round((vals[i] / total) * 100); acc += out[k]; });
    return out;
}

const pickArchetype = (v) => {
    const s = str(v, 40).toLowerCase();
    if (!s) return null;
    return ARCHETYPE_NAMES.find((a) => a.toLowerCase() === s) ?? (/stuck|princess|spoil/.test(s) ? 'Princess' : /chill|slack|lazy/.test(s) ? 'Slacker' : /tough|drill|strict/.test(s) ? 'Drill' : /wick|viper|cruel|evil/.test(s) ? 'Viper' : null);
};

const verbList = (v) => list(v, 5).map((x) => x.toLowerCase()).filter((x) => VERBS.includes(x));

/**
 * A valid sheet from a model reply (or a saved one). Missing parts get sane defaults.
 * @param {object|string} raw the parsed object or the reply text
 * @param {{id?: string, name?: string, card?: boolean, avatar?: string, seed?: number}} [meta]
 */
export function normalizeSheet(raw, meta = {}) {
    const r = (typeof raw === 'string' ? extractJson(raw) : raw) ?? {};
    const name = str(r.name, 60) || meta.name || 'Unnamed';
    const dials = {};
    for (const d of DIALS) dials[d] = clampDial(r.dials?.[d] ?? r[d], d === 'friendly' ? 4 : 6);
    const wants = r.wants ?? {};
    const verbs = verbList(wants.verbs);
    const hates = verbList(wants.hates).filter((v) => !verbs.includes(v));
    // Size: what the extension rolled (meta) wins; else a giant height the model gave; else roll from the seed.
    const seedR = ((meta.seed ?? name.length) * 9301 + 49297) % 233280 / 233280;
    let size_class = meta.size_class ?? r.size_class ?? null;
    let height_cm = meta.height_cm ?? (Number(r.height_cm) >= 300 ? Math.round(Number(r.height_cm)) : null);
    if (!size_class && height_cm) size_class = classForHeight(height_cm);
    if (!size_class) size_class = rollClass(seedR);
    size_class = classOf(size_class).n;
    if (!height_cm || classForHeight(height_cm) !== size_class) height_cm = heightFor(size_class, (seedR * 7) % 1);
    const rawSchedule = r.schedule && typeof r.schedule === 'object' ? r.schedule : {};
    const schedule = {};
    for (const s of SLOTS) if (rawSchedule[s]) schedule[s] = slug(rawSchedule[s]);
    return {
        id: meta.id || slug(name),
        name,
        card: Boolean(meta.card ?? r.card),
        avatar: meta.avatar ?? r.avatar ?? '',
        age: Math.round(num(r.age, 18, 99, 21)),
        from: str(r.from, 60),
        size_class,
        height_cm,
        shoe_us: num(r.shoe_us, 4, 16, 8),
        archetype: pickArchetype(r.archetype) ?? ARCHETYPE_NAMES[(meta.seed ?? name.length) % ARCHETYPE_NAMES.length],
        dials,
        odor: normalizeOdor(r.odor),
        shoes: str(r.shoes, 160) || 'worn sneakers',
        socks: str(r.socks, 160) || 'white ankle socks, not fresh',
        look: str(r.look, 400),
        hook: str(r.hook, 240),
        job: str(r.job, 80),
        hobby: str(r.hobby, 120),
        kink: str(r.kink, 120),
        quirk: str(r.quirk, 120),
        voice: str(r.voice, 240),
        wants: {
            verbs: verbs.length ? verbs : ['rub'],
            hates: hates.length ? hates : [],
            praise: str(wants.praise, 100),
            trigger: str(wants.trigger, 120),
        },
        home: r.home ? slug(r.home) : '',
        schedule,
        sprites: r.sprites && typeof r.sprites === 'object' ? r.sprites : {}, // expression -> image path
        feet: r.feet && typeof r.feet === 'object' ? r.feet : {}, // 'shoes' | 'socks' | 'bare' -> image path
    };
}

/** "mostly cheesy with a lemony edge" */
export function odorText(odor) {
    const sorted = ODOR.map((k) => [k, odor?.[k] ?? 0]).sort((a, b) => b[1] - a[1]);
    const [a, b] = sorted;
    if (a[1] >= 70) return `overwhelmingly ${a[0]}`;
    if (a[1] >= 45) return `mostly ${a[0]} with a ${b[0]} edge`;
    return `${a[0]} and ${b[0]} in equal measure`;
}

/** The sheet as a compact paragraph for the prompt. */
export function sheetSummary(s, { dials = true, playerCm = PLAYER_CM } = {}) {
    const d = s.dials;
    const bits = [`${s.name}${s.age ? `, ${s.age}` : ''}${s.from ? `, from ${s.from}` : ''}${s.job ? `, ${s.job}` : ''} — ${s.archetype}: ${ARCHETYPES[s.archetype].line}.`];
    if (s.hook) bits.push(s.hook);
    bits.push(scaleText(s, playerCm));
    if (dials) bits.push(`Dials (0-11): bossy ${d.bossy}, bratty ${d.bratty}, friendly ${d.friendly}, smelly ${d.smelly}, sweaty ${d.sweaty}, dirty ${d.dirty}.`);
    bits.push(`Feet: ${s.shoes}; ${s.socks}; the smell is ${odorText(s.odor)} (cheesy ${s.odor.cheesy}%, lemony ${s.odor.lemony}%, fishy ${s.odor.fishy}%, meaty ${s.odor.meaty}%).`);
    if (s.look) bits.push(`Looks: ${s.look}.`);
    if (s.voice) bits.push(`Voice: ${s.voice}.`);
    if (s.quirk) bits.push(`Quirk: ${s.quirk}.`);
    if (s.kink) bits.push(`What she gets out of it: ${s.kink}.`);
    const w = s.wants;
    bits.push(`Likes: ${w.verbs.join(', ')}${w.hates.length ? `; hates: ${w.hates.join(', ')}` : ''}${w.praise ? `; compliment ${w.praise}` : ''}${w.trigger ? `; sets her off: ${w.trigger}` : ''}.`);
    return bits.join(' ');
}

/** One line per resident for a list. */
export const sheetLine = (s) => `${s.name} (${s.archetype}${s.job ? `, ${s.job}` : ''}, class ${s.size_class} ${classOf(s.size_class).name}, ${Math.round(s.height_cm / 30.48)} ft) — ${s.shoes}; ${s.socks}`;
