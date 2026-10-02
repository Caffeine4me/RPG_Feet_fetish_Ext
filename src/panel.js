// The sheet window: meters, attributes, money, items, conditions, the giants you know (with a to-scale
// drawing and the numbers), and the log. Draggable, collapsible. Talks to the app through callbacks
// and reads everything from app.view() on each refresh.

import { ATTRS, ATTR_HELP } from './dice.js';
import { METERS, METER_HELP, levelFor, XP_PER_LEVEL } from './sheet.js';
import { SIZE_CLASSES, ftIn, len, scaleOf, sizeLine } from './size.js';
import { ART_H, ART_W, drawScale } from './scaleart.js';
import { clockText, weatherLine } from './clock.js';
import { KINDS, findPath, here, layout, routesFrom, smallMinutes } from './nav.js';
import { riskOf } from './danger.js';
import { drawMap, hitPlace, MAP_H, MAP_W } from './mapart.js';

let doc = globalThis.document; // the document the window lives in (a popout has its own)
export const setDocument = (d) => { doc = d; };

export function el(tag, attrs = {}, ...kids) {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : doc.createTextNode(String(kid)));
    return n;
}
const btn = (text, title, onclick, cls = '') => el('button', { type: 'button', class: `sf-btn ${cls}`, title, onclick }, text);

export class Panel {
    /**
     * @param app the callbacks and view()
     * @param prefs stored position and tab
     * @param o.popout true when the panel fills its own browser window (no drag, no collapse)
     */
    constructor(app, prefs = {}, { popout = false, document: d = globalThis.document } = {}) {
        this.app = app;
        this.prefs = prefs;
        this.popout = popout;
        setDocument(d);
        this.selected = null; // npc id for the scale drawing
        this.tab = prefs.tab || 'sheet';
        this.root = el('div', { class: `sf-panel${popout ? ' sf-popout' : ''}`, id: 'sf_panel' });
        this.tick = 0;
    }

    mount(parent) {
        setDocument(parent.ownerDocument);
        const header = el('div', { class: 'sf-header' },
            el('span', { class: 'sf-title' }, '🧍 Smallfolk'),
            this.sub = el('span', { class: 'sf-sub' }),
            el('span', { class: 'sf-spacer' }),
            btn(this.popout ? '⇲' : '⧉', this.popout ? 'Dock back into SillyTavern' : 'Open in its own window', () => this.app.onPopout(!this.popout)),
            this.popout ? null : btn('–', 'Collapse', () => this.toggleCollapse()),
            btn('×', 'Close', () => this.app.onClose()));
        this.dest = null; // chosen place on the map
        this.tabs = el('div', { class: 'sf-tabs' }, ...['sheet', 'map', 'bag', 'giants', 'log'].map((t) => el('button', { type: 'button', class: 'sf-tab', dataset: { tab: t }, onclick: () => { this.tab = t; this.prefs.tab = t; this.app.onPrefs(this.prefs); this.refresh(); } }, t)));
        this.body = el('div', { class: 'sf-body' });
        this.status = el('div', { class: 'sf-status' });
        this.root.append(header, this.tabs, this.body, this.status);
        const p = this.prefs;
        if (!this.popout) {
            if (p.left !== undefined) Object.assign(this.root.style, { left: `${p.left}px`, top: `${p.top}px`, right: 'auto' });
            if (p.width) this.root.style.width = `${p.width}px`;
            if (p.collapsed) this.root.classList.add('sf-collapsed');
            this._drag(header);
            this.root.addEventListener('pointerup', () => this._savePos());
        }
        parent.append(this.root);
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
        if (this.popout) return;
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
        const draw = { sheet: () => this.sheetTab(v), map: () => this.mapTab(v), bag: () => this.bagTab(v), giants: () => this.giantsTab(v), log: () => this.logTab(v) }[this.tab] || (() => this.sheetTab(v));
        draw();
    }

    // -------------------------------------------------------------- sheet
    card(title, ...kids) { return el('section', { class: 'sf-card' }, title ? el('h4', { class: 'sf-card-title' }, title) : null, ...kids); }

    sheetTab(v) {
        const s = v.sheet;
        const at = v.nav ? here(v.nav) : null;
        const risk = riskOf(at, { sheet: s, time: s.time, weather: v.weather });
        // now
        this.body.append(this.card(null,
            el('div', { class: 'sf-row sf-nowline' }, el('span', { class: 'sf-clock' }, clockText(s.time)), el('span', { class: 'sf-dim' }, weatherLine(v.weather).split(':')[0])),
            el('div', { class: 'sf-row' }, el('span', { class: 'sf-tag sf-where-tag', title: 'Where you are (set on the map tab)' }, `📍 ${at ? at.name : 'nowhere named'}`), el('input', { class: 'sf-input sf-grow', value: s.place, placeholder: 'the spot: under the table', onchange: (e) => this.app.onEdit('place', e.target.value) })),
            el('div', { class: 'sf-row' },
                el('span', { class: `sf-risk sf-risk-${risk.level.replace(/\s+/g, '-')}`, title: risk.factors.map(([t, n]) => `${t} ${n >= 0 ? '+' : ''}${n}`).join(', ') }, `${risk.level} · difficulty ${risk.dc}`),
                s.carried ? el('span', { class: 'sf-tag sf-carried', title: 'Click when she sets you down', onclick: () => this.app.onCarried(null) }, `✋ ${s.carried.by}${s.carried.where ? `: ${s.carried.where}` : ''} ×`) : null,
                v.roll ? el('span', { class: 'sf-tag sf-dice', title: 'The d20 the model gets for your next action' }, `🎲 ${v.roll}`) : null)));
        // vitals
        const meters = el('div', { class: 'sf-meters' });
        for (const m of METERS) {
            const { cur, max } = s.meters[m];
            meters.append(el('div', { class: `sf-meter sf-${m}`, title: `${m}: ${METER_HELP[m]}` },
                el('span', { class: 'sf-meter-name' }, m),
                el('div', { class: 'sf-bar' }, el('div', { class: 'sf-fill', style: { width: `${Math.round((cur / max) * 100)}%` } }), el('span', { class: 'sf-bar-text' }, `${cur}/${max}`)),
                el('span', { class: 'sf-pm' }, btn('−', `${m} −1`, () => this.app.onMeter(m, -1), 'sf-mini'), btn('+', `${m} +1`, () => this.app.onMeter(m, +1), 'sf-mini'))));
        }
        const conds = el('div', { class: 'sf-conds' },
            ...s.conditions.filter((c) => c !== 'carried').map((c) => el('span', { class: 'sf-cond', title: 'Click to clear', onclick: () => this.app.onCond(c, false) }, c, ' ×')),
            ...s.injuries.map((i) => el('span', { class: 'sf-cond sf-injury', title: `${i.attr} ${i.mod} until it heals; click to heal`, onclick: () => this.app.onHeal(i.name) }, `${i.name} ×`)),
            el('input', { class: 'sf-input sf-cond-in', placeholder: '+ condition', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { this.app.onCond(e.target.value.trim(), true); e.target.value = ''; } } }));
        this.body.append(this.card('Vitals', meters, conds));
        // self
        const attrs = el('div', { class: 'sf-attrs' });
        for (const a of ATTRS) attrs.append(el('div', { class: 'sf-attr', title: ATTR_HELP[a] }, el('span', { class: 'sf-attr-name' }, a), el('b', {}, `+${s.attrs[a]}`), s.points > 0 ? btn('▲', `Spend a point on ${a}`, () => this.app.onSpend(a), 'sf-mini sf-primary') : null));
        const xpPct = Math.round(((s.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100);
        this.body.append(this.card('You',
            el('div', { class: 'sf-row sf-ident' },
                el('input', { class: 'sf-input sf-name', value: s.name, title: 'Your name on the sheet', onchange: (e) => this.app.onEdit('name', e.target.value) }),
                el('label', { class: 'sf-dim', title: 'Your height in cm (91 cm is 3 ft)' }, el('input', { class: 'sf-input sf-num', type: 'number', min: 30, max: 300, value: s.height_cm, onchange: (e) => this.app.onEdit('height_cm', Number(e.target.value)) }), ' cm'),
                el('span', { class: 'sf-spacer' }),
                el('label', { class: 'sf-money' }, s.currency, el('input', { class: 'sf-input sf-num sf-money-in', type: 'number', min: 0, step: '0.5', value: s.money, onchange: (e) => this.app.onEdit('money', Number(e.target.value)) }))),
            el('div', { class: 'sf-row sf-xp', title: `${s.xp} xp; ${XP_PER_LEVEL} per level` }, el('span', { class: 'sf-meter-name' }, `level ${levelFor(s.xp)}`), el('div', { class: 'sf-bar' }, el('div', { class: 'sf-fill', style: { width: `${xpPct}%` } }), el('span', { class: 'sf-bar-text' }, `${s.xp % XP_PER_LEVEL}/${XP_PER_LEVEL} xp`)), s.points > 0 ? el('span', { class: 'sf-tag sf-good' }, `${s.points} point${s.points > 1 ? 's' : ''} to spend`) : null),
            attrs));
        if (s.notes.length) this.body.append(this.card('Remembered', el('div', { class: 'sf-notes' }, ...s.notes.map((n, i) => el('div', { class: 'sf-note-line' }, n, btn('×', 'Forget', () => this.app.onNoteRemove(i), 'sf-mini'))))));
        // actions
        this.body.append(el('div', { class: 'sf-bar-actions' },
            btn('🍞 Eat', 'Eat from your bag (food +4)', () => this.app.onEat()),
            btn('⏳ Wait 1 h', 'Let an hour pass here', () => this.app.onWait(60)),
            btn('🌙 Sleep', 'Sleep here until morning', () => this.app.onSleep()),
            el('span', { class: 'sf-spacer' }),
            btn('↶', 'Undo the last change', () => this.app.onUndo()),
            this.more([['Heal everything', () => this.app.onRest()], ['Add 5 xp', () => this.app.onXp(5)], ['New sheet (start over)', () => this.app.onNew()]])));
    }

    /** A small menu button with a list of actions. */
    more(items) {
        const menu = el('div', { class: 'sf-menu' }, ...items.map(([label, fn]) => el('button', { type: 'button', class: 'sf-menu-item', onclick: () => { menu.classList.remove('sf-open'); fn(); } }, label)));
        const wrap = el('span', { class: 'sf-more' }, btn('⋯', 'More', () => menu.classList.toggle('sf-open')), menu);
        return wrap;
    }

    // -------------------------------------------------------------- map
    mapTab(v) {
        const nav = v.nav;
        const s = v.sheet;
        layout(nav);
        const at = here(nav);
        if (this.dest && !nav.places.some((p) => p.id === this.dest)) this.dest = null;
        const path = at && this.dest && this.dest !== at.id ? findPath(nav, at.id, this.dest, s.height_cm) : null;
        const canvas = el('canvas', { class: 'sf-map', width: MAP_W, height: MAP_H });
        const env = { sheet: s, time: s.time, weather: v.weather };
        drawMap(canvas, nav, { at: at?.id ?? null, dest: this.dest, path, env });
        canvas.addEventListener('click', (e) => {
            const r = canvas.getBoundingClientRect();
            const p = hitPlace(nav, ((e.clientX - r.left) / r.width), ((e.clientY - r.top) / r.height));
            if (p) { this.dest = p.id === at?.id ? null : p.id; this.refresh(); }
        });
        this.body.append(canvas);
        this.body.append(el('div', { class: 'sf-row' }, el('span', { class: 'sf-clock' }, `🕑 ${clockText(s.time)}`), el('span', { class: 'sf-dim' }, ` · ${weatherLine(v.weather)}`)));
        if (!nav.places.length) this.body.append(el('div', { class: 'sf-empty' }, 'No places yet. The story maps them as you learn of them (MAP and ROUTE tags), or add one below.'));
        if (at) {
            const risk = riskOf(at, env);
            const ways = routesFrom(nav, at.id).map(({ route, to }) => ({ route, place: nav.places.find((q) => q.id === to) })).filter((w) => w.place);
            this.body.append(el('div', { class: 'sf-here' },
                el('div', {}, el('b', {}, at.name), el('span', { class: 'sf-dim' }, ` · ${KINDS[at.kind].label} · danger ${at.danger} · crowd ${at.crowd} · cover ${at.cover}`)),
                el('div', { class: `sf-risk sf-risk-${risk.level.replace(/\s+/g, '-')}`, title: risk.factors.map(([t, n]) => `${t} ${n >= 0 ? '+' : ''}${n}`).join(', ') }, `${risk.level} here (difficulty ${risk.dc})`),
                at.note ? el('div', { class: 'sf-dim' }, at.note) : null,
                ways.length ? el('div', { class: 'sf-ways' }, ...ways.map((w) => el('button', { type: 'button', class: `sf-way${this.dest === w.place.id ? ' sf-on' : ''}`, onclick: () => { this.dest = w.place.id; this.refresh(); } }, `${w.place.name} · ${smallMinutes(w.route.giantMin, s.height_cm)} min${w.route.hazards.length ? ` · ${w.route.hazards.join(', ')}` : ''}`))) : el('div', { class: 'sf-dim' }, 'No known way out of here.')));
        }
        const dest = nav.places.find((p) => p.id === this.dest);
        if (dest && at && dest !== at) {
            const total = path ? path.reduce((a, l) => a + l.minutes, 0) : null;
            const legs = path ? path.map((l) => { const p = nav.places.find((q) => q.id === l.to); return `${p?.name} (${l.minutes} min${l.route.hazards.length ? `; ${l.route.hazards.join(', ')}` : ''})`; }) : [];
            this.body.append(el('div', { class: 'sf-plan' },
                el('div', {}, el('b', {}, `To ${dest.name}`), path ? el('span', { class: 'sf-dim' }, ` · ${total} min on foot at your size, ${path.length} leg${path.length > 1 ? 's' : ''}`) : el('span', { class: 'sf-bad' }, ' · no known way there')),
                path ? el('div', { class: 'sf-dim' }, `via ${legs.join(' → ')}`) : null,
                el('div', { class: 'sf-row sf-actions' },
                    path ? btn('Go', 'Travel there: each leg is rolled against its hazards, time passes, and the story tells what happened', () => { this.app.onTravel(dest.id); this.dest = null; }, 'sf-primary') : null,
                    btn('Set as here', 'You are already there (no roll)', () => { this.app.onArrive(dest.id); this.dest = null; }),
                    btn('Link from here', 'Add a way from where you are to this place', () => this.app.onLink(at.id, dest.id)))));
        }
        const roster = el('details', { class: 'sf-details', open: nav.places.length <= 3 }, el('summary', {}, `${nav.places.length} places, ${nav.routes.length} ways`));
        for (const p of nav.places) {
            roster.append(el('div', { class: `sf-place${p.id === at?.id ? ' sf-on' : ''}` },
                el('span', { class: 'sf-place-name', onclick: () => { this.dest = p.id; this.refresh(); } }, p.name),
                el('select', { class: 'sf-input sf-kind', onchange: (e) => this.app.onPlaceEdit(p.id, 'kind', e.target.value) }, ...Object.entries(KINDS).map(([k, d]) => el('option', { value: k, selected: k === p.kind }, d.label))),
                el('label', { title: 'danger 0-5' }, 'D', el('input', { class: 'sf-input sf-tiny', type: 'number', min: 0, max: 5, value: p.danger, onchange: (e) => this.app.onPlaceEdit(p.id, 'danger', Number(e.target.value)) })),
                el('label', { title: 'crowd 0-3' }, 'C', el('input', { class: 'sf-input sf-tiny', type: 'number', min: 0, max: 3, value: p.crowd, onchange: (e) => this.app.onPlaceEdit(p.id, 'crowd', Number(e.target.value)) })),
                el('label', { title: 'cover 0-3' }, 'H', el('input', { class: 'sf-input sf-tiny', type: 'number', min: 0, max: 3, value: p.cover, onchange: (e) => this.app.onPlaceEdit(p.id, 'cover', Number(e.target.value)) })),
                btn('×', 'Forget this place', () => this.app.onPlaceRemove(p.id), 'sf-mini sf-danger')));
        }
        this.body.append(roster);
        const name = el('input', { class: 'sf-input sf-grow', placeholder: 'add a place' });
        const add = () => { if (name.value.trim()) { this.app.onPlaceAdd(name.value.trim()); name.value = ''; } };
        name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        this.body.append(el('div', { class: 'sf-row sf-add' }, name, btn('Add', 'Add the place', add, 'sf-primary')));
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
