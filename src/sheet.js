// The player sheet: a small man's stats, money, items and conditions. Pure data and pure functions so
// the panel, the prompt and the tag handler all work from the same shape.

import { ATTRS } from './dice.js';
import { num, slug, str } from './json.js';
import { PLAYER_CM } from './size.js';

export const METERS = ['health', 'stamina', 'nerve'];
export const METER_HELP = {
    health: 'bruises, cuts, being stepped on; 0 is out cold or worse',
    stamina: 'climbing, running, hanging on; 0 is collapse',
    nerve: 'the will to stay calm under a giant; 0 is panic or freezing up',
};

export const XP_PER_LEVEL = 100;
export const levelFor = (xp) => 1 + Math.floor(Math.max(0, Number(xp) || 0) / XP_PER_LEVEL);

export function createSheet({ name = 'You', heightCm = PLAYER_CM, money = 20, currency = '$' } = {}) {
    return {
        name: str(name, 60) || 'You',
        height_cm: num(heightCm, 30, 300, PLAYER_CM),
        meters: Object.fromEntries(METERS.map((m) => [m, { cur: 10, max: 10 }])),
        attrs: Object.fromEntries(ATTRS.map((a) => [a, 2])),
        points: 0, // unspent attribute points from levelling
        xp: 0,
        money: num(money, 0, 1e9, 20),
        currency: str(currency, 8) || '$',
        items: [], // {id, name, qty, note}
        conditions: [], // short words: soaked, hidden, bruised, carried
        notes: [], // things the player wants remembered, one line each
        clock: '', // free text: "Day 2, late evening"
        place: '', // free text: "Mara's kitchen, under the table"
    };
}

/** Bring a stored sheet up to the current shape. */
export function normalizeSheet(raw) {
    const s = createSheet({ name: raw?.name, heightCm: raw?.height_cm, money: raw?.money, currency: raw?.currency });
    for (const m of METERS) {
        const v = raw?.meters?.[m] ?? {};
        s.meters[m].max = num(v.max, 1, 999, 10);
        s.meters[m].cur = num(v.cur, 0, s.meters[m].max, s.meters[m].max);
    }
    for (const a of ATTRS) s.attrs[a] = num(raw?.attrs?.[a], 0, 9, 2);
    s.points = num(raw?.points, 0, 99, 0);
    s.xp = num(raw?.xp, 0, 1e7, 0);
    s.items = (Array.isArray(raw?.items) ? raw.items : []).map(normalizeItem).filter(Boolean).slice(0, 60);
    s.conditions = [...new Set((Array.isArray(raw?.conditions) ? raw.conditions : []).map((c) => str(c, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
    s.notes = (Array.isArray(raw?.notes) ? raw.notes : []).map((n) => str(n, 200)).filter(Boolean).slice(0, 30);
    s.clock = str(raw?.clock, 60);
    s.place = str(raw?.place, 120);
    return s;
}

export function normalizeItem(raw) {
    const name = str(typeof raw === 'string' ? raw : raw?.name, 60);
    if (!name) return null;
    return { id: slug(name), name, qty: num(raw?.qty, 1, 9999, 1), note: str(raw?.note, 120) };
}

export const findItem = (sheet, name) => {
    const id = slug(name);
    return sheet.items.find((i) => i.id === id) ?? sheet.items.find((i) => i.id.startsWith(id) || i.name.toLowerCase().includes(String(name).toLowerCase()));
};

/** Add (qty > 0) or remove (qty < 0) an item; removing more than held drops it. Returns the item or null. */
export function changeItem(sheet, name, qty = 1, note = '') {
    const item = normalizeItem({ name, qty: Math.abs(qty) || 1, note });
    if (!item) return null;
    const have = findItem(sheet, item.name);
    if (qty < 0) {
        if (!have) return null;
        have.qty -= Math.abs(qty);
        if (have.qty <= 0) sheet.items = sheet.items.filter((i) => i !== have);
        return have;
    }
    if (have) { have.qty += item.qty; if (note) have.note = item.note; return have; }
    sheet.items.push(item);
    return item;
}

export function setCondition(sheet, name, on = true) {
    const c = str(name, 30).toLowerCase();
    if (!c) return;
    sheet.conditions = sheet.conditions.filter((x) => x !== c);
    if (on) sheet.conditions.push(c);
}

/** Change a meter by delta (clamped). Returns the new value. */
export function changeMeter(sheet, meter, delta) {
    const m = sheet.meters[meter];
    if (!m) return null;
    m.cur = num(m.cur + (Number(delta) || 0), 0, m.max, m.cur);
    return m.cur;
}

/** Add xp; returns the number of levels gained (attribute points are granted). */
export function addXp(sheet, amount) {
    const before = levelFor(sheet.xp);
    sheet.xp = num(sheet.xp + (Number(amount) || 0), 0, 1e7, sheet.xp);
    const gained = levelFor(sheet.xp) - before;
    if (gained > 0) sheet.points += gained;
    return gained;
}

/** Spend an unspent point on an attribute. */
export function spendPoint(sheet, attr) {
    if (!ATTRS.includes(attr) || sheet.points <= 0 || sheet.attrs[attr] >= 9) return false;
    sheet.attrs[attr] += 1;
    sheet.points -= 1;
    return true;
}

export const moneyText = (sheet) => `${sheet.currency}${Number(sheet.money).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** The sheet for the prompt: a few lines. */
export function sheetText(sheet) {
    const meters = METERS.map((m) => `${m} ${sheet.meters[m].cur}/${sheet.meters[m].max}`).join(', ');
    const attrs = ATTRS.map((a) => `${a} ${sheet.attrs[a]}`).join(', ');
    const items = sheet.items.length ? sheet.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}${i.note ? ` (${i.note})` : ''}`).join('; ') : 'nothing but the clothes on your back';
    const lines = [
        `${sheet.name}, level ${levelFor(sheet.xp)} (${sheet.xp} xp). ${meters}. ${attrs}.`,
        `Money: ${moneyText(sheet)}. Carrying: ${items}.`,
    ];
    if (sheet.conditions.length) lines.push(`Conditions: ${sheet.conditions.join(', ')}.`);
    if (sheet.clock || sheet.place) lines.push([sheet.clock && `Time: ${sheet.clock}.`, sheet.place && `Where: ${sheet.place}.`].filter(Boolean).join(' '));
    if (sheet.notes.length) lines.push(`Notes: ${sheet.notes.join(' | ')}`);
    return lines.join('\n');
}
