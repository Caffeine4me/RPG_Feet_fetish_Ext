// The game window: a floating panel with the town map, the visual-novel scene, the cast, the journal
// and the gallery. It reads everything through `app.view()` and sends every action back through `app`.

import { BASE_H, BASE_W, drawTown, hitTest, layoutTown } from './map.js';
import { POV_H, POV_W, drawFeetPov } from './feetpov.js';
import { ARCHETYPES, DIALS, EXPRESSIONS, VERBS } from './sheet.js';
import { CHECKS } from './rules.js';
import { SLOTS, findLocation, typeOf, whoIsAt } from './world.js';
import { PLAYER_CM, classOf, sizeLine } from './size.js';

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return node;
}
const btn = (label, title, onclick, cls = '') => el('button', { class: `ss-btn menu_button ${cls}`, type: 'button', title, onclick }, label);
const iconBtn = (icon, title, onclick, cls = '') => el('button', { class: `ss-btn ss-icon menu_button ${cls}`, type: 'button', title, onclick }, el('i', { class: `fa-solid ${icon}` }));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const first = (name) => String(name || '').split(' ')[0];

const TABS = [['map', 'fa-map', 'Map'], ['scene', 'fa-comments', 'Scene'], ['cast', 'fa-users', 'Cast'], ['journal', 'fa-book', 'Journal'], ['gallery', 'fa-images', 'Gallery'], ['log', 'fa-scroll', 'Log']];

export class Panel {
    /**
     * @param {object} app see index.js: view(), onTravel, onWait, onSleep, onChoice, onFreeText, onVerb, onNewGame,
     *   onMakeSprites, onMakeFeet, onMakeBackground, onPicture, onEditDial, onLayout, onClose, onExport, onImport, onRewind
     * @param {object} [layout] saved { left, top, width, height, tab }
     */
    constructor(app, layout = {}) {
        this.app = app;
        this.layout = layout;
        this.tab = layout.tab || 'map';
        this.hover = null;
        this.tick = 0;
        this.lineIndex = null; // which dialogue line is shown; null = the last
        this.showAll = false;
        this.everyone = false;
        this.verbTarget = '';
        this.feetView = null; // null = automatic (on during foot service), true/false = forced
        this.maximized = false;
        this._build();
    }

    _build() {
        this.strip = el('span', { class: 'ss-strip' });
        this.status = el('div', { class: 'ss-status' });
        this.tabBar = el('div', { class: 'ss-tabs' }, ...TABS.map(([id, icon, label]) => el('button', { class: 'ss-tab menu_button', type: 'button', 'data-tab': id, onclick: () => this.setTab(id) }, el('i', { class: `fa-solid ${icon}` }), ` ${label}`)));
        this.body = el('div', { class: 'ss-body' });
        const header = el('div', { class: 'ss-header' },
            el('i', { class: 'fa-solid fa-socks' }), el('span', { class: 'ss-title', text: 'Sole Survivor' }), this.strip, el('div', { class: 'ss-spacer' }),
            iconBtn('fa-wand-magic-sparkles', 'New game: build a town around the character(s) in this chat', () => this.app.onNewGame()),
            iconBtn('fa-camera', 'A picture of this moment', () => this.app.onPicture()),
            iconBtn('fa-rotate-left', 'Rewind: undo the last turn (the chat message stays; the game state goes back)', () => this.app.onRewind()),
            iconBtn('fa-up-right-and-down-left-from-center', 'Full size', () => this.toggleMax()),
            iconBtn('fa-xmark', 'Close', () => this.app.onClose()),
        );
        this.root = el('div', { class: 'ss-panel', style: { display: 'none' } }, header, this.tabBar, this.body, this.status);
        this._drag(header);
        if (this.layout.width) Object.assign(this.root.style, { left: `${this.layout.left}px`, top: `${this.layout.top}px`, width: `${this.layout.width}px`, height: `${this.layout.height}px`, right: 'auto' });
        new ResizeObserver(() => this._saveLayout()).observe(this.root);
    }

    _drag(handle) {
        let start = null;
        handle.addEventListener('pointerdown', (ev) => {
            if (ev.target.closest('button') || this.maximized) return;
            const r = this.root.getBoundingClientRect();
            start = { x: ev.clientX - r.left, y: ev.clientY - r.top };
            handle.setPointerCapture(ev.pointerId);
        });
        handle.addEventListener('pointermove', (ev) => {
            if (!start) return;
            Object.assign(this.root.style, { left: `${Math.max(0, ev.clientX - start.x)}px`, top: `${Math.max(0, ev.clientY - start.y)}px`, right: 'auto' });
        });
        handle.addEventListener('pointerup', () => { if (start) { start = null; this._saveLayout(); } });
    }

    _saveLayout() {
        if (!this.root.isConnected || this.root.style.display === 'none' || this.maximized) return;
        const r = this.root.getBoundingClientRect();
        this.app.onLayout?.({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), tab: this.tab });
    }

    mount(parent) { parent.append(this.root); }
    get isOpen() { return this.root.isConnected && this.root.style.display !== 'none'; }
    show() { this.root.style.display = ''; this.refresh(); this._animate(); }
    hide() { this.root.style.display = 'none'; }
    toggleMax(force) {
        this.maximized = force ?? !this.maximized;
        this.root.classList.toggle('ss-max', this.maximized);
        this.refresh();
    }
    setStatus(text, isError = false) { this.status.textContent = text || ''; this.status.classList.toggle('ss-error', Boolean(isError)); }
    setBusy(on, text) { this.root.classList.toggle('ss-busy', Boolean(on)); if (text !== undefined) this.setStatus(text); }
    setTab(id) { this.tab = id; this.refresh(); this._saveLayout(); }

    /** Redraw everything from app.view(). */
    refresh() {
        if (!this.isOpen) return;
        const v = this.app.view();
        for (const b of this.tabBar.querySelectorAll('.ss-tab')) b.classList.toggle('ss-active', b.dataset.tab === this.tab);
        this.strip.textContent = v.world && v.state ? `Day ${v.state.day} · ${cap(v.state.slot)} · $${v.state.player.money} · ${Math.round(v.state.player.size_cm)} cm` : '';
        this.body.replaceChildren();
        if (!v.world || !v.state) { this.body.append(this._welcome(v)); return; }
        const draw = { map: () => this._map(v), scene: () => this._scene(v), cast: () => this._cast(v), journal: () => this._journal(v), gallery: () => this._gallery(v), log: () => this._log(v) }[this.tab] ?? (() => this._map(v));
        this.body.append(draw());
    }

    _welcome(v) {
        return el('div', { class: 'ss-welcome' },
            el('h3', { text: 'Sole Survivor' }),
            el('p', { text: v.chatOpen ? `Build a town around ${v.cast?.join(', ') || 'the character in this chat'}: their home, their haunts, their friends and rivals, and a few places that start CLOSED. Then explore it.` : 'Open a chat with a character first.' }),
            v.chatOpen ? btn('New game', 'Generate the town and cast (takes a minute)', () => this.app.onNewGame(), 'ss-primary') : null,
            el('p', { class: 'ss-hint', text: 'Click a building on the map to go there. Entering a place where someone is starts a scene; the choices you pick are sent as your messages.' }),
        );
    }

    // ------------------------------------------------------------------ map

    _map(v) {
        const { world, state } = v;
        if (!this.layoutCache || this.layoutCache.key !== `${world.locations.length}:${v.layoutSeed}`) this.layoutCache = { key: `${world.locations.length}:${v.layoutSeed}`, layout: layoutTown(world, { seed: v.layoutSeed }) };
        const layout = this.layoutCache.layout;
        this.canvas = el('canvas', { class: 'ss-map', width: BASE_W, height: BASE_H });
        const toBase = (ev) => { const r = this.canvas.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * BASE_W, y: ((ev.clientY - r.top) / r.height) * BASE_H }; };
        this.canvas.addEventListener('pointermove', (ev) => { const p = toBase(ev); const id = hitTest(layout, p.x, p.y); if (id !== this.hover) { this.hover = id; this._mapInfo(v); } });
        this.canvas.addEventListener('pointerleave', () => { this.hover = null; this._mapInfo(v); });
        this.canvas.addEventListener('click', (ev) => { const p = toBase(ev); const id = hitTest(layout, p.x, p.y); if (id) this.app.onTravel(id); });
        this.info = el('div', { class: 'ss-mapinfo' });
        this._mapInfo(v);
        const bar = el('div', { class: 'ss-bar' },
            btn('Wait', 'Let this part of the day pass', () => this.app.onWait()),
            btn('Sleep', 'Go home and sleep until morning', () => this.app.onSleep()),
            btn(this.everyone ? 'Hide people' : 'Where is everyone?', 'Show where the residents are right now', () => { this.everyone = !this.everyone; this.refresh(); }),
            el('div', { class: 'ss-spacer' }),
            btn('Look around', 'A scene here, without moving', () => this.app.onLook()),
        );
        this._drawMap(v, layout);
        return el('div', { class: 'ss-maptab' }, el('div', { class: 'ss-mapwrap' }, this.canvas), this.info, bar);
    }

    _drawMap(v, layout) {
        if (!this.canvas) return;
        const { world, state } = v;
        const open = {}, people = {};
        for (const l of world.locations) open[l.id] = v.statusOf(l);
        if (this.everyone) for (const l of world.locations) { const here = whoIsAt(world, l.id, state.slot); if (here.length) people[l.id] = here.map((s) => ({ name: s.name, color: s.card ? '#ff7ab6' : '#9ad0ff' })); }
        drawTown(this.canvas, layout, world, { open, people, hover: this.hover, at: state.at, slot: state.slot, tick: this.tick });
    }

    _mapInfo(v) {
        if (!this.info) return;
        const { world, state } = v;
        const loc = findLocation(world, this.hover || state.at);
        if (!loc) { this.info.textContent = ''; return; }
        const here = whoIsAt(world, loc.id, state.slot);
        const status = v.statusOf(loc);
        this.info.replaceChildren(
            el('b', { text: loc.name }), ` · ${typeOf(loc).label}`,
            loc.id === state.at ? el('span', { class: 'ss-tag', text: 'you are here' }) : null,
            status === 'open' ? el('span', { class: 'ss-tag ss-open', text: 'open' }) : el('span', { class: 'ss-tag ss-closed', text: status === 'locked' ? 'CLOSED' : 'closed now' }),
            el('div', { class: 'ss-hint', text: status === 'open' ? (here.length ? `Here now: ${here.map((s) => s.name).join(', ')}.` : 'Nobody here right now.') : v.hint(loc) }),
        );
    }

    _animate() {
        if (this._raf) return;
        let last = 0;
        const step = (t) => {
            this._raf = null;
            if (!this.isOpen) return;
            if (t - last > 90) {
                last = t; this.tick++;
                if (this.tab === 'map' && this.canvas && this.layoutCache) this._drawMap(this.app.view(), this.layoutCache.layout);
                if (this.tab === 'scene' && this.povCanvas?.isConnected) drawFeetPov(this.povCanvas.getContext('2d'), { ...this.povArgs, tick: this.tick });
            }
            this._raf = requestAnimationFrame(step);
        };
        this._raf = requestAnimationFrame(step);
    }

    // ------------------------------------------------------------------ scene

    _scene(v) {
        const { world, state } = v;
        const here = findLocation(world, state.at);
        const present = v.present;
        const scene = state.scene;
        const bg = here ? v.backgroundUrl(here) : '';
        const target = present.find((s) => s.id === this.verbTarget) ?? present[0] ?? null;
        const feetOn = Boolean(target) && (this.feetView ?? ['service_row', 'punishment'].includes(state.event?.type));
        let stageInner;
        if (feetOn) {
            this.povCanvas = el('canvas', { class: 'ss-pov', width: POV_W, height: POV_H });
            this.povArgs = { sheet: target, feet: v.feetState(target.id) || 'socks', tiny: state.player.size_cm < 100 };
            drawFeetPov(this.povCanvas.getContext('2d'), { ...this.povArgs, tick: this.tick });
            stageInner = [this.povCanvas, el('div', { class: 'ss-pov-name', text: `${first(target.name)} · ${this.povArgs.feet}` })];
        } else {
            this.povCanvas = null;
            const tallest = present.reduce((m, s) => Math.max(m, s.height_cm || 0), 0);
            const youPct = tallest ? Math.max(3, Math.min(30, (62 + ((present.find((s) => s.height_cm === tallest)?.size_class ?? 1) - 1) * 40) * (PLAYER_CM / tallest))) : 0;
            stageInner = [!bg ? el('div', { class: 'ss-stage-text', text: here ? `${here.name}: ${here.interior}` : '' }) : null,
                el('div', { class: 'ss-sprites' }, ...present.map((s) => this._sprite(v, s))),
                present.length ? el('div', { class: 'ss-you', style: { height: `${youPct}%` }, title: `${v.user}: ${PLAYER_CM} cm, for scale` }, el('img', { src: v.youUrl(), alt: 'you', draggable: false })) : null];
        }
        const stage = el('div', { class: `ss-stage${feetOn ? ' ss-stage-pov' : ''}`, style: bg && !feetOn ? { backgroundImage: `url("${encodeURI(bg)}")` } : {} },
            ...stageInner,
            el('div', { class: 'ss-stage-tools' },
                target ? iconBtn('fa-socks', feetOn ? 'Back to the room view' : `Feet view: ${first(target.name)}'s feet up on the table`, () => { this.feetView = !feetOn; this.refresh(); }, feetOn ? 'ss-active' : '') : null,
                here && !bg && !feetOn ? iconBtn('fa-image', 'Make a background picture for this place', () => this.app.onMakeBackground(here.id)) : null,
                here ? iconBtn('fa-location-dot', here.name, () => this.setTab('map')) : null,
            ),
        );
        // Dialogue box.
        const lines = scene?.lines ?? [];
        const narration = scene?.narration ?? [];
        let box;
        if (!scene) box = el('div', { class: 'ss-dialogue' }, el('div', { class: 'ss-narration', text: here ? (present.length ? `${present.map((s) => first(s.name)).join(' and ')} ${present.length > 1 ? 'are' : 'is'} here. Say or do something to start the scene.` : 'Nobody is here. Look around, or go somewhere else.') : '' }));
        else if (this.showAll || !lines.length) box = el('div', { class: 'ss-dialogue ss-all' }, ...narration.map((n) => el('div', { class: 'ss-narration', text: n })), ...lines.map((l) => el('div', { class: 'ss-line' }, el('b', { text: l.who }), el('span', { class: 'ss-expr', text: ` [${l.expr}]` }), ` ${l.text}`)));
        else {
            const i = this.lineIndex === null ? lines.length - 1 : Math.max(0, Math.min(lines.length - 1, this.lineIndex));
            const l = lines[i];
            box = el('div', { class: 'ss-dialogue', onclick: () => { this.lineIndex = i + 1 < lines.length ? i + 1 : null; this.refresh(); } },
                i === 0 && narration.length ? el('div', { class: 'ss-narration', text: narration[0] }) : null,
                el('div', { class: 'ss-nameplate', text: l.who }),
                el('div', { class: 'ss-words', text: l.text }),
                el('div', { class: 'ss-page', text: `${i + 1}/${lines.length} ▸` }),
            );
        }
        const toggles = el('div', { class: 'ss-bar ss-small' },
            lines.length > 1 ? btn(this.showAll ? 'One line at a time' : 'Show the whole scene', '', () => { this.showAll = !this.showAll; this.refresh(); }) : null,
            lines.length > 1 && !this.showAll ? btn('◂', 'Previous line', () => { const n = (this.lineIndex ?? lines.length - 1) - 1; this.lineIndex = Math.max(0, n); this.refresh(); }) : null,
        );
        // Choices.
        const choices = el('div', { class: 'ss-choices' }, ...(scene?.choices ?? []).map((c) => {
            const who = present[0];
            const o = c.check && who ? v.odds(who, c.check) : null;
            return el('button', { class: 'ss-choice menu_button', type: 'button', onclick: () => this.app.onChoice(c) },
                el('span', { class: 'ss-n', text: `${c.n}.` }), ` ${c.text}`,
                c.check ? el('span', { class: 'ss-check', text: ` ${CHECKS[c.check]?.label ?? c.check}${o !== null ? ` ${Math.round(o * 100)}%` : ''}` }) : null);
        }));
        // Verb bar (foot service) when someone is here.
        let verbs = null;
        if (present.length) {
            const target = present.find((s) => s.id === this.verbTarget) ?? present[0];
            verbs = el('div', { class: 'ss-verbs' },
                ...VERBS.map((vb) => { const o = v.odds(target, vb); return el('button', { class: 'ss-verb', type: 'button', title: `${cap(vb)} ${first(target.name)}'s feet (${Math.round(o * 100)}%)`, onclick: () => this.app.onVerb(vb, target.id) }, vb.toUpperCase()); }),
                present.length > 1 ? el('select', { class: 'text_pole ss-target', onchange: (e) => { this.verbTarget = e.target.value; this.refresh(); } }, ...present.map((s) => el('option', { value: s.id, selected: s.id === target.id, text: first(s.name) }))) : el('span', { class: 'ss-hint', text: first(target.name) }),
                el('span', { class: 'ss-meters' }, `favor ${state.rel[target.id]?.favor ?? 0} · irritation ${state.rel[target.id]?.irritation ?? 0}/10`),
            );
        }
        const input = el('input', { class: 'text_pole ss-free', placeholder: 'Or type what you do…', onkeydown: (e) => { if (e.key === 'Enter' && input.value.trim()) { this.app.onFreeText(input.value.trim()); input.value = ''; } } });
        const free = el('div', { class: 'ss-bar' }, input, btn('Send', '', () => { if (input.value.trim()) { this.app.onFreeText(input.value.trim()); input.value = ''; } }), btn('Leave', 'Back to the map', () => this.setTab('map')));
        const meters = el('div', { class: 'ss-meters ss-bar ss-small' }, `Stamina ${state.player.stamina}/10 · Composure ${state.player.composure}/10 · Dirt ${state.player.dirt}/10${state.inventory.length ? ` · ${state.inventory.join(', ')}` : ''}`);
        return el('div', { class: 'ss-scenetab' }, stage, box, toggles, choices, verbs, free, meters);
    }

    _sprite(v, s) {
        const expr = v.expressionOf(s);
        const url = v.spriteUrl(s, expr);
        const feet = v.feetState(s.id);
        // Height on the stage by class: class 1 fits, class 6 towers out of the top (you see her legs and feet).
        const cls = s.size_class ?? 1;
        const pct = Math.min(260, 62 + (cls - 1) * 40);
        const wrap = el('div', { class: `ss-sprite ss-expr-${expr}`, title: `${s.name} (${expr}${feet ? `, ${feet}` : ''}) · ${sizeLine(s)}`, style: { height: `${pct}%` } });
        const generated = Boolean(s.sprites?.[expr] || s.sprites?.neutral);
        if (url) wrap.append(el('img', { src: url, alt: s.name, draggable: false }));
        else wrap.append(el('div', { class: 'ss-silhouette' }, el('span', { text: first(s.name) })));
        if (!generated) wrap.append(v.spritesBusy(s.id) ? el('div', { class: 'ss-hint', text: 'drawing…' }) : btn('Make sprites', `Generate ${first(s.name)}'s expression sheet with the image model`, () => this.app.onMakeSprites(s.id), 'ss-small'));
        wrap.append(el('div', { class: 'ss-sprite-name', text: `${first(s.name)} · ${expr} · ${classOf(cls).name} ${Math.round(s.height_cm / 30.48)} ft` }));
        return wrap;
    }

    // ------------------------------------------------------------------ cast

    _cast(v) {
        const { world, state } = v;
        return el('div', { class: 'ss-casttab' }, ...world.residents.map((s) => {
            const r = state.rel[s.id] ?? {};
            const url = v.spriteUrl(s, 'neutral');
            const feetUrl = v.feetUrl(s);
            return el('div', { class: 'ss-card' },
                el('div', { class: 'ss-card-pic' }, url ? el('img', { src: url, alt: s.name }) : el('div', { class: 'ss-silhouette' }, el('span', { text: first(s.name) }))),
                el('div', { class: 'ss-card-body' },
                    el('div', { class: 'ss-card-head' }, el('b', { text: s.name }), s.card ? el('span', { class: 'ss-tag', text: 'your character' }) : null, ` ${s.age} · ${s.archetype} · ${s.job || ''}`, el('span', { class: 'ss-tag ss-size', text: sizeLine(s) })),
                    el('div', { class: 'ss-hint', text: ARCHETYPES[s.archetype]?.line }),
                    el('div', { text: s.hook }),
                    el('div', { class: 'ss-hint', text: `Feet: ${s.shoes}; ${s.socks}. Smell: cheesy ${s.odor.cheesy}% lemony ${s.odor.lemony}% fishy ${s.odor.fishy}% meaty ${s.odor.meaty}%.` }),
                    el('div', { class: 'ss-hint', text: `Likes ${s.wants.verbs.join(', ')}${s.wants.hates.length ? `; hates ${s.wants.hates.join(', ')}` : ''}. Home: ${findLocation(world, s.home)?.name ?? '?'}. ${SLOTS.map((sl) => `${sl}: ${findLocation(world, s.schedule[sl])?.name ?? '?'}`).join(' · ')}` }),
                    el('div', { class: 'ss-dials' }, ...DIALS.map((d) => el('label', { title: d }, `${d} `, el('input', { type: 'number', min: 0, max: 11, value: s.dials[d], class: 'text_pole ss-num', onchange: (e) => this.app.onEditDial(s.id, d, Number(e.target.value)) })))),
                    el('div', { class: 'ss-meters', text: `favor ${r.favor ?? 0} · irritation ${r.irritation ?? 0}/10 · fear ${r.fear ?? 0}/10${r.met ? '' : ' · not met yet'}` }),
                    el('div', { class: 'ss-bar ss-small' },
                        btn(url ? 'Redo sprites' : 'Make sprites', 'Generate the six-expression sprite sheet', () => this.app.onMakeSprites(s.id)),
                        btn(feetUrl ? 'Redo feet card' : 'Make feet card', 'Generate shoes / socks / bare soles reference', () => this.app.onMakeFeet(s.id)),
                        feetUrl ? el('a', { href: feetUrl, target: '_blank', class: 'ss-hint', text: 'feet card' }) : null,
                    ),
                ),
            );
        }));
    }

    // ------------------------------------------------------------------ journal, gallery, log

    _journal(v) {
        const { world, state } = v;
        const quests = world.quests.map((q) => ({ q, s: state.quests[q.id] ?? { status: 'hidden' } })).filter(({ s }) => s.status !== 'hidden');
        return el('div', { class: 'ss-journal' },
            el('h4', { text: world.town.name }), el('p', { text: world.town.intro || world.town.vibe }),
            el('h4', { text: 'Quests' }),
            quests.length ? el('ul', {}, ...quests.map(({ q, s }) => el('li', { class: s.status === 'done' ? 'ss-done' : '' }, el('b', { text: q.title }), ` (${world.residents.find((r) => r.id === q.giver)?.name ?? '?'}): ${q.goal}${q.reward.opens ? ` → opens ${findLocation(world, q.reward.opens)?.name}` : ''}${s.status === 'done' ? ' ✓' : ''}`))) : el('p', { class: 'ss-hint', text: 'No quests yet. Talk to people.' }),
            el('h4', { text: 'Carrying' }), el('p', { text: state.inventory.join(', ') || 'nothing' }),
            el('h4', { text: 'Places' }), el('p', { class: 'ss-hint', text: world.locations.map((l) => `${l.name}${v.statusOf(l) === 'locked' ? ' (CLOSED: ' + v.hint(l) + ')' : ''}`).join(' · ') }),
            state.endings.length ? el('div', {}, el('h4', { text: 'Endings seen' }), el('p', { text: state.endings.join(' · ') })) : null,
            el('div', { class: 'ss-bar ss-small' }, btn('Export town', 'Copy the town and cast as JSON', () => this.app.onExport()), btn('Import town', 'Paste a town JSON', () => this.app.onImport())),
        );
    }

    _gallery(v) {
        const items = v.gallery ?? [];
        return el('div', { class: 'ss-gallery' }, items.length ? items.slice().reverse().map((g) => el('a', { href: g.url, target: '_blank', title: g.title }, el('img', { src: g.url, alt: g.title }))) : el('p', { class: 'ss-hint', text: 'Pictures you make land here.' }));
    }

    _log(v) {
        return el('pre', { class: 'ss-log', text: (v.log ?? []).slice(-80).join('\n') });
    }
}

export { EXPRESSIONS };
