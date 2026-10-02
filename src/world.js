// The world: a town of locations with opening rules, residents with schedules, quests, and the clock.
// The generator prompt builds the town around the character card(s) in the chat; normalizeWorld makes
// whatever the model answered playable. Play state (where you are, the day, meters) is separate: see createState.

import { extractJson, list, num, slug, str } from './json.js';
import { SLOTS, normalizeSheet, sheetSummary } from './sheet.js';
import { PLAYER_CM, classOf, heightFor, rarityTable, rollCast } from './size.js';

export { SLOTS };

/**
 * Location types: palette for the map, default opening hours, the events that can happen there, and a
 * default interior line for the background picture. Unknown types fall back to `generic`.
 */
export const LOCATION_TYPES = {
    home: { label: 'Your place', wall: '#6b5a8a', roof: '#4a3f63', trim: '#c9b7ff', hours: SLOTS, events: [], interior: 'a small rented flat, mattress on the floor, a desk, a window on the street' },
    sorority: { label: 'Sorority house', wall: '#b05a5a', roof: '#6e3535', trim: '#ffd1d1', hours: ['afternoon', 'evening', 'night'], events: ['service_row', 'validation'], interior: 'a lounge with a long sofa, shoes kicked off by the door, socks on the rug, trophies on the mantel' },
    dorm: { label: 'Dorm', wall: '#7a6f5a', roof: '#4e4639', trim: '#e0d4b8', hours: ['evening', 'night'], events: ['chore'], interior: 'a narrow dorm room, bunk bed, a pile of laundry, sneakers under the desk' },
    house: { label: 'House', wall: '#8a7a6a', roof: '#5a4a3a', trim: '#f0e0c0', hours: ['evening', 'night'], events: ['chore'], interior: 'a tidy suburban living room, a shoe rack by the door, a thick rug' },
    gym: { label: 'Gym', wall: '#4b6a8a', roof: '#2e4458', trim: '#bfe0ff', hours: ['morning', 'afternoon'], events: ['chore', 'service_row'], interior: 'a gym floor with rubber mats, racks of dumbbells, a bench with a gym bag and sweaty sneakers on it' },
    cinema: { label: 'Cinema', wall: '#8a3b5a', roof: '#55253a', trim: '#ffc7e3', hours: ['evening', 'night'], events: ['service_row'], interior: 'a dark cinema row, red seats, popcorn on the floor, feet up on the seat in front' },
    laundromat: { label: 'Laundromat', wall: '#4f8a7a', roof: '#2f5a4e', trim: '#c2ffe9', hours: ['morning', 'afternoon', 'evening'], events: ['chore'], interior: 'rows of humming dryers, a folding table heaped with socks, warm lint-scented air' },
    spa: { label: 'Spa', wall: '#8a7fa0', roof: '#5a5270', trim: '#e9e1ff', hours: ['afternoon', 'evening'], events: ['chore', 'service_row'], interior: 'a spa pedicure room, foot baths, towels, a row of recliners' },
    cafe: { label: 'Cafe', wall: '#a07a4a', roof: '#6a4e2c', trim: '#ffe4bd', hours: ['morning', 'afternoon'], events: ['chore'], interior: 'a corner cafe, counter with pastries, small tables, someone with her shoes off under the table' },
    burger: { label: 'Burger joint', wall: '#3f6a3f', roof: '#284528', trim: '#ffd84a', hours: ['afternoon', 'evening', 'night'], events: [], interior: 'a fast-food booth, laminate table, fries on a tray, sticky floor' },
    shoes: { label: 'Shoe store', wall: '#8a6a3f', roof: '#5a4428', trim: '#ffe9c7', hours: ['morning', 'afternoon'], events: ['chore'], interior: 'a shoe store, boxes stacked to the ceiling, a fitting bench, a mirror low to the floor' },
    library: { label: 'Library', wall: '#5a5a7a', roof: '#3a3a52', trim: '#d8d8ff', hours: ['morning', 'afternoon', 'evening'], events: [], interior: 'a quiet library study table, bare feet resting on a chair under it' },
    park: { label: 'Park', wall: '#4f7a3f', roof: '#345228', trim: '#c9ffb0', hours: SLOTS, events: [], interior: 'a park bench by a fountain, grass, someone sitting with her sandals off' },
    bus: { label: 'Bus stop', wall: '#6a6a6a', roof: '#444', trim: '#ffe56a', hours: SLOTS, events: ['service_row'], interior: 'a bus shelter, a bench, a timetable, a bus pulling in' },
    lighthouse: { label: 'Lighthouse', wall: '#b04a3f', roof: '#f0f0f0', trim: '#fff', hours: ['afternoon', 'evening'], events: [], interior: 'the foot of a striped lighthouse, rocks and gulls, a spiral stair inside' },
    farm: { label: 'Farm plot', wall: '#7a5a3f', roof: '#4e3a28', trim: '#b8ff8a', hours: ['morning', 'afternoon'], events: ['chore'], interior: 'a vegetable plot, muddy boots by a shed, a hose' },
    pool: { label: 'Pool', wall: '#3f7a8a', roof: '#28505a', trim: '#aef1ff', hours: ['morning', 'afternoon'], events: ['service_row'], interior: 'a poolside with deck chairs, wet footprints on the tiles, flip-flops' },
    tennis: { label: 'Tennis court', wall: '#6a8a3f', roof: '#445a28', trim: '#f0ffb0', hours: ['morning', 'afternoon'], events: ['chore'], interior: 'a tennis court bench, a racket bag, white socks and court shoes' },
    boutique: { label: 'Boutique', wall: '#a05a8a', roof: '#6a3a5a', trim: '#ffd6f5', hours: ['morning', 'afternoon'], events: ['chore'], interior: 'a boutique with a velvet bench, mirrors, heels lined up' },
    thrift: { label: 'Thrift store', wall: '#8a6a6a', roof: '#5a4444', trim: '#ffd9d9', hours: ['afternoon'], events: [], interior: 'a cluttered thrift store, bins of old shoes, a rack of worn socks' },
    bar: { label: 'Bar', wall: '#5a3f6a', roof: '#3a2845', trim: '#ffb0ff', hours: ['evening', 'night'], events: ['service_row'], interior: 'a dim bar, sticky stools, boots up on the rail' },
    school: { label: 'Campus', wall: '#8a8a5a', roof: '#5a5a3a', trim: '#ffffc0', hours: ['morning', 'afternoon'], events: [], interior: 'a lecture hall, feet up on the seat in front, a lost sneaker in the aisle' },
    office: { label: 'Office', wall: '#5a6a7a', roof: '#3a4552', trim: '#d0e0ff', hours: ['morning', 'afternoon'], events: ['chore'], interior: 'an office with a desk, heels kicked off under it, a stocking foot on the carpet' },
    beach: { label: 'Beach', wall: '#c9a86a', roof: '#8a7045', trim: '#fff5d0', hours: ['morning', 'afternoon', 'evening'], events: ['service_row'], interior: 'a beach towel, sand between toes, sandals tossed aside' },
    generic: { label: 'Place', wall: '#7a7a7a', roof: '#4a4a4a', trim: '#e0e0e0', hours: SLOTS, events: [], interior: 'a plain room' },
};

export const typeOf = (loc) => LOCATION_TYPES[loc?.type] ?? LOCATION_TYPES.generic;

const WORLD_SHAPE = `{
  "town": { "name": "town name", "vibe": "one line", "intro": "two sentences that open the game, addressed to the player" },
  "locations": [
    { "id": "short_id", "name": "Sign name", "type": "home | sorority | dorm | house | gym | cinema | laundromat | spa | cafe | burger | shoes | library | park | bus | lighthouse | farm | pool | tennis | boutique | thrift | bar | school | office | beach",
      "open": { "when": "start" },
      "hours": ["morning", "afternoon", "evening", "night"],
      "interior": "one line describing the inside, for a background picture",
      "notes": "what happens here, who hangs out, anything hidden" }
  ],
  "residents": [
    { "...": "a full character sheet (same shape as before)", "home": "location id", "schedule": { "morning": "location id", "afternoon": "location id", "evening": "location id", "night": "location id" } }
  ],
  "quests": [
    { "id": "short_id", "title": "...", "giver": "resident id", "goal": "what to do, concretely", "steps": ["step one", "step two"],
      "reward": { "opens": "location id or empty", "favor": 2, "money": 20 }, "due_day": 0 }
  ]
}
Opening rules ("open"): { "when": "start" } | { "when": "day", "day": 3 } | { "when": "quest", "quest": "quest id" } | { "when": "favor", "who": "resident id", "min": 5 } | { "when": "flag", "flag": "name", "hint": "what the sign says" }`;

export const WORLD_RULES = `You design the town for a giantess foot-fetish comedy RPG in the style of 2000s flash adventure games: a pixel town built at giant scale, bossy giant women with smelly socks, a normal-sized human player who lives among them, chores and favours, humiliating bad ends played for laughs. Answer with JSON only.

Rules:
- Every resident is a giant woman. Her size class and height are GIVEN below and not yours to change; write each one as used to her own size. The player is a normal human (${Math.round(PLAYER_CM)} cm) and the town is built for giants: doors, chairs, tables, shoes and socks are all at their scale, and the player's home is something small (a shoebox flat in a wall, a dollhouse, a drawer).
- The MAIN CHARACTERS (given below, from the player's character cards) are the heart of the town. Build the town around their lore: where they live, where they work and hang out, their friends, rivals, family, and anything their cards mention. Keep their sheets as given; only add "home" and "schedule".
- Invent the requested number of extra residents, each with a complete sheet (same shape as the main characters) and the size class listed for her, different archetypes, different feet, different voices. Some are friends of the main characters, some rivals, one may be an authority figure.
- 10 to 14 locations. One is the player's home (type "home", open from the start). Every resident has a home that is a location. Add workplaces and hangouts that fit the residents' jobs and hobbies, and a few public places (park, bus stop, cafe, cinema, laundromat...). About a third of the locations start CLOSED, each with a different opening rule; the rest are open from the start. The main characters' homes are open from the start.
- Schedules: each resident is somewhere every slot (morning, afternoon, evening, night), usually home at night, and the main characters are reachable in at least two slots at open locations.
- 3 to 5 quests. The first one or two are given by the main characters, small and concrete (fetch, carry, clean, deliver, find), each with a humiliating twist. Rewards open closed locations.
- Short, playful, concrete writing. No code fence, no commentary: the JSON object only.`;

/**
 * Messages that generate the town around the card sheets.
 * @param {object} o
 * @param {object[]} o.sheets the sheets of the character card(s) (normalizeSheet output)
 * @param {string} o.user the player's name
 * @param {string} [o.persona]
 * @param {string} [o.scenario] the card's scenario field
 * @param {number} [o.extraResidents] how many residents to invent
 * @param {string} [o.vibe] the player's wish for the town ("seaside college town", "boarding school")
 */
export function buildWorldMessages({ sheets, user, persona = '', scenario = '', extraResidents = 5, vibe = '', classes = [] }) {
    const parts = [];
    parts.push(`SIZE CLASSES: ${rarityTable()}.`);
    parts.push(`MAIN CHARACTERS:\n${sheets.map((s) => `- id "${s.id}": ${sheetSummary(s)}`).join('\n')}`);
    if (classes.length) parts.push(`EXTRA RESIDENTS' SIZES, in order (write "size_class" and "height_cm" exactly as given): ${classes.map((c, i) => `#${i + 1}: class ${c.n} ${classOf(c.n).name}, ${c.height_cm} cm (${Math.round(c.height_cm / 30.48)} ft)`).join('; ')}`);
    if (scenario) parts.push(`THEIR SCENARIO: ${str(scenario, 2000)}`);
    parts.push(`THE PLAYER (${user})${persona ? `: ${str(persona, 1500)}` : ''}`);
    if (vibe) parts.push(`THE PLAYER WANTS: ${str(vibe, 400)}`);
    parts.push(`Invent ${Math.max(0, Math.round(extraResidents))} extra residents. Shape (replace every value; the main characters' sheets go into "residents" with the same ids):\n${WORLD_SHAPE}`);
    return [
        { role: 'system', content: WORLD_RULES },
        { role: 'user', content: parts.join('\n\n') },
    ];
}

const RULE_KINDS = ['start', 'day', 'quest', 'favor', 'flag'];

function normalizeRule(raw, { quests, residents }) {
    const when = str(raw?.when, 10).toLowerCase();
    if (!RULE_KINDS.includes(when)) return { when: 'start' };
    if (when === 'day') return { when, day: Math.round(num(raw.day, 2, 60, 3)) };
    if (when === 'quest') { const q = slug(raw.quest); return quests.has(q) ? { when, quest: q } : { when: 'start' }; }
    if (when === 'favor') { const who = slug(raw.who); return residents.has(who) ? { when, who, min: Math.round(num(raw.min, 1, 20, 5)) } : { when: 'start' }; }
    return { when: 'flag', flag: slug(raw.flag) || 'secret', hint: str(raw.hint, 100) };
}

/**
 * A playable world from the model's JSON. The card sheets are kept (home and schedule are taken from the
 * reply); extra residents are normalised; missing homes, bad schedule ids and dangling rules are fixed.
 * @param {object|string} raw
 * @param {{cardSheets: object[]}} o
 */
export function normalizeWorld(raw, { cardSheets = [], classes = [] } = {}) {
    const r = (typeof raw === 'string' ? extractJson(raw) : raw) ?? {};
    const town = { name: str(r.town?.name, 60) || 'Sockville', vibe: str(r.town?.vibe, 200), intro: str(r.town?.intro, 600) };

    // Locations first, with unique ids.
    const locations = [];
    const ids = new Set();
    for (const l of Array.isArray(r.locations) ? r.locations : []) {
        const name = str(l?.name, 40);
        if (!name) continue;
        let id = slug(l.id || name);
        while (ids.has(id)) id += '_';
        ids.add(id);
        const type = LOCATION_TYPES[str(l.type, 20).toLowerCase()] ? str(l.type, 20).toLowerCase() : 'generic';
        const hours = list(l.hours, 4).map((h) => h.toLowerCase()).filter((h) => SLOTS.includes(h));
        locations.push({ id, name, type, open: l.open, hours: hours.length ? hours : [...LOCATION_TYPES[type].hours], interior: str(l.interior, 300) || LOCATION_TYPES[type].interior, notes: str(l.notes, 300), background: {} });
    }
    let home = locations.find((l) => l.type === 'home');
    if (!home) { home = { id: 'home', name: 'Your place', type: 'home', open: { when: 'start' }, hours: [...SLOTS], interior: LOCATION_TYPES.home.interior, notes: '', background: {} }; while (ids.has(home.id)) home.id += '_'; ids.add(home.id); locations.unshift(home); }

    // Residents: the card sheets as given, plus the invented ones.
    const residents = [];
    const rawResidents = Array.isArray(r.residents) ? r.residents : [];
    const used = new Set();
    for (const cs of cardSheets) {
        const match = rawResidents.find((x) => slug(x?.id || x?.name) === cs.id || str(x?.name, 60).toLowerCase() === cs.name.toLowerCase());
        const merged = { ...cs, home: match?.home ? slug(match.home) : cs.home, schedule: match?.schedule && typeof match.schedule === 'object' ? Object.fromEntries(Object.entries(match.schedule).map(([k, v]) => [k, slug(v)])) : cs.schedule };
        residents.push(merged);
        used.add(cs.id);
    }
    for (const x of rawResidents) {
        const id = slug(x?.id || x?.name);
        if (!id || used.has(id) || residents.some((s) => s.id === id)) continue;
        if (cardSheets.some((cs) => str(x?.name, 60).toLowerCase() === cs.name.toLowerCase())) continue;
        const given = classes[residents.length - cardSheets.length];
        residents.push(normalizeSheet(x, { id, seed: residents.length, ...(given ? { size_class: given.n, height_cm: given.height_cm } : {}) }));
        used.add(id);
    }

    // Homes and schedules point at real locations.
    for (const s of residents) {
        if (!s.home || !ids.has(s.home) || s.home === home.id) {
            const house = { id: `${s.id}_home`, name: `${s.name.split(' ')[0]}'s place`, type: 'house', open: { when: 'start' }, hours: ['evening', 'night'], interior: LOCATION_TYPES.house.interior, notes: `${s.name} lives here.`, background: {} };
            while (ids.has(house.id)) house.id += '_';
            ids.add(house.id);
            locations.push(house);
            s.home = house.id;
        }
        const sched = {};
        for (const slot of SLOTS) {
            const v = s.schedule?.[slot];
            sched[slot] = v && ids.has(v) ? v : s.home;
        }
        s.schedule = sched;
    }

    // Quests.
    const residentIds = new Set(residents.map((s) => s.id));
    const quests = [];
    const qids = new Set();
    for (const q of Array.isArray(r.quests) ? r.quests : []) {
        const title = str(q?.title, 80);
        if (!title) continue;
        let id = slug(q.id || title);
        while (qids.has(id)) id += '_';
        qids.add(id);
        const giver = slug(q.giver);
        const opens = slug(q.reward?.opens);
        quests.push({
            id, title,
            giver: residentIds.has(giver) ? giver : (residents[0]?.id ?? ''),
            goal: str(q.goal, 300), steps: list(q.steps, 6),
            reward: { opens: ids.has(opens) ? opens : '', favor: Math.round(num(q.reward?.favor, 0, 10, 2)), money: Math.round(num(q.reward?.money, 0, 500, 0)) },
            due_day: Math.round(num(q.due_day, 0, 99, 0)),
        });
    }

    // Opening rules, now that quests and residents are known; the card characters' homes are open.
    for (const l of locations) {
        l.open = normalizeRule(l.open, { quests: qids, residents: residentIds });
        if (l.type === 'home' || cardSheets.some((cs) => residents.find((s) => s.id === cs.id)?.home === l.id)) l.open = { when: 'start' };
    }
    // A quest that opens a location which is open from the start still "opens" it in the journal; fine.
    return { town, locations, residents, quests, version: 1 };
}

// ------------------------------------------------------------------ play state

export const PLAYER_DEFAULTS = { size_cm: 175, money: 40, stamina: 10, composure: 10, dirt: 0, reputation: 0 };

/** A fresh play state for a world: day 1, morning, at home. */
export function createState(world, { seed = Date.now() % 1e9, size_cm = 175 } = {}) {
    const home = world.locations.find((l) => l.type === 'home') ?? world.locations[0];
    const rel = {};
    for (const s of world.residents) rel[s.id] = { favor: 0, irritation: 0, fear: 0, met: false };
    const quests = {};
    for (const q of world.quests) quests[q.id] = { status: 'hidden', step: 0 };
    return {
        seed, day: 1, slot: 'morning', at: home.id, turn: 0,
        player: { ...PLAYER_DEFAULTS, size_cm, base_cm: size_cm },
        rel, quests, inventory: [], flags: {}, endings: [], visited: [home.id], known: [],
        scene: null, // the current VN scene: { locationId, present: [ids], choices: [], lines: [] }
        event: null, // an active event module's state
        log: [],
    };
}

export const slotIndex = (slot) => Math.max(0, SLOTS.indexOf(slot));

/** Move the clock on by `n` slots. Returns how many days passed. */
export function advance(state, n = 1) {
    let i = slotIndex(state.slot) + Math.max(0, Math.round(n));
    const days = Math.floor(i / SLOTS.length);
    state.day += days;
    state.slot = SLOTS[i % SLOTS.length];
    return days;
}

/** Sleep: back home, next morning (stamina and composure refill). */
export function sleep(world, state) {
    const home = world.locations.find((l) => l.type === 'home') ?? world.locations[0];
    state.at = home.id;
    state.day += 1;
    state.slot = 'morning';
    state.player.stamina = PLAYER_DEFAULTS.stamina;
    state.player.composure = PLAYER_DEFAULTS.composure;
    for (const r of Object.values(state.rel)) r.irritation = Math.max(0, r.irritation - 2);
    state.scene = null;
    state.event = null;
}

export const findLocation = (world, id) => world.locations.find((l) => l.id === id) ?? null;
export const findResident = (world, id) => world.residents.find((s) => s.id === id) ?? null;

/** Residents whose schedule puts them at `locId` in `slot`. */
export function whoIsAt(world, locId, slot) {
    return world.residents.filter((s) => s.schedule?.[slot] === locId);
}

/** Whether a location's opening rule is met (hours are separate: see isOpenNow). */
export function isUnlocked(world, state, loc) {
    const r = loc.open ?? { when: 'start' };
    if (state.flags?.[`open:${loc.id}`]) return true;
    switch (r.when) {
        case 'start': return true;
        case 'day': return state.day >= r.day;
        case 'quest': return state.quests?.[r.quest]?.status === 'done';
        case 'favor': return (state.rel?.[r.who]?.favor ?? 0) >= r.min;
        case 'flag': return Boolean(state.flags?.[r.flag]);
        default: return true;
    }
}

export const isOpenNow = (world, state, loc) => isUnlocked(world, state, loc) && loc.hours.includes(state.slot);

/** What the CLOSED sign says. */
export function closedHint(world, state, loc) {
    if (!isUnlocked(world, state, loc)) {
        const r = loc.open;
        if (r.when === 'day') return `Opens on day ${r.day}.`;
        if (r.when === 'quest') { const q = world.quests.find((x) => x.id === r.quest); return q ? `Opens after "${q.title}".` : 'Closed for now.'; }
        if (r.when === 'favor') { const s = findResident(world, r.who); return s ? `${s.name.split(' ')[0]} has to like you more first.` : 'Closed for now.'; }
        if (r.when === 'flag') return r.hint || 'Closed. Something has to happen first.';
        return 'Closed.';
    }
    return `Open in the ${loc.hours.join(', ')}.`;
}

/** Travel to a location: a slot passes. Returns { ok, reason }. */
export function travel(world, state, locId) {
    const loc = findLocation(world, locId);
    if (!loc) return { ok: false, reason: 'no such place' };
    if (loc.id === state.at) return { ok: false, reason: 'you are already here' };
    advance(state, 1);
    state.at = loc.id;
    if (!state.visited.includes(loc.id)) state.visited.push(loc.id);
    state.scene = null;
    state.event = null;
    return { ok: true, loc, open: isOpenNow(world, state, loc) };
}

/** Wait a slot where you are. */
export function wait(state) { advance(state, 1); state.scene = null; state.event = null; }

/** Mark a quest as given / done, and hand out its reward. Returns the quest or null. */
export function questGiven(world, state, qid) {
    const q = world.quests.find((x) => x.id === qid);
    if (!q) return null;
    const s = state.quests[qid] ??= { status: 'hidden', step: 0 };
    if (s.status === 'hidden') s.status = 'active';
    return q;
}
export function questDone(world, state, qid) {
    const q = world.quests.find((x) => x.id === qid);
    if (!q) return null;
    const s = state.quests[qid] ??= { status: 'hidden', step: 0 };
    if (s.status === 'done') return q;
    s.status = 'done';
    if (q.reward.money) state.player.money += q.reward.money;
    if (q.reward.favor && state.rel[q.giver]) state.rel[q.giver].favor += q.reward.favor;
    if (q.reward.opens) state.flags[`open:${q.reward.opens}`] = true;
    return q;
}

/** Add a place the story brought up; CLOSED with a flag rule unless `open`. Returns the location. */
export function addLocation(world, { name, type = 'generic', interior = '', notes = '', open = false, hint = '' }) {
    const base = slug(name);
    let id = base;
    while (world.locations.some((l) => l.id === id)) id += '_';
    const t = LOCATION_TYPES[type] ? type : 'generic';
    const loc = { id, name: str(name, 40), type: t, open: open ? { when: 'start' } : { when: 'flag', flag: `open:${id}`, hint: hint || 'You have heard of this place. Find a way in.' }, hours: [...LOCATION_TYPES[t].hours], interior: str(interior, 300) || LOCATION_TYPES[t].interior, notes: str(notes, 300), background: {} };
    world.locations.push(loc);
    return loc;
}

/** Pre-roll the sizes of `count` invented residents: [{ n, height_cm }], seeded. */
export function rollSizes(count, seed = 1) {
    let a = (Number(seed) || 1) >>> 0;
    const rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return rollCast(count, rng).map((n) => ({ n, height_cm: heightFor(n, rng()) }));
}

/** The town as a few lines for the prompt: open places, closed places, who is where now. */
export function townSummary(world, state) {
    const here = findLocation(world, state.at);
    const open = world.locations.filter((l) => isOpenNow(world, state, l) && l.id !== state.at).map((l) => l.name);
    const closed = world.locations.filter((l) => !isUnlocked(world, state, l)).map((l) => l.name);
    return [
        `${world.town.name}${world.town.vibe ? ` (${world.town.vibe})` : ''}. Day ${state.day}, ${state.slot}. ${here ? `You are at ${here.name}.` : ''}`,
        open.length ? `Open now: ${open.join(', ')}.` : '',
        closed.length ? `Still closed: ${closed.join(', ')}.` : '',
    ].filter(Boolean).join(' ');
}
