// Sole Survivor: a living-world foot-fetish RPG around the character card you are chatting with.
// A pixel town to explore (drawn by code), visual-novel scenes written by the chat model under a
// game brief the extension injects, a seeded rules engine that decides outcomes, and sprites,
// feet cards and backgrounds generated automatically from the cards.

import { extractJson, slug } from './src/json.js';
import { EXPRESSIONS, buildSheetMessages, normalizeSheet } from './src/sheet.js';
import { addLocation, createState, findLocation, findResident, isOpenNow, isUnlocked, closedHint, normalizeWorld, buildWorldMessages, questDone, questGiven, sleep as sleepAt, travel as travelTo, wait as waitSlot, whoIsAt, advance } from './src/world.js';
import { applyDeltas, check, odds, setValue, tiny, triggers } from './src/rules.js';
import { buildBrief, buildReconcileMessages, choiceMessage, parseReconcile, parseReply, verbOf } from './src/scene.js';
import { DEFAULT_MODELS, PICTURE_SOURCES, failureText, modelsRequest, pictureRequest, readModels, readPicture } from './src/picture.js';
import { FEET_KINDS, SHEET_COLS, SHEET_ROWS, backgroundPrompt, badEndPrompt, cellRects, eventPrompt, feetCardPrompt, keyOut, opaqueBounds, spriteSheetPrompt } from './src/sprites.js';
import { Panel } from './src/panel.js';

const NAME = 'soleSurvivor';
const META_KEY = 'sole_survivor';
const PROMPT_KEY = 'sole_survivor_brief';
const LOG = '[Sole Survivor]';
const FOLDER = 'Sole Survivor';

const DEFAULTS = {
    enabled: true,
    profile: '', // connection profile for generation and reconcile; '' = the chat's connection
    maxTokens: 6000,
    extraResidents: 5,
    vibe: '',
    cruelty: 6, smell: 7, lethal: false, length: 'short',
    reconcile: true,
    sendMode: 'send', // 'send' or 'fill'
    asterisks: false,
    injectPosition: 1, injectDepth: 1, injectRole: 0,
    pictureSource: 'gemini', pictureModel: '', customUrl: '', resolution: '',
    autoSprites: true, autoBackgrounds: false,
    panel: { open: false },
};

const ctx = () => SillyTavern.getContext();
function cfg() {
    const all = ctx().extensionSettings;
    all[NAME] = { ...DEFAULTS, ...(all[NAME] ?? {}) };
    all[NAME].panel = { ...DEFAULTS.panel, ...(all[NAME].panel ?? {}) };
    return all[NAME];
}
const save = () => ctx().saveSettingsDebounced();
const post = (url, body) => fetch(url, { method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify(body ?? {}) });
const sub = (text, name) => { const c = ctx(); return typeof c.substituteParams === 'function' ? c.substituteParams(text || '', undefined, name) : String(text || ''); };
const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, 'Sole Survivor');

let panel = null;
let busy = false;
let lastUserText = '';
const undo = []; // state snapshots for rewind
const spritesBusy = new Set();

// ------------------------------------------------------------------ game data in the chat

const hasChat = () => { const c = ctx(); return Boolean(c.chat && (c.characterId !== undefined && c.characterId !== null || c.groupId)); };
function game() { return hasChat() ? ctx().chatMetadata?.[META_KEY] ?? null : null; }

function log(text) {
    const g = game();
    const line = `${new Date().toLocaleTimeString()} ${text}`;
    console.debug(LOG, text);
    if (g) { g.log = [...(g.log ?? []).slice(-199), line]; }
}

function commit() {
    const c = ctx();
    if (game()) (c.saveMetadataDebounced ?? c.saveMetadata)?.call(c);
    updateInjection();
    panel?.refresh();
}

function snapshot() {
    const g = game();
    if (!g) return;
    undo.push(JSON.stringify(g.state));
    if (undo.length > 30) undo.shift();
}

function rewind() {
    const g = game();
    if (!g || !undo.length) { panel?.setStatus('Nothing to rewind.'); return; }
    g.state = JSON.parse(undo.pop());
    log('Rewound one step.');
    commit();
    panel?.setStatus('Rewound. The chat message stays; send something new or swipe.');
}

function castCards() {
    const c = ctx();
    if (c.groupId) {
        const group = c.groups?.find((g) => g.id === c.groupId);
        const off = new Set(group?.disabled_members ?? []);
        return (group?.members ?? []).filter((a) => !off.has(a)).map((a) => c.characters.find((ch) => ch.avatar === a)).filter(Boolean);
    }
    const card = c.characters?.[c.characterId];
    return card ? [card] : [];
}

// ------------------------------------------------------------------ the model

async function askModel(messages, maxTokens = Number(cfg().maxTokens) || 6000) {
    const c = ctx();
    const s = cfg();
    if (s.profile) {
        const svc = c.ConnectionManagerRequestService;
        if (!svc) throw new Error('connection profiles need the Connection Manager extension');
        try {
            const res = await svc.sendRequest(s.profile, messages, maxTokens, { stream: false, extractData: true, includePreset: true, includeInstruct: true });
            return typeof res === 'string' ? res : res?.content ?? '';
        } catch (err) { throw new Error(err.cause?.message || err.message); }
    }
    const fn = c.generateRaw;
    if (fn.length >= 2) return fn(messages.map((m) => m.content).join('\n\n'), null, false, false, '', maxTokens);
    return fn({ prompt: messages, responseLength: maxTokens, trimNames: false });
}

/** Ask for JSON; one retry when the reply had none. */
async function askJson(messages, what) {
    let reply = await askModel(messages);
    if (extractJson(reply)) return reply;
    console.warn(LOG, `${what}: not JSON, asking again`, reply);
    reply = await askModel([...messages, { role: 'assistant', content: String(reply || '').slice(0, 3000) }, { role: 'user', content: 'That was not a complete JSON object. Answer again with the whole JSON object only, nothing else.' }]);
    if (!extractJson(reply)) throw new Error(`the model did not answer with ${what} (try a different model or profile, or raise Max tokens)`);
    return reply;
}

// ------------------------------------------------------------------ new game

async function newGame() {
    const c = ctx();
    if (!hasChat()) { toast('warning', 'Open a chat first.'); return; }
    if (busy) { toast('info', 'Still working…'); return; }
    const cards = castCards();
    if (!cards.length) { toast('warning', 'No character card in this chat.'); return; }
    if (game() && !window.confirm('Start a new game? The current town and progress in this chat will be replaced.')) return;
    busy = true;
    panel?.setBusy(true, 'Reading the character card…');
    try {
        const persona = sub('{{persona}}');
        const user = c.name1;
        const sheets = [];
        for (const card of cards) {
            panel?.setStatus(`Writing ${card.name}'s sheet…`);
            const reply = await askJson(buildSheetMessages({ card: { name: card.name, description: sub(card.description, card.name), personality: sub(card.personality, card.name), scenario: sub(card.scenario, card.name), first_mes: sub(card.first_mes, card.name), mes_example: sub(card.mes_example, card.name) }, persona: persona === '{{persona}}' ? '' : persona, user, extra: cfg().vibe }), 'a character sheet');
            sheets.push(normalizeSheet(reply, { id: slug(card.name), name: card.name, card: true, avatar: card.avatar }));
        }
        panel?.setStatus(`Building the town around ${sheets.map((s) => s.name).join(', ')}…`);
        const reply = await askJson(buildWorldMessages({ sheets, user, persona: persona === '{{persona}}' ? '' : persona, scenario: sub(cards[0].scenario, cards[0].name), extraResidents: Number(cfg().extraResidents) || 0, vibe: cfg().vibe }), 'a town');
        const world = normalizeWorld(reply, { cardSheets: sheets });
        const seed = Math.floor(Math.random() * 1e9);
        const state = createState(world, { seed });
        c.chatMetadata[META_KEY] = { world, state, layoutSeed: seed, gallery: [], log: [] };
        undo.length = 0;
        log(`New game: ${world.town.name}, ${world.locations.length} places, ${world.residents.length} residents, ${world.quests.length} quests.`);
        commit();
        panel?.setTab('map');
        panel?.setStatus(`${world.town.name}: ${world.town.intro || world.town.vibe}`);
        toast('success', `Welcome to ${world.town.name}.`);
        if (cfg().autoSprites) for (const s of world.residents.filter((r) => r.card)) makeSprites(s.id).catch(() => {});
    } catch (err) {
        console.error(LOG, err);
        panel?.setStatus(`Could not start: ${err.message}`, true);
        toast('error', err.message);
    } finally {
        busy = false;
        panel?.setBusy(false);
    }
}

// ------------------------------------------------------------------ prompt injection

async function setPrompt(text) {
    const s = cfg();
    let fn = ctx().setExtensionPrompt;
    if (typeof fn !== 'function') ({ setExtensionPrompt: fn } = await import('../../../../script.js'));
    fn(PROMPT_KEY, text, Number(s.injectPosition), Number(s.injectDepth), false, Number(s.injectRole));
}

function brief() {
    const g = game();
    if (!g) return '';
    const s = cfg();
    return buildBrief({ world: g.world, state: g.state, user: ctx().name1, outcome: g.state.pending ?? null, settings: { cruelty: s.cruelty, smell: s.smell, lethal: s.lethal, length: s.length } });
}

function updateInjection() {
    const text = cfg().enabled && game() ? brief() : '';
    setPrompt(text).catch((e) => console.error(LOG, 'Could not set the prompt', e));
}

/** SillyTavern calls this before every generation: make sure the brief is current. */
globalThis.soleSurvivorInterceptor = async function soleSurvivorInterceptor(_chat, _size, _abort, type) {
    if (type === 'quiet') return;
    updateInjection();
};

// ------------------------------------------------------------------ the view the panel reads

function present() {
    const g = game();
    if (!g) return [];
    const here = findLocation(g.world, g.state.at);
    if (!here) return [];
    if (!(isOpenNow(g.world, g.state, here) || here.type === 'home')) return [];
    return whoIsAt(g.world, here.id, g.state.slot);
}

function expressionOf(sheet) {
    const g = game();
    const ex = g?.state.scene?.expressions ?? {};
    const full = sheet.name.toLowerCase(), fst = full.split(' ')[0];
    for (const [who, e] of Object.entries(ex)) { const w = who.toLowerCase(); if (w === full || w === fst || w.split(' ')[0] === fst) return EXPRESSIONS.includes(e) ? e : 'neutral'; }
    return 'neutral';
}

const view = () => {
    const g = game();
    const c = ctx();
    return {
        chatOpen: hasChat(), cast: castCards().map((x) => x.name),
        world: g?.world ?? null, state: g?.state ?? null, layoutSeed: g?.layoutSeed ?? 1, gallery: g?.gallery ?? [], log: g?.log ?? [],
        user: c.name1,
        present: present(),
        statusOf: (loc) => (!g ? 'locked' : !isUnlocked(g.world, g.state, loc) ? 'locked' : !isOpenNow(g.world, g.state, loc) ? 'closed' : 'open'),
        hint: (loc) => (g ? closedHint(g.world, g.state, loc) : ''),
        odds: (sheet, kind) => (g ? odds(g.state, sheet, kind) ?? 0.5 : 0.5),
        expressionOf,
        spriteUrl: (sheet, expr) => sheet.sprites?.[expr] || sheet.sprites?.neutral || '',
        feetUrl: (sheet) => sheet.feet?.socks || sheet.feet?.bare || sheet.feet?.shoes || '',
        feetState: (id) => g?.state.feet?.[id] ?? '',
        backgroundUrl: (loc) => loc.background?.[g?.state.slot === 'night' ? 'night' : 'day'] || loc.background?.day || loc.background?.night || '',
        spritesBusy: (id) => spritesBusy.has(id),
    };
};

// ------------------------------------------------------------------ sending the player's move

function sendAsUser(text) {
    const s = cfg();
    const box = document.getElementById('send_textarea');
    if (!box) return 'none';
    const draft = box.value.trim();
    const generating = document.body.dataset.generating === 'true';
    box.value = draft ? `${draft} ${text}` : text;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    if (s.sendMode === 'fill' || draft || generating) { box.focus(); return generating ? 'busy' : 'filled'; }
    document.getElementById('send_but')?.click();
    return 'sent';
}

const VERB_TEXT = {
    kiss: (n) => `I kneel and kiss ${n}'s feet.`,
    sniff: (n) => `I lean in and take a deep breath of ${n}'s socks.`,
    lick: (n) => `I lick ${n}'s soles clean.`,
    rub: (n) => `I rub ${n}'s feet, working my thumbs into her arches.`,
    talk: (n) => `I try to make conversation with ${n}.`,
};

/** Resolve a check now, store the outcome for the brief, and send the move. */
function act({ text, kind = null, targetId = null, snap = true }) {
    const g = game();
    if (!g) return;
    if (snap) snapshot();
    const here = present();
    const target = (targetId && findResident(g.world, targetId)) || here[0] || null;
    if (kind && target) {
        const result = check(g.state, target, kind, { salt: g.state.turn });
        applyDeltas(g.state, target.id, result.deltas);
        g.state.pending = { text: `${result.tier === 'crit' ? 'Critical success' : result.tier === 'botch' ? 'Disaster' : result.tier === 'success' ? 'Success' : 'Failure'} on a ${kind} check (rolled ${result.roll}, needed ${result.need}). ${result.text}` };
        log(`${kind} vs ${target.name}: ${result.tier} (${result.roll}/${result.need})`);
    } else {
        g.state.pending = null;
    }
    commit();
    const sent = sendAsUser(text);
    if (sent === 'busy') panel?.setStatus('The AI is still writing; your move is in the message box.');
}

const actions = {
    onTravel(id) {
        const g = game();
        if (!g) return;
        if (busy) return;
        const loc = findLocation(g.world, id);
        if (!loc) return;
        if (loc.id === g.state.at) { panel?.setTab('scene'); return; }
        snapshot();
        const t = travelTo(g.world, g.state, id);
        log(`Travel to ${loc.name} (${g.state.slot}, day ${g.state.day}).`);
        if (!isUnlocked(g.world, g.state, loc)) {
            commit();
            panel?.setStatus(`${loc.name} is CLOSED. ${closedHint(g.world, g.state, loc)}`);
            return;
        }
        commit();
        panel?.setTab('scene');
        act({ text: `I head over to ${loc.name}${t.open ? '' : ' and find it closed'}.`, snap: false });
    },
    onWait() {
        const g = game();
        if (!g) return;
        snapshot();
        waitSlot(g.state);
        log(`Waited until ${g.state.slot}.`);
        commit();
        const here = present();
        if (here.length) act({ text: `I hang around ${findLocation(g.world, g.state.at)?.name ?? 'here'} until the ${g.state.slot}.`, snap: false });
        else panel?.setStatus(`It is now ${g.state.slot}.`);
    },
    onSleep() {
        const g = game();
        if (!g) return;
        snapshot();
        sleepAt(g.world, g.state);
        log(`Slept. Day ${g.state.day}.`);
        commit();
        panel?.setStatus(`Day ${g.state.day}, morning. Stamina and composure are back.`);
    },
    onLook() { act({ text: 'I look around.' }); panel?.setTab('scene'); },
    onChoice(choice) {
        const g = game();
        if (!g) return;
        if (choice.check) act({ text: choiceMessage(choice, { asterisks: cfg().asterisks }), kind: choice.check, targetId: panel?.verbTarget || null });
        else act({ text: choiceMessage(choice, { asterisks: cfg().asterisks }) });
    },
    onFreeText(text) {
        const kind = verbOf(text);
        act({ text: cfg().asterisks && !/^[*"]/.test(text) ? `*${text}*` : text, kind, targetId: panel?.verbTarget || null });
    },
    onVerb(verb, targetId) {
        const g = game();
        const target = g && findResident(g.world, targetId);
        if (!target) return;
        const n = target.name.split(' ')[0];
        const text = VERB_TEXT[verb]?.(n) ?? `I ${verb} ${n}.`;
        act({ text: cfg().asterisks ? `*${text}*` : text, kind: verb, targetId });
    },
    onNewGame: newGame,
    onMakeSprites: (id) => makeSprites(id).catch((e) => panel?.setStatus(e.message, true)),
    onMakeFeet: (id) => makeFeet(id).catch((e) => panel?.setStatus(e.message, true)),
    onMakeBackground: (id) => makeBackground(id).catch((e) => panel?.setStatus(e.message, true)),
    onPicture: () => makeScenePicture().catch((e) => panel?.setStatus(e.message, true)),
    onEditDial(id, dial, value) {
        const g = game();
        const s = g && findResident(g.world, id);
        if (!s) return;
        s.dials[dial] = Math.max(0, Math.min(11, Math.round(Number(value) || 0)));
        commit();
    },
    onLayout(box) { Object.assign(cfg().panel, box); save(); },
    onClose() { setPanelOpen(false); },
    onRewind: rewind,
    onExport() {
        const g = game();
        if (!g) return;
        const text = JSON.stringify({ world: g.world }, null, 2);
        navigator.clipboard?.writeText(text).then(() => panel?.setStatus('Town copied to the clipboard as JSON.'), () => { console.log(LOG, text); panel?.setStatus('See the console for the JSON.'); });
    },
    async onImport() {
        const { callGenericPopup, POPUP_TYPE } = ctx();
        if (!callGenericPopup) return;
        const text = await callGenericPopup('<h3>Import a town</h3><small>Paste the JSON from "Export town". Progress starts over.</small>', POPUP_TYPE.INPUT, '', { wide: true, large: true, rows: 12, okButton: 'Import' });
        const raw = extractJson(String(text || ''));
        if (!raw) return;
        const cards = castCards();
        const world = normalizeWorld(raw.world ?? raw, { cardSheets: (raw.world ?? raw).residents?.filter((r) => r.card).map((r) => normalizeSheet(r, { id: r.id, card: true, avatar: cards.find((c) => c.name === r.name)?.avatar })) ?? [] });
        const seed = Math.floor(Math.random() * 1e9);
        ctx().chatMetadata[META_KEY] = { world, state: createState(world, { seed }), layoutSeed: seed, gallery: [], log: [] };
        undo.length = 0;
        commit();
    },
    view,
};

// ------------------------------------------------------------------ reading the reply

async function onMessageReceived(id, type) {
    const g = game();
    if (!g || !cfg().enabled) return;
    const c = ctx();
    const m = c.chat?.[id];
    if (!m || m.is_user || m.is_system || !m.mes) return;
    const parsed = parseReply(m.mes);
    g.state.scene = { messageId: id, lines: parsed.lines, narration: parsed.narration, choices: parsed.choices, expressions: parsed.expressions };
    g.state.turn = (g.state.turn ?? 0) + 1;
    g.state.pending = null;
    if (parsed.event) g.state.event = parsed.event === 'none' ? null : { type: parsed.event };
    for (const q of parsed.quests) if (questGiven(g.world, g.state, q)) log(`Quest given: ${q}`);
    if (panel) { panel.lineIndex = null; panel.showAll = false; }
    commit();
    if (cfg().reconcile) await reconcile(m.mes);
    if (cfg().autoSprites) for (const s of present()) if (!s.sprites?.neutral && !spritesBusy.has(s.id)) makeSprites(s.id).catch(() => {});
    if (cfg().autoBackgrounds) { const here = findLocation(g.world, g.state.at); if (here && !view().backgroundUrl(here)) makeBackground(here.id).catch(() => {}); }
}

async function reconcile(reply) {
    const g = game();
    if (!g) return;
    try {
        const text = await askModel(buildReconcileMessages({ world: g.world, state: g.state, reply, userText: lastUserText, user: ctx().name1 }), 1200);
        const d = parseReconcile(text, g.world);
        if (game() !== g) return;
        for (const [id, n] of Object.entries(d.favor)) applyDeltas(g.state, id, { rel: { favor: n } });
        for (const [id, n] of Object.entries(d.irritation)) applyDeltas(g.state, id, { rel: { irritation: n } });
        for (const id of d.met) (g.state.rel[id] ??= { favor: 0, irritation: 0, fear: 0 }).met = true;
        for (const it of d.items_gained) if (!g.state.inventory.includes(it)) g.state.inventory.push(it);
        g.state.inventory = g.state.inventory.filter((it) => !d.items_lost.some((l) => l.toLowerCase() === it.toLowerCase()));
        if (d.money) applyDeltas(g.state, null, { player: { money: d.money } });
        if (d.size_cm !== null) { setValue(g.state, null, 'size_cm', d.size_cm); log(`Size is now ${d.size_cm} cm.`); }
        for (const q of d.quests_given) questGiven(g.world, g.state, q);
        for (const q of d.quests_done) { const quest = questDone(g.world, g.state, q); if (quest) log(`Quest done: ${quest.title}`); }
        for (const p of d.new_places) { if (!g.world.locations.some((l) => l.name.toLowerCase() === p.name.toLowerCase())) { const loc = addLocation(g.world, { name: p.name, type: p.type, interior: p.interior, hint: p.why ? `${p.why} mentioned it. Find a way in.` : '' }); log(`New place on the map: ${loc.name} (closed).`); } }
        g.state.feet = { ...(g.state.feet ?? {}), ...d.feet };
        if (d.time_passed) { advance(g.state, 1); log(`Time passed: now ${g.state.slot}.`); }
        for (const f of d.flags) g.state.flags[f] = true;
        commit();
    } catch (err) {
        console.warn(LOG, 'Reconcile failed', err);
    }
}

function onMessageSent(id) {
    const m = ctx().chat?.[id];
    if (m?.is_user) lastUserText = m.mes || '';
}

function onMessageChanged(id) {
    const g = game();
    const c = ctx();
    const m = c.chat?.[id];
    if (!g || !m || m.is_user || m.is_system || id !== c.chat.length - 1) return;
    const parsed = parseReply(m.mes);
    g.state.scene = { messageId: id, lines: parsed.lines, narration: parsed.narration, choices: parsed.choices, expressions: parsed.expressions };
    commit();
}

function loadChat() {
    undo.length = 0;
    lastUserText = '';
    updateInjection();
    if (panel) { panel.setStatus(game() ? '' : hasChat() ? 'No game in this chat yet. Press ✨ New game.' : 'Open a chat first.'); panel.refresh(); }
}

// ------------------------------------------------------------------ pictures

async function makePicture(prompt, { aspect = '1:1', images = [] } = {}) {
    const s = cfg();
    const source = PICTURE_SOURCES[s.pictureSource] ? s.pictureSource : 'gemini';
    const model = s.pictureModel || DEFAULT_MODELS[source];
    if (!model) throw new Error('pick a picture model in the settings');
    const req = pictureRequest(source, { prompt, model, aspect, images: PICTURE_SOURCES[source].reference ? images : [], resolution: s.resolution, customUrl: s.customUrl });
    const res = await post(req.url, req.body);
    if (!res.ok) throw new Error(failureText(source, res.status, await res.text().catch(() => '')));
    const pic = readPicture(await res.json());
    if (pic.url) {
        const r = await fetch(pic.url);
        const buf = new Uint8Array(await r.arrayBuffer());
        let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
        pic.data = btoa(bin); pic.format = /png/i.test(r.headers.get('content-type') || '') ? 'png' : 'jpg';
    }
    if (!pic.data) throw new Error(pic.text ? `no picture came back: ${pic.text.slice(0, 200)}` : 'no picture came back');
    return pic; // { data, format }
}

async function upload(base64, format, filename) {
    const res = await post('/api/images/upload', { image: base64, format, ch_name: FOLDER, filename });
    if (!res.ok) throw new Error('could not save the picture');
    return (await res.json()).path;
}

const bitmapOf = async (base64, format) => createImageBitmap(await (await fetch(`data:image/${format === 'jpg' ? 'jpeg' : format};base64,${base64}`)).blob());

/** A character's avatar as a small JPEG data URL. */
async function avatarData(file) {
    if (!file || file === 'none') return null;
    const res = await fetch(`/characters/${encodeURIComponent(file)}`);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const k = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * k); canvas.height = Math.round(bitmap.height * k);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
}

/** The reference image for a resident: the card avatar, else her neutral sprite, else nothing. */
async function referenceFor(sheet) {
    if (sheet.avatar) { try { const u = await avatarData(sheet.avatar); if (u) return u; } catch { /* no avatar */ } }
    if (sheet.sprites?.neutral) { try { const r = await fetch(sheet.sprites.neutral); const b = await r.blob(); return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }); } catch { /* fine */ } }
    return null;
}

/** Cut a cell out of a bitmap, key out the background, trim, and return PNG base64. */
function cutCell(bitmap, rect, { key = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = rect.w; canvas.height = rect.h;
    const g2 = canvas.getContext('2d');
    g2.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    if (!key) return canvas.toDataURL('image/png').split(',')[1];
    const img = g2.getImageData(0, 0, rect.w, rect.h);
    keyOut(img.data, rect.w, rect.h, { tolerance: 70 });
    const b = opaqueBounds(img.data, rect.w, rect.h) ?? { x: 0, y: 0, w: rect.w, h: rect.h };
    g2.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    const pad = 2;
    out.width = b.w + pad * 2; out.height = b.h + pad * 2;
    out.getContext('2d').drawImage(canvas, b.x, b.y, b.w, b.h, pad, pad, b.w, b.h);
    return out.toDataURL('image/png').split(',')[1];
}

async function makeSprites(id) {
    const g = game();
    const s = g && findResident(g.world, id);
    if (!s || spritesBusy.has(id)) return;
    spritesBusy.add(id);
    panel?.setStatus(`Drawing ${s.name}'s sprites…`);
    panel?.refresh();
    try {
        const ref = await referenceFor(s);
        const pic = await makePicture(spriteSheetPrompt(s, { reference: Boolean(ref) }), { aspect: '3:2', images: ref ? [ref] : [] });
        if (game() !== g) return;
        const sheetPath = await upload(pic.data, pic.format, `sheet_${s.id}_${Date.now()}`);
        const bitmap = await bitmapOf(pic.data, pic.format);
        const sprites = {};
        const rects = cellRects(bitmap.width, bitmap.height, SHEET_COLS, SHEET_ROWS);
        for (let i = 0; i < rects.length && i < EXPRESSIONS.length; i++) {
            sprites[EXPRESSIONS[i]] = await upload(cutCell(bitmap, rects[i]), 'png', `sprite_${s.id}_${EXPRESSIONS[i]}_${Date.now()}`);
        }
        s.sprites = sprites;
        g.gallery.push({ url: sheetPath, title: `${s.name}: expression sheet` });
        log(`Sprites made for ${s.name}.`);
        commit();
        panel?.setStatus(`${s.name}'s sprites are ready.`);
    } finally {
        spritesBusy.delete(id);
        panel?.refresh();
    }
}

async function makeFeet(id) {
    const g = game();
    const s = g && findResident(g.world, id);
    if (!s) return;
    panel?.setStatus(`Drawing ${s.name}'s feet card…`);
    const ref = await referenceFor(s);
    const pic = await makePicture(feetCardPrompt(s, { reference: Boolean(ref) }), { aspect: '3:1', images: ref ? [ref] : [] });
    if (game() !== g) return;
    const cardPath = await upload(pic.data, pic.format, `feet_${s.id}_${Date.now()}`);
    const bitmap = await bitmapOf(pic.data, pic.format);
    const rects = cellRects(bitmap.width, bitmap.height, 3, 1);
    const feet = {};
    for (let i = 0; i < 3; i++) feet[FEET_KINDS[i]] = await upload(cutCell(bitmap, rects[i], { key: false }), 'png', `feet_${s.id}_${FEET_KINDS[i]}_${Date.now()}`);
    s.feet = feet;
    g.gallery.push({ url: cardPath, title: `${s.name}: feet card` });
    log(`Feet card made for ${s.name}.`);
    commit();
    panel?.setStatus(`${s.name}'s feet card is ready.`);
}

const bgInFlight = new Set();
async function makeBackground(locId) {
    const g = game();
    const loc = g && findLocation(g.world, locId);
    if (!loc || bgInFlight.has(locId)) return;
    bgInFlight.add(locId);
    panel?.setStatus(`Painting ${loc.name}…`);
    try {
        const key = g.state.slot === 'night' ? 'night' : 'day';
        const pic = await makePicture(backgroundPrompt(loc, { slot: g.state.slot, town: g.world.town.name }), { aspect: '16:9' });
        if (game() !== g) return;
        const path = await upload(pic.data, pic.format, `bg_${loc.id}_${key}_${Date.now()}`);
        loc.background = { ...(loc.background ?? {}), [key]: path };
        g.gallery.push({ url: path, title: `${loc.name} (${key})` });
        log(`Background made for ${loc.name}.`);
        commit();
        panel?.setStatus(`${loc.name} is painted.`);
    } finally { bgInFlight.delete(locId); }
}

/** Put a picture into the chat as a message the AI does not read. */
async function postPicture(url, title) {
    const c = ctx();
    const message = {
        name: c.name2 || FOLDER, is_user: false, is_system: true,
        send_date: c.getMessageTimeStamp?.() ?? new Date().toLocaleString(), mes: '',
        extra: { media: [{ url, type: 'image', title, source: 'generated' }], media_display: 'gallery', media_index: 0, image: url, title, inline_image: false, sole_survivor: true },
    };
    c.chat.push(message);
    const id = c.chat.length - 1;
    await c.eventSource.emit(c.eventTypes.MESSAGE_RECEIVED, id, 'extension');
    c.addOneMessage(message);
    await c.eventSource.emit(c.eventTypes.CHARACTER_MESSAGE_RENDERED, id, 'extension');
    await c.saveChat();
}

/** The floor-level shot of the present resident's feet (or a bad-end card when the state says so). */
async function makeScenePicture() {
    const g = game();
    if (!g) { toast('warning', 'No game yet.'); return; }
    const who = present()[0];
    if (!who) { panel?.setStatus('Nobody here to picture.'); return; }
    panel?.setStatus('Drawing the scene…');
    const ref = (await referenceFor(who)) || null;
    const feet = g.state.feet?.[who.id] || 'socks';
    const ending = triggers(g.state, [who]).some((t) => t.severity === 'end');
    const prompt = ending ? badEndPrompt({ sheet: who }) : eventPrompt({ sheet: who, feet, tinyNow: tiny(g.state), note: g.state.scene?.narration?.[0] ?? '' });
    const pic = await makePicture(prompt, { aspect: '16:10', images: ref ? [ref] : [] });
    const path = await upload(pic.data, pic.format, `scene_${Date.now()}`);
    g.gallery.push({ url: path, title: prompt });
    await postPicture(path, prompt);
    commit();
    panel?.setStatus('Picture posted.');
}

// ------------------------------------------------------------------ panel, menu, commands

function setPanelOpen(open) {
    if (open && !panel) {
        panel = new Panel(actions, cfg().panel);
        panel.mount(document.body);
    }
    if (panel) { if (open) panel.show(); else panel.hide(); }
    if (open) panel.setStatus(game() ? '' : hasChat() ? 'No game in this chat yet. Press ✨ New game.' : 'Open a chat first.');
    cfg().panel.open = open;
    save();
}
const togglePanel = () => setPanelOpen(!(panel?.isOpen));

function addMenu() {
    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById('ss_menu_button')) {
        const item = document.createElement('div');
        item.id = 'ss_menu_button';
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<div class="fa-solid fa-socks extensionsMenuExtensionButton"></div>Sole Survivor';
        item.addEventListener('click', togglePanel);
        menu.append(item);
    }
}

function registerCommands() {
    const c = ctx();
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = c;
    const help = 'Sole Survivor: <code>/sole</code> opens the game window; <code>/sole new</code> builds a town around the character; <code>/sole go &lt;place&gt;</code>, <code>/sole wait</code>, <code>/sole sleep</code>, <code>/sole look</code>, <code>/sole sniff|lick|rub|kiss|talk [name]</code>, <code>/sole picture</code>, <code>/sole rewind</code>.';
    const callback = async (_args, value) => {
        const [cmd, ...rest] = String(value ?? '').trim().split(/\s+/);
        const arg = rest.join(' ');
        const g = game();
        switch ((cmd || '').toLowerCase()) {
            case '': togglePanel(); return '';
            case 'new': await newGame(); return '';
            case 'go': { if (!g) return 'no game'; const loc = g.world.locations.find((l) => l.name.toLowerCase().includes(arg.toLowerCase()) || l.id === slug(arg)); if (!loc) return `no place called ${arg}`; actions.onTravel(loc.id); return loc.name; }
            case 'wait': actions.onWait(); return '';
            case 'sleep': actions.onSleep(); return '';
            case 'look': actions.onLook(); return '';
            case 'picture': actions.onPicture(); return '';
            case 'rewind': rewind(); return '';
            case 'sniff': case 'lick': case 'rub': case 'kiss': case 'talk': {
                if (!g) return 'no game';
                const who = arg ? g.world.residents.find((r) => r.name.toLowerCase().includes(arg.toLowerCase())) : present()[0];
                if (!who) return 'nobody here';
                actions.onVerb(cmd.toLowerCase(), who.id);
                return '';
            }
            default: return help.replace(/<[^>]+>/g, '');
        }
    };
    try {
        if (SlashCommandParser?.addCommandObject && SlashCommand?.fromProps) {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'sole', callback, helpString: help, unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'new | go <place> | wait | sleep | look | sniff|lick|rub|kiss|talk [name] | picture | rewind', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })] }));
        } else if (typeof c.registerSlashCommand === 'function') c.registerSlashCommand('sole', (a, v) => callback(a, v), [], help);
    } catch (err) { console.warn(LOG, 'Could not register /sole', err); }
}

// ------------------------------------------------------------------ settings

const options = (pairs, current) => pairs.map(([v, label]) => `<option value="${v}"${String(v) === String(current) ? ' selected' : ''}>${label}</option>`).join('');

function settingsHtml() {
    const s = cfg();
    return `
<div id="ss_settings" class="ss-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b><i class="fa-solid fa-socks"></i> Sole Survivor</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <small>A foot-fetish RPG around the character in this chat: a pixel town to explore, visual-novel scenes, generated sprites. Open the game window from the wand menu or with <code>/sole</code>.</small>
      <div class="flex-container"><div id="ss_open" class="menu_button"><i class="fa-solid fa-socks"></i> Open the game window</div></div>
      <label class="checkbox_label"><input type="checkbox" data-key="enabled"> Enabled (injects the game brief into the prompt while a game is on)</label>
      <h4>New game</h4>
      <div class="ss-row">
        <label>Extra residents to invent <input class="text_pole" type="number" min="0" max="12" data-key="extraResidents"></label>
        <label>Model for building and bookkeeping <select class="text_pole" id="ss_profile" data-key="profile"></select></label>
      </div>
      <label>What you want the town to be like (optional) <input class="text_pole" type="text" data-key="vibe" placeholder="e.g. seaside college town; make her a Viper; she runs the gym"></label>
      <h4>Tone</h4>
      <div class="ss-row">
        <label>Cruelty <input type="range" min="0" max="10" data-key="cruelty"></label>
        <label>Smell <input type="range" min="0" max="10" data-key="smell"></label>
        <label>Scene length <select class="text_pole" data-key="length">${options([['short', 'Short'], ['long', 'Long']], s.length)}</select></label>
      </div>
      <label class="checkbox_label"><input type="checkbox" data-key="lethal"> Bad ends can be lethal for a tiny</label>
      <h4>Play</h4>
      <label class="checkbox_label"><input type="checkbox" data-key="reconcile"> After each reply, ask the model what changed (favor, items, quests, new places)</label>
      <div class="ss-row">
        <label>Your moves <select class="text_pole" data-key="sendMode">${options([['send', 'Send at once'], ['fill', 'Put in the message box to edit']], s.sendMode)}</select></label>
        <label class="checkbox_label"><input type="checkbox" data-key="asterisks"> Wrap actions in *asterisks*</label>
      </div>
      <div class="ss-row">
        <label>Brief position <select class="text_pole" data-key="injectPosition">${options([[1, 'In chat at depth'], [0, 'After the story string'], [2, 'Before the story string']], s.injectPosition)}</select></label>
        <label>Depth <input type="number" class="text_pole" min="0" max="50" data-key="injectDepth"></label>
        <label>As <select class="text_pole" data-key="injectRole">${options([[0, 'System'], [1, 'User'], [2, 'Assistant']], s.injectRole)}</select></label>
        <label>Max tokens <input type="number" class="text_pole" min="1000" max="30000" step="500" data-key="maxTokens"></label>
      </div>
      <h4>Pictures</h4>
      <div class="ss-row">
        <label>Source <select class="text_pole" data-key="pictureSource">${options(Object.entries(PICTURE_SOURCES).map(([k, v]) => [k, v.label]), s.pictureSource)}</select></label>
        <label>Model <input class="text_pole" type="text" list="ss_models" data-key="pictureModel" placeholder="${DEFAULT_MODELS[s.pictureSource] || 'model id'}"></label>
        <label>Resolution <select class="text_pole" data-key="resolution">${options([['', 'Default'], ['1K', '1K'], ['2K', '2K']], s.resolution)}</select></label>
      </div>
      <datalist id="ss_models"></datalist>
      <label class="ss-custom">Custom API address <input class="text_pole" type="text" data-key="customUrl" placeholder="https://openrouter.ai/api/v1"></label>
      <label>API key <small>(kept in SillyTavern's secret store for the chosen source)</small></label>
      <div class="flex-container">
        <input id="ss_key" class="text_pole flex1" type="password" autocomplete="off" placeholder="Paste a key to save it">
        <div id="ss_key_save" class="menu_button">Save</div>
        <div id="ss_models_load" class="menu_button">Load models</div>
      </div>
      <label class="checkbox_label"><input type="checkbox" data-key="autoSprites"> Make sprites for a character the first time she appears</label>
      <label class="checkbox_label"><input type="checkbox" data-key="autoBackgrounds"> Paint a place's background the first time you enter it</label>
      <small>Sprites are cut from a 3×2 expression sheet drawn from the card's avatar; feet cards and backgrounds are made from the Cast and Scene tabs.</small>
    </div>
  </div>
</div>`;
}

function fillProfiles(select) {
    let profiles = null;
    try { profiles = ctx().ConnectionManagerRequestService?.getSupportedProfiles() ?? []; } catch { profiles = null; }
    const current = cfg().profile;
    const pairs = [['', 'Same as the chat connection'], ...(profiles ?? []).map((p) => [p.id, p.name])];
    if (current && !pairs.some(([id]) => id === current)) pairs.push([current, '(missing profile)']);
    select.innerHTML = options(pairs, current);
    select.disabled = profiles === null;
}

function bindSettings(root) {
    const s = cfg();
    const syncCustom = () => root.querySelector('.ss-custom').classList.toggle('displayNone', cfg().pictureSource !== 'custom');
    for (const input of root.querySelectorAll('[data-key]')) {
        const key = input.dataset.key;
        if (input.type === 'checkbox') input.checked = Boolean(s[key]);
        else input.value = s[key] ?? '';
        input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' || input.type === 'range' ? 'change' : 'input', () => {
            cfg()[key] = input.type === 'checkbox' ? input.checked : (input.type === 'number' || input.type === 'range') ? Number(input.value) : input.value;
            if (key === 'pictureSource') { syncCustom(); root.querySelector('[data-key="pictureModel"]').placeholder = DEFAULT_MODELS[cfg().pictureSource] || 'model id'; }
            save();
            if (['enabled', 'cruelty', 'smell', 'lethal', 'length', 'injectPosition', 'injectDepth', 'injectRole'].includes(key)) updateInjection();
        });
    }
    syncCustom();
    const profile = root.querySelector('#ss_profile');
    fillProfiles(profile);
    profile.addEventListener('focus', () => fillProfiles(profile));
    root.querySelector('#ss_open').addEventListener('click', () => setPanelOpen(true));
    root.querySelector('#ss_key_save').addEventListener('click', async () => {
        const field = root.querySelector('#ss_key');
        const secret = PICTURE_SOURCES[cfg().pictureSource]?.secret;
        if (!field.value.trim() || !secret) return;
        const res = await post('/api/secrets/write', { key: secret, value: field.value.trim(), label: FOLDER });
        if (!res.ok) { toast('error', `SillyTavern refused the key (${res.status})`); return; }
        field.value = '';
        const c = ctx();
        if (c.eventTypes?.SECRET_WRITTEN) c.eventSource.emit(c.eventTypes.SECRET_WRITTEN, secret);
        toast('success', 'Key saved.');
    });
    root.querySelector('#ss_models_load').addEventListener('click', async () => {
        const source = cfg().pictureSource;
        const req = modelsRequest(source, { customUrl: cfg().customUrl });
        if (!req) return;
        try {
            const res = await post(req.url, req.body);
            const list = readModels(source, res.ok ? await res.json() : null);
            root.querySelector('#ss_models').innerHTML = list.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
            toast(list.length ? 'success' : 'warning', list.length ? `${list.length} models loaded; pick one in the Model box.` : 'No models came back (is the key saved?).');
        } catch (err) { toast('error', err.message); }
    });
}

// ------------------------------------------------------------------ init

function init() {
    cfg();
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = settingsHtml();
    const root = wrapper.firstElementChild;
    container?.append(root);
    bindSettings(root);
    addMenu();
    registerCommands();
    const { eventSource, event_types } = ctx();
    eventSource.on(event_types.CHAT_CHANGED, loadChat);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    for (const ev of ['MESSAGE_SWIPED', 'MESSAGE_EDITED']) if (event_types[ev]) eventSource.on(event_types[ev], onMessageChanged);
    if (cfg().panel.open) setPanelOpen(true);
    loadChat();
    console.log(LOG, 'loaded');
}

if (typeof jQuery === 'function') jQuery(init);
