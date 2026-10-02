// The sheet window: meters, attributes, money, items, conditions, the giants you know (with a to-scale
// drawing and the numbers), and the log. Draggable, collapsible. Talks to the app through callbacks
// and reads everything from app.view() on each refresh.

import { ATTRS, ATTR_HELP } from './dice.js';
import { METERS, METER_HELP, levelFor, XP_PER_LEVEL } from './sheet.js';
import { SIZE_CLASSES, ftIn, len, scaleOf, sizeLine } from './size.js';
import { ART_H, ART_W, drawScale } from './scaleart.js';

export function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
}
const btn = (text, title, onclick, cls = '') => el('button', { type: 'button', class: `sf-btn ${cls}`, title, onclick }, text);

export class Panel {
    constructor(app, prefs = {}) {
        this.app = app;
        this.prefs = prefs;
        this.selected = null; // npc id for the scale drawing
        this.tab = prefs.tab || 'sheet';
        this.root = el('div', { class: 'sf-panel', id: 'sf_panel' });
        this.tick = 0;
    }

    mount(parent) {
        const header = el('div', { class: 'sf-header' },
            el('span', { class: 'sf-title' }, '🧍 Smallfolk'),
            this.sub = el('span', { class: 'sf-sub' }),
            el('span', { class: 'sf-spacer' }),
            btn('–', 'Collapse', () => this.toggleCollapse()),
            btn('×', 'Close', () => this.app.onClose()));
        this.tabs = el('div', { class: 'sf-tabs' }, ...['sheet', 'bag', 'giants', 'log'].map((t) => el('button', { type: 'button', class: 'sf-tab', dataset: { tab: t }, onclick: () => { this.tab = t; this.prefs.tab = t; this.app.onPrefs(this.prefs); this.refresh(); } }, t)));
        this.body = el('div', { class: 'sf-body' });
        this.status = el('div', { class: 'sf-status' });
        this.root.append(header, this.tabs, this.body, this.status);
        const p = this.prefs;
        if (p.left !== undefined) Object.assign(this.root.style, { left: `${p.left}px`, top: `${p.top}px`, right: 'auto' });
        if (p.width) this.root.style.width = `${p.width}px`;
        if (p.collapsed) this.root.classList.add('sf-collapsed');
        parent.append(this.root);
        this._drag(header);
        this.root.addEventListener('pointerup', () => this._savePos());
        this.refresh();
    }

    _drag(handle) {
        let start = null;
        handle.addEventListener('pointerdown', (ev) => {
            if (ev.target.closest('button')) return;
            const r = this.root.getBoundingClientRect();
            start = { x: ev.clientX - r.left, y: ev.clientY - r.top };
            handle.setPointerCapture(ev.pointerId);
        });
        handle.addEventListener('pointermove', (ev) => {
            if (!start) return;
            Object.assign(this.root.style, { left: `${Math.max(0, ev.clientX - start.x)}px`, top: `${Math.max(0, ev.clientY - start.y)}px`, right: 'auto' });
        });
        handle.addEventListener('pointerup', () => { start = null; this._savePos(); });
    }
    _savePos() {
        const r = this.root.getBoundingClientRect();
        Object.assign(this.prefs, { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) });
        this.app.onPrefs(this.prefs);
    }
    toggleCollapse(force) {
        const on = force ?? !this.root.classList.contains('sf-collapsed');
        this.root.classList.toggle('sf-collapsed', on);
        this.prefs.collapsed = on;
        this.app.onPrefs(this.prefs);
    }
    show() { this.root.style.display = ''; this.refresh(); }
    hide() { this.root.style.display = 'none'; }
    get isOpen() { return this.root.isConnected && this.root.style.display !== 'none'; }
    setStatus(text) { this.status.textContent = text || ''; }

    refresh() {
        if (!this.isOpen) return;
        const v = this.app.view();
        this.tabs.querySelectorAll('.sf-tab').forEach((b) => b.classList.toggle('sf-on', b.dataset.tab === this.tab));
        const s = v.sheet;
        this.sub.textContent = s ? `${s.name} · ${ftIn(s.height_cm)} · ${v.moneyText}` : '';
        this.body.replaceChildren();
        if (!s) { this.body.append(el('div', { class: 'sf-empty' }, v.hint || 'Open a chat to start a sheet.', el('div', {}, btn('Start a sheet', 'New sheet for this chat', () => this.app.onNew(), 'sf-primary')))); return; }
        const draw = { sheet: () => this.sheetTab(v), bag: () => this.bagTab(v), giants: () => this.giantsTab(v), log: () => this.logTab(v) }[this.tab] || (() => this.sheetTab(v));
        draw();
    }

    // -------------------------------------------------------------- sheet
    sheetTab(v) {
        const s = v.sheet;
        const name = el('input', { class: 'sf-input sf-name', value: s.name, title: 'Your name on the sheet', onchange: (e) => this.app.onEdit('name', e.target.value) });
        const height = el('input', { class: 'sf-input sf-num', type: 'number', min: 30, max: 300, value: s.height_cm, title: 'Your height in cm (91 cm is 3 ft)', onchange: (e) => this.app.onEdit('height_cm', Number(e.target.value)) });
        this.body.append(el('div', { class: 'sf-row sf-ident' }, name, el('label', {}, 'cm ', height), el('span', { class: 'sf-tag' }, `level ${levelFor(s.xp)}`)));
        const meters = el('div', { class: 'sf-meters' });
        for (const m of METERS) {
            const { cur, max } = s.meters[m];
            const pct = Math.round((cur / max) * 100);
            meters.append(el('div', { class: `sf-meter sf-${m}`, title: METER_HELP[m] },
                el('span', { class: 'sf-meter-name' }, m),
                el('div', { class: 'sf-bar' }, el('div', { class: 'sf-fill', style: { width: `${pct}%` } }), el('span', { class: 'sf-bar-text' }, `${cur}/${max}`)),
                btn('−', `${m} −1`, () => this.app.onMeter(m, -1)), btn('+', `${m} +1`, () => this.app.onMeter(m, +1)),
                el('input', { class: 'sf-input sf-num sf-max', type: 'number', min: 1, max: 999, value: max, title: `${m} maximum`, onchange: (e) => this.app.onMeterMax(m, Number(e.target.value)) })));
        }
        this.body.append(meters);
        const xpPct = Math.round(((s.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100);
        this.body.append(el('div', { class: 'sf-xp', title: `${s.xp} xp; ${XP_PER_LEVEL} per level` }, el('span', { class: 'sf-meter-name' }, 'xp'), el('div', { class: 'sf-bar' }, el('div', { class: 'sf-fill', style: { width: `${xpPct}%` } }), el('span', { class: 'sf-bar-text' }, `${s.xp % XP_PER_LEVEL}/${XP_PER_LEVEL}`)), btn('+5', 'xp +5', () => this.app.onXp(5))));
        const attrs = el('div', { class: 'sf-attrs' });
        for (const a of ATTRS) {
            attrs.append(el('div', { class: 'sf-attr', title: ATTR_HELP[a] }, el('span', { class: 'sf-attr-name' }, a), el('b', {}, `+${s.attrs[a]}`),
                s.points > 0 ? btn('▲', `Spend a point on ${a}`, () => this.app.onSpend(a), 'sf-mini') : el('span', { class: 'sf-dots' }, '●'.repeat(Math.min(9, s.attrs[a])))));
        }
        this.body.append(attrs);
        if (s.points > 0) this.body.append(el('div', { class: 'sf-note sf-good' }, `${s.points} attribute point${s.points > 1 ? 's' : ''} to spend.`));
        this.body.append(el('div', { class: 'sf-row' },
            el('label', { class: 'sf-money' }, s.currency, el('input', { class: 'sf-input sf-num sf-money-in', type: 'number', min: 0, step: '0.5', value: s.money, onchange: (e) => this.app.onEdit('money', Number(e.target.value)) })),
            btn('−5', '', () => this.app.onMoney(-5)), btn('+5', '', () => this.app.onMoney(5)), btn('+20', '', () => this.app.onMoney(20)),
            v.roll ? el('span', { class: 'sf-tag sf-dice', title: 'The d20 the model gets for your next action' }, `🎲 ${v.roll}`) : null));
        const conds = el('div', { class: 'sf-conds' }, ...s.conditions.map((c) => el('span', { class: 'sf-cond', title: 'Click to clear', onclick: () => this.app.onCond(c, false) }, c, ' ×')),
            el('input', { class: 'sf-input sf-cond-in', placeholder: '+ condition', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { this.app.onCond(e.target.value.trim(), true); e.target.value = ''; } } }));
        this.body.append(conds);
        this.body.append(el('div', { class: 'sf-row sf-where' },
            el('input', { class: 'sf-input', value: s.clock, placeholder: 'time (Day 1, morning)', onchange: (e) => this.app.onEdit('clock', e.target.value) }),
            el('input', { class: 'sf-input sf-grow', value: s.place, placeholder: 'where you are', onchange: (e) => this.app.onEdit('place', e.target.value) })));
        if (s.notes.length) this.body.append(el('div', { class: 'sf-notes' }, ...s.notes.map((n, i) => el('div', { class: 'sf-note-line' }, n, btn('×', 'Forget', () => this.app.onNoteRemove(i), 'sf-mini')))));
        this.body.append(el('div', { class: 'sf-row sf-actions' }, btn('↶ Undo', 'Undo the last change', () => this.app.onUndo()), btn('Rest', 'Restore the meters (a night of sleep)', () => this.app.onRest()), btn('New sheet', 'Start this chat over', () => this.app.onNew(), 'sf-danger')));
    }

    // -------------------------------------------------------------- bag
    bagTab(v) {
        const s = v.sheet;
        const list = el('div', { class: 'sf-items' });
        if (!s.items.length) list.append(el('div', { class: 'sf-empty' }, 'Nothing but the clothes on your back.'));
        for (const it of s.items) {
            list.append(el('div', { class: 'sf-item' },
                el('span', { class: 'sf-item-name' }, it.name), el('span', { class: 'sf-item-qty' }, `×${it.qty}`),
                el('input', { class: 'sf-input sf-grow sf-item-note', value: it.note, placeholder: 'note', onchange: (e) => this.app.onItemNote(it.id, e.target.value) }),
                btn('−', 'One fewer', () => this.app.onItem(it.name, -1)), btn('+', 'One more', () => this.app.onItem(it.name, +1)), btn('×', 'Drop all', () => this.app.onItem(it.name, -it.qty), 'sf-danger')));
        }
        const name = el('input', { class: 'sf-input sf-grow', placeholder: 'item' });
        const qty = el('input', { class: 'sf-input sf-num', type: 'number', min: 1, value: 1 });
        const note = el('input', { class: 'sf-input sf-grow', placeholder: 'note' });
        const add = () => { if (name.value.trim()) { this.app.onItem(name.value.trim(), Number(qty.value) || 1, note.value.trim()); name.value = ''; note.value = ''; qty.value = 1; } };
        for (const i of [name, note]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        this.body.append(el('div', { class: 'sf-row' }, el('b', {}, `${s.currency}${s.money}`), el('span', { class: 'sf-dim' }, ` · ${s.items.reduce((a, i) => a + i.qty, 0)} things`)), list, el('div', { class: 'sf-row sf-add' }, name, qty, note, btn('Add', 'Add the item', add, 'sf-primary')));
    }

    // -------------------------------------------------------------- giants
    giantsTab(v) {
        const list = v.npcs;
        if (this.selected && !list.some((n) => n.id === this.selected)) this.selected = null;
        if (!this.selected) this.selected = (list.find((n) => n.card) ?? list[0])?.id ?? null;
        const npc = list.find((n) => n.id === this.selected) ?? null;
        const canvas = el('canvas', { class: 'sf-art', width: ART_W, height: ART_H });
        drawScale(canvas, { npc, playerCm: v.sheet.height_cm, user: v.sheet.name, tick: this.tick });
        this.body.append(canvas);
        if (npc) {
            const sc = scaleOf(npc.height_cm, v.sheet.height_cm);
            const facts = el('div', { class: 'sf-facts' });
            for (const f of [...sc.body, ...sc.things]) facts.append(el('div', { class: 'sf-fact' }, el('span', { class: 'sf-fact-name' }, f.name), el('span', {}, len(f.cm)), el('span', { class: 'sf-dim' }, f.vs)));
            this.body.append(el('details', { class: 'sf-details' }, el('summary', {}, `${npc.name}: the numbers`), facts));
        }
        const roster = el('div', { class: 'sf-npcs' });
        if (!list.length) roster.append(el('div', { class: 'sf-empty' }, 'No giants yet. They are added when the story names one (or add one below).'));
        for (const n of list) {
            const cls = el('select', { class: 'sf-input sf-class', title: 'Pin her class (her height is re-rolled inside it)', onchange: (e) => this.app.onNpcClass(n.id, Number(e.target.value)) }, ...SIZE_CLASSES.map((c) => el('option', { value: c.n, selected: c.n === n.size_class }, `${c.n} ${c.name}`)));
            roster.append(el('div', { class: `sf-npc${n.id === this.selected ? ' sf-on' : ''}${n.card ? ' sf-card' : ''}`, onclick: (e) => { if (e.target.closest('input, select, button')) return; this.selected = n.id; this.refresh(); } },
                el('div', { class: 'sf-npc-head' }, el('b', {}, n.name), el('span', { class: 'sf-dim' }, ` ${sizeLine(n, v.sheet.height_cm)}`), el('span', { class: 'sf-spacer' }), cls, btn('🎲', 'Re-roll her height', () => this.app.onNpcReroll(n.id), 'sf-mini'), btn('×', 'Forget her', () => this.app.onNpcRemove(n.id), 'sf-mini sf-danger')),
                el('div', { class: 'sf-row' }, el('input', { class: 'sf-input sf-grow', value: n.relation, placeholder: 'relation (owes you; thinks you are a pet)', onchange: (e) => this.app.onNpcEdit(n.id, 'relation', e.target.value) })),
                el('div', { class: 'sf-row' }, el('input', { class: 'sf-input sf-grow', value: n.note, placeholder: 'note', onchange: (e) => this.app.onNpcEdit(n.id, 'note', e.target.value) }))));
        }
        this.body.append(roster);
        const name = el('input', { class: 'sf-input sf-grow', placeholder: 'name a giant' });
        const pick = el('select', { class: 'sf-input sf-class' }, el('option', { value: '' }, 'roll class'), ...SIZE_CLASSES.map((c) => el('option', { value: c.n }, `${c.n} ${c.name}`)));
        const add = () => { if (name.value.trim()) { this.app.onNpcAdd(name.value.trim(), Number(pick.value) || null); name.value = ''; } };
        name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        this.body.append(el('div', { class: 'sf-row sf-add' }, name, pick, btn('Add', 'Add her', add, 'sf-primary')));
    }

    // -------------------------------------------------------------- log
    logTab(v) {
        const box = el('div', { class: 'sf-log' });
        for (const line of [...(v.log ?? [])].reverse()) box.append(el('div', { class: 'sf-log-line' }, line));
        if (!v.log?.length) box.append(el('div', { class: 'sf-empty' }, 'Nothing yet.'));
        this.body.append(box);
        if (v.checks?.length) this.body.append(el('div', { class: 'sf-note' }, `Checks: ${v.checks.slice(-5).join('; ')}`));
    }
}
