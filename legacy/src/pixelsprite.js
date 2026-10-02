// Procedural pixel sprites: a chunky-outline figure drawn from a character sheet, with the six
// expressions. Used as the placeholder until an image model draws the real sheet, and in the demo.
// colorsFromSheet is pure; drawFigure takes any 2D canvas context.

import { EXPRESSIONS } from './sheet.js';

const COLORS = {
    blonde: '#e8c56a', blond: '#e8c56a', golden: '#e8c56a', yellow: '#e8d14a', platinum: '#f3e9c8', silver: '#cfd3d8', white: '#f2f2f2', grey: '#9a9a9a', gray: '#9a9a9a',
    red: '#c4382a', ginger: '#d9642a', auburn: '#8c3a1e', copper: '#b8602e', orange: '#e07a2a',
    brown: '#5a3a22', brunette: '#4a2e1a', chestnut: '#6b3f22', black: '#1a1a22', dark: '#2a2630', raven: '#1a1a22',
    pink: '#f08ac0', purple: '#8a4fc4', violet: '#8a4fc4', lavender: '#b9a0e0', blue: '#3a6ac4', navy: '#243a6e', teal: '#2f8a86', green: '#3f8a3f', olive: '#6b7a3a', mint: '#8fd6b4',
    cream: '#f1e4c4', beige: '#d9c3a0', tan: '#c9a06a', khaki: '#b8a37a', maroon: '#6e1f2a', burgundy: '#6e1f2a', crimson: '#b01e2e', scarlet: '#c82323', gold: '#d4a62a', peach: '#f5b58a', coral: '#f07a5a',
};
const SKIN = { pale: '#f6dcc8', fair: '#f4d7c3', porcelain: '#f8e3d6', light: '#f1c9a5', tanned: '#d8a97a', tan: '#d8a97a', olive: '#c9a06f', golden: '#d9a877', bronze: '#b07a4a', brown: '#8a5a3a', dark: '#6b4028', ebony: '#4e2e1e', black: '#4e2e1e' };

const CW = Object.keys(COLORS).join('|');
const GAP = (n) => `(?:(?!\\b(?:${CW})\\b)[^.,;]){0,${n}}`; // up to n chars with no other colour word in them
const colorWord = (text) => { const m = new RegExp(`\\b(${Object.keys(COLORS).join('|')})\\b`, 'i').exec(text || ''); return m ? COLORS[m[1].toLowerCase()] : null; };

/**
 * The figure's palette from the sheet's look, shoes and socks text.
 * @returns {{skin, hair, top, bottom, socks, shoes, long: boolean, skirt: boolean}}
 */
export function colorsFromSheet(sheet) {
    const look = String(sheet.look || '');
    const hairM = new RegExp(`\\b(${CW})\\b${GAP(30)}\\bhair\\b|\\bhair\\b[^.,;]{0,20}?\\b(${CW})\\b`, 'i').exec(look);
    const hair = COLORS[(hairM?.[1] || hairM?.[2] || '').toLowerCase()] || colorWord(look) || '#5a3a22';
    const skinM = new RegExp(`\\b(${Object.keys(SKIN).join('|')})\\b[^.,;]{0,12}\\bskin\\b|\\bskin\\b[^.,;]{0,12}?\\b(${Object.keys(SKIN).join('|')})\\b|\\b(tanned|pale|olive|ebony)\\b`, 'i').exec(look);
    const skin = SKIN[(skinM?.[1] || skinM?.[2] || skinM?.[3] || '').toLowerCase()] || '#f1c9a5';
    const clothes = look.replace(/\bhair\b[^.,;]*/gi, '').replace(new RegExp(`\\b(${Object.keys(COLORS).join('|')})\\b[^.,;]{0,30}\\bhair\\b`, 'gi'), '');
    const topM = new RegExp(`\\b(${CW})\\b${GAP(20)}\\b(hoodie|shirt|top|tee|t-shirt|blouse|sweater|jacket|cardigan|dress|tank|crop|jersey|vest|uniform|coat)\\b`, 'i').exec(clothes);
    const botM = new RegExp(`\\b(${CW})\\b${GAP(20)}\\b(skirt|jeans|shorts|pants|trousers|leggings|tights|sweatpants)\\b`, 'i').exec(clothes);
    const top = COLORS[(topM?.[1] || '').toLowerCase()] || '#c23a5a';
    const bottom = COLORS[(botM?.[1] || '').toLowerCase()] || (/dress/i.test(clothes) ? top : '#2d3a6e');
    const socks = colorWord(sheet.socks) || '#f2f2f2';
    const shoes = colorWord(sheet.shoes) || (/boot/i.test(sheet.shoes || '') ? '#2a2020' : '#f0f0f0');
    return { skin, hair, top, bottom, socks, shoes, long: /\b(long|waist|ponytail|braid|flowing)\b/i.test(look) || !/\b(short|bob|pixie|cropped|buzz)\b/i.test(look), skirt: /\b(skirt|dress)\b/i.test(clothes) };
}

export const FIG_W = 24;
export const FIG_H = 48;
const OUTLINE = '#1c1418';

/**
 * Draw the figure at (ox, oy) on a 1x pixel grid (call on a small canvas and scale with
 * imageSmoothingEnabled = false). Expressions change the face and the arms.
 */
export function drawFigure(ctx, ox, oy, c, expr = 'neutral') {
    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(ox + x, oy + y, w, h); };
    const dark = (hex, k = 0.72) => shade(hex, k);
    // Hair behind the head.
    if (c.long) px(6, 4, 12, 20, c.hair);
    // Legs and feet first (behind the skirt).
    px(8, 30, 4, 12, c.skirt ? c.skin : c.bottom); px(13, 30, 4, 12, c.skirt ? c.skin : c.bottom);
    px(8, 40, 4, 4, c.socks); px(13, 40, 4, 4, c.socks);
    px(7, 44, 5, 3, c.shoes); px(13, 44, 5, 3, c.shoes);
    px(7, 46, 5, 1, dark(c.shoes)); px(13, 46, 5, 1, dark(c.shoes));
    // Torso.
    px(7, 16, 11, 14, c.top);
    px(7, 16, 11, 1, dark(c.top, 0.85));
    if (c.skirt) { px(6, 28, 13, 7, c.bottom); px(6, 34, 13, 1, dark(c.bottom)); }
    else px(7, 29, 11, 2, dark(c.bottom, 0.8));
    // Arms by expression.
    const arm = (x, y, w, h) => { px(x, y, w, h, c.top); };
    const hand = (x, y) => px(x, y, 2, 2, c.skin);
    switch (expr) {
        case 'smug': arm(5, 17, 2, 6); arm(18, 17, 2, 6); px(6, 22, 13, 3, c.top); hand(8, 23); hand(15, 23); break; // crossed
        case 'annoyed': arm(4, 17, 2, 8); arm(19, 17, 2, 8); px(4, 24, 3, 2, c.top); px(18, 24, 3, 2, c.top); hand(6, 25); hand(17, 25); break; // hands on hips
        case 'bored': arm(5, 17, 2, 10); hand(5, 27); arm(18, 17, 2, 6); px(17, 22, 3, 2, c.top); hand(16, 23); break; // one hand on hip
        case 'laughing': arm(5, 17, 2, 10); hand(5, 27); arm(18, 14, 2, 5); hand(17, 12); break; // hand to mouth
        case 'disgusted': arm(5, 17, 2, 10); hand(5, 27); px(18, 19, 5, 2, c.top); hand(22, 18); break; // arm out, pushing away
        default: arm(5, 17, 2, 10); hand(5, 27); arm(18, 17, 2, 10); hand(18, 27);
    }
    // Neck and head.
    px(11, 14, 3, 2, c.skin);
    px(8, 4, 9, 10, c.skin);
    // Bangs.
    px(7, 3, 11, 3, c.hair); px(7, 6, 2, 3, c.hair); px(16, 6, 2, 3, c.hair);
    if (!c.long) px(6, 4, 2, 6, c.hair), px(17, 4, 2, 6, c.hair);
    // Face.
    face(px, c, expr);
    outline(ctx, ox, oy, FIG_W, FIG_H);
}

function face(px, c, expr) {
    const eye = (x, open = true, lid = false) => {
        if (!open) { px(x, 9, 2, 1, OUTLINE); return; }
        px(x, 8, 2, 2, '#fff'); px(x + 1, 9, 1, 1, OUTLINE);
        if (lid) px(x, 8, 2, 1, c.skin);
    };
    switch (expr) {
        case 'smug': eye(9, true, true); eye(13, true, true); px(9, 7, 2, 1, OUTLINE); px(13, 6, 2, 1, OUTLINE); px(12, 12, 3, 1, OUTLINE); px(14, 11, 1, 1, OUTLINE); break;
        case 'annoyed': eye(9); eye(13); px(9, 7, 2, 1, OUTLINE); px(13, 7, 2, 1, OUTLINE); px(10, 6, 1, 1, OUTLINE); px(13, 6, 1, 1, OUTLINE); px(10, 12, 4, 1, OUTLINE); px(10, 11, 1, 1, OUTLINE); px(13, 11, 1, 1, OUTLINE); break;
        case 'laughing': px(9, 8, 2, 1, OUTLINE); px(13, 8, 2, 1, OUTLINE); px(10, 11, 4, 2, '#7a1a2a'); px(10, 11, 4, 1, '#fff'); break;
        case 'bored': eye(9, true, true); eye(13, true, true); px(10, 12, 4, 1, OUTLINE); break;
        case 'disgusted': eye(9); px(13, 8, 2, 1, OUTLINE); px(10, 11, 1, 1, OUTLINE); px(11, 12, 2, 1, OUTLINE); px(13, 11, 1, 1, OUTLINE); px(11, 10, 2, 1, shade(c.skin, 0.85)); px(12, 13, 1, 1, '#d9607a'); break;
        default: eye(9); eye(13); px(10, 12, 4, 1, OUTLINE);
    }
}

/** A 1px dark outline around everything opaque in the box (reads the canvas back). */
function outline(ctx, ox, oy, w, h) {
    const img = ctx.getImageData(ox - 1, oy - 1, w + 2, h + 2);
    const d = img.data, W = w + 2, H = h + 2;
    const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
    const out = new Uint8ClampedArray(d);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (opaque(x, y)) continue;
        if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) { const i = (y * W + x) * 4; out[i] = 0x1c; out[i + 1] = 0x14; out[i + 2] = 0x18; out[i + 3] = 255; }
    }
    img.data.set(out);
    ctx.putImageData(img, ox - 1, oy - 1);
}

export function shade(hex, k) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
    return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/**
 * A PNG data URL of one expression at `scale`, transparent background. Browser only.
 */
export function spriteDataUrl(sheet, expr = 'neutral', scale = 4) {
    const c = colorsFromSheet(sheet);
    const small = document.createElement('canvas');
    small.width = FIG_W + 2; small.height = FIG_H + 2;
    drawFigure(small.getContext('2d'), 1, 1, c, EXPRESSIONS.includes(expr) ? expr : 'neutral');
    const big = document.createElement('canvas');
    big.width = small.width * scale; big.height = small.height * scale;
    const g = big.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, big.width, big.height);
    return big.toDataURL('image/png');
}
