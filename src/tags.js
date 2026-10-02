// Bookkeeping tags. The model reports what changed with short square-bracket tags at the end of its
// reply ([HEALTH -2], [MONEY +5], [ITEM +brass key], [NPC Mara class 3], [MAP ...], [ROUTE ...]).
// This module finds them, applies them to the game and removes them from what the reader sees.

import { str } from './json.js';
import { addInjury, addXp, changeItem, changeMeter, eat, passTime, setCondition } from './sheet.js';
import { upsertNpc } from './npcs.js';
import { classForHeight, FT } from './size.js';
import { KINDS, here, upsertPlace, upsertRoute } from './nav.js';
import { parseTime, absMin } from './clock.js';
import { ATTRS } from './dice.js';

const KEYWORDS = 'HEALTH|HP|STAMINA|STAM|NERVE|FOOD|WARMTH|EAT|MONEY|CASH|ITEM|COND|XP|NPC|CHECK|TIME|PLACE|MAP|ROUTE|INJURY|NOTE';
const TAG = new RegExp(`\\[(${KEYWORDS})\\b\\s*([^\\]]*)\\]`, 'gi');
export const TAG_RE = TAG;
const METER = { HEALTH: 'health', HP: 'health', STAMINA: 'stamina', STAM: 'stamina', NERVE: 'nerve', FOOD: 'food', WARMTH: 'warmth' };

const signed = (s) => { const m = /^([+-]?)\s*(\d+(?:\.\d+)?)/.exec(String(s).trim()); return m ? Number(m[1] + m[2]) : null; };

/** Every tag in `text`, in order, as plain objects. */
export function parseTags(text) {
    const out = [];
    for (const m of String(text ?? '').matchAll(TAG)) {
        const key = m[1].toUpperCase();
        const arg = m[2].trim();
        if (METER[key]) { const n = signed(arg); if (n !== null) out.push({ type: 'meter', meter: METER[key], delta: n }); }
        else if (key === 'EAT') out.push({ type: 'eat', amount: Math.abs(signed(arg) ?? 4) || 4, text: arg.replace(/^[+-]?\d+\s*:?\s*/, '') });
        else if (key === 'MONEY' || key === 'CASH') { const n = signed(arg.replace(/^([+-]?)\s*[^\d]*/, '$1')); if (n !== null) out.push({ type: 'money', delta: n }); }
        else if (key === 'XP') { const n = signed(arg); if (n !== null) out.push({ type: 'xp', delta: Math.abs(n) }); }
        else if (key === 'ITEM') out.push(parseItem(arg));
        else if (key === 'COND') { const mm = /^([+-])?\s*(.+)$/.exec(arg); if (mm) out.push({ type: 'cond', name: mm[2].trim(), on: mm[1] !== '-' }); }
        else if (key === 'NPC') out.push(parseNpc(arg));
        else if (key === 'CHECK') out.push({ type: 'check', text: arg });
        else if (key === 'TIME') out.push({ type: 'time', text: str(arg, 60) });
        else if (key === 'PLACE') { const [name, ...rest] = arg.split(':'); if (name.trim()) out.push({ type: 'place', name: str(name, 60), spot: str(rest.join(':'), 120) }); }
        else if (key === 'MAP') out.push(parseMap(arg));
        else if (key === 'ROUTE') out.push(parseRoute(arg));
        else if (key === 'INJURY') out.push(parseInjury(arg));
        else if (key === 'NOTE') out.push({ type: 'note', text: str(arg, 200) });
    }
    return out.filter(Boolean);
}

function parseItem(arg) {
    const m = /^([+-])?\s*([^:×x]*?)(?:\s*[×x]\s*(\d+))?(?:\s*:\s*(.*))?$/.exec(arg);
    if (!m || !m[2].trim()) return null;
    return { type: 'item', name: m[2].trim(), qty: (m[1] === '-' ? -1 : 1) * (Number(m[3]) || 1), note: (m[4] ?? '').trim() };
}

function parseNpc(arg) {
    const [head, ...rest] = arg.split(':');
    const note = rest.join(':').trim();
    let name = head.trim(), cls = null, heightCm = null;
    let m = /^(.*?)\s+class\s*(\d)\s*$/i.exec(name);
    if (m) { name = m[1]; cls = Number(m[2]); }
    else if ((m = /^(.*?)\s+(\d+(?:\.\d+)?)\s*(ft|feet|'|m|meters|metres)\s*$/i.exec(name))) {
        name = m[1];
        heightCm = Math.round(Number(m[2]) * (/^m/i.test(m[3]) ? 100 : FT));
        cls = classForHeight(heightCm);
    }
    name = name.trim();
    if (!name) return null;
    return { type: 'npc', name, cls, heightCm, note };
}

/** [MAP Market square: square, danger 3, crowd 2, cover 0: a note] — fields in any order, all optional. */
function parseMap(arg) {
    const [head, fields = '', ...rest] = arg.split(':');
    const name = head.trim();
    if (!name) return null;
    const out = { type: 'map', name: str(name, 60), note: str(rest.join(':'), 200) };
    const f = fields.toLowerCase();
    const kind = Object.keys(KINDS).find((k) => new RegExp(`\\b${k}s?\\b`).test(f)) ?? (/\binside|indoors?\b/.test(f) ? 'indoor' : /\boutside|outdoors?\b/.test(f) ? 'wild' : null);
    if (kind) out.kind = kind;
    for (const k of ['danger', 'crowd', 'cover']) { const m = new RegExp(`${k}\\s*(\\d)`).exec(f); if (m) out[k] = Number(m[1]); }
    if (!fields.trim() && !rest.length) return out;
    if (fields && !kind && !/danger|crowd|cover/.test(f)) out.note = str([fields, out.note].filter(Boolean).join(' '), 200);
    return out;
}

/** [ROUTE Market square - Bakery: 5 min, hazards: gutter, cats: note] — minutes are a giant's walk. */
function parseRoute(arg) {
    const m = /^(.+?)\s*(?:->|→|-|to|–)\s*(.+?)\s*(?::\s*(.*))?$/.exec(arg);
    if (!m) return null;
    const out = { type: 'route', from: str(m[1], 60), to: str(m[2], 60), giantMin: null, hazards: [], note: '' };
    const rest = m[3] ?? '';
    const t = /(\d+(?:\.\d+)?)\s*(min|minutes?|h|hours?|hrs?)\b/i.exec(rest);
    if (t) out.giantMin = Math.round(Number(t[1]) * (/^h/i.test(t[2]) ? 60 : 1));
    let tail;
    const h = /hazards?\s*:?\s*([^:]+)/i.exec(rest);
    if (h) { out.hazards = h[1].split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 6); tail = rest.slice(h.index + h[0].length); }
    else tail = rest.includes(':') ? rest.slice(rest.indexOf(':') + 1) : rest.replace(t?.[0] ?? '', '');
    out.note = str(tail.replace(/^[\s:,]+/, ''), 160);
    return out;
}

/** [INJURY sprained ankle: agility -1, 2 days] */
function parseInjury(arg) {
    const [head, rest = ''] = arg.split(':');
    const name = head.trim();
    if (!name) return null;
    const attr = ATTRS.find((a) => rest.toLowerCase().includes(a)) ?? 'agility';
    const mod = /-\s*(\d)/.exec(rest);
    const d = /(\d+(?:\.\d+)?)\s*(day|days|d|h|hour|hours|week|weeks)\b/i.exec(rest);
    const hours = d ? Number(d[1]) * (/^w/i.test(d[2]) ? 168 : /^d/i.test(d[2]) ? 24 : 1) : 48;
    return { type: 'injury', name: str(name, 40), attr, mod: mod ? -Number(mod[1]) : -1, hours };
}

/** The reply without its tags (and without the blank lines they leave). */
export function stripTags(text) {
    return String(text ?? '').replace(TAG, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Apply tags to the game {sheet, npcs, nav, weather, turn}. Returns lines for the log and chips.
 * `r` is the random source for new giants.
 */
export function applyTags(game, tags, { r = Math.random } = {}) {
    const out = [];
    const { sheet } = game;
    const nav = game.nav;
    const env = () => { const p = nav ? here(nav) : null; return { weather: game.weather ?? 'clear', outside: p ? !['indoor', 'shop', 'hideout'].includes(p.kind) : false }; };
    for (const t of tags) {
        switch (t.type) {
            case 'meter': { const v = changeMeter(sheet, t.meter, t.delta); out.push({ kind: t.delta < 0 ? 'bad' : 'good', text: `${t.meter} ${t.delta > 0 ? '+' : ''}${t.delta} (${v}/${sheet.meters[t.meter].max})` }); break; }
            case 'eat': eat(sheet, t.amount); out.push({ kind: 'good', text: `ate${t.text ? ` ${t.text}` : ''} (food ${sheet.meters.food.cur}/${sheet.meters.food.max})` }); break;
            case 'money': { sheet.money = Math.max(0, Math.round((sheet.money + t.delta) * 100) / 100); out.push({ kind: t.delta < 0 ? 'bad' : 'good', text: `${t.delta > 0 ? '+' : '-'}${sheet.currency}${Math.abs(t.delta)} (${sheet.currency}${sheet.money})` }); break; }
            case 'xp': { const lv = addXp(sheet, t.delta); out.push({ kind: 'good', text: `+${t.delta} xp${lv ? ` · level up! +${lv} point${lv > 1 ? 's' : ''}` : ''}` }); break; }
            case 'item': { const it = changeItem(sheet, t.name, t.qty, t.note); if (it) out.push({ kind: t.qty < 0 ? 'bad' : 'good', text: `${t.qty < 0 ? 'lost' : 'got'} ${t.name}${Math.abs(t.qty) > 1 ? ` ×${Math.abs(t.qty)}` : ''}` }); break; }
            case 'cond': setCondition(sheet, t.name, t.on); out.push({ kind: 'info', text: `${t.on ? 'now' : 'no longer'} ${t.name.toLowerCase()}` }); break;
            case 'npc': { const { npc, created } = upsertNpc(game.npcs, { ...t, turn: game.turn }, r); out.push({ kind: 'info', text: `${created ? 'met' : 'updated'} ${npc.name}, class ${npc.size_class}` }); break; }
            case 'check': game.checks = [...(game.checks ?? []).slice(-9), t.text]; out.push({ kind: 'info', text: `check: ${t.text}` }); break;
            case 'time': {
                const p = parseTime(t.text, sheet.time);
                if (!p) break;
                const minutes = p.add ?? Math.max(0, absMin(p.set) - absMin(sheet.time));
                if (p.set && absMin(p.set) < absMin(sheet.time)) { sheet.time = p.set; sheet.lastMeal = Math.min(sheet.lastMeal, absMin(p.set)); sheet.wokeAt = Math.min(sheet.wokeAt, absMin(p.set)); }
                else if (p.set && minutes >= 600) {
                    // a long skip: he slept somewhere along the way; hunger still mounts, capped
                    const notes = passTime(sheet, minutes, { ...env(), resting: true, maxHunger: 3, gentle: true });
                    sheet.wokeAt = absMin(sheet.time);
                    sheet.lastMeal = absMin(sheet.time);
                    setCondition(sheet, 'tired', false); setCondition(sheet, 'exhausted', false);
                    for (const n of notes) out.push({ kind: 'bad', text: n });
                } else { const notes = passTime(sheet, minutes, env()); for (const n of notes) out.push({ kind: 'bad', text: n }); }
                out.push({ kind: 'info', text: `time: ${t.text}` });
                break;
            }
            case 'place': {
                if (nav) { const { place, created } = upsertPlace(nav, { name: t.name }); if (place) { if (nav.at !== place.id) place.visits += 1; nav.at = place.id; out.push({ kind: 'info', text: `${created ? 'new place' : 'at'}: ${place.name}` }); } }
                sheet.place = t.spot;
                break;
            }
            case 'map': { if (nav) { const { place, created } = upsertPlace(nav, t); if (place) out.push({ kind: 'info', text: `${created ? 'mapped' : 'updated'}: ${place.name}` }); } break; }
            case 'route': { if (nav) { const rt = upsertRoute(nav, t); if (rt) out.push({ kind: 'info', text: `way: ${t.from} – ${t.to}` }); } break; }
            case 'injury': { const inj = addInjury(sheet, t.name, t.attr, t.mod, t.hours); if (inj) out.push({ kind: 'bad', text: `injured: ${inj.name} (${inj.attr} ${inj.mod})` }); break; }
            case 'note': sheet.notes = [...sheet.notes.slice(-29), t.text]; out.push({ kind: 'info', text: `note: ${t.text}` }); break;
            default: break;
        }
    }
    return out;
}

/** The tag reference for the prompt. */
export const TAG_HELP = [
    '[HEALTH -2] [STAMINA -1] [NERVE +1] [WARMTH -2]  meters, with a sign; [EAT 4: a crumb of bread] when he eats (food up, 1 for a bite, 4 for a meal)',
    '[MONEY -5] [MONEY +12.50]  what was paid or earned',
    '[ITEM +brass key: opens her pantry] [ITEM +coin x3] [ITEM -rope]  gained or lost',
    '[COND +soaked] [COND -hidden] [COND +carried] [COND +noticed]  a state that starts or ends',
    '[INJURY sprained ankle: agility -1, 2 days]  a lasting hurt (might, agility, wits or charm)',
    '[XP +10]  for a risk survived, a problem solved, a giant won over (5 small, 10 real, 25 big)',
    '[NPC Mara] a newly named giant; her size is rolled and given to you next turn. Add "class 3" or "32 ft" only when the story has already fixed her size; ": a note" to remember something',
    '[CHECK agility 17 vs 12: success]  when you used the dice',
    '[TIME +40 min] [TIME Day 2, evening]  how much time the reply covered (always, when more than a few minutes)',
    '[PLACE Mara\'s kitchen: under the table]  where he is now, and the spot within it, whenever it changes',
    '[MAP Market square: square, danger 3, crowd 2, cover 0: stalls, carts, a drain he could use]  a place he learns of (kinds: indoor, shop, street, square, road, wild, water, hideout; danger 0-5, crowd 0-3, cover 0-3)',
    '[ROUTE Mara\'s kitchen - Market square: 6 min, hazards: back step, gutter, cats]  a way between two places, with a giant\'s walking time',
    '[NOTE she owes you a favour]  something to remember',
].join('\n');

/** A short label for a chip in the chat: "health −2", "+$5", "got brass key". */
export function tagLabel(t, currency = '$') {
    switch (t?.type) {
        case 'meter': return `${t.meter} ${t.delta > 0 ? '+' : '−'}${Math.abs(t.delta)}`;
        case 'eat': return `ate${t.text ? ` ${t.text}` : ''}`;
        case 'money': return `${t.delta > 0 ? '+' : '−'}${currency}${Math.abs(t.delta)}`;
        case 'xp': return `+${t.delta} xp`;
        case 'item': return `${t.qty < 0 ? 'lost' : 'got'} ${t.name}${Math.abs(t.qty) > 1 ? ` ×${Math.abs(t.qty)}` : ''}`;
        case 'cond': return `${t.on ? '' : 'no longer '}${t.name.toLowerCase()}`;
        case 'injury': return `injured: ${t.name}`;
        case 'npc': return `${t.name}${t.cls ? ` · class ${t.cls}` : ''}`;
        case 'check': return `🎲 ${t.text}`;
        case 'time': return `🕑 ${t.text}`;
        case 'place': return `📍 ${t.name}${t.spot ? `: ${t.spot}` : ''}`;
        case 'map': return `🗺 ${t.name}`;
        case 'route': return `↔ ${t.from} – ${t.to}`;
        case 'note': return `✎ ${t.text}`;
        default: return '';
    }
}
