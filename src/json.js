// A forgiving JSON reader for model replies: code fences, chatter around the object, trailing commas,
// single-line comments, and a reply cut off mid-object (the open brackets are closed).

/** The first JSON object (or array) in `text`, parsed, or null. */
export function extractJson(text) {
    const t = String(text ?? '');
    const start = t.search(/[{[]/);
    if (start < 0) return null;
    const candidates = [t.slice(start)];
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
    if (fenced) candidates.unshift(fenced[1]);
    for (const c of candidates) {
        const parsed = tryParse(c) ?? tryParse(repair(c));
        if (parsed && typeof parsed === 'object') return parsed;
    }
    return null;
}

function tryParse(s) {
    try { return JSON.parse(s); } catch { return null; }
}

/** Trim to the outermost bracket pair, drop comments and trailing commas, close what was left open. */
export function repair(s) {
    let t = String(s ?? '').trim();
    const first = t.search(/[{[]/);
    if (first > 0) t = t.slice(first);
    t = t.replace(/^\s*\/\/[^\n]*$/gm, '');
    // Walk the text tracking strings and brackets; stop at the matching close of the first bracket.
    const stack = [];
    let inStr = false, esc = false, out = '';
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        out += ch;
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
        else if (ch === '}' || ch === ']') { stack.pop(); if (!stack.length) break; }
    }
    if (inStr) out += '"';
    out = out.replace(/,\s*$/, '');
    while (stack.length) out += stack.pop();
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return out;
}

/** Clamp a number, with a fallback for anything that is not one. */
export const num = (v, lo, hi, dflt) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
};

/** A url-ish id from a name: "Suds & Socks" -> "suds_socks". */
export const slug = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'x';

export const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const list = (v, max = 12) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/\s*[,;]\s*/) : []).map((x) => str(x, 80)).filter(Boolean).slice(0, max);
