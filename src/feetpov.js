// The feet point of view: her feet up on the table, soles toward you, filling the frame, drawn by code
// at 1x and scaled up. Socks, bare soles or shoes from the sheet; toes wiggle and stink wisps drift with
// `tick`, so it loops like the old flash games. Used on the scene stage during foot service and as the
// placeholder for the model-drawn event picture.

import { colorsFromSheet, shade } from './pixelsprite.js';

export const POV_W = 240;
export const POV_H = 150;

const PAL = { wallTop: '#4a2a36', wallBottom: '#2e1a22', table: '#8a5a32', tableEdge: '#5a3a1e', tableLight: '#a06c3c', wisp: 'rgba(150,230,90,0.45)', wisp2: 'rgba(220,240,120,0.35)', sweat: '#dff4ff', tiny: '#4aa3e0', tinyDark: '#2c6fa3', outline: '#1c1418' };

function rng(seed) {
    let a = (Number(seed) || 1) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The sock pattern from the sheet's socks text. */
export function sockPattern(socks) {
    const t = String(socks || '').toLowerCase();
    if (/stripe/.test(t)) return 'stripes';
    if (/polka|dots?\b|spotted/.test(t)) return 'dots';
    if (/hole|torn|ripped|worn through/.test(t)) return 'holes';
    if (/toe ?socks?/.test(t)) return 'toes';
    if (/nylon|tights|stockings|sheer|pantyhose/.test(t)) return 'nylon';
    return 'plain';
}

/**
 * Draw the view.
 * @param {CanvasRenderingContext2D} ctx a 1x canvas of POV_W x POV_H
 * @param {object} o
 * @param {object} o.sheet the character sheet
 * @param {'socks'|'bare'|'shoes'} [o.feet]
 * @param {number} [o.tick] animation counter
 * @param {boolean} [o.tiny] draw the tiny at the bottom edge
 * @param {number} [o.smell] 0..11 how thick the wisps are (the sheet's smelly dial by default)
 */
export function drawFeetPov(ctx, { sheet, feet = 'socks', tick = 0, tiny = true, smell = null } = {}) {
    const c = colorsFromSheet(sheet);
    const sweaty = (sheet.dials?.sweaty ?? 5) >= 7;
    const dirty = (sheet.dials?.dirty ?? 5);
    const stink = smell ?? (sheet.dials?.smelly ?? 6);
    const W = POV_W, H = POV_H;
    ctx.imageSmoothingEnabled = false;
    // Room: wall with a dark band, then the table top in perspective and its front edge.
    for (let y = 0; y < 70; y++) { ctx.fillStyle = y % 2 ? PAL.wallTop : shade(PAL.wallTop, 0.92); ctx.fillRect(0, y, W, 1); }
    ctx.fillStyle = PAL.wallBottom; ctx.fillRect(0, 62, W, 8);
    for (let y = 70; y < H; y++) { const k = (y - 70) / (H - 70); const inset = Math.round(30 * (1 - k)); ctx.fillStyle = k > 0.9 ? PAL.tableEdge : (y % 4 === 0 ? PAL.tableLight : PAL.table); ctx.fillRect(inset, y, W - inset * 2, 1); }
    ctx.fillStyle = PAL.tableEdge; ctx.fillRect(0, H - 8, W, 8); ctx.fillStyle = shade(PAL.tableEdge, 0.7); ctx.fillRect(0, H - 8, W, 1);
    // Legs going away behind the feet (calves narrowing toward the body).
    const legCol = c.skirt ? c.skin : c.bottom;
    // Her seat and body far behind, a dark silhouette at the vanishing point.
    ctx.fillStyle = shade(c.top, 0.45); ctx.fillRect(104, 14, 32, 30); ctx.fillStyle = shade(c.skin, 0.5); ctx.fillRect(112, 4, 16, 12); ctx.fillStyle = shade(c.hair, 0.5); ctx.fillRect(110, 2, 20, 6);
    // The legs run from the feet back toward her, converging and narrowing with distance.
    for (let y = 18; y < 90; y++) {
        const k = (y - 18) / 72; // 0 far, 1 near
        const w = Math.round(6 + 12 * k);
        const lx = Math.round(108 - 33 * k), rx = Math.round(132 + 33 * k);
        ctx.fillStyle = shade(legCol, 0.6 + 0.4 * k);
        ctx.fillRect(lx - Math.round(w / 2), y, w, 1); ctx.fillRect(rx - Math.round(w / 2), y, w, 1);
        if (y % 9 === 0) { ctx.fillStyle = shade(legCol, 0.5 + 0.3 * k); ctx.fillRect(lx - Math.round(w / 2), y, w, 1); ctx.fillRect(rx - Math.round(w / 2), y, w, 1); }
    }
    // Ankles (socks or skin) just behind the heels.
    ctx.fillStyle = feet === 'socks' ? c.socks : c.skin; ctx.fillRect(64, 118, 22, 18); ctx.fillRect(154, 122, 22, 18);
    // The two feet, soles toward us, toes up. Left foot at x≈75, right at x≈165; a slight tilt between them.
    const wig = Math.round(Math.sin(tick / 6) * 1.5); // toe wiggle
    foot(ctx, 75, 60, { c, feet, sweaty, dirty, wig, mirror: false, pattern: sockPattern(sheet.socks), tick });
    foot(ctx, 165, 64, { c, feet, sweaty, dirty, wig: -wig, mirror: true, pattern: sockPattern(sheet.socks), tick });
    // Stink wisps.
    if (feet !== 'shoes' && stink > 0) wisps(ctx, [75, 165], 50, tick, stink);
    // The tiny at the bottom edge, looking up.
    if (tiny) tinyPerson(ctx, 120, H - 10, tick);
}

function foot(ctx, cx, top, { c, feet, sweaty, dirty, wig, mirror, pattern, tick }) {
    const base = feet === 'bare' ? c.skin : feet === 'socks' ? c.socks : c.shoes;
    const dark = shade(base, 0.78), light = shade(base, 1.12);
    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    // The sole: rows with widths following a foot's outline (toes wide, arch narrower, heel round).
    const rows = [];
    for (let y = 0; y < 76; y++) {
        const k = y / 76;
        let w = k < 0.08 ? 30 + y * 2.5 : k < 0.3 ? 48 : k < 0.6 ? 48 - (k - 0.3) * 40 : k < 0.85 ? 36 + (k - 0.6) * 20 : 42 - (k - 0.85) * 160;
        rows.push(Math.max(6, Math.round(w)));
    }
    // Outline then fill.
    rows.forEach((w, i) => px(cx - Math.round(w / 2) - 1, top + i, w + 2, 1, PAL.outline));
    px(cx - 16, top - 1, 32, 1, PAL.outline);
    rows.forEach((w, i) => px(cx - Math.round(w / 2), top + i, w, 1, base));
    if (feet === 'shoes') {
        // Tread.
        for (let y = 6; y < 72; y += 6) { const w = rows[y] - 8; px(cx - Math.round(w / 2), top + y, w, 2, dark); }
        px(cx - 10, top + 20, 20, 10, light);
    } else {
        // Ball and heel pads, darker; grime by dirt.
        const pad = feet === 'bare' ? shade(base, 0.86) : dark;
        px(cx - 18, top + 8, 36, 14, pad);
        px(cx - 14, top + 56, 28, 14, pad);
        px(cx - 6, top + 30, 12, 20, feet === 'bare' ? shade(base, 0.93) : shade(base, 0.9)); // arch
        if (dirty >= 4) { const r = rng(cx * 7 + 3); const n = dirty * 4; for (let i = 0; i < n; i++) { const y = 4 + Math.floor(r() * 68); const w = rows[Math.min(75, y)] - 6; px(cx - Math.round(w / 2) + Math.floor(r() * Math.max(1, w)), top + y, 1 + Math.floor(r() * 2), 1, shade(base, dirty >= 8 ? 0.45 : 0.6)); } }
        if (feet === 'socks') {
            if (pattern === 'stripes') for (let y = 2; y < 74; y += 8) { const w = rows[y]; px(cx - Math.round(w / 2), top + y, w, 3, shade(base, 0.6)); }
            if (pattern === 'dots') { const r = rng(cx); for (let i = 0; i < 18; i++) { const y = 3 + Math.floor(r() * 70); const w = rows[Math.min(75, y)] - 6; px(cx - Math.round(w / 2) + Math.floor(r() * Math.max(1, w - 2)), top + y, 2, 2, shade(base, 0.6)); } }
            if (pattern === 'holes') { px(cx - 12 + (mirror ? 8 : 0), top + 10, 7, 5, c.skin); px(cx + 4 - (mirror ? 10 : 0), top + 58, 6, 6, c.skin); px(cx - 12 + (mirror ? 8 : 0), top + 10, 7, 1, PAL.outline); }
            if (pattern === 'nylon') for (let y = 0; y < 76; y += 2) { const w = rows[y]; px(cx - Math.round(w / 2), top + y, w, 1, shade(c.skin, 0.8)); }
            // Toe seam.
            px(cx - 16, top + 6, 32, 1, dark);
        }
    }
    // Toes: five bumps along the top, wiggling.
    if (feet !== 'shoes') {
        const toes = [[-17, 7, 7], [-8, 6, 6], [-1, 5, 5], [5, 5, 4], [10, 4, 3]];
        toes.forEach(([dx, w, h], i) => {
            const x = cx + (mirror ? -dx - w : dx);
            const y = top - h + 1 + (i % 2 ? wig : 0) + (i === 0 ? -1 : 0);
            px(x - 1, y - 1, w + 2, h + 2, PAL.outline);
            px(x, y, w, h, feet === 'bare' ? base : (pattern === 'toes' ? [c.socks, shade(c.socks, 0.7)][i % 2] : base));
            if (feet === 'bare') px(x + 1, y + 1, Math.max(1, w - 2), 1, light); // nail glint
        });
    }
    // Sweat droplets sliding down.
    if (sweaty && feet !== 'shoes') { const r = rng(cx * 13); for (let i = 0; i < 5; i++) { const x0 = cx - 14 + Math.floor(r() * 28); const y = top + 8 + ((Math.floor(r() * 60) + tick * 2) % 62); px(x0, y, 1, 2, PAL.sweat); } }
}

function wisps(ctx, xs, top, tick, stink) {
    const n = Math.max(1, Math.round(stink / 2));
    for (const cx of xs) for (let i = 0; i < n; i++) {
        const phase = i * 1.7 + cx;
        for (let y = 0; y < 48; y += 2) {
            const yy = top - y - ((tick * 1.2 + i * 9) % 20);
            if (yy < 0) continue;
            const x = cx - 20 + i * (40 / n) + Math.round(Math.sin((yy + phase) / 7 + tick / 9) * 4);
            const fade = 1 - y / 48;
            ctx.fillStyle = (i % 2 ? PAL.wisp : PAL.wisp2).replace(/[\d.]+\)$/, `${(0.5 * fade).toFixed(2)})`);
            ctx.fillRect(x, yy, 2, 2);
        }
    }
}

function tinyPerson(ctx, cx, baseY, tick) {
    const bob = tick % 24 < 12 ? 0 : 1;
    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    px(cx - 3, baseY - 15 + bob, 6, 16, PAL.outline);
    px(cx - 2, baseY - 14 + bob, 4, 4, PAL.tiny); // head, tilted up
    px(cx - 2, baseY - 10 + bob, 4, 5, PAL.tinyDark); // body
    px(cx - 2, baseY - 5 + bob, 1, 5, PAL.tiny); px(cx + 1, baseY - 5 + bob, 1, 5, PAL.tiny); // legs
    px(cx - 1, baseY - 13 + bob, 1, 1, '#fff'); px(cx + 1, baseY - 13 + bob, 1, 1, '#fff'); // eyes up
}

/** The prompt for the model-drawn version of this exact view. */
export function feetPovPrompt(sheet, { feet = 'socks', tiny = true, place = '' } = {}) {
    const what = feet === 'shoes' ? `the soles of her ${sheet.shoes}` : feet === 'socks' ? `her ${sheet.socks}, soles toward the viewer` : 'her bare soles toward the viewer, toes at the top';
    return [
        'Pixel art in the style of a 2000s browser flash game: chunky dark outlines, flat warm colours, no gradients, no text.',
        `Point of view from the far edge of a table: ${sheet.name} has her feet up on it, crossed at the ankles, ${what}, huge, filling most of the frame, her legs going away toward her seat in the background.`,
        feet !== 'shoes' ? `Green stink wisps rise off them${(sheet.dials?.sweaty ?? 5) >= 7 ? ', sweat droplets glisten' : ''}${(sheet.dials?.dirty ?? 5) >= 7 ? ', the soles grimy with dirt' : ''}.` : '',
        tiny ? 'A small blue-skinned tiny person stands at the bottom edge of the table, looking up at them.' : '',
        place ? `The room behind: ${place}.` : '',
    ].filter(Boolean).join(' ');
}
