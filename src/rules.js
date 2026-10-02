// The rules engine: the numbers behind every scene. Checks roll a d20 against a difficulty set by the
// resident's dials; outcomes are deltas on your meters and her relationship. Everything is seeded by the
// play state so a swipe or reload re-rolls the same way. The model is told outcomes; it never decides them.

import { num } from './json.js';
import { DIAL_MAX } from './sheet.js';
import { PLAYER_CM, scaleOf } from './size.js';

const LIMITS = {
    player: { stamina: [0, 10], composure: [0, 10], dirt: [0, 10], money: [0, 99999], reputation: [-10, 10], size_cm: [1, 400] },
    rel: { favor: [-10, 20], irritation: [0, 10], fear: [0, 10] },
};

function mulberry(seed) {
    let a = (Number(seed) || 1) >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A d20 for this turn of this game (the same roll for the same state). */
export function rollFor(state, salt = 0) {
    const r = mulberry((state.seed ?? 1) * 31 + (state.turn ?? 0) * 7919 + salt * 104729);
    return 1 + Math.floor(r() * 20);
}

/** The verbs the engine knows, with the dials that set their difficulty. */
export const CHECKS = {
    sniff: { label: 'Sniff', stamina: 0, diff: (d) => 7 + d.smelly * 0.5 },
    lick: { label: 'Lick', stamina: 1, diff: (d) => 8 + d.dirty * 0.4 + d.smelly * 0.3 },
    rub: { label: 'Rub', stamina: 2, diff: (d) => 7 + d.bossy * 0.4 },
    kiss: { label: 'Kiss', stamina: 0, diff: (d) => 9 + d.bratty * 0.5 - d.friendly * 0.3 },
    talk: { label: 'Talk', stamina: 0, diff: (d) => 7 + (DIAL_MAX - d.friendly) * 0.5 },
    climb: { label: 'Climb', stamina: 2, diff: (d) => 8 + d.sweaty * 0.4 + d.dirty * 0.3 },
    hide: { label: 'Hide', stamina: 1, diff: (d) => 7 + d.bossy * 0.3 + d.bratty * 0.2 },
    sneak: { label: 'Sneak', stamina: 1, diff: (d) => 6 + (DIAL_MAX - d.friendly) * 0.4 },
    chore: { label: 'Chore', stamina: 2, diff: (d) => 8 + d.bossy * 0.3 },
};

/** How many times taller she is than the player. */
export const ratioOf = (state, sheet) => scaleOf(sheet?.height_cm ?? PLAYER_CM, state.player?.size_cm ?? PLAYER_CM).ratio;
/** Small enough, next to her, that climbing, hiding and being crushed are on the table. */
export const tiny = (state, sheet = null) => (sheet ? ratioOf(state, sheet) >= 2 : (state.player?.size_cm ?? PLAYER_CM) < 100);

/** The odds (0..1) of passing a check, for showing on a choice button. */
export function odds(state, sheet, kind) {
    const c = CHECKS[kind];
    if (!c || !sheet) return null;
    const need = difficulty(state, sheet, kind);
    return Math.max(0.05, Math.min(0.95, (21 - need) / 20));
}

function difficulty(state, sheet, kind) {
    const c = CHECKS[kind];
    let need = c.diff(sheet.dials);
    const rel = state.rel?.[sheet.id] ?? { favor: 0, irritation: 0 };
    need -= Math.min(5, Math.max(-5, rel.favor * 0.5));
    need += rel.irritation * 0.4;
    if (sheet.wants?.verbs?.includes(kind)) need -= 3;
    if (sheet.wants?.hates?.includes(kind)) need += 4;
    // Scale: a bigger giant means more stench per breath and more sole to cover; climbing and hiding get harder too.
    const cls = sheet.size_class ?? 1;
    if (['sniff', 'lick'].includes(kind)) need += (cls - 1) * 0.6;
    if (['rub', 'kiss', 'chore'].includes(kind)) need += (cls - 1) * 0.3;
    if (['climb', 'sneak'].includes(kind)) need += (cls - 1) * 0.5;
    if (kind === 'hide') need -= (cls - 1) * 0.3; // easier to vanish next to something that big
    return Math.round(need);
}

/**
 * Resolve a check: a roll, a tier, and the deltas it causes. Nothing is applied here.
 * @returns {{kind, roll, need, tier: 'crit'|'success'|'fail'|'botch', deltas: {player: object, rel: object}, text: string}}
 */
export function check(state, sheet, kind, { salt = 0 } = {}) {
    const c = CHECKS[kind];
    if (!c) throw new Error(`unknown check ${kind}`);
    const roll = rollFor(state, salt);
    const need = difficulty(state, sheet, kind);
    const tier = roll === 20 || (roll >= 18 && roll >= need) ? 'crit' : roll === 1 || (roll <= 3 && roll < need) ? 'botch' : roll >= need ? 'success' : 'fail';
    const d = sheet.dials;
    const wanted = sheet.wants?.verbs?.includes(kind), hated = sheet.wants?.hates?.includes(kind);
    const player = { stamina: -c.stamina }, rel = {};
    const first = sheet.name.split(' ')[0];
    let text;
    const stench = Math.ceil(d.smelly / 3);
    switch (kind) {
        case 'sniff':
            if (tier === 'crit') { rel.favor = wanted ? 3 : 2; player.composure = -stench; text = `${first} notices and enjoys it; the smell hits like a wall and you hold steady.`; }
            else if (tier === 'success') { rel.favor = wanted ? 2 : 1; player.composure = -stench; text = `A long breath of her socks: ${first} lets you.`; }
            else if (tier === 'fail') { rel.irritation = hated ? 2 : 1; player.composure = -Math.ceil(d.smelly / 2); text = `You gag; ${first} is not impressed.`; }
            else { rel.irritation = 2; player.composure = -Math.ceil(d.smelly / 2) - 1; text = `You cough right into her sock. ${first} shoves her foot into your face to make a point.`; }
            break;
        case 'lick':
            if (tier === 'crit') { rel.favor = wanted ? 3 : 2; player.dirt = 1; text = `${first} actually moans; her soles taste exactly as grimy as they look.`; }
            else if (tier === 'success') { rel.favor = wanted ? 2 : 1; player.dirt = 1; text = `You clean a stripe of her sole. ${first} allows it.`; }
            else if (tier === 'fail') { rel.irritation = hated ? 3 : 1; player.composure = -2; text = `Lint and grit; you flinch. ${first} calls you useless.`; }
            else { rel.irritation = 3; player.composure = -3; player.dirt = 2; text = `You retch. ${first} grinds her foot into your mouth until you finish.`; }
            break;
        case 'rub':
            if (tier === 'crit') { rel.favor = wanted ? 3 : 2; rel.irritation = -1; text = `Perfect pressure. ${first} melts and forgets to be mean for a minute.`; }
            else if (tier === 'success') { rel.favor = wanted ? 2 : 1; text = `A decent rub. ${first} wiggles her toes: keep going.`; }
            else if (tier === 'fail') { rel.irritation = 1; text = `Too soft. ${first} tells you to do it properly.`; }
            else { rel.irritation = 2; player.stamina = -3; text = `You cramp up mid-rub. ${first} kicks you away.`; }
            break;
        case 'kiss':
            if (tier === 'crit') { rel.favor = 3; text = `${first} laughs, surprised, and lets you kiss each toe.`; }
            else if (tier === 'success') { rel.favor = wanted ? 2 : 1; text = `${first} rolls her eyes but offers the other foot too.`; }
            else if (tier === 'fail') { rel.irritation = 2; text = `${first} pulls her foot back: "Ew. Who said you could?"`; }
            else { rel.irritation = 3; rel.fear = 1; text = `She plants her sole on your face and holds it there. "Kiss that."`; }
            break;
        case 'talk':
            if (tier === 'crit') { rel.favor = 2; rel.irritation = -2; text = `${first} actually listens, and tells you something she wants done.`; }
            else if (tier === 'success') { rel.favor = 1; rel.irritation = -1; text = `${first} humours you.`; }
            else if (tier === 'fail') { rel.irritation = 1; text = `${first} yawns. Wrong topic.`; }
            else { rel.irritation = 2; text = `You say the one thing that sets her off: ${sheet.wants?.trigger || 'the wrong thing'}.`; }
            break;
        case 'climb':
            if (tier === 'crit' || tier === 'success') { text = `You find handholds in the ${tier === 'crit' ? 'weave of her sock' : 'fabric'} and get up.`; }
            else if (tier === 'fail') { player.stamina = -3; text = `Too slick with sweat; you slide back down.`; }
            else { player.stamina = -4; rel.fear = 1; text = `You fall, and the foot shifts. It nearly comes down on you.`; }
            break;
        case 'hide':
            if (tier === 'crit' || tier === 'success') { text = `You squeeze out of sight ${tier === 'crit' ? 'before she even looks' : 'just in time'}.`; }
            else if (tier === 'fail') { rel.fear = 2; text = `${first} spots you. "There you are."`; }
            else { rel.fear = 3; rel.irritation = 1; text = `She spots you and pins you under a toe.`; }
            break;
        case 'sneak':
            if (tier === 'crit' || tier === 'success') { text = `You get across unseen.`; }
            else if (tier === 'fail') { rel.fear = 1; text = `A foot comes down a hair's breadth away.`; }
            else { rel.fear = 3; player.stamina = -4; text = `She steps on you. Not fully; enough.`; }
            break;
        case 'chore':
            if (tier === 'crit') { rel.favor = 3; player.money = 10; text = `Done fast and well; ${first} even pays.`; }
            else if (tier === 'success') { rel.favor = 2; player.money = 5; text = `Done. ${first} nods.`; }
            else if (tier === 'fail') { rel.irritation = 1; text = `Half done. ${first} makes you start over.`; }
            else { rel.irritation = 2; player.stamina = -2; text = `You wreck it. ${first} adds a punishment to the list.`; }
            break;
        default: text = '';
    }
    return { kind, roll, need, tier, deltas: { player, rel }, text };
}

function clampInto(obj, key, limits, delta) {
    const [lo, hi] = limits[key] ?? [-1e9, 1e9];
    obj[key] = Math.min(hi, Math.max(lo, (Number(obj[key]) || 0) + (Number(delta) || 0)));
}

/** Apply { player: {...}, rel: {...} } deltas for resident `who` (may be null). */
export function applyDeltas(state, who, deltas) {
    for (const [k, v] of Object.entries(deltas?.player ?? {})) if (v) clampInto(state.player, k, LIMITS.player, v);
    if (who) {
        const r = state.rel[who] ??= { favor: 0, irritation: 0, fear: 0, met: false };
        for (const [k, v] of Object.entries(deltas?.rel ?? {})) if (v) clampInto(r, k, LIMITS.rel, v);
        r.met = true;
    }
}

/** Set an absolute value with the same limits (the reconcile step uses this). */
export function setValue(state, who, key, value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    if (who) { const r = state.rel[who] ??= { favor: 0, irritation: 0, fear: 0, met: false }; const [lo, hi] = LIMITS.rel[key] ?? [-1e9, 1e9]; if (LIMITS.rel[key]) r[key] = Math.min(hi, Math.max(lo, v)); }
    else { const [lo, hi] = LIMITS.player[key] ?? [-1e9, 1e9]; if (LIMITS.player[key]) state.player[key] = Math.min(hi, Math.max(lo, v)); }
}

/**
 * What the state demands right now: things the brief must tell the model to play out.
 * @returns {{id: string, who?: string, text: string, severity: 'note'|'punish'|'end'}[]}
 */
export function triggers(state, present = []) {
    const out = [];
    const p = state.player;
    if (p.composure <= 0) out.push({ id: 'passout', text: 'The smell has beaten you: you pass out at her feet. She decides what to do with you while you are out.', severity: 'punish' });
    if (p.stamina <= 0) out.push({ id: 'exhausted', text: 'You are exhausted and cannot do any more service this slot; she notices and is not pleased.', severity: 'note' });
    for (const s of present) {
        const r = state.rel[s.id] ?? {};
        if (r.irritation >= 9) out.push({ id: `punish:${s.id}`, who: s.id, text: `${s.name} has had enough of you: she punishes you now, in her own style, before anything else happens.`, severity: 'punish' });
        else if (r.irritation >= 6) out.push({ id: `warn:${s.id}`, who: s.id, text: `${s.name} is irritated (${r.irritation}/10) and threatens a punishment.`, severity: 'note' });
        if (tiny(state, s) && r.fear >= 8 && (s.dials.friendly <= 3 || s.archetype === 'Viper' || (s.size_class ?? 1) >= 4)) out.push({ id: `end:${s.id}`, who: s.id, text: `${s.name} has caught you and is done playing: this is a bad end unless the player finds a way out this turn.`, severity: 'end' });
    }
    return out;
}

/** Meters as one line for the prompt and the panel. */
export function playerLine(state, user = 'You') {
    const p = state.player;
    const size = p.size_cm < 100 ? `${Math.round(p.size_cm)} cm tall (tiny)` : `${Math.round(p.size_cm)} cm tall`;
    return `${user}: ${size}; stamina ${p.stamina}/10; composure (stench tolerance) ${p.composure}/10; dirt ${p.dirt}/10; $${p.money}${state.inventory.length ? `; carrying: ${state.inventory.join(', ')}` : ''}.`;
}

export function relationLine(state, sheet) {
    const r = state.rel?.[sheet.id] ?? { favor: 0, irritation: 0, fear: 0, met: false };
    const mood = r.irritation >= 8 ? 'furious' : r.irritation >= 5 ? 'irritated' : r.favor >= 8 ? 'fond of you' : r.favor >= 3 ? 'tolerates you' : r.favor < 0 ? 'despises you' : 'indifferent';
    return `${sheet.name}: ${r.met ? '' : 'never met you before. '}favor ${r.favor}, irritation ${r.irritation}/10${tiny(state, sheet) ? `, your fear of her ${r.fear}/10` : ''} (${mood}).`;
}

/** The size as a stage name. */
export function sizeStage(cm) {
    const v = num(cm, 1, 400, 175);
    if (v >= 100) return 'normal';
    if (v >= 30) return 'doll';
    if (v >= 8) return 'mouse';
    if (v >= 3) return 'bug';
    return 'speck';
}
