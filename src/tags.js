// Bookkeeping tags. The model reports what changed with short square-bracket tags at the end of its
// reply ([HEALTH -2], [MONEY +5], [ITEM +brass key], [NPC Mara class 3] ...). This module finds them,
// applies them to the game and removes them from what the reader sees.

import { str } from './json.js';
import { addXp, changeItem, changeMeter, setCondition } from './sheet.js';
import { upsertNpc } from './npcs.js';
import { classForHeight, FT } from './size.js';

const KEYWORDS = 'HEALTH|HP|STAMINA|STAM|NERVE|MONEY|CASH|ITEM|COND|XP|NPC|CHECK|TIME|PLACE|NOTE';
const TAG = new RegExp(`\\[(${KEYWORDS})\\b\\s*([^\\]]*)\\]`, 'gi');
const METER = { HEALTH: 'health', HP: 'health', STAMINA: 'stamina', STAM: 'stamina', NERVE: 'nerve' };

const signed = (s) => { const m = /^([+-]?)\s*(\d+(?:\.\d+)?)/.exec(String(s).trim()); return m ? Number(m[1] + m[2]) : null; };

/** Every tag in `text`, in order, as plain objects. */
export function parseTags(text) {
    const out = [];
    for (const m of String(text ?? '').matchAll(TAG)) {
        const key = m[1].toUpperCase();
        const arg = m[2].trim();
        if (METER[key]) { const n = signed(arg); if (n !== null) out.push({ type: 'meter', meter: METER[key], delta: n }); }
        else if (key === 'MONEY' || key === 'CASH') { const n = signed(arg.replace(/^[+-]?\s*[^\d+-]+/, (s) => s.replace(/[^\d+-]/g, ''))); if (n !== null) out.push({ type: 'money', delta: n }); }
        else if (key === 'XP') { const n = signed(arg); if (n !== null) out.push({ type: 'xp', delta: Math.abs(n) }); }
        else if (key === 'ITEM') out.push(parseItem(arg));
        else if (key === 'COND') { const mm = /^([+-])?\s*(.+)$/.exec(arg); if (mm) out.push({ type: 'cond', name: mm[2].trim(), on: mm[1] !== '-' }); }
        else if (key === 'NPC') out.push(parseNpc(arg));
        else if (key === 'CHECK') out.push({ type: 'check', text: arg });
        else if (key === 'TIME') out.push({ type: 'time', text: str(arg, 60) });
        else if (key === 'PLACE') out.push({ type: 'place', text: str(arg, 120) });
        else if (key === 'NOTE') out.push({ type: 'note', text: str(arg, 200) });
    }
    return out.filter(Boolean);
}

function parseItem(arg) {
    // +rope | -rope | +coin x3 | +brass key: opens her pantry | -coin ×2
    const m = /^([+-])?\s*([^:×x]*?)(?:\s*[×x]\s*(\d+))?(?:\s*:\s*(.*))?$/.exec(arg);
    if (!m || !m[2].trim()) return null;
    return { type: 'item', name: m[2].trim(), qty: (m[1] === '-' ? -1 : 1) * (Number(m[3]) || 1), note: (m[4] ?? '').trim() };
}

function parseNpc(arg) {
    // Mara | Mara class 3 | Mara 32 ft | Mara 9.7 m | Mara: her sister, runs the bakery | Mara class 2: ...
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

/** The reply without its tags (and without the blank lines they leave). */
export function stripTags(text) {
    return String(text ?? '').replace(TAG, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Apply tags to the game {sheet, npcs, turn}. Returns human lines for the log and chips, e.g.
 * "health -2 (8/10)". `r` is the random source for new giants.
 */
export function applyTags(game, tags, { r = Math.random } = {}) {
    const out = [];
    const { sheet } = game;
    for (const t of tags) {
        switch (t.type) {
            case 'meter': { const v = changeMeter(sheet, t.meter, t.delta); out.push({ kind: t.delta < 0 ? 'bad' : 'good', text: `${t.meter} ${t.delta > 0 ? '+' : ''}${t.delta} (${v}/${sheet.meters[t.meter].max})` }); break; }
            case 'money': { sheet.money = Math.max(0, Math.round((sheet.money + t.delta) * 100) / 100); out.push({ kind: t.delta < 0 ? 'bad' : 'good', text: `${t.delta > 0 ? '+' : '-'}${sheet.currency}${Math.abs(t.delta)} (${sheet.currency}${sheet.money})` }); break; }
            case 'xp': { const lv = addXp(sheet, t.delta); out.push({ kind: 'good', text: `+${t.delta} xp${lv ? ` · level up! +${lv} point${lv > 1 ? 's' : ''}` : ''}` }); break; }
            case 'item': { const it = changeItem(sheet, t.name, t.qty, t.note); if (it) out.push({ kind: t.qty < 0 ? 'bad' : 'good', text: `${t.qty < 0 ? 'lost' : 'got'} ${t.name}${Math.abs(t.qty) > 1 ? ` ×${Math.abs(t.qty)}` : ''}` }); break; }
            case 'cond': setCondition(sheet, t.name, t.on); out.push({ kind: 'info', text: `${t.on ? 'now' : 'no longer'} ${t.name.toLowerCase()}` }); break;
            case 'npc': { const { npc, created } = upsertNpc(game.npcs, { ...t, turn: game.turn }, r); out.push({ kind: 'info', text: `${created ? 'met' : 'updated'} ${npc.name}, class ${npc.size_class}` }); break; }
            case 'check': game.checks = [...(game.checks ?? []).slice(-9), t.text]; out.push({ kind: 'info', text: `check: ${t.text}` }); break;
            case 'time': sheet.clock = t.text; out.push({ kind: 'info', text: t.text }); break;
            case 'place': sheet.place = t.text; out.push({ kind: 'info', text: t.text }); break;
            case 'note': sheet.notes = [...sheet.notes.slice(-29), t.text]; out.push({ kind: 'info', text: `note: ${t.text}` }); break;
            default: break;
        }
    }
    return out;
}

/** The tag reference for the prompt. */
export const TAG_HELP = [
    '[HEALTH -2] [STAMINA -1] [NERVE +1]  meters, with a sign',
    '[MONEY -5] [MONEY +12.50]  what was paid or earned',
    '[ITEM +brass key: opens her pantry] [ITEM +coin x3] [ITEM -rope]  gained or lost',
    '[COND +soaked] [COND -hidden]  a condition that starts or ends (soaked, hidden, carried, bruised, hungry ...)',
    '[XP +10]  for a risk taken, a problem solved, a giant won over (5 small, 10 real, 25 big)',
    '[NPC Mara] a newly named giant; her size is rolled and given to you next turn. Add "class 3" or "32 ft" only when the story has already fixed her size, and ": a note" to remember something about her',
    '[CHECK agility 17 vs 12: success]  when you used the dice',
    '[TIME Day 2, late evening] [PLACE Mara\'s kitchen, under the table]  when they change',
    '[NOTE she owes you a favour]  something to remember',
].join('\n');

/** A short label for a chip in the chat: "health −2", "+$5", "got brass key". */
export function tagLabel(t, currency = '$') {
    switch (t?.type) {
        case 'meter': return `${t.meter} ${t.delta > 0 ? '+' : '−'}${Math.abs(t.delta)}`;
        case 'money': return `${t.delta > 0 ? '+' : '−'}${currency}${Math.abs(t.delta)}`;
        case 'xp': return `+${t.delta} xp`;
        case 'item': return `${t.qty < 0 ? 'lost' : 'got'} ${t.name}${Math.abs(t.qty) > 1 ? ` ×${Math.abs(t.qty)}` : ''}`;
        case 'cond': return `${t.on ? '' : 'no longer '}${t.name.toLowerCase()}`;
        case 'npc': return `${t.name}${t.cls ? ` · class ${t.cls}` : ''}`;
        case 'check': return `🎲 ${t.text}`;
        case 'time': return `🕑 ${t.text}`;
        case 'place': return `📍 ${t.text}`;
        case 'note': return `✎ ${t.text}`;
        default: return '';
    }
}
