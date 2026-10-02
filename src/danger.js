// Danger. What can hurt a three-foot man where he stands, right now: the place, the crowd at this hour,
// the weather, the dark, and the state he is in. The engine turns that into a difficulty, rolls the
// hazards of a journey or a night out, applies the cost, and writes the outcome for the model to tell.

import { clockText as clockTextOf, isDark, slotOf } from './clock.js';
import { changeMeter, effectiveAttrs, passTime, setCondition, sleep } from './sheet.js';
import { KINDS, here } from './nav.js';

const HAZARDS = {
    street: ['a boot coming down', 'a cart wheel', 'a dog off its lead', 'a stray cat', 'a gutter running fast', 'a dropped crate', 'a swinging door', 'a broom', 'a kicked stone', 'rats under the boards'],
    square: ['the crowd', 'a market cart', 'a dog', 'pigeons the size of ponies', 'a dropped basket', 'a child who wants to pick you up', 'a sweeper'],
    road: ['a wagon', 'a horse', 'a bicycle', 'a wheel rut full of water', 'the drop off the kerb', 'a runner'],
    indoor: ['a chair pushed back', 'a mop', 'the house cat', 'a closing door', 'a foot under the table', 'something dropped from the counter', 'being seen'],
    shop: ['the shop cat', 'a shelf being restocked', 'a sweeping apron', 'a customer\'s heel', 'a sack set down', 'the shopkeeper\'s notice'],
    wild: ['a crow', 'a fox', 'a hawk', 'mud to the waist', 'a stream', 'brambles', 'an ant column', 'a wasp'],
    water: ['the current', 'cold water', 'a gull', 'a slick stone', 'a drop into the water'],
    hideout: ['a mouse', 'a draught', 'being found'],
};
const WEATHER_HAZARDS = { rain: ['a gutter in flood', 'a drop the size of a bucket', 'a slick stone', 'a puddle that is a pond'], wind: ['a gust off a corner', 'a flying sheet of paper', 'grit in the air'], cold: ['the cold itself', 'ice underfoot'], heat: ['a hot pavement', 'thirst'] };
const DARK_HAZARDS = ['something that hunts at night', 'a cat you could not see', 'a step you could not see', 'a lantern bearer'];

export const pick = (list, r) => list[Math.floor(Math.max(0, Math.min(0.999999, r())) * list.length)] ?? list[0];

/** Crowd at this hour: squares and streets empty at night, shops close, homes fill in the evening. */
export function crowdNow(place, min) {
    const slot = slotOf(min);
    let c = place.crowd;
    if (['street', 'square', 'shop', 'road'].includes(place.kind)) { if (slot === 'night') c = 0; else if (slot === 'dawn' || slot === 'evening') c = Math.max(0, c - 1); }
    if (place.kind === 'indoor' && (slot === 'evening' || slot === 'night')) c = Math.min(3, c + 1);
    return c;
}

/**
 * The difficulty of being here now and why. Returns {dc, factors: [[text, +n]...], level: word}.
 */
export function riskOf(place, { sheet, time, weather }) {
    const f = [];
    const kind = KINDS[place?.kind] ? place.kind : 'street';
    const base = place ? place.danger : 3;
    f.push([`${KINDS[kind].label}, danger ${base}`, 6 + base * 2]);
    const crowd = place ? crowdNow(place, time.min) : 1;
    if (crowd) f.push([`crowd ${crowd}`, crowd * 2]);
    if (place?.cover) f.push([`cover ${place.cover}`, -place.cover * 2]);
    const outside = !['indoor', 'shop', 'hideout'].includes(kind);
    if (outside && isDark(time.min)) f.push(['dark', 3]);
    if (outside && weather === 'rain') f.push(['rain', 3]);
    if (outside && weather === 'wind') f.push(['wind', 2]);
    if (outside && weather === 'cold') f.push(['cold', 2]);
    if (outside && weather === 'heat') f.push(['heat', 1]);
    if (sheet.conditions.includes('soaked')) f.push(['soaked', 1]);
    if (sheet.conditions.includes('exhausted')) f.push(['exhausted', 3]);
    else if (sheet.conditions.includes('tired')) f.push(['tired', 1]);
    if (sheet.conditions.includes('starving')) f.push(['starving', 2]);
    if (sheet.conditions.includes('carried')) f.push(['carried: at her mercy, not your own', 2]);
    if (sheet.conditions.includes('hidden')) f.push(['hidden', -3]);
    if (sheet.meters.nerve.cur <= 3) f.push(['shaking', 2]);
    const dc = Math.max(2, f.reduce((a, [, n]) => a + n, 0));
    const level = dc >= 20 ? 'deadly' : dc >= 16 ? 'very dangerous' : dc >= 12 ? 'dangerous' : dc >= 8 ? 'risky' : 'fairly safe';
    return { dc, factors: f, level };
}

/** One concrete hazard for this place now. */
export function hazardFor(place, route, { time, weather }, r) {
    const pool = [...(route?.hazards ?? []), ...(route?.hazards?.length ? [] : HAZARDS[place?.kind] ?? HAZARDS.street)];
    const outside = !['indoor', 'shop', 'hideout'].includes(place?.kind);
    if (outside && WEATHER_HAZARDS[weather]) pool.push(...WEATHER_HAZARDS[weather]);
    if (outside && isDark(time.min)) pool.push(...DARK_HAZARDS);
    return pick(pool, r);
}

/**
 * Roll one leg of a journey or one stretch of exposure. Mutates the sheet. Returns
 * {tier, roll, total, dc, hazard, text, deltas}. r() gives random numbers; the agility total is used.
 */
export function resolveLeg(sheet, place, route, env, r) {
    const { dc } = riskOf(place, { sheet, ...env });
    const roll = 1 + Math.floor(r() * 20);
    const attrs = effectiveAttrs(sheet);
    const total = roll + attrs.agility + Math.floor(attrs.wits / 2);
    const hazard = hazardFor(place, route, env, r);
    const d = { health: 0, stamina: 0, nerve: 0, cond: [] };
    let tier, text;
    if (roll === 1 || total < dc - 7) {
        tier = 'disaster';
        d.health = -(3 + Math.floor(r() * 3)); d.nerve = -2; d.stamina = -1;
        text = `${hazard} caught you squarely: you are hurt (${-d.health} health) and shaken; you may have been seen or picked up.`;
        if (r() < 0.5) d.cond.push('+bruised');
        if (r() < 0.35) d.cond.push('+noticed');
    } else if (total < dc - 3) {
        tier = 'hurt';
        d.health = -(1 + Math.floor(r() * 2)); d.nerve = -1;
        text = `${hazard} got you: ${-d.health} health and a scare.`;
        if (r() < 0.3) d.cond.push('+bruised');
    } else if (total < dc) {
        tier = 'close';
        d.stamina = -1; d.nerve = -1;
        text = `a close call with ${hazard}: unhurt, but it cost you breath and nerve.`;
    } else if (roll === 20 || total >= dc + 6) {
        tier = 'clean';
        text = `you read the ground well and passed ${hazard} unseen, even found a better way.`;
    } else {
        tier = 'ok';
        d.stamina = -1;
        text = `you got past ${hazard} with care; it took effort.`;
    }
    if (env.weather === 'rain' && !['indoor', 'shop', 'hideout'].includes(place?.kind)) d.cond.push('+soaked');
    for (const [k, v] of Object.entries({ health: d.health, stamina: d.stamina, nerve: d.nerve })) if (v) changeMeter(sheet, k, v);
    for (const c of d.cond) setCondition(sheet, c.slice(1), c[0] === '+');
    return { tier, roll, total, dc, hazard, text, deltas: d };
}

/** The lines about danger for the prompt. */
export function threatText(place, env) {
    const { dc, factors, level } = riskOf(place, env);
    return `This spot is ${level} for someone your size (difficulty ${dc}: ${factors.map(([t, n]) => `${t} ${n >= 0 ? '+' : ''}${n}`).join(', ')}).`;
}

/** Hard states the model must honour now. */
export function triggers(sheet, { lethal = true } = {}) {
    const out = [];
    const m = sheet.meters;
    if (m.health.cur <= 0) out.push({ severity: 'end', text: lethal ? 'his health is gone: this is the end of him unless a giant intervenes this very moment; write it with weight, and if he dies, say so plainly.' : 'his health is gone: he is out cold; he wakes later, somewhere a giant put him, worse off.' });
    else if (m.health.cur <= 3) out.push({ severity: 'warn', text: 'he is badly hurt: slow, bleeding or limping; another blow could finish him.' });
    if (m.stamina.cur <= 0) out.push({ severity: 'warn', text: 'he is spent: he cannot run, climb or hold on until he rests.' });
    if (m.nerve.cur <= 0) out.push({ severity: 'warn', text: 'his nerve is gone: he freezes, hides or panics; he cannot act calmly this turn.' });
    if (m.food.cur <= 0) out.push({ severity: 'warn', text: 'he is starving: weak, dizzy, losing health until he eats.' });
    if (m.warmth.cur <= 0) out.push({ severity: 'warn', text: 'he is dangerously cold: shivering, clumsy, losing health until he is warm and dry.' });
    return out;
}

const outsideOf = (place) => !['indoor', 'shop', 'hideout'].includes(place?.kind);
const worse = (a, b) => (!a ? b : !b ? a : (b.danger + (outsideOf(b) ? 1 : 0)) > (a.danger + (outsideOf(a) ? 1 : 0)) ? b : a);

/**
 * Walk a path of legs (from nav.findPath). Rolls each leg, lets the time pass, stops if he goes down.
 * Mutates game.sheet and game.nav.at. Returns {arrived, minutes, legs, text} where text is the
 * outcome for the model.
 */
export function journey(game, legs, r) {
    const { sheet, nav } = game;
    const out = { arrived: true, minutes: 0, legs: [], text: '' };
    const env = () => ({ time: sheet.time, weather: game.weather ?? 'clear' });
    for (const leg of legs) {
        const from = nav.places.find((p) => p.id === leg.from), to = nav.places.find((p) => p.id === leg.to);
        const ground = worse(from, to) ?? to;
        const res = resolveLeg(sheet, ground, leg.route, env(), r);
        const notes = passTime(sheet, leg.minutes, { weather: game.weather, outside: outsideOf(ground) });
        out.minutes += leg.minutes;
        out.legs.push({ from: from?.name, to: to?.name, minutes: leg.minutes, ...res, notes });
        if (sheet.meters.health.cur <= 0) {
            out.arrived = false;
            out.text = `On the way from ${from?.name} to ${to?.name} (${leg.minutes} min), ${res.text} He went down there and did not get up.`;
            nav.at = to?.id ?? nav.at;
            return out;
        }
        if (to) { to.visits += 1; nav.at = to.id; }
    }
    const last = legs[legs.length - 1];
    const dest = nav.places.find((p) => p.id === last?.to);
    const bits = out.legs.map((l) => `${l.from} to ${l.to} (${l.minutes} min): ${l.text}${l.notes.length ? ` (${l.notes.join('; ')})` : ''}`);
    out.text = `${sheet.name} travelled to ${dest?.name ?? 'his destination'}, ${out.minutes} minutes on foot at his size. ${bits.join(' Then ')} He arrives at ${clockTextOf(sheet.time)}.`;
    return out;
}

/** Wait here for `minutes`: time passes; out in the open that is one exposure roll per hour. */
export function waitHere(game, minutes, r) {
    const { sheet, nav } = game;
    const place = here(nav);
    const outside = outsideOf(place);
    const texts = [];
    const hours = Math.max(1, Math.round(minutes / 60));
    if (outside || (place && place.cover === 0)) for (let i = 0; i < hours; i++) { const res = resolveLeg(sheet, place, null, { time: sheet.time, weather: game.weather }, r); if (res.tier !== 'ok' && res.tier !== 'clean') texts.push(res.text); if (sheet.meters.health.cur <= 0) break; }
    const notes = passTime(sheet, minutes, { weather: game.weather, outside });
    return `${sheet.name} waited ${minutes} minutes at ${place?.name ?? 'the spot'}${texts.length ? `: ${texts.join(' Then ')}` : outside ? ': nothing found him.' : '.'}${notes.length ? ` (${notes.join('; ')})` : ''} It is now ${clockTextOf(sheet.time)}.`;
}

/** Sleep here until morning (07:00) or 8 hours. Poor cover means a roll for being found or frozen. */
export function sleepHere(game, r) {
    const { sheet, nav } = game;
    const place = here(nav);
    const outside = outsideOf(place);
    const toMorning = ((7 * 60 - sheet.time.min) + 1440) % 1440;
    const minutes = toMorning < 180 ? toMorning + 1440 : toMorning;
    const risky = outside || !place || place.cover < 2;
    let text = '';
    if (risky) { const res = resolveLeg(sheet, place, null, { time: sheet.time, weather: game.weather }, r); text = res.tier === 'ok' || res.tier === 'clean' ? 'The night passed without anyone finding him.' : `In the night ${res.text}`; }
    else text = `He slept well hidden at ${place.name}.`;
    const notes = sleep(sheet, minutes, { weather: game.weather, outside });
    return `${sheet.name} slept ${Math.round(minutes / 60)} hours. ${text}${notes.length ? ` (${notes.join('; ')})` : ''} He wakes at ${clockTextOf(sheet.time)}.`;
}
