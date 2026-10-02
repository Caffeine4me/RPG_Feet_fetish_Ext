// Time. The sheet carries a day and a minute of the day; the model's TIME tags and the extension's own
// travel, waiting and sleeping move it. Passing time has a cost at three feet tall: hunger, cold and
// tiredness come on faster than a giant would guess.

export const SLOTS = [
    ['night', 0, 5], ['dawn', 5, 7], ['morning', 7, 11], ['midday', 11, 14], ['afternoon', 14, 18], ['evening', 18, 22], ['night', 22, 24],
];
export const slotOf = (min) => { const h = ((Number(min) || 0) % 1440) / 60; return (SLOTS.find(([, a, b]) => h >= a && h < b) ?? SLOTS[0])[0]; };
export const isDark = (min) => { const h = ((Number(min) || 0) % 1440) / 60; return h < 6 || h >= 20; };
export const hhmm = (min) => { const m = ((Number(min) || 0) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const clockText = (t) => `Day ${t.day}, ${hhmm(t.min)} (${slotOf(t.min)})`;
export const absMin = (t) => (Number(t?.day) || 1) * 1440 + (Number(t?.min) || 0);
export const createTime = (day = 1, min = 8 * 60) => ({ day, min });

/** Move a time forward by `minutes` (never back). Returns the number of midnights crossed. */
export function tick(t, minutes) {
    let m = (Number(t.min) || 0) + Math.max(0, Math.round(Number(minutes) || 0));
    let days = 0;
    while (m >= 1440) { m -= 1440; t.day += 1; days++; }
    t.min = m;
    return days;
}

const SLOT_MIN = { night: 23 * 60, dawn: 5 * 60 + 30, morning: 8 * 60, midday: 12 * 60, noon: 12 * 60, afternoon: 15 * 60, evening: 19 * 60, dusk: 19 * 60 + 30, midnight: 0, 'late evening': 21 * 60, 'late night': 2 * 60, 'early morning': 6 * 60 + 30 };

/**
 * Read a TIME tag. "+45 min", "+2 hours", "Day 2, evening", "Day 3 14:30", "evening" (same day or the
 * next if that slot has passed). Returns {set: {day, min}} or {add: minutes} or null.
 */
export function parseTime(text, now = createTime()) {
    const s = String(text ?? '').trim().toLowerCase();
    if (!s) return null;
    let m = /^\+\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)?\b/.exec(s);
    if (m) { const n = Number(m[1]); const u = m[2] ?? 'min'; return { add: Math.round(u.startsWith('h') ? n * 60 : u.startsWith('d') ? n * 1440 : n) }; }
    const out = { day: now.day, min: now.min };
    let any = false;
    m = /day\s*(\d+)/.exec(s);
    if (m) { out.day = Math.max(1, Number(m[1])); any = true; }
    m = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/.exec(s);
    if (m) { let h = Number(m[1]) % 24; if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0; out.min = h * 60 + Number(m[2]); any = true; }
    else {
        m = /\b(\d{1,2})\s*(am|pm)\b/.exec(s);
        if (m) { let h = Number(m[1]) % 12; if (m[2] === 'pm') h += 12; out.min = h * 60; any = true; }
        else {
            const slot = Object.keys(SLOT_MIN).sort((a, b) => b.length - a.length).find((k) => s.includes(k));
            if (slot) { out.min = SLOT_MIN[slot]; any = true; if (!/day\s*\d+/.test(s) && out.min <= now.min) out.day = now.day + 1; }
        }
    }
    if (/\b(next|following) (day|morning)\b|\btomorrow\b/.test(s) && !/day\s*\d+/.test(s)) { out.day = now.day + 1; any = true; }
    return any ? { set: out } : null;
}

export const WEATHERS = [
    { id: 'clear', weight: 40, line: 'clear' },
    { id: 'overcast', weight: 20, line: 'overcast and grey' },
    { id: 'wind', weight: 12, line: 'a hard wind: gusts that can take you off your feet' },
    { id: 'rain', weight: 18, line: 'rain: every drop a cupful, gutters running like rivers' },
    { id: 'cold', weight: 7, line: 'bitter cold: being wet or out at night is dangerous' },
    { id: 'heat', weight: 3, line: 'heat: the pavement burns and water is far apart' },
];
export function rollWeather(r = Math.random()) {
    const total = WEATHERS.reduce((a, w) => a + w.weight, 0);
    let x = Math.max(0, Math.min(0.999999, Number(r) || 0)) * total;
    for (const w of WEATHERS) { if (x < w.weight) return w.id; x -= w.weight; }
    return 'clear';
}
export const weatherLine = (id) => (WEATHERS.find((w) => w.id === id) ?? WEATHERS[0]).line;
