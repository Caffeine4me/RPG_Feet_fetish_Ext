// The visual-novel scene: the brief that goes into the prompt before each reply, the parser that reads
// the reply back (dialogue lines with [expression] tags, a [CHOICES] block, an [EVENT] tag), and the
// reconcile request that extracts what the story changed (favor, items, quests, time, new places).

import { extractJson, list, num, slug, str } from './json.js';
import { EXPRESSIONS, VERBS, sheetSummary } from './sheet.js';
import { CHECKS, playerLine, relationLine, tiny, triggers } from './rules.js';
import { findLocation, isOpenNow, townSummary, typeOf, whoIsAt } from './world.js';

export const EVENT_TYPES = ['service_row', 'chore', 'expedition', 'punishment', 'none'];

/**
 * The game state as text for the model, with the format rules.
 * @param {object} o
 * @param {object} o.world
 * @param {object} o.state
 * @param {string} o.user the player's name
 * @param {{text: string}|null} [o.outcome] the engine's resolved outcome for the player's last action
 * @param {{cruelty?: number, smell?: number, lethal?: boolean, length?: string}} [o.settings]
 */
export function buildBrief({ world, state, user, outcome = null, settings = {} }) {
    const here = findLocation(world, state.at);
    const present = here ? whoIsAt(world, here.id, state.slot).filter(() => isOpenNow(world, state, here) || here.type === 'home') : [];
    const lines = [];
    lines.push('[Sole Survivor: the game state. Follow it exactly; it outranks earlier story details that contradict it.]');
    lines.push(townSummary(world, state));
    if (here) lines.push(`HERE: ${here.name} (${typeOf(here).label.toLowerCase()}): ${here.interior}${here.notes ? ` ${here.notes}` : ''}${isOpenNow(world, state, here) || here.type === 'home' ? '' : ' It is closed right now; you are outside it.'}`);
    if (present.length) {
        lines.push('PRESENT:');
        for (const s of present) lines.push(`- ${sheetSummary(s)}\n  Relationship: ${relationLine(state, s)}`);
    } else lines.push('PRESENT: nobody; you are alone here.');
    lines.push(`PLAYER: ${playerLine(state, user)}`);
    const active = world.quests.filter((q) => state.quests[q.id]?.status === 'active');
    if (active.length) lines.push(`QUESTS: ${active.map((q) => `"${q.title}" for ${world.residents.find((r) => r.id === q.giver)?.name ?? 'someone'}: ${q.goal}${q.due_day ? ` (by day ${q.due_day})` : ''}`).join(' | ')}`);
    const hidden = world.quests.filter((q) => state.quests[q.id]?.status === 'hidden' && present.some((s) => s.id === q.giver));
    if (hidden.length) lines.push(`QUESTS SHE COULD GIVE (when it fits; say [QUEST id] on its own line when she does): ${hidden.map((q) => `[${q.id}] "${q.title}": ${q.goal}`).join(' | ')}`);
    if (outcome?.text) lines.push(`OUTCOME OF THE PLAYER'S LAST ACTION (already decided; narrate it, do not change it): ${outcome.text}`);
    const t = triggers(state, present);
    if (t.length) lines.push(`MUST HAPPEN NOW: ${t.map((x) => x.text).join(' ')}`);
    if (state.event?.type && state.event.type !== 'none') lines.push(`EVENT IN PROGRESS: ${state.event.type}${state.event.note ? ` (${state.event.note})` : ''}.`);
    lines.push(formatRules({ user, present, settings, tinyNow: present.some((s) => tiny(state, s)) || tiny(state) }));
    return lines.join('\n');
}

function formatRules({ user, present, settings, tinyNow }) {
    const cruelty = num(settings.cruelty, 0, 10, 6);
    const smell = num(settings.smell, 0, 10, 7);
    const names = present.map((s) => s.name).join(', ');
    return [
        'FORMAT: write the scene like a visual novel. Narration in italics, short. Every spoken line on its own line as `Name [expression]: "words"` where expression is one of: ' + EXPRESSIONS.join(', ') + '. Only the people PRESENT speak' + (names ? ` (${names})` : '') + `; ${user} does not speak unless the player wrote it.`,
        `Then stop (${settings.length === 'long' ? '4-6' : '2-4'} short paragraphs at most) and end with a [CHOICES] block of 3 or 4 numbered options, each written as ${user}'s action in first person ("I offer to carry her bag"). Make one option a check by starting it with (Sniff check), (Lick check), (Rub check), (Kiss check), (Talk check)${tinyNow ? ', (Climb check), (Hide check), (Sneak check)' : ''} or (Chore check) when the action is one of those. One option may be "I leave."`,
        `SCALE: every woman is a giant of the size the sheet gives and ${user} is a normal-sized human; keep every size, distance and gesture true to that (what she can do with one toe, how far her voice carries, how long it takes ${user} to cross her sole). Never shrink or grow anyone.`,
        'In a group chat, a character who is not PRESENT does not appear or speak; whoever writes this turn writes as the narrator and voices only those present.',
        'Never decide the result of a check, never move the clock, never let the player leave town or change size unless the game state says so. When a girl puts her feet up and demands service, or starts a chore, write [EVENT service_row] or [EVENT chore] on its own line; [EVENT punishment] when she punishes; [EVENT none] when it ends.',
        `TONE: comedic, bratty, humiliating; cruelty ${cruelty}/10; foot smell described vividly (${smell}/10) and exactly as each sheet says. Girls are petty and specific, never gracious. ${settings.lethal ? 'Bad ends can kill a tiny.' : 'Bad ends keep the player as a possession; nobody dies.'}`,
    ].join('\n');
}

const LINE_RE = /^\s*\**\s*([A-Z][\w .'-]{0,40}?)\s*\[(\w+)\]\s*:\s*\**\s*(.+?)\s*\**\s*$/;
const CHOICE_RE = /^\s*(?:\(?(\d+)[.)]|[-*•])\s*(.+?)\s*$/;
const CHECK_RE = /^\(\s*(\w+)\s*check\s*\)\s*/i;

/**
 * Read a reply: dialogue lines, the last expression per speaker, the choices, event and quest tags.
 * @returns {{lines: {who: string, expr: string, text: string}[], narration: string[], choices: {n: number, text: string, check: string|null}[], event: string|null, quests: string[], expressions: object}}
 */
export function parseReply(text) {
    const src = String(text ?? '').replace(/<(think|thinking)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const lines = [], narration = [], choices = [], quests = [];
    const expressions = {};
    let event = null, inChoices = false;
    for (const raw of src.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const ev = /^\[EVENT\s+(\w+)\]$/i.exec(line);
        if (ev) { const e = ev[1].toLowerCase(); event = EVENT_TYPES.includes(e) ? e : 'none'; continue; }
        const q = /^\[QUEST\s+([\w-]+)\]$/i.exec(line);
        if (q) { quests.push(slug(q[1])); continue; }
        if (/^\[\/?CHOICES\]?$/i.test(line) || /^\[CHOICES\]/i.test(line)) { inChoices = !/^\[\/CHOICES\]/i.test(line); continue; }
        if (inChoices) {
            const m = CHOICE_RE.exec(line);
            if (m) {
                let t = m[2].replace(/\*+/g, '').trim();
                let kind = null;
                const ck = CHECK_RE.exec(t);
                if (ck) { kind = ck[1].toLowerCase(); t = t.slice(ck[0].length); if (!CHECKS[kind]) kind = null; }
                choices.push({ n: Number(m[1]) || choices.length + 1, text: t, check: kind });
            }
            continue;
        }
        const d = LINE_RE.exec(line);
        if (d) {
            const expr = EXPRESSIONS.includes(d[2].toLowerCase()) ? d[2].toLowerCase() : 'neutral';
            const who = d[1].trim();
            lines.push({ who, expr, text: d[3].replace(/^"|"$/g, '') });
            expressions[who] = expr;
        } else narration.push(line.replace(/^\*+|\*+$/g, ''));
    }
    return { lines, narration, choices, event, quests, expressions };
}

/** The reply without the game tags (for showing in the panel). */
export function stripTags(text) {
    return String(text ?? '').replace(/\[CHOICES\][\s\S]*$/i, '').replace(/^\[(EVENT|QUEST)[^\]]*\]\s*$/gim, '').trim();
}

/** The text sent as the player's message for a chosen option. */
export function choiceMessage(choice, { asterisks = false } = {}) {
    const t = String(choice.text ?? '').trim().replace(/\s+/g, ' ');
    const body = /[.!?]$/.test(t) ? t : `${t}.`;
    return asterisks ? `*${body}*` : body;
}

// ------------------------------------------------------------------ reconcile: what the story changed

const RECONCILE_SHAPE = `{
  "favor": { "resident_id": -2 },
  "irritation": { "resident_id": 1 },
  "met": ["resident_id"],
  "items_gained": ["item"], "items_lost": ["item"],
  "money": 0,
  "size_cm": null,
  "quests_given": ["quest_id"], "quests_done": ["quest_id"],
  "new_places": [{ "name": "The Pier", "type": "beach", "interior": "one line", "why": "who mentioned it" }],
  "feet": { "resident_id": "shoes | socks | bare" },
  "time_passed": 0,
  "flags": ["short_flag_name"]
}`;

/**
 * Messages that ask a (cheap) model what the last exchange changed.
 */
export function buildReconcileMessages({ world, state, reply, userText = '', user }) {
    const here = findLocation(world, state.at);
    const present = here ? whoIsAt(world, here.id, state.slot) : [];
    const known = world.residents.map((s) => `${s.id} = ${s.name}`).join(', ');
    const quests = world.quests.map((q) => `${q.id} = "${q.title}" (${state.quests[q.id]?.status ?? 'hidden'})`).join(', ');
    const places = world.locations.map((l) => l.name).join(', ');
    return [
        { role: 'system', content: 'You read one exchange of a text RPG and report, as JSON only, what changed in the game. Report only what the text plainly shows. Small numbers: favor and irritation move by -3..3. "time_passed" is 1 only if the scene plainly skipped to a later part of the day. "new_places" only for places in town that are named and not in the known list. No code fence, no commentary.' },
        { role: 'user', content: [
            `RESIDENTS: ${known}`,
            `PRESENT: ${present.map((s) => s.id).join(', ') || 'nobody'}`,
            `QUESTS: ${quests || 'none'}`,
            `KNOWN PLACES: ${places}`,
            `PLAYER (${user}) WROTE: ${str(userText, 1500) || '(nothing)'}`,
            `THE REPLY:\n${str(reply, 6000)}`,
            `Answer with this shape (omit keys with nothing to report):\n${RECONCILE_SHAPE}`,
        ].join('\n\n') },
    ];
}

/** Normalised reconcile deltas from a reply. */
export function parseReconcile(text, world) {
    const r = (typeof text === 'string' ? extractJson(text) : text) ?? {};
    const ids = new Set(world.residents.map((s) => s.id));
    const byId = (obj) => { const out = {}; for (const [k, v] of Object.entries(obj && typeof obj === 'object' ? obj : {})) { const id = slug(k); const n = Math.round(num(v, -3, 3, 0)); if (ids.has(id) && n) out[id] = n; } return out; };
    const qids = new Set(world.quests.map((q) => q.id));
    const feet = {};
    for (const [k, v] of Object.entries(r.feet && typeof r.feet === 'object' ? r.feet : {})) { const id = slug(k); const f = str(v, 10).toLowerCase(); if (ids.has(id) && ['shoes', 'socks', 'bare'].includes(f)) feet[id] = f; }
    return {
        favor: byId(r.favor), irritation: byId(r.irritation),
        met: list(r.met, 12).map(slug).filter((id) => ids.has(id)),
        items_gained: list(r.items_gained, 6), items_lost: list(r.items_lost, 6),
        money: Math.round(num(r.money, -500, 500, 0)),
        size_cm: r.size_cm === null || r.size_cm === undefined || r.size_cm === '' ? null : num(r.size_cm, 1, 400, null),
        quests_given: list(r.quests_given, 6).map(slug).filter((id) => qids.has(id)),
        quests_done: list(r.quests_done, 6).map(slug).filter((id) => qids.has(id)),
        new_places: (Array.isArray(r.new_places) ? r.new_places : []).slice(0, 3).map((p) => ({ name: str(p?.name, 40), type: str(p?.type, 20).toLowerCase(), interior: str(p?.interior, 300), why: str(p?.why, 100) })).filter((p) => p.name),
        feet,
        time_passed: num(r.time_passed, 0, 1, 0) >= 1 ? 1 : 0,
        flags: list(r.flags, 6).map(slug),
    };
}

/** The verb of a free-text player message, if it plainly is one ("I sniff her socks" -> sniff). */
export function verbOf(text) {
    const t = String(text ?? '').toLowerCase();
    for (const v of [...VERBS, 'climb', 'hide', 'sneak']) if (new RegExp(`\\b${v}(s|ed|ing)?\\b`).test(t)) return v;
    if (/\b(massage|knead)/.test(t)) return 'rub';
    if (/\b(smell|inhale|breathe in)/.test(t)) return 'sniff';
    if (/\b(clean|wash|sort|fold|scrub|paint)\b/.test(t)) return 'chore';
    return null;
}
