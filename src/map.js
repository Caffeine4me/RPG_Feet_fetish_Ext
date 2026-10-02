// The overworld: a pixel town drawn by code on a canvas, in the style of 2000s flash adventure maps.
// layoutTown is pure (buildings on a loose grid over a grass island, paths routed between doors);
// drawTown paints it at 1x on a canvas that the panel scales up with nearest-neighbour.

import { typeOf } from './world.js';

export const BASE_W = 480;
export const BASE_H = 300;

/** A small deterministic RNG (mulberry32). */
export function rng(seed) {
    let a = (Number(seed) || 1) >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Where everything goes. Buildings get a slot on a grid with jitter; paths join the doors with a minimum
 * spanning tree routed as L shapes; trees fill the gaps. Pure: same world + seed, same layout.
 * @returns {{w: number, h: number, buildings: {id: string, x: number, y: number, w: number, h: number, door: {x: number, y: number}}[], paths: {x1: number, y1: number, x2: number, y2: number}[], trees: {x: number, y: number, k: number}[], plaza: {x: number, y: number}|null, island: {cx: number, cy: number, rx: number, ry: number}}}
 */
export function layoutTown(world, { seed = 1, w = BASE_W, h = BASE_H } = {}) {
    const r = rng(seed);
    const locs = world.locations;
    const n = locs.length;
    const cols = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(n * 1.5))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const margin = { x: 28, y: 22 };
    const cellW = (w - margin.x * 2) / cols;
    const cellH = (h - margin.y * 2) / rows;
    // Spread the cells: the top-left slots first, with holes left for a plaza when there is room.
    const cells = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells.push({ row, col });
    const plazaCell = cells.length > n && cols >= 3 ? cells[Math.floor(cells.length / 2)] : null;
    const free = cells.filter((c) => c !== plazaCell);
    const buildings = locs.map((loc, i) => {
        const cell = free[i % free.length];
        const bw = Math.round(Math.min(cellW - 10, 52 + r() * 12));
        const bh = Math.round(Math.min(cellH - 16, 44 + r() * 10));
        const jx = (cellW - bw) * (0.15 + r() * 0.7);
        const jy = (cellH - bh - 10) * (0.1 + r() * 0.6);
        const x = Math.round(margin.x + cell.col * cellW + jx);
        const y = Math.round(margin.y + cell.row * cellH + jy);
        return { id: loc.id, type: loc.type, x, y, w: bw, h: bh, door: { x: x + Math.round(bw / 2), y: y + bh } };
    });
    // Paths: Prim's MST over door positions, each edge as an L (down first, then across, then down).
    const paths = [];
    if (buildings.length > 1) {
        const inTree = new Set([0]);
        while (inTree.size < buildings.length) {
            let best = null;
            for (const i of inTree) for (let j = 0; j < buildings.length; j++) {
                if (inTree.has(j)) continue;
                const a = buildings[i].door, b = buildings[j].door;
                const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
                if (!best || d < best.d) best = { i, j, d };
            }
            inTree.add(best.j);
            const a = buildings[best.i].door, b = buildings[best.j].door;
            const midY = Math.max(a.y, b.y) + 6;
            paths.push({ x1: a.x, y1: a.y, x2: a.x, y2: midY }, { x1: a.x, y1: midY, x2: b.x, y2: midY }, { x1: b.x, y1: midY, x2: b.x, y2: b.y });
        }
    }
    const plaza = plazaCell ? { x: Math.round(margin.x + plazaCell.col * cellW + cellW / 2), y: Math.round(margin.y + plazaCell.row * cellH + cellH / 2) } : null;
    if (plaza && buildings.length) {
        const near = buildings.reduce((p, b) => (Math.hypot(b.door.x - plaza.x, b.door.y - plaza.y) < Math.hypot(p.door.x - plaza.x, p.door.y - plaza.y) ? b : p));
        paths.push({ x1: near.door.x, y1: near.door.y + 6, x2: plaza.x, y2: near.door.y + 6 }, { x1: plaza.x, y1: near.door.y + 6, x2: plaza.x, y2: plaza.y });
    }
    const island = { cx: w / 2, cy: h / 2 + 4, rx: w / 2 - 6, ry: h / 2 - 4 };
    const trees = [];
    const clear = (x, y) => buildings.every((b) => x < b.x - 6 || x > b.x + b.w + 6 || y < b.y - 6 || y > b.y + b.h + 14) && (!plaza || Math.hypot(x - plaza.x, y - plaza.y) > 26);
    for (let i = 0; i < 70 && trees.length < 26; i++) {
        const x = Math.round(12 + r() * (w - 24)), y = Math.round(12 + r() * (h - 24));
        const dx = (x - island.cx) / island.rx, dy = (y - island.cy) / island.ry;
        if (dx * dx + dy * dy > 0.86) continue;
        if (!clear(x, y)) continue;
        trees.push({ x, y, k: Math.floor(r() * 3) });
    }
    return { w, h, buildings, paths, trees, plaza, island };
}

/** The building under a point (in base pixels), or null. */
export function hitTest(layout, x, y) {
    for (const b of layout.buildings) if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 12) return b.id;
    return null;
}

// ------------------------------------------------------------------ pixel font (3x5)

const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101011001', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101011', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111', 0: '010101101101010', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010', 9: '010101011001110',
    ' ': '000000000000000', "'": '010010000000000', '&': '010101010101011', '.': '000000000000010', '-': '000000111000000', '!': '010010010000010', '?': '110001010000010', '/': '001001010100100', ',': '000000000010100', ':': '000010000010000',
};

/** Draw text in the 3x5 pixel font. Returns the width drawn. */
export function pixelText(ctx, text, x, y, color = '#fff', scale = 1) {
    ctx.fillStyle = color;
    let cx = x;
    for (const ch of String(text).toUpperCase()) {
        const g = FONT[ch] ?? FONT['?'];
        for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
        cx += 4 * scale;
    }
    return cx - x - scale;
}
export const textWidth = (text, scale = 1) => String(text).length * 4 * scale - scale;

// ------------------------------------------------------------------ type icons (8x8)

const ICONS = {
    home: '00011000001111000111111011111111011001100110011001100110', // house (last row dropped below)
    sorority: '01100110111111111111111101111110001111000001100000000000',
    gym: '11000011110000111111111111111111110000111100001100000000',
    cinema: '11111111100110011111111110011001111111111001100111111111',
    laundromat: '01111110111111111100001111011011110110111100001101111110', // sock-ish blob
    spa: '00011000001111000011110001111110111111110111111000111100',
    cafe: '01111100011111100111111001111110011111000111110000111000',
    burger: '00111100011111101111111111111111011111101111111100111100',
    shoes: '00000000000011000001111000111110011111111111111111111110',
    library: '11111111100000011011110110111101101111011000000111111111',
    park: '00011000001111000111111011111111001111000001100000011000',
    bus: '01111110111111111001100110011001111111111111111101000010',
    lighthouse: '00111100011111100011110000111100001111000011110001111110',
    farm: '10101010010101011010101001010101101010100101010111111111',
    pool: '00000000011001101111111100000000011001101111111100000000',
    tennis: '00111100011111101111111111111111111111110111111000111100',
    boutique: '01100110111111111111111111111111011111100011110000011000',
    thrift: '00011000000110000111111001111110011111100111111000111100',
    bar: '11111111011111100011110000011000000110000001100001111110',
    school: '00011000001111000111111011111111111111110001100000011000',
    office: '11111111100000011011110110111101101111011011110111111111',
    beach: '00000000000110000011110000011000011111101111111100000000',
    generic: '00111100011111101111111111111111111111111111111101111110',
    dorm: '11111111100000011011110110000001101111011000000111111111',
    house: '00011000001111000111111011111111011001100110011001100110',
};

function icon(ctx, key, x, y, color) {
    const g = ICONS[key] ?? ICONS.generic;
    ctx.fillStyle = color;
    for (let i = 0; i < 64; i++) if (g[i] === '1') ctx.fillRect(x + (i % 8), y + Math.floor(i / 8), 1, 1);
}

// ------------------------------------------------------------------ drawing

const PAL = { water: '#2a3a52', waterDeep: '#1e2b3f', sand: '#8a7a55', grass: '#3f6a3a', grassDark: '#345a30', path: '#8a7a68', pathEdge: '#6e6052', shadow: 'rgba(0,0,0,0.35)', sign: '#1a1a1a', signText: '#f0f0f0', closed: '#d8d8d8', window: '#ffe08a', windowOff: '#2b2b3a', door: '#2b1d14', tree: '#2f5a2a', treeLight: '#4a8a3f', trunk: '#4a3524', night: 'rgba(10,14,40,0.45)', player: '#ffd23f', cursor: '#ffffff' };

/**
 * Paint the town. `canvas` is any 2D-capable canvas (the panel's, sized to layout.w x layout.h).
 * @param {object} o.open loc id -> 'open' | 'closed' | 'locked' (from world.js: isOpenNow / isUnlocked)
 * @param {object} [o.people] loc id -> [{ name, color }] markers to draw (residents known to be there)
 * @param {string} [o.hover] loc id under the mouse
 * @param {string} [o.at] where the player is
 * @param {number} [o.tick] animation frame counter
 */
export function drawTown(canvas, layout, world, { open = {}, people = {}, hover = null, at = null, slot = 'morning', tick = 0 } = {}) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const { w, h, island } = layout;
    ctx.fillStyle = PAL.waterDeep;
    ctx.fillRect(0, 0, w, h);
    // Water ripples.
    ctx.fillStyle = PAL.water;
    for (let y = 0; y < h; y += 6) for (let x = ((y / 6) % 2) * 3 + ((tick >> 3) % 6); x < w; x += 12) ctx.fillRect(x, y, 4, 1);
    // Island: sand rim then grass, as blocky ellipses.
    blob(ctx, island.cx, island.cy, island.rx, island.ry, PAL.sand);
    blob(ctx, island.cx, island.cy, island.rx - 4, island.ry - 4, PAL.grass);
    // Grass texture.
    ctx.fillStyle = PAL.grassDark;
    const g = rng(7);
    for (let i = 0; i < 260; i++) {
        const x = Math.round(g() * w), y = Math.round(g() * h);
        if (inBlob(island, x, y, -8)) ctx.fillRect(x, y, 2, 1);
    }
    // Paths.
    for (const p of layout.paths) {
        const x = Math.min(p.x1, p.x2) - 3, y = Math.min(p.y1, p.y2) - 3;
        const pw = Math.abs(p.x2 - p.x1) + 6, ph = Math.abs(p.y2 - p.y1) + 6;
        ctx.fillStyle = PAL.pathEdge; ctx.fillRect(x, y, pw, ph);
        ctx.fillStyle = PAL.path; ctx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
    }
    // Plaza with a fountain.
    if (layout.plaza) {
        const { x, y } = layout.plaza;
        blob(ctx, x, y, 22, 14, PAL.pathEdge);
        blob(ctx, x, y, 20, 12, PAL.path);
        blob(ctx, x, y, 9, 6, '#4a7aa0');
        blob(ctx, x, y, 7, 4, '#7fb3d8');
        ctx.fillStyle = '#c0c0c0'; ctx.fillRect(x - 1, y - 7, 3, 8);
        ctx.fillStyle = '#e8f6ff'; ctx.fillRect(x - 3 + ((tick >> 2) % 3), y - 9, 2, 2);
    }
    // Trees.
    for (const t of layout.trees) tree(ctx, t.x, t.y, t.k);
    // Buildings, back to front.
    const byY = [...layout.buildings].sort((a, b) => a.y - b.y);
    for (const b of byY) {
        const loc = world.locations.find((l) => l.id === b.id);
        if (!loc) continue;
        building(ctx, b, loc, open[b.id] ?? 'open', { hover: hover === b.id, tick, slot });
        const marks = people[b.id] ?? [];
        marks.slice(0, 4).forEach((m, i) => {
            ctx.fillStyle = m.color || '#ff7ab6';
            ctx.fillRect(b.x + 4 + i * 7, b.y - 6, 5, 5);
            ctx.fillStyle = '#000';
            ctx.fillRect(b.x + 5 + i * 7, b.y - 5, 1, 1); ctx.fillRect(b.x + 7 + i * 7, b.y - 5, 1, 1);
        });
    }
    // The player at the door of the current place.
    const here = layout.buildings.find((b) => b.id === at);
    if (here) person(ctx, here.door.x + 6, here.door.y + 2 - (tick % 20 < 10 ? 0 : 1), PAL.player);
    // The cursor arrow over the hovered place.
    const hb = layout.buildings.find((b) => b.id === hover);
    if (hb && hover !== at) arrow(ctx, hb.x + hb.w / 2, hb.y - 14 + (tick % 16 < 8 ? 0 : 2));
    // Night tint.
    if (slot === 'night') { ctx.fillStyle = PAL.night; ctx.fillRect(0, 0, w, h); }
    else if (slot === 'evening') { ctx.fillStyle = 'rgba(80,30,60,0.18)'; ctx.fillRect(0, 0, w, h); }
}

function inBlob(island, x, y, pad = 0) {
    const dx = (x - island.cx) / (island.rx + pad), dy = (y - island.cy) / (island.ry + pad);
    return dx * dx + dy * dy <= 1;
}

/** A blocky filled ellipse (rows of rects, so it stays pixelly). */
function blob(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    for (let y = -ry; y <= ry; y += 1) {
        const k = Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
        const half = Math.round(rx * k);
        ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
    }
}

function tree(ctx, x, y, k) {
    ctx.fillStyle = PAL.shadow; ctx.fillRect(x - 3, y + 3, 8, 2);
    ctx.fillStyle = PAL.trunk; ctx.fillRect(x, y + 1, 2, 3);
    ctx.fillStyle = PAL.tree;
    if (k === 0) { ctx.fillRect(x - 3, y - 4, 8, 5); ctx.fillRect(x - 2, y - 6, 6, 2); }
    else if (k === 1) { ctx.fillRect(x - 2, y - 6, 6, 7); ctx.fillRect(x - 1, y - 8, 4, 2); }
    else { ctx.fillRect(x - 4, y - 3, 10, 4); ctx.fillRect(x - 2, y - 5, 6, 2); }
    ctx.fillStyle = PAL.treeLight; ctx.fillRect(x - 1, y - 5, 2, 1); ctx.fillRect(x + 1, y - 3, 1, 1);
}

function person(ctx, x, y, color) {
    ctx.fillStyle = PAL.shadow; ctx.fillRect(x - 2, y + 1, 6, 1);
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 8, 3, 3); // head
    ctx.fillRect(x - 1, y - 5, 5, 4); // body
    ctx.fillRect(x, y - 1, 1, 2); ctx.fillRect(x + 2, y - 1, 1, 2); // legs
}

function arrow(ctx, cx, y) {
    ctx.fillStyle = '#000';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(cx) - i - 1, y + i - 1, i * 2 + 3, 1);
    ctx.fillRect(Math.round(cx) - 3, y - 7, 5, 7);
    ctx.fillStyle = PAL.cursor;
    for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(cx) - i, y + i, i * 2 + 1, 1);
    ctx.fillRect(Math.round(cx) - 2, y - 6, 3, 6);
}

function building(ctx, b, loc, status, { hover, tick, slot }) {
    const t = typeOf(loc);
    const { x, y, w, h } = b;
    const night = slot === 'night' || slot === 'evening';
    // Special shapes.
    if (loc.type === 'farm') return farm(ctx, b, loc, status, { hover, tick });
    if (loc.type === 'lighthouse') return lighthouse(ctx, b, loc, status, { hover, tick });
    if (loc.type === 'park') return park(ctx, b, loc, status, { hover, tick });
    // Shadow and walls.
    ctx.fillStyle = PAL.shadow; ctx.fillRect(x + 3, y + 4, w, h);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = t.wall; ctx.fillRect(x, y, w, h);
    // Roof band.
    ctx.fillStyle = t.roof; ctx.fillRect(x, y, w, 9);
    ctx.fillStyle = t.trim; ctx.fillRect(x, y + 9, w, 1);
    // Icon in the roof band's middle.
    icon(ctx, loc.type, x + Math.round(w / 2) - 4, y + 1, t.trim);
    // Windows: a row above the sign and a row below.
    const lit = status === 'open' ? PAL.window : (night ? PAL.windowOff : '#8ab0d8');
    const cols = Math.max(2, Math.floor((w - 12) / 12));
    for (let i = 0; i < cols; i++) {
        const wx = x + 6 + i * Math.floor((w - 12) / cols) + 1;
        ctx.fillStyle = lit; ctx.fillRect(wx, y + 13, 5, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(wx + 2, y + 13, 1, 6);
    }
    // Door, bottom centre.
    ctx.fillStyle = PAL.door; ctx.fillRect(x + Math.round(w / 2) - 4, y + h - 10, 8, 10);
    ctx.fillStyle = t.trim; ctx.fillRect(x + Math.round(w / 2) + 1, y + h - 5, 1, 1);
    // Ground-floor windows beside the door.
    ctx.fillStyle = lit;
    ctx.fillRect(x + 5, y + h - 9, 6, 5); ctx.fillRect(x + w - 11, y + h - 9, 6, 5);
    // The sign plaque: the name, or CLOSED.
    sign(ctx, b, loc, status, hover);
}

function sign(ctx, b, loc, status, hover) {
    const { x, y, w } = b;
    const label = status === 'locked' ? 'CLOSED' : shortName(loc.name, Math.floor((w - 8) / 4));
    const tw = textWidth(label);
    const sx = x + Math.round((w - tw) / 2) - 3, sy = y + 22;
    ctx.fillStyle = hover ? '#3a3a3a' : PAL.sign;
    ctx.fillRect(sx, sy, tw + 6, 9);
    ctx.fillStyle = hover ? '#ffd23f' : (status === 'locked' ? '#777' : '#444');
    ctx.fillRect(sx, sy, tw + 6, 1); ctx.fillRect(sx, sy + 8, tw + 6, 1);
    pixelText(ctx, label, sx + 3, sy + 2, status === 'locked' ? PAL.closed : (status === 'closed' ? '#9a9a9a' : PAL.signText));
    if (status === 'closed') { // open later today / tomorrow: a small moon
        ctx.fillStyle = '#cfd8ff'; ctx.fillRect(sx + tw + 8, sy + 1, 3, 3); ctx.fillStyle = PAL.sign; ctx.fillRect(sx + tw + 9, sy + 1, 2, 2);
    }
}

export function shortName(name, max = 12) {
    const n = String(name).toUpperCase().replace(/[^A-Z0-9 '&.\-!?/,:]/g, '');
    if (n.length <= max) return n;
    const words = n.split(' ');
    let out = '';
    for (const wd of words) { if ((out + ' ' + wd).trim().length > max) break; out = (out + ' ' + wd).trim(); }
    return (out || n.slice(0, max)).slice(0, max);
}

function farm(ctx, b, loc, status, { hover, tick }) {
    const { x, y, w, h } = b;
    ctx.fillStyle = '#4e3a28'; ctx.fillRect(x, y + 6, w, h - 6);
    for (let r = 0; r < Math.floor((h - 10) / 8); r++) {
        ctx.fillStyle = '#6a4e36'; ctx.fillRect(x + 3, y + 10 + r * 8, w - 6, 3);
        ctx.fillStyle = '#5fbf4a';
        for (let c = 0; c < Math.floor((w - 6) / 7); c++) ctx.fillRect(x + 5 + c * 7 + (((tick >> 4) + c + r) % 2), y + 8 + r * 8, 2, 3);
    }
    sign(ctx, { ...b, y: y + h - 32 }, loc, status, hover);
}

function lighthouse(ctx, b, loc, status, { hover, tick }) {
    const { x, y, w, h } = b;
    const cx = x + Math.round(w / 2);
    ctx.fillStyle = PAL.shadow; ctx.fillRect(cx - 5, y + 4, 14, h);
    for (let i = 0; i < h - 8; i++) { ctx.fillStyle = Math.floor(i / 6) % 2 ? '#f0f0f0' : '#b04a3f'; ctx.fillRect(cx - 6 + Math.floor(i / 10), y + 8 + i, 12 - Math.floor(i / 10) * 2, 1); }
    ctx.fillStyle = '#222'; ctx.fillRect(cx - 7, y + 2, 14, 6);
    ctx.fillStyle = (tick >> 4) % 2 ? '#fff6a0' : '#ffd23f'; ctx.fillRect(cx - 5, y + 3, 10, 4);
    sign(ctx, { ...b, y: y + h - 30 }, loc, status, hover);
}

function park(ctx, b, loc, status, { hover, tick }) {
    const { x, y, w, h } = b;
    ctx.fillStyle = PAL.grassDark; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PAL.path; ctx.fillRect(x + 4, y + Math.round(h / 2), w - 8, 4);
    tree(ctx, x + 8, y + 10, 0); tree(ctx, x + w - 8, y + 12, 1); tree(ctx, x + Math.round(w / 2), y + h - 6, 2);
    ctx.fillStyle = '#8a6a3f'; ctx.fillRect(x + Math.round(w / 2) - 5, y + Math.round(h / 2) - 5, 10, 2); ctx.fillRect(x + Math.round(w / 2) - 5, y + Math.round(h / 2) - 3, 1, 3); ctx.fillRect(x + Math.round(w / 2) + 4, y + Math.round(h / 2) - 3, 1, 3);
    sign(ctx, { ...b, y: y + h - 32 }, loc, status, hover);
}
