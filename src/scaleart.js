// A pixel drawing of you next to one giant, to scale. When she is too tall to fit, the drawing keeps
// you readable and lets her run off the top: that is the point.

import { ftIn, scaleOf } from './size.js';

export const ART_W = 240;
export const ART_H = 150;

/** A flat silhouette standing on floorY, `h` pixels tall, facing left. */
export function drawFigure(ctx, x, floorY, h, color, { female = true } = {}) {
    if (h < 3) { ctx.fillStyle = color; ctx.fillRect(Math.round(x - 1), floorY - Math.max(1, Math.round(h)), 2, Math.max(1, Math.round(h))); return; }
    const u = h / 48; // 48 units tall
    const r = (dx, dy, w, hh) => ctx.fillRect(Math.round(x + dx * u), Math.round(floorY - dy * u), Math.max(1, Math.round(w * u)), Math.max(1, Math.round(hh * u)));
    ctx.fillStyle = color;
    r(-3.5, 48, 7, 7); // head
    r(-1.5, 41, 3, 2); // neck
    if (female) { r(-4.5, 39, 9, 12); r(-5.5, 27, 11, 6); } // torso, hips
    else { r(-5.5, 39, 11, 14); r(-4.5, 25, 9, 4); }
    r(-7, 38, 2.5, 14); r(4.5, 38, 2.5, 14); // arms
    r(-4.5, 21, 3.5, 21); r(1, 21, 3.5, 21); // legs
    r(-7, 2, 6, 2); r(0.5, 2, 6, 2); // feet
}

/**
 * Draw the player and a giant on `canvas`. opts: {npc, playerCm, user}. Returns the pixel scale.
 */
export function drawScale(canvas, { npc, playerCm = 91, user = 'you' } = {}) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    // sky and floor
    ctx.fillStyle = '#1b1e2b'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a2f45'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 97 + 13) % W, (i * 53 + 7) % (H - 30), 1, 1);
    const floorY = H - 14;
    ctx.fillStyle = '#3a3326'; ctx.fillRect(0, floorY, W, H - floorY);
    ctx.fillStyle = '#58503a'; ctx.fillRect(0, floorY, W, 2);
    if (!npc) { label(ctx, 'no giant selected', 6, 12); drawFigure(ctx, W / 2, floorY, 40, '#e8c39e', { female: false }); return 1; }
    const s = scaleOf(npc.height_cm, playerCm);
    const fit = (H - 30) / npc.height_cm; // px per cm to fit her
    const scale = Math.max(fit, 9 / playerCm); // but keep you at least 9 px
    const herH = npc.height_cm * scale, youH = playerCm * scale;
    const herX = W * 0.62, youX = Math.min(W - 24, herX - (herH / 48) * 9 - Math.max(10, youH * 0.3) - 6);
    // her shadow and her figure (may run off the top)
    ctx.fillStyle = '#15171f'; ctx.fillRect(Math.round(herX - herH * 0.16), floorY, Math.round(herH * 0.32), 3);
    drawFigure(ctx, herX, floorY, herH, '#d9a98a');
    // the player
    drawFigure(ctx, youX, floorY, youH, '#e8c39e', { female: false });
    // labels
    label(ctx, `${npc.name} · ${ftIn(npc.height_cm)} · class ${npc.size_class}`, 6, 12);
    label(ctx, `${user} · ${ftIn(playerCm)} · ${s.ratio.toFixed(1)}× smaller`, 6, 24);
    if (herH > H - 30) label(ctx, `shown to her ${herH > H * 4 ? 'ankle' : herH > H * 2.3 ? 'knee' : herH > H * 1.5 ? 'hips' : 'shoulders'}; she keeps going`, 6, 36, '#9aa3c7');
    // a tick for her sole length next to you
    const sole = s.body[0].cm * scale;
    ctx.fillStyle = '#9aa3c7'; ctx.fillRect(Math.round(youX - 6), floorY + 6, Math.max(1, Math.round(sole)), 1);
    label(ctx, `her sole: ${ftIn(s.body[0].cm)}`, Math.round(youX - 6), floorY + 12, '#9aa3c7', 7);
    return scale;
}

function label(ctx, text, x, y, color = '#f2eee6', size = 8) {
    ctx.font = `${size}px monospace`;
    ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(13,15,22,.75)'; ctx.fillRect(x - 2, y - size + 1, w + 4, size + 3);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
}
