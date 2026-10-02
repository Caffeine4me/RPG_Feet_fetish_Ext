// The giants you know. Each gets a size class the moment she is named: rolled by the extension (rarer
// the taller) unless the story or the settings fix it. Names are matched loosely so "Mara" and
// "Mara Voss" are one entry.

import { num, slug, str } from './json.js';
import { PLAYER_CM, classForHeight, classOf, heightFor, rollClass, scaleText, sizeLine } from './size.js';

export function createNpc({ name, cls, heightCm, note = '', card = false, turn = 0 }, r = Math.random) {
    const n = str(name, 60);
    let size_class = cls ? classOf(cls).n : null;
    const h = Number(heightCm);
    let height_cm = Number.isFinite(h) && h > 0 ? num(h, 200, 4000, null) : null;
    if (height_cm && !cls) size_class = classForHeight(height_cm);
    if (!size_class) size_class = rollClass(r());
    if (!height_cm || classForHeight(height_cm) !== size_class) height_cm = heightFor(size_class, r());
    return { id: slug(n), name: n, size_class, height_cm, note: str(note, 300), relation: '', card: Boolean(card), met: turn, seen: turn };
}

export function normalizeNpc(raw) {
    if (!raw?.name) return null;
    const n = createNpc({ name: raw.name, cls: raw.size_class, heightCm: raw.height_cm, note: raw.note, card: raw.card, turn: raw.met }, () => 0.5);
    n.relation = str(raw.relation, 120);
    n.seen = num(raw.seen, 0, 1e9, n.met);
    return n;
}

const first = (name) => slug(name).split('_')[0];

export function findNpc(list, name) {
    const id = slug(name);
    if (!id || id === 'x') return null;
    return list.find((n) => n.id === id)
        ?? list.find((n) => first(n.name) === id || n.id.startsWith(`${id}_`) || id.startsWith(`${n.id}_`))
        ?? null;
}

/**
 * Add or update a giant. A class or height given here wins over what was rolled before (the story
 * decided); a note is appended; returns {npc, created}.
 */
export function upsertNpc(list, { name, cls, heightCm, note, card, turn = 0 }, r = Math.random) {
    const have = findNpc(list, name);
    if (!have) {
        const npc = createNpc({ name, cls, heightCm, note, card, turn }, r);
        list.push(npc);
        return { npc, created: true };
    }
    if (cls || heightCm) {
        const fresh = createNpc({ name: have.name, cls, heightCm }, r);
        have.size_class = fresh.size_class;
        have.height_cm = fresh.height_cm;
    }
    if (note) have.note = str([have.note, note].filter(Boolean).join(' '), 300);
    if (card) have.card = true;
    have.seen = Math.max(have.seen ?? 0, turn);
    return { npc: have, created: false };
}

/** Lines about the giants for the prompt: card characters first, then the most recently seen. */
export function npcsText(list, { playerCm = PLAYER_CM, max = 8 } = {}) {
    const sorted = [...list].sort((a, b) => Number(b.card) - Number(a.card) || (b.seen ?? 0) - (a.seen ?? 0)).slice(0, max);
    return sorted.map((n) => `- ${scaleText(n, playerCm)}${n.relation ? ` Relation: ${n.relation}.` : ''}${n.note ? ` ${n.note}` : ''}`).join('\n');
}

export const npcLine = (n, playerCm) => `${n.name}: ${sizeLine(n, playerCm)}`;
