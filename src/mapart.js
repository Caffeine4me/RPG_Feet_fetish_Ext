// The map: known places as pixel markers on a dark ground, ways between them as dotted lines, the
// path you picked lit up. Danger shows in the marker colour.

import { KINDS } from './nav.js';
import { riskOf } from './danger.js';

export const MAP_W = 320;
export const MAP_H = 200;

const KIND_GLYPH = { indoor: '⌂', shop: '$', street: '≡', square: '□', road: '═', wild: '♣', water: '≈', hideout: '●' };
const dangerColor = (d) => ['#7cc27a', '#a9c76b', '#d9c25a', '#e2954b', '#d8603f', '#b8302f'][Math.max(0, Math.min(5, d))];

export function drawMap(canvas, nav, { at = null, dest = null, path = null, env = null } = {}) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#171a24'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f2331'; for (let x = 0; x < W; x += 16) ctx.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 16) ctx.fillRect(0, y, W, 1);
    const pos = (p) => ({ x: Math.round(p.x * W), y: Math.round(p.y * H) });
    const onPath = new Set((path ?? []).map((l) => l.route));
    for (const r of nav.routes) {
        const a = nav.places.find((p) => p.id === r.a), b = nav.places.find((p) => p.id === r.b);
        if (!a || !b) continue;
        dotted(ctx, pos(a), pos(b), onPath.has(r) ? '#f0d27a' : '#4a5068', onPath.has(r) ? 2 : 1);
    }
    const sorted = [...nav.places].sort((a, b) => a.x - b.x);
    for (const [i, p] of sorted.entries()) {
        const { x, y } = pos(p);
        // labels go under the marker, or above it when a close neighbour to the left already has one under
        const left = sorted[i - 1];
        const crowded = left && Math.abs(left.x - p.x) * W < 70 && Math.abs(left.y - p.y) * H < 24;
        p._above = crowded ? !left._above : false;
        const risk = env ? riskOf(p, env).dc : p.danger * 3;
        const col = dangerColor(Math.round(Math.min(5, risk / 4)));
        if (p.id === at) { ctx.fillStyle = '#f0d27a'; ctx.fillRect(x - 7, y - 7, 14, 14); }
        else if (p.id === dest) { ctx.fillStyle = '#9fd1ff'; ctx.fillRect(x - 7, y - 7, 14, 14); }
        ctx.fillStyle = '#0d0f16'; ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.fillStyle = col; ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.fillStyle = '#0d0f16'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(KIND_GLYPH[p.kind] ?? '·', x, y + 1);
        label(ctx, p.name, x, p._above ? y - 18 : y + 10, p.id === at ? '#f0d27a' : '#e6e2d8');
    }
    if (!nav.places.length) label(ctx, 'nothing mapped yet', W / 2, H / 2, '#9aa3c7');
}

function dotted(ctx, a, b, color, w) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.floor(d / 5));
    ctx.fillStyle = color;
    for (let i = 0; i <= n; i++) { if (i % 2) continue; const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n; ctx.fillRect(Math.round(x) - (w > 1 ? 1 : 0), Math.round(y) - (w > 1 ? 1 : 0), w, w); }
}

function label(ctx, text, x, y, color) {
    ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const t = text.length > 22 ? `${text.slice(0, 21)}…` : text;
    const w = ctx.measureText(t).width;
    ctx.fillStyle = 'rgba(13,15,22,.8)'; ctx.fillRect(Math.round(x - w / 2) - 2, y - 1, Math.round(w) + 4, 10);
    ctx.fillStyle = color; ctx.fillText(t, x, y);
}

/** The place under a click at (fx, fy) in 0..1 canvas fractions, or null. */
export function hitPlace(nav, fx, fy) {
    let best = null, bd = 0.06;
    for (const p of nav.places) { const d = Math.hypot((p.x - fx) * (MAP_W / MAP_H), p.y - fy); if (d < bd) { bd = d; best = p; } }
    return best;
}
