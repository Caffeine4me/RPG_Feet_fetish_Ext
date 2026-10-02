// Navigation. The places the player knows and the ways between them, as a graph the story grows:
// the model names a place with a MAP tag and a way with a ROUTE tag, the extension keeps them, draws
// them, finds paths, and converts a giant's walking time into a three-foot man's.

import { num, slug, str } from './json.js';
import { HUMAN_CM, PLAYER_CM } from './size.js';

export const KINDS = {
    indoor: { label: 'indoors', danger: 1, crowd: 1, cover: 2 },
    shop: { label: 'a shop', danger: 2, crowd: 2, cover: 1 },
    street: { label: 'a street', danger: 3, crowd: 2, cover: 1 },
    square: { label: 'an open square', danger: 3, crowd: 3, cover: 0 },
    road: { label: 'a road', danger: 4, crowd: 1, cover: 0 },
    wild: { label: 'the outdoors', danger: 3, crowd: 0, cover: 2 },
    water: { label: 'water', danger: 4, crowd: 0, cover: 0 },
    hideout: { label: 'a hideout', danger: 0, crowd: 0, cover: 3 },
};
const KIND_WORDS = [
    ['hideout', /\b(nest|hole|hideout|burrow|crack|nook|den|drawer|dollhouse|shoebox|cupboard)\b/],
    ['water', /\b(river|canal|harbou?r|dock|pond|lake|sea|bath|sink|fountain)\b/],
    ['road', /\b(road|highway|bridge|crossing|tracks?|rails?)\b/],
    ['square', /\b(square|plaza|market|yard|court|fair|park|green)\b/],
    ['street', /\b(street|lane|alley|avenue|gutter|path|sidewalk|pavement|stairs?|stairwell)\b/],
    ['shop', /\b(shop|store|bakery|tavern|inn|bar|cafe|café|stall|smithy|office|hall|church|temple|school|clinic|station)\b/],
    ['wild', /\b(wood|forest|field|meadow|hill|garden|farm|orchard|beach|cliff|ruin|cave)\b/],
    ['indoor', /\b(kitchen|room|bedroom|house|home|flat|apartment|attic|cellar|basement|loft|pantry|hallway|cottage|barn|shed|library|bath)\b/],
];
export const guessKind = (name) => (KIND_WORDS.find(([, re]) => re.test(String(name).toLowerCase())) ?? ['street'])[0];

export const MAP_ASPECT = 1.6; // width / height of the drawing

export function createNav() { return { places: [], routes: [], at: null }; }

export function normalizePlace(raw) {
    const name = str(typeof raw === 'string' ? raw : raw?.name, 60);
    if (!name) return null;
    const kind = KINDS[raw?.kind] ? raw.kind : guessKind(name);
    const d = KINDS[kind];
    return {
        id: slug(name), name, kind,
        danger: num(raw?.danger, 0, 5, d.danger), crowd: num(raw?.crowd, 0, 3, d.crowd), cover: num(raw?.cover, 0, 3, d.cover),
        note: str(raw?.note, 200), visits: num(raw?.visits, 0, 1e6, 0), x: num(raw?.x, 0, 1, null), y: num(raw?.y, 0, 1, null),
    };
}

const first = (name) => slug(name).split('_')[0];
export function findPlace(nav, name) {
    const id = slug(name);
    if (!id || id === 'x') return null;
    return nav.places.find((p) => p.id === id) ?? nav.places.find((p) => p.id.startsWith(`${id}_`) || id.startsWith(`${p.id}_`)) ?? nav.places.find((p) => first(p.name) === id && id.length > 3) ?? null;
}

/** Add or update a place; fields given win over what was there. Returns {place, created}. */
export function upsertPlace(nav, raw) {
    const fresh = normalizePlace(raw);
    if (!fresh) return { place: null, created: false };
    const have = findPlace(nav, fresh.name);
    if (!have) { nav.places.push(fresh); return { place: fresh, created: true }; }
    for (const k of ['kind', 'danger', 'crowd', 'cover']) if (raw?.[k] !== undefined && raw[k] !== null && raw[k] !== '') have[k] = fresh[k];
    if (raw?.note) have.note = str([have.note, raw.note].filter(Boolean).join(' '), 200);
    return { place: have, created: false };
}

/** Add or update a way between two places (both are created if unknown). giantMin is a giant's walking time. */
export function upsertRoute(nav, { from, to, giantMin, hazards = [], note = '' }) {
    const a = upsertPlace(nav, from).place, b = upsertPlace(nav, to).place;
    if (!a || !b || a === b) return null;
    let r = nav.routes.find((x) => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
    if (!r) { r = { a: a.id, b: b.id, giantMin: 5, hazards: [], note: '' }; nav.routes.push(r); }
    if (giantMin) r.giantMin = num(giantMin, 1, 1440, r.giantMin);
    if (hazards.length) r.hazards = [...new Set([...r.hazards, ...hazards.map((h) => str(h, 40).toLowerCase()).filter(Boolean)])].slice(0, 6);
    if (note) r.note = str(note, 160);
    return r;
}

/** Walking time for a small man: a giant's minutes scaled by stride (and a little for the detours). */
export const smallMinutes = (giantMin, playerCm = PLAYER_CM) => Math.max(1, Math.round((Number(giantMin) || 5) * (HUMAN_CM / (Number(playerCm) || PLAYER_CM)) * 1.3));

export const routesFrom = (nav, id) => nav.routes.filter((r) => r.a === id || r.b === id).map((r) => ({ route: r, to: r.a === id ? r.b : r.a }));

/** Dijkstra by a small man's minutes. Returns [{route, from, to, minutes}] or null. */
export function findPath(nav, fromId, toId, playerCm = PLAYER_CM) {
    if (fromId === toId) return [];
    const dist = new Map([[fromId, 0]]), prev = new Map(), done = new Set();
    while (true) {
        let u = null;
        for (const [k, v] of dist) if (!done.has(k) && (u === null || v < dist.get(u))) u = k;
        if (u === null || u === toId) break;
        done.add(u);
        for (const { route, to } of routesFrom(nav, u)) {
            const d = dist.get(u) + smallMinutes(route.giantMin, playerCm);
            if (d < (dist.get(to) ?? Infinity)) { dist.set(to, d); prev.set(to, { from: u, route }); }
        }
    }
    if (!dist.has(toId)) return null;
    const legs = [];
    for (let v = toId; v !== fromId; v = prev.get(v).from) { const p = prev.get(v); legs.unshift({ route: p.route, from: p.from, to: v, minutes: smallMinutes(p.route.giantMin, playerCm) }); }
    return legs;
}

/**
 * Positions for the drawing: places already placed keep their spot; new ones go on a ring around the
 * place they connect to (or the middle), nudged apart. Deterministic for a given order.
 */
export function layout(nav) {
    // New places: breadth-first from the first place, left to right by depth, siblings spread top to bottom.
    const fresh = nav.places.filter((p) => p.x === null || p.y === null);
    if (fresh.length) {
        const depth = new Map();
        const roots = nav.places.filter((p) => !fresh.includes(p));
        const queue = roots.length ? roots.map((p) => [p, 0]) : [[nav.places[0], 0]];
        for (const [p, d] of queue) depth.set(p.id, d);
        while (queue.length) {
            const [p, d] = queue.shift();
            for (const { to } of routesFrom(nav, p.id)) if (!depth.has(to)) { depth.set(to, d + 1); queue.push([nav.places.find((q) => q.id === to), d + 1]); }
        }
        for (const p of fresh) if (!depth.has(p.id)) depth.set(p.id, 1 + Math.max(0, ...[...depth.values()]));
        const maxD = Math.max(1, ...fresh.map((p) => depth.get(p.id)));
        const byDepth = new Map();
        for (const p of fresh) { const d = depth.get(p.id); byDepth.set(d, [...(byDepth.get(d) ?? []), p]); }
        for (const [d, list] of byDepth) {
            list.forEach((p, i) => {
                p.x = roots.length ? Math.min(0.92, 0.15 + (d / Math.max(maxD, 3)) * 0.77) : 0.12 + (d / Math.max(maxD, 3)) * 0.8;
                p.y = list.length === 1 ? 0.5 : 0.18 + (i / (list.length - 1)) * 0.64;
            });
        }
    }
    // relax: push places apart, pull linked ones to a comfortable distance, stay inside the frame
    const AR = MAP_ASPECT;
    for (let it = 0; it < 80; it++) {
        const f = new Map(nav.places.map((p) => [p.id, { x: 0, y: 0 }]));
        for (const a of nav.places) for (const b of nav.places) {
            if (a === b) continue;
            let dx = (a.x - b.x) * AR, dy = a.y - b.y;
            let d = Math.hypot(dx, dy) || 0.001;
            if (d < 0.001) { dx = Math.cos(seedAngle(a.id)); dy = Math.sin(seedAngle(a.id)); d = 1; }
            const min = 0.38;
            if (d < min) { const push = ((min - d) / d) * 0.5; f.get(a.id).x += (dx / AR) * push; f.get(a.id).y += dy * push; }
        }
        for (const r of nav.routes) {
            const a = nav.places.find((p) => p.id === r.a), b = nav.places.find((p) => p.id === r.b);
            if (!a || !b) continue;
            const dx = (b.x - a.x) * AR, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
            const want = 0.38, pull = ((d - want) / d) * 0.15;
            f.get(a.id).x += (dx / AR) * pull; f.get(a.id).y += dy * pull; f.get(b.id).x -= (dx / AR) * pull; f.get(b.id).y -= dy * pull;
        }
        for (const p of nav.places) { const v = f.get(p.id); p.x = Math.max(0.08, Math.min(0.92, p.x + v.x * 0.5)); p.y = Math.max(0.12, Math.min(0.86, p.y + v.y * 0.5)); }
    }
    return nav.places;
}

/** The current place (creating "somewhere" if the story never named one). */
export function here(nav) { return nav.places.find((p) => p.id === nav.at) ?? null; }

/** Lines about the known map for the prompt. */
export function navText(nav, playerCm = PLAYER_CM, max = 10) {
    const at = here(nav);
    const ways = at ? routesFrom(nav, at.id).map(({ route, to }) => { const p = nav.places.find((q) => q.id === to); return p ? `${p.name} (${smallMinutes(route.giantMin, playerCm)} min for you${route.hazards.length ? `; ${route.hazards.join(', ')}` : ''})` : null; }).filter(Boolean) : [];
    const others = nav.places.filter((p) => p !== at && !ways.some((w) => w.startsWith(p.name))).slice(0, max).map((p) => p.name);
    return [
        at ? `Here: ${at.name} (${KINDS[at.kind].label}; danger ${at.danger}/5, crowd ${at.crowd}/3, cover ${at.cover}/3${at.note ? `; ${at.note}` : ''}).` : 'Here: nowhere named yet.',
        ways.length ? `Ways from here: ${ways.join('; ')}.` : 'No known way out of here yet.',
        others.length ? `Other places known: ${others.join(', ')}.` : '',
    ].filter(Boolean).join('\n');
}
