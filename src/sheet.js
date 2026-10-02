// The player sheet: a small man's stats, money, items and conditions. Pure data and pure functions so
// the panel, the prompt and the tag handler all work from the same shape.

import { ATTRS } from './dice.js';
import { num, slug, str } from './json.js';
import { PLAYER_CM } from './size.js';
import { absMin, createTime, isDark, parseTime, tick } from './clock.js';

export const METERS = ['health', 'stamina', 'nerve', 'food', 'warmth'];
export const METER_HELP = {
    health: 'bruises, cuts, being stepped on; 0 is out cold or worse',
    stamina: 'climbing, running, hanging on; 0 is collapse',
    nerve: 'the will to stay calm under a giant; 0 is panic or freezing up',
    food: 'drops one every three hours; 0 is starving and costs health',
    warmth: 'drops when wet, cold or out at night; 0 costs health',
};

export const XP_PER_LEVEL = 100;
export const levelFor = (xp) => 1 + Math.floor(Math.max(0, Number(xp) || 0) / XP_PER_LEVEL);

export function createSheet({ name = 'You', heightCm = PLAYER_CM, money = 20, currency = '$' } = {}) {
    return {
        name: str(name, 60) || 'You',
        height_cm: num(heightCm, 30, 300, PLAYER_CM),
        meters: Object.fromEntries(METERS.map((m) => [m, { cur: m === 'food' ? 8 : 10, max: 10 }])),
        attrs: Object.fromEntries(ATTRS.map((a) => [a, 2])),
        points: 0, // unspent attribute points from levelling
        xp: 0,
        money: num(money, 0, 1e9, 20),
        currency: str(currency, 8) || '$',
        items: [], // {id, name, qty, note}
        conditions: [], // short words: soaked, hidden, bruised, carried
        notes: [], // things the player wants remembered, one line each
        time: createTime(), // {day, min}
        place: '', // the spot within the place: "under the table"
        injuries: [], // {name, attr, mod, until (absolute minutes)}
        lastMeal: 0, wokeAt: 0, // absolute minutes
    };
}

/** Bring a stored sheet up to the current shape. */
export function normalizeSheet(raw) {
    const s = createSheet({ name: raw?.name, heightCm: raw?.height_cm, money: raw?.money, currency: raw?.currency });
    for (const m of METERS) {
        const v = raw?.meters?.[m] ?? {};
        s.meters[m].max = num(v.max, 1, 999, 10);
        s.meters[m].cur = num(v.cur, 0, s.meters[m].max, m === 'food' ? 8 : s.meters[m].max);
    }
    for (const a of ATTRS) s.attrs[a] = num(raw?.attrs?.[a], 0, 9, 2);
    s.points = num(raw?.points, 0, 99, 0);
    s.xp = num(raw?.xp, 0, 1e7, 0);
    s.items = (Array.isArray(raw?.items) ? raw.items : []).map(normalizeItem).filter(Boolean).slice(0, 60);
    s.conditions = [...new Set((Array.isArray(raw?.conditions) ? raw.conditions : []).map((c) => str(c, 30).toLowerCase()).filter(Boolean))].slice(0, 12);
    s.notes = (Array.isArray(raw?.notes) ? raw.notes : []).map((n) => str(n, 200)).filter(Boolean).slice(0, 30);
    s.time = { day: num(raw?.time?.day, 1, 1e6, 1), min: num(raw?.time?.min, 0, 1439, 8 * 60) };
    if (raw?.clock && !raw?.time) { const t = parseTime(raw.clock, s.time); if (t?.set) s.time = t.set; }
    s.place = str(raw?.place, 120);
    s.injuries = (Array.isArray(raw?.injuries) ? raw.injuries : []).map((i) => ({ name: str(i?.name, 40), attr: ATTRS.includes(i?.attr) ? i.attr : 'agility', mod: num(i?.mod, -5, 0, -1), until: num(i?.until, 0, 1e9, 0) })).filter((i) => i.name).slice(0, 8);
    s.lastMeal = num(raw?.lastMeal, 0, 1e9, absMin(s.time));
    s.wokeAt = num(raw?.wokeAt, 0, 1e9, absMin(s.time));
    return s;
}

/** Attributes after injuries, tiredness and hunger. */
export function effectiveAttrs(sheet) {
    const out = { ...sheet.attrs };
    for (const i of sheet.injuries) out[i.attr] = (out[i.attr] ?? 0) + i.mod;
    if (sheet.conditions.includes('exhausted')) for (const a of ATTRS) out[a] -= 1;
    if (sheet.conditions.includes('starving')) { out.might -= 1; out.agility -= 1; }
    for (const a of ATTRS) out[a] = Math.max(-3, out[a]);
    return out;
}

/** An injury: a named penalty that heals after `hours`. */
export function addInjury(sheet, name, attr = 'agility', mod = -1, hours = 48) {
    const inj = { name: str(name, 40), attr: ATTRS.includes(attr) ? attr : 'agility', mod: num(mod, -5, 0, -1), until: absMin(sheet.time) + Math.max(1, Math.round(hours * 60)) };
    if (!inj.name) return null;
    sheet.injuries = [...sheet.injuries.filter((i) => i.name !== inj.name), inj].slice(-8);
    return inj;
}

/**
 * Let `minutes` pass: hunger, cold, tiredness and their costs. env: {weather, outside, resting}.
 * Returns the notable things that happened, as text.
 */
export function passTime(sheet, minutes, { weather = 'clear', outside = false, resting = false, maxHunger = Infinity, gentle = false } = {}) {
    const out = [];
    const before = absMin(sheet.time);
    tick(sheet.time, minutes);
    const now = absMin(sheet.time);
    // hunger: one food per 3 hours
    const hungerSteps = Math.min(maxHunger, Math.floor((now - sheet.lastMeal) / 180) - Math.floor((before - sheet.lastMeal) / 180));
    if (hungerSteps > 0) changeMeter(sheet, 'food', -hungerSteps);
    // warmth: lose when wet, cold, or out in the dark; gain when inside and dry
    const hours = (now - before) / 60;
    const wet = sheet.conditions.includes('soaked');
    const dries = wet && hours >= 2 && (!outside || gentle || weather === 'clear' || weather === 'heat');
    const wetHours = dries ? Math.min(hours, 2) : hours;
    let warm = 0;
    if (wet) warm -= wetHours * 1.5;
    if (outside && !gentle && (weather === 'cold' || weather === 'rain')) warm -= hours;
    if (outside && !gentle && isDark(sheet.time.min) && weather !== 'heat') warm -= hours * 0.5;
    if ((!outside || gentle) && (!wet || dries)) warm += Math.max(0, hours - wetHours);
    if (dries) { setCondition(sheet, 'soaked', false); out.push('dried off'); }
    if (warm) changeMeter(sheet, 'warmth', Math.round(warm));
    // starving and freezing cost health
    if (!gentle && sheet.meters.food.cur <= 0) { const n = Math.floor(hours / 4); if (n) { changeMeter(sheet, 'health', -n); out.push(`starving: -${n} health`); } }
    if (!gentle && sheet.meters.warmth.cur <= 0) { const n = Math.floor(hours); if (n) { changeMeter(sheet, 'health', -n); out.push(`freezing: -${n} health`); } }
    // conditions from the meters
    setCondition(sheet, 'hungry', sheet.meters.food.cur > 0 && sheet.meters.food.cur <= 3);
    setCondition(sheet, 'starving', sheet.meters.food.cur <= 0);
    setCondition(sheet, 'cold', sheet.meters.warmth.cur > 0 && sheet.meters.warmth.cur <= 3);
    setCondition(sheet, 'freezing', sheet.meters.warmth.cur <= 0);
    // tiredness
    const awake = (now - sheet.wokeAt) / 60;
    if (!resting) {
        setCondition(sheet, 'tired', awake >= 16 && awake < 24);
        setCondition(sheet, 'exhausted', awake >= 24);
        if (awake >= 24 && !out.includes('exhausted')) out.push('exhausted');
    }
    // injuries heal
    const healed = sheet.injuries.filter((i) => i.until <= now);
    if (healed.length) { sheet.injuries = sheet.injuries.filter((i) => i.until > now); out.push(`healed: ${healed.map((i) => i.name).join(', ')}`); }
    return out;
}

/** Eat: food up, the hunger clock restarts. */
export function eat(sheet, amount = 4) { changeMeter(sheet, 'food', amount); sheet.lastMeal = absMin(sheet.time); setCondition(sheet, 'hungry', sheet.meters.food.cur <= 3); setCondition(sheet, 'starving', false); }

/** Sleep for `minutes` somewhere: stamina and nerve back, some health if fed, the tiredness clock restarts. */
export function sleep(sheet, minutes, env = {}) {
    const notes = passTime(sheet, minutes, { ...env, resting: true });
    sheet.wokeAt = absMin(sheet.time);
    setCondition(sheet, 'tired', false); setCondition(sheet, 'exhausted', false);
    sheet.meters.stamina.cur = sheet.meters.stamina.max;
    changeMeter(sheet, 'nerve', Math.ceil(sheet.meters.nerve.max / 2));
    if (sheet.meters.food.cur > 0 && sheet.meters.warmth.cur > 0) changeMeter(sheet, 'health', 2);
    return notes;
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
    if (sheet.injuries.length) lines.push(`Injuries: ${sheet.injuries.map((i) => `${i.name} (${i.attr} ${i.mod})`).join(', ')}.`);
    if (sheet.notes.length) lines.push(`Notes: ${sheet.notes.join(' | ')}`);
    return lines.join('\n');
}
