// Picture backends. Every request goes through SillyTavern's own server, so API keys stay in its secret
// store: Google AI Studio (Nano Banana) and any OpenAI-compatible API through the chat-completions relay,
// OpenRouter and NanoGPT through SillyTavern's image routes. (Same approach as Scene Mapper and Nano Banana POV.)

export const PICTURE_SOURCES = {
    gemini: { label: 'Google AI Studio (Nano Banana)', secret: 'api_key_makersuite', reference: true },
    openrouter: { label: 'OpenRouter', secret: 'api_key_openrouter', reference: true },
    nanogpt: { label: 'NanoGPT', secret: 'api_key_nanogpt', reference: true },
    custom: { label: 'Any OpenAI-compatible API (chat completions)', secret: 'api_key_custom', reference: true },
};

export const DEFAULT_MODELS = { gemini: 'gemini-2.5-flash-image', openrouter: 'google/gemini-2.5-flash-image', nanogpt: '', custom: '' };

/** The picture's file type from its first bytes (base64). */
export function formatOf(b64, mime = '') {
    if (/png/.test(mime)) return 'png';
    if (/jpe?g/.test(mime)) return 'jpg';
    if (/webp/.test(mime)) return 'webp';
    const s = String(b64 || '').slice(0, 8);
    return s.startsWith('iVBOR') ? 'png' : s.startsWith('/9j/') ? 'jpg' : s.startsWith('UklGR') ? 'webp' : 'png';
}

const dataUrlParts = (url) => {
    const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(String(url || ''));
    return m ? { mime: m[1] || '', data: m[2] } : null;
};

/** Width and height for a frame shape, the long side `long` px, both multiples of 64. */
export function sizeFor(aspect, long = 1024) {
    const [a, b] = String(aspect || '1:1').split(':').map(Number);
    const r = a > 0 && b > 0 ? a / b : 1;
    const snap = (v) => Math.max(256, Math.round(v / 64) * 64);
    return r >= 1 ? { width: snap(long), height: snap(long / r) } : { width: snap(long * r), height: snap(long) };
}

/** The user's message: the reference pictures first, then the prompt. */
export function messageContent(prompt, images = []) {
    const list = [].concat(images ?? []).filter(Boolean);
    return list.length ? [...list.map((url) => ({ type: 'image_url', image_url: { url } })), { type: 'text', text: prompt }] : prompt;
}

function toYaml(obj, indent = '') {
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) out.push(`${indent}${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
        else if (v && typeof v === 'object') out.push(`${indent}${k}:`, toYaml(v, `${indent}  `));
        else out.push(`${indent}${k}: ${JSON.stringify(v)}`);
    }
    return out.join('\n');
}

/**
 * The request for one picture: `{ url, body }` to post to SillyTavern.
 * @param {string} source a PICTURE_SOURCES key
 * @param {{prompt: string, model: string, aspect?: string, images?: string[], resolution?: string, customUrl?: string, size?: number}} o
 */
export function pictureRequest(source, o) {
    const { prompt, model, aspect = '1:1' } = o;
    const images = [].concat(o.images ?? []).filter(Boolean);
    if (source === 'gemini') {
        return {
            url: '/api/backends/chat-completions/generate',
            body: { chat_completion_source: 'makersuite', model, messages: [{ role: 'user', content: messageContent(prompt, images) }], stream: false, max_tokens: 8192, temperature: 1, request_images: true, request_image_aspect_ratio: aspect, request_image_resolution: o.resolution || '' },
        };
    }
    if (source === 'openrouter') return { url: '/api/openrouter/image/generate', body: { model, prompt: messageContent(prompt, images), aspect_ratio: aspect } };
    if (source === 'nanogpt') {
        const { width, height } = sizeFor(aspect, o.size || 1024);
        return { url: '/api/sd/nanogpt/generate', body: { model, prompt, width, height, resolution: `${width}x${height}`, aspect_ratio: aspect, nImages: 1, showExplicitContent: true, ...(images.length > 1 ? { imageDataUrls: images } : images.length ? { imageDataUrl: images[0] } : {}) } };
    }
    if (source === 'custom') {
        const include = toYaml({ modalities: ['image', 'text'], image_config: { aspect_ratio: aspect, ...(o.resolution ? { image_size: o.resolution } : {}) } });
        return {
            url: '/api/backends/chat-completions/generate',
            body: { chat_completion_source: 'custom', custom_url: String(o.customUrl || '').replace(/\/+$/, '').replace(/\/chat\/completions$/, ''), model, messages: [{ role: 'user', content: messageContent(prompt, images) }], stream: false, max_tokens: 8192, temperature: 1, custom_include_body: include },
        };
    }
    throw new Error(`unknown picture source ${source}`);
}

/** The picture in a reply: `{ data, format }`, `{ url }` to download, or `{ text }` (usually a refusal). */
export function readPicture(data) {
    if (!data || typeof data !== 'object') return { text: String(data || '') };
    if (typeof data.image === 'string' && data.image) return { data: data.image, format: data.format && data.format !== 'jpeg' ? data.format : formatOf(data.image) };
    const part = (data.responseContent?.parts ?? data.candidates?.[0]?.content?.parts ?? []).find((x) => x?.inlineData?.data && !x.thought);
    if (part) return { data: part.inlineData.data, format: formatOf(part.inlineData.data, part.inlineData.mimeType) };
    const d0 = Array.isArray(data.data) ? data.data[0] : null;
    if (d0?.b64_json) return { data: d0.b64_json, format: formatOf(d0.b64_json) };
    if (d0?.url) return fromUrl(d0.url);
    const msg = data.choices?.[0]?.message ?? {};
    for (const im of msg.images ?? []) { const u = im?.image_url?.url ?? im?.url ?? (typeof im === 'string' ? im : ''); if (u) return fromUrl(u); }
    if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
            const u = c?.image_url?.url ?? (c?.type === 'image' ? c.source?.data && `data:${c.source.media_type || 'image/png'};base64,${c.source.data}` : '');
            if (u) return fromUrl(u);
            if (c?.inline_data?.data || c?.inlineData?.data) { const x = c.inline_data ?? c.inlineData; return { data: x.data, format: formatOf(x.data, x.mime_type ?? x.mimeType) }; }
        }
    }
    const text = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map((c) => c?.text || '').join(' ') : '';
    const md = /!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)\s]+)\)/.exec(text) || /(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)/.exec(text);
    if (md) return fromUrl(md[1]);
    const err = data.error?.message ?? (typeof data.error === 'string' ? data.error : '');
    return { text: String(err || text || '').trim() };
}

function fromUrl(u) {
    const p = dataUrlParts(u);
    return p ? { data: p.data, format: formatOf(p.data, p.mime) } : { url: String(u) };
}

/** Why a request failed, in words. */
export function failureText(source, status, body = '') {
    const who = PICTURE_SOURCES[source]?.label ?? source;
    let said = '';
    try { const j = JSON.parse(body); said = j?.error?.message ?? j?.message ?? (typeof j?.error === 'string' ? j.error : ''); } catch { said = /<html/i.test(body) ? '' : String(body || '').slice(0, 200); }
    if (status === 404) return `this SillyTavern has no ${who} picture route; update SillyTavern or pick another source`;
    if (status === 400 && !said) return `no ${who} key saved yet`;
    if (status === 401 || status === 403) return `${who} rejected the key${said ? `: ${said}` : ''}`;
    if (status === 402) return `${who} says there are no credits left${said ? `: ${said}` : ''}`;
    return `${who} said no (error ${status})${said ? `: ${said}` : '; the model may have refused this picture'}`;
}

/** A model list from SillyTavern's routes, as [{ id, name }]. */
export function readModels(source, data) {
    const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const list = arr.map((m) => (typeof m === 'string' ? { id: m, name: m } : { id: String(m.value ?? m.id ?? m.name ?? ''), name: String(m.text ?? m.name ?? m.display_name ?? m.id ?? '') }))
        .map((m) => ({ id: m.id.replace(/^models\//, ''), name: m.name.replace(/^models\//, '') })).filter((m) => m.id);
    if (source === 'gemini') return list.filter((m) => /image/i.test(m.id));
    return list;
}

export function modelsRequest(source, o = {}) {
    if (source === 'openrouter') return { url: '/api/openrouter/models/image', body: {} };
    if (source === 'nanogpt') return { url: '/api/sd/nanogpt/models', body: {} };
    if (source === 'gemini') return { url: '/api/backends/chat-completions/status', body: { chat_completion_source: 'makersuite' } };
    if (source === 'custom') return { url: '/api/backends/chat-completions/status', body: { chat_completion_source: 'custom', custom_url: String(o.customUrl || '').replace(/\/+$/, '') } };
    return null;
}
