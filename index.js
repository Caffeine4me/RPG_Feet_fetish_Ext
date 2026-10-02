// Smallfolk: play a three-foot-tall man in a world of giants. The extension keeps the sheet (meters,
// attributes, money, items, conditions), a roster of the giants he meets with their rolled sizes, and
// the turn's dice, feeds all of it to the model every generation, and reads the model's bookkeeping
// tags back out of each reply. The story itself is the chat.

import { num, str } from './src/json.js';
import { ATTRS, d20, rng } from './src/dice.js';
import { METERS, changeItem, changeMeter, createSheet, moneyText, normalizeSheet, setCondition, spendPoint, addXp } from './src/sheet.js';
import { findNpc, normalizeNpc, upsertNpc } from './src/npcs.js';
import { applyTags, parseTags } from './src/tags.js';
import { buildPrompt } from './src/prompt.js';
import { SIZE_CLASSES, heightFor } from './src/size.js';
import { Panel } from './src/panel.js';
import { decorateMessage, undecorate } from './src/chatview.js';

const NAME = 'smallfolk';
const META_KEY = 'smallfolk';
const PROMPT_KEY = 'smallfolk_sheet';
const LOG = '[Smallfolk]';

const DEFAULTS = {
    enabled: true,
    autoStart: true, // start a sheet when a chat opens
    autoOpen: false, // open the window when a chat with a sheet opens
    heightCm: 91, // 3 ft
    currency: '$',
    startMoney: 20,
    cardClass: 'roll', // size class for the character card: 'roll' or 1-6
    dice: true,
    hideTags: true,
    maxNpcs: 8,
    world: '',
    injectPosition: 1, injectDepth: 1, injectRole: 0,
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
const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, 'Smallfolk');

let panel = null;
const undo = [];

// ------------------------------------------------------------------ game data in the chat

const hasChat = () => { const c = ctx(); return Boolean(c.chat && ((c.characterId !== undefined && c.characterId !== null) || c.groupId)); };
function game() { return hasChat() ? ctx().chatMetadata?.[META_KEY] ?? null : null; }

function cards() {
    const c = ctx();
    if (c.groupId) {
        const group = c.groups?.find((g) => g.id === c.groupId);
        const off = new Set(group?.disabled_members ?? []);
        return (group?.members ?? []).filter((a) => !off.has(a)).map((a) => c.characters.find((ch) => ch.avatar === a)).filter(Boolean);
    }
    const card = c.characters?.[c.characterId];
    return card ? [card] : [];
}

function log(text) {
    const g = game();
    console.debug(LOG, text);
    if (g) g.log = [...(g.log ?? []).slice(-199), `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${text}`];
}

function commit() {
    const c = ctx();
    if (game()) (c.saveMetadataDebounced ?? c.saveMetadata)?.call(c);
    updateInjection();
    panel?.refresh();
}

const snapshot = (g) => JSON.stringify({ sheet: g.sheet, npcs: g.npcs, checks: g.checks ?? [] });
function restore(g, snap) { const d = JSON.parse(snap); g.sheet = d.sheet; g.npcs = d.npcs; g.checks = d.checks; }
function remember() { const g = game(); if (g) { undo.push(snapshot(g)); if (undo.length > 30) undo.shift(); } }

function newGame() {
    if (!hasChat()) { toast('warning', 'Open a chat first.'); return; }
    const c = ctx();
    const s = cfg();
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const r = rng(seed);
    const g = { sheet: createSheet({ name: c.name1 || 'You', heightCm: s.heightCm, money: s.startMoney, currency: s.currency }), npcs: [], turn: 0, roll: null, seed, log: [], checks: [], applied: null };
    for (const card of cards()) upsertNpc(g.npcs, { name: card.name, cls: s.cardClass === 'roll' ? null : Number(s.cardClass), card: true }, r);
    c.chatMetadata[META_KEY] = g;
    undo.length = 0;
    log(`New sheet for ${g.sheet.name}${g.npcs.length ? `; ${g.npcs.map((n) => `${n.name} is class ${n.size_class}`).join(', ')}` : ''}.`);
    commit();
    return g;
}

/** Make sure the game has every field this version expects. */
function upgrade(g) {
    g.sheet = normalizeSheet(g.sheet);
    g.npcs = (g.npcs ?? []).map(normalizeNpc).filter(Boolean);
    g.turn = num(g.turn, 0, 1e9, 0);
    g.seed = num(g.seed, 1, 4294967295, 1);
    g.log ??= []; g.checks ??= []; g.applied ??= null;
    if (g.roll !== null && g.roll !== undefined) g.roll = num(g.roll, 1, 20, null);
    return g;
}

// ------------------------------------------------------------------ prompt injection

async function setPrompt(text) {
    const s = cfg();
    let fn = ctx().setExtensionPrompt;
    if (typeof fn !== 'function') ({ setExtensionPrompt: fn } = await import('../../../../script.js'));
    fn(PROMPT_KEY, text, Number(s.injectPosition), Number(s.injectDepth), false, Number(s.injectRole));
}

function promptText() {
    const g = game();
    const s = cfg();
    if (!g || !s.enabled) return '';
    return buildPrompt({ sheet: g.sheet, npcs: g.npcs, roll: s.dice ? g.roll : null, checks: g.checks, user: ctx().name1 || g.sheet.name, settings: { world: str(s.world, 1500), maxNpcs: s.maxNpcs } });
}

function updateInjection() {
    setPrompt(promptText()).catch((e) => console.error(LOG, 'Could not set the prompt', e));
}

/** A fresh d20 for the coming turn (seeded by the chat's seed and the turn number). */
function rollTurn(g) {
    g.roll = d20(rng(g.seed + g.turn * 7919)());
}

globalThis.smallfolkInterceptor = async function smallfolkInterceptor(_chat, _size, _abort, type) {
    const g = game();
    if (!g || !cfg().enabled) return;
    if (type !== 'quiet' && type !== 'impersonate' && (g.roll === null || g.roll === undefined)) rollTurn(g);
    await setPrompt(promptText());
};

// ------------------------------------------------------------------ chat events

function onMessageSent() {
    const g = game();
    if (!g) return;
    g.turn += 1;
    rollTurn(g);
    commit();
}

function onMessageReceived(id) {
    const g = game();
    const c = ctx();
    const msg = c.chat?.[id];
    if (!g || !msg || msg.is_user || msg.is_system) return;
    const text = msg.mes || '';
    // A swipe or an edit of the message we already applied: roll it back first, then apply the new text.
    if (g.applied && g.applied.id === id && g.applied.snap) restore(g, g.applied.snap);
    const snap = snapshot(g);
    const tags = parseTags(text);
    if (tags.length) {
        remember();
        const lines = applyTags(g, tags, { r: rng((g.seed ^ (id * 2654435761)) >>> 0) });
        for (const l of lines) log(l.text);
        g.applied = { id, snap };
        commit();
    } else if (g.applied?.id === id) { g.applied = { id, snap }; commit(); }
    setTimeout(() => decorate(id), 30);
}

function onMessageChanged(id) {
    setTimeout(() => onMessageReceived(Number(id)), 10);
}

function decorate(id) {
    const c = ctx();
    const msg = c.chat?.[Number(id)];
    const root = document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
    if (!root || !msg) return;
    if (msg.is_user || !game()) { undecorate(root); return; }
    decorateMessage(root, msg.mes || '', { currency: game().sheet.currency, hide: cfg().hideTags });
}
function decorateAll() { document.querySelectorAll('#chat .mes[mesid]').forEach((n) => decorate(n.getAttribute('mesid'))); }

function loadChat() {
    const g = game();
    if (g) upgrade(g);
    else if (hasChat() && cfg().enabled && cfg().autoStart) newGame();
    undo.length = 0;
    updateInjection();
    panel?.refresh();
    if (game() && cfg().autoOpen && !panel?.isOpen) setPanelOpen(true);
    setTimeout(decorateAll, 100);
}

// ------------------------------------------------------------------ actions for the panel and commands

const actions = {
    view() {
        const g = game();
        return { sheet: g?.sheet ?? null, npcs: g?.npcs ?? [], log: g?.log ?? [], checks: g?.checks ?? [], roll: cfg().dice ? g?.roll ?? null : null, moneyText: g ? moneyText(g.sheet) : '', hint: hasChat() ? 'No sheet in this chat yet.' : 'Open a chat first.' };
    },
    onPrefs(p) { cfg().panel = { ...cfg().panel, ...p }; save(); },
    onClose() { setPanelOpen(false); },
    onNew() { newGame(); },
    onUndo() { const g = game(); if (!g || !undo.length) return; restore(g, undo.pop()); log('Undid the last change.'); commit(); },
    onRest() { const g = game(); if (!g) return; remember(); for (const m of METERS) g.sheet.meters[m].cur = g.sheet.meters[m].max; log('Rested: meters restored.'); commit(); },
    onMeter(m, d) { const g = game(); if (!g) return; remember(); changeMeter(g.sheet, m, d); commit(); },
    onMeterMax(m, v) { const g = game(); if (!g) return; remember(); g.sheet.meters[m].max = num(v, 1, 999, 10); g.sheet.meters[m].cur = Math.min(g.sheet.meters[m].cur, g.sheet.meters[m].max); commit(); },
    onXp(n) { const g = game(); if (!g) return; remember(); const lv = addXp(g.sheet, n); if (lv) log(`Level up: ${lv} point${lv > 1 ? 's' : ''} to spend.`); commit(); },
    onSpend(a) { const g = game(); if (!g) return; remember(); spendPoint(g.sheet, a); commit(); },
    onMoney(d) { const g = game(); if (!g) return; remember(); g.sheet.money = Math.max(0, Math.round((g.sheet.money + d) * 100) / 100); commit(); },
    onEdit(field, value) {
        const g = game(); if (!g) return; remember();
        if (field === 'name') g.sheet.name = str(value, 60) || g.sheet.name;
        else if (field === 'height_cm') g.sheet.height_cm = num(value, 30, 300, g.sheet.height_cm);
        else if (field === 'money') g.sheet.money = num(value, 0, 1e9, g.sheet.money);
        else if (field === 'clock') g.sheet.clock = str(value, 60);
        else if (field === 'place') g.sheet.place = str(value, 120);
        commit();
    },
    onCond(name, on) { const g = game(); if (!g) return; remember(); setCondition(g.sheet, name, on); commit(); },
    onItem(name, qty, note = '') { const g = game(); if (!g) return; remember(); changeItem(g.sheet, name, qty, note); commit(); },
    onItemNote(id, note) { const g = game(); const it = g?.sheet.items.find((i) => i.id === id); if (!it) return; it.note = str(note, 120); commit(); },
    onNoteRemove(i) { const g = game(); if (!g) return; remember(); g.sheet.notes.splice(i, 1); commit(); },
    onNpcAdd(name, cls) { const g = game(); if (!g) return; remember(); const { npc } = upsertNpc(g.npcs, { name, cls, turn: g.turn }, rng(Date.now() >>> 0)); log(`Added ${npc.name}, class ${npc.size_class}.`); commit(); },
    onNpcClass(id, cls) { const g = game(); const n = g?.npcs.find((x) => x.id === id); if (!n) return; remember(); n.size_class = cls; n.height_cm = heightFor(cls, Math.random()); commit(); },
    onNpcReroll(id) { const g = game(); const n = g?.npcs.find((x) => x.id === id); if (!n) return; remember(); n.height_cm = heightFor(n.size_class, Math.random()); commit(); },
    onNpcRemove(id) { const g = game(); if (!g) return; remember(); g.npcs = g.npcs.filter((x) => x.id !== id); commit(); },
    onNpcEdit(id, field, value) { const g = game(); const n = g?.npcs.find((x) => x.id === id); if (!n) return; n[field] = str(value, field === 'note' ? 300 : 120); commit(); },
};

// ------------------------------------------------------------------ window, menu, commands

function setPanelOpen(open) {
    if (open && !panel) { panel = new Panel(actions, cfg().panel); panel.mount(document.body); }
    if (panel) { if (open) panel.show(); else panel.hide(); }
    cfg().panel.open = open;
    save();
}
const togglePanel = () => setPanelOpen(!(panel?.isOpen));

function addMenu() {
    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById('sf_menu_button')) {
        const item = document.createElement('div');
        item.id = 'sf_menu_button';
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<div class="fa-solid fa-person extensionsMenuExtensionButton"></div>Smallfolk sheet';
        item.addEventListener('click', togglePanel);
        menu.append(item);
    }
}

function registerCommands() {
    const c = ctx();
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = c;
    const help = 'Smallfolk: <code>/sf</code> opens the sheet; <code>/sf new</code> starts over; <code>/sf health -2</code>, <code>/sf stamina +1</code>, <code>/sf nerve -1</code>, <code>/sf money +5</code>, <code>/sf item +rope x2</code>, <code>/sf item -rope</code>, <code>/sf cond +soaked</code>, <code>/sf xp +10</code>, <code>/sf npc Mara class 3</code>, <code>/sf time Day 2, evening</code>, <code>/sf place under the table</code>, <code>/sf note ...</code>, <code>/sf rest</code>, <code>/sf undo</code>, <code>/sf roll</code>.';
    const callback = async (_args, value) => {
        const [cmd, ...rest] = String(value ?? '').trim().split(/\s+/);
        const arg = rest.join(' ');
        const g = game();
        const word = (cmd || '').toLowerCase();
        switch (word) {
            case '': togglePanel(); return '';
            case 'new': newGame(); return '';
            case 'rest': actions.onRest(); return '';
            case 'undo': actions.onUndo(); return '';
            case 'roll': if (g) { g.roll = d20(Math.random()); commit(); return String(g.roll); } return 'no sheet';
            case 'health': case 'hp': case 'stamina': case 'nerve': case 'money': case 'item': case 'cond': case 'xp': case 'npc': case 'time': case 'place': case 'note': case 'check': {
                if (!g) return 'no sheet';
                const tags = parseTags(`[${word.toUpperCase()} ${arg}]`);
                if (!tags.length) return `could not read "${arg}"`;
                remember();
                const lines = applyTags(g, tags, { r: rng(Date.now() >>> 0) });
                for (const l of lines) log(l.text);
                commit();
                return lines.map((l) => l.text).join('; ');
            }
            default: return help.replace(/<[^>]+>/g, '');
        }
    };
    try {
        if (SlashCommandParser?.addCommandObject && SlashCommand?.fromProps) {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'sf', callback, helpString: help, unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'new | health|stamina|nerve|money|xp ±n | item ±name [xN] | cond ±name | npc Name [class N] | time … | place … | note … | rest | undo | roll', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })] }));
        } else if (typeof c.registerSlashCommand === 'function') c.registerSlashCommand('sf', (a, v) => callback(a, v), [], help);
    } catch (err) { console.warn(LOG, 'Could not register /sf', err); }
}

// ------------------------------------------------------------------ settings

const options = (pairs, current) => pairs.map(([v, label]) => `<option value="${v}"${String(v) === String(current) ? ' selected' : ''}>${label}</option>`).join('');

function settingsHtml() {
    const s = cfg();
    return `
<div id="sf_settings" class="sf-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b><i class="fa-solid fa-person"></i> Smallfolk</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <small>You are a three-foot-tall man in a world of giants. The extension keeps your sheet (health, stamina, nerve, attributes, money, items, conditions) and a roster of the giants you meet with their sizes, rolled into six classes from 10 ft to 100 ft, the taller rarer. All of it goes into the prompt every turn, and the model's bookkeeping tags come back out into the sheet. Open the sheet from the wand menu or with <code>/sf</code>.</small>
      <div class="flex-container"><div id="sf_open" class="menu_button"><i class="fa-solid fa-person"></i> Open the sheet</div></div>
      <label class="checkbox_label"><input type="checkbox" data-key="enabled"> Enabled (injects the sheet and the world into the prompt)</label>
      <label class="checkbox_label"><input type="checkbox" data-key="autoStart"> Start a sheet when a chat opens</label>
      <label class="checkbox_label"><input type="checkbox" data-key="autoOpen"> Open the sheet window when a chat with a sheet opens</label>
      <label class="checkbox_label"><input type="checkbox" data-key="dice"> Give the model a d20 for each of your turns (uncertain actions use it)</label>
      <label class="checkbox_label"><input type="checkbox" data-key="hideTags"> Hide the bookkeeping tags in the chat (shown as small chips instead)</label>
      <h4>New sheets</h4>
      <div class="sf-row">
        <label>Your height, cm <input class="text_pole" type="number" min="30" max="300" data-key="heightCm"></label>
        <label>Currency <input class="text_pole" type="text" maxlength="8" data-key="currency"></label>
        <label>Starting money <input class="text_pole" type="number" min="0" data-key="startMoney"></label>
        <label>The character card's class <select class="text_pole" data-key="cardClass">${options([['roll', 'Roll it (rarer the taller)'], ...SIZE_CLASSES.map((c) => [c.n, `${c.n} ${c.name} (${c.ft[0]}-${c.ft[1]} ft)`])], s.cardClass)}</select></label>
      </div>
      <label>About the world (optional, goes into the prompt) <textarea class="text_pole" rows="2" data-key="world" placeholder="e.g. The town is Hollowmere, a river port. Money is the mark. Smallfolk are rare and most giants have never seen one."></textarea></label>
      <h4>Prompt</h4>
      <div class="sf-row">
        <label>Position <select class="text_pole" data-key="injectPosition">${options([[1, 'In chat at depth'], [0, 'After the story string'], [2, 'Before the story string']], s.injectPosition)}</select></label>
        <label>Depth <input type="number" class="text_pole" min="0" max="50" data-key="injectDepth"></label>
        <label>As <select class="text_pole" data-key="injectRole">${options([[0, 'System'], [1, 'User'], [2, 'Assistant']], s.injectRole)}</select></label>
        <label>Giants listed <input type="number" class="text_pole" min="1" max="30" data-key="maxNpcs"></label>
      </div>
    </div>
  </div>
</div>`;
}

function bindSettings(root) {
    const s = cfg();
    for (const input of root.querySelectorAll('[data-key]')) {
        const key = input.dataset.key;
        if (input.type === 'checkbox') input.checked = Boolean(s[key]);
        else input.value = s[key] ?? '';
        input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', () => {
            cfg()[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
            save();
            if (['enabled', 'dice', 'world', 'maxNpcs', 'injectPosition', 'injectDepth', 'injectRole'].includes(key)) updateInjection();
            if (key === 'hideTags') decorateAll();
            panel?.refresh();
        });
    }
    root.querySelector('#sf_open').addEventListener('click', () => setPanelOpen(true));
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
    for (const ev of ['CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'MESSAGE_UPDATED']) if (event_types[ev]) eventSource.on(event_types[ev], (id) => setTimeout(() => decorate(Number(id)), 30));
    if (event_types.MORE_MESSAGES_LOADED) eventSource.on(event_types.MORE_MESSAGES_LOADED, () => setTimeout(decorateAll, 50));
    if (cfg().panel.open) setPanelOpen(true);
    loadChat();
    console.log(LOG, 'loaded');
}

if (typeof jQuery === 'function') jQuery(init);
