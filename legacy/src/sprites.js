// Sprite automation: the prompts that make a character's expression sheet, feet card and a place's
// background in the house style, and the pure helpers that cut a sheet into cells and key out its
// flat background. The browser side (canvases, uploads) lives in index.js.

import { EXPRESSIONS } from './sheet.js';
import { typeOf } from './world.js';

/** The house style, in front of every picture prompt. */
export const STYLE = 'Pixel art in the style of a 2000s browser flash game: chunky dark outlines, flat warm colours, no gradients, no anti-aliasing, big readable shapes, slightly cartoonish proportions.';

export const KEY_COLOR = { r: 255, g: 0, b: 255 }; // magenta: the flat background to key out
export const SHEET_COLS = 3;
export const SHEET_ROWS = 2;

/** A prompt for the 3x2 expression sheet of one character. */
export function spriteSheetPrompt(sheet, { reference = false } = {}) {
    const cells = EXPRESSIONS.map((e, i) => `${i + 1}. ${e}`).join(', ');
    return [
        STYLE,
        `A character sprite sheet for a visual novel: a grid of exactly ${SHEET_COLS} columns and ${SHEET_ROWS} rows, ${SHEET_COLS * SHEET_ROWS} cells of equal size, no gaps, no grid lines, no labels, no text anywhere.`,
        `Every cell shows the same person, ${sheet.name}, full body from head to feet, standing, facing the viewer, centred in the cell, the same outfit and the same pose in every cell. Only the face and the hand gesture change. Expressions in reading order: ${cells}.`,
        `${sheet.name}: ${sheet.look || 'a young woman'}. Age ${sheet.age}. She wears ${sheet.shoes}; ${sheet.socks} show at the ankle.`,
        reference ? `The attached image is ${sheet.name}'s face and look: keep the same face, hair, skin tone and style in every cell.` : '',
        `The background of every cell is one flat solid magenta (#FF00FF) with nothing else on it, so it can be cut out.`,
    ].filter(Boolean).join(' ');
}

export const FEET_KINDS = ['shoes', 'socks', 'bare'];

/** A prompt for the three-panel feet card: shoes on, socked, bare soles. */
export function feetCardPrompt(sheet, { reference = false } = {}) {
    return [
        STYLE,
        `A reference sheet of ${sheet.name}'s feet: exactly 3 panels side by side in one row, equal size, no gaps, no labels, no text.`,
        `Panel 1: her feet in her shoes, ${sheet.shoes}, seen from the floor at a tiny person's eye level, the shoes huge in the frame.`,
        `Panel 2: the shoes off, her feet in ${sheet.socks}, soles toward the viewer, from the floor, faint green stink wisps rising off the socks.`,
        `Panel 3: barefoot, both soles facing the viewer, toes at the top, from the floor, the skin of the soles ${sheet.dials.dirty >= 7 ? 'grimy and dark with dirt' : sheet.dials.dirty >= 4 ? 'a little dusty' : 'clean'}, ${sheet.dials.sweaty >= 7 ? 'glistening with sweat' : 'dry'}.`,
        `Shoe size US ${sheet.shoe_us}. ${reference ? `The attached image shows ${sheet.name}; match her skin tone.` : ''}`,
        'Warm brown floor, nothing else in the frame.',
    ].filter(Boolean).join(' ');
}

/** A prompt for a location's background, as a visual-novel backdrop. */
export function backgroundPrompt(loc, { slot = 'afternoon', town = '' } = {}) {
    const light = slot === 'night' ? 'night, lamps on, dark blue shadows' : slot === 'evening' ? 'evening, warm orange light, long shadows' : slot === 'morning' ? 'morning, cool bright light' : 'afternoon, flat warm daylight';
    return [
        STYLE,
        `A visual-novel background with no people in it: ${loc.name}, ${typeOf(loc).label.toLowerCase()}${town ? ` in ${town}` : ''}.`,
        `${loc.interior}.`,
        `Eye-level view, wide, the middle of the frame left clear for a character sprite to stand in. ${light}. No text, no signs with words.`,
    ].join(' ');
}

/** A prompt for an event picture: the floor-level service shot. */
export function eventPrompt({ sheet, feet = 'socks', tinyNow = false, note = '' }) {
    const what = feet === 'shoes' ? `her ${sheet.shoes}` : feet === 'socks' ? `her ${sheet.socks}` : 'her bare soles';
    return [
        STYLE,
        `Camera on the floor at a tiny person's eye level. ${sheet.name}'s feet fill the frame: ${what}, resting, toes slightly curled.`,
        tinyNow ? 'A small blue-skinned tiny person stands at the bottom edge of the frame for scale, looking up.' : '',
        feet !== 'shoes' ? 'Green stink wisps rise off them; a few sweat droplets.' : '',
        note, 'Warm brown floor, a hint of the room behind. No text.',
    ].filter(Boolean).join(' ');
}

/** A prompt for a bad-end card (portrait). The caption is drawn by the extension, not the model. */
export function badEndPrompt({ sheet, how = 'taped to the sole of her sock' }) {
    return [
        STYLE,
        `A portrait-format panel: ${sheet.name}'s face in the top corner looking down with a smug grin, and below, huge, the sole of her ${sheet.socks.split(',')[0]} with a tiny blue-skinned person ${how}.`,
        'Yellow-green stink haze. Leave the bottom fifth of the frame plain for a caption. No text.',
    ].join(' ');
}

// ------------------------------------------------------------------ pure pixel helpers

/** The cell rectangles of a grid image, reading order. */
export function cellRects(width, height, cols = SHEET_COLS, rows = SHEET_ROWS) {
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x0 = Math.round((c * width) / cols), x1 = Math.round(((c + 1) * width) / cols);
        const y0 = Math.round((r * height) / rows), y1 = Math.round(((r + 1) * height) / rows);
        out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    return out;
}

/**
 * Key out a flat colour in RGBA pixel data (in place). The colour defaults to the most common colour
 * along the image border, so an off-magenta or white background still goes. Returns the colour used.
 */
export function keyOut(data, width, height, { color = null, tolerance = 60 } = {}) {
    const key = color ?? borderColor(data, width, height);
    const t2 = tolerance * tolerance;
    for (let i = 0; i < data.length; i += 4) {
        const dr = data[i] - key.r, dg = data[i + 1] - key.g, db = data[i + 2] - key.b;
        if (dr * dr + dg * dg + db * db <= t2) data[i + 3] = 0;
    }
    return key;
}

/** The most common colour (quantised) along the border of an image. */
export function borderColor(data, width, height) {
    const counts = new Map();
    const bump = (x, y) => {
        const i = (y * width + x) * 4;
        const k = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
        const e = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
        counts.set(k, e);
    };
    for (let x = 0; x < width; x++) { bump(x, 0); bump(x, height - 1); }
    for (let y = 0; y < height; y++) { bump(0, y); bump(width - 1, y); }
    let best = null;
    for (const e of counts.values()) if (!best || e.n > best.n) best = e;
    return best ? { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) } : { ...KEY_COLOR };
}

/** The bounding box of the opaque pixels, or null when there are none. */
export function opaqueBounds(data, width, height, { alpha = 8 } = {}) {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > alpha) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Which cell holds which expression. */
export const cellExpression = (i) => EXPRESSIONS[i] ?? null;
