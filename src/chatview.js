// The chat itself, made playable: in an AI message the [CHOICES] block becomes buttons, [EVENT] and
// [QUEST] tags become small chips, and `Name [expression]:` lines get a coloured nameplate. Display only:
// the message text, the prompt and the chat file are unchanged.

/**
 * Decorate one rendered message. Idempotent (marks the element).
 * @param {HTMLElement} root the message's .mes_text element
 * @param {{choices: object[], event: string|null, quests: string[]}} parsed from scene.js parseReply
 * @param {{onChoice: (choice) => void, live: boolean}} o live: this is the latest message, so its choices can be clicked
 */
export function decorateMessage(root, parsed, { onChoice, live = true } = {}) {
    if (!root || root.dataset.ssDone === (live ? 'live' : 'old')) return;
    root.querySelectorAll('.ss-inline-choices, .ss-chip').forEach((n) => n.remove());
    root.dataset.ssDone = live ? 'live' : 'old';
    const doc = root.ownerDocument;
    // Tags on their own line: [EVENT x], [QUEST x].
    for (const block of [...root.querySelectorAll('p, div, li')]) {
        const m = /^\s*\[(EVENT|QUEST)\s+([\w-]+)\]\s*$/i.exec(block.textContent || '');
        if (!m || block.querySelector('p, div, li')) continue;
        const chip = doc.createElement('span');
        chip.className = `ss-chip ss-chip-${m[1].toLowerCase()}`;
        chip.textContent = m[1] === 'EVENT' ? `event: ${m[2].replace(/_/g, ' ')}` : `quest: ${m[2].replace(/_/g, ' ')}`;
        block.replaceWith(chip);
    }
    // The choices block: from the element holding "[CHOICES]" to the end of the message.
    const start = [...root.children].find((n) => /\[CHOICES\]/i.test(n.textContent || ''));
    if (start) {
        let n = start;
        const gone = [];
        while (n) { gone.push(n); n = n.nextElementSibling; }
        gone.forEach((x) => x.remove());
        const box = doc.createElement('div');
        box.className = 'ss-inline-choices';
        for (const c of parsed.choices ?? []) {
            const b = doc.createElement('button');
            b.type = 'button';
            b.className = 'ss-inline-choice menu_button';
            b.textContent = `${c.n}. ${c.text}${c.check ? ` (${c.check} check)` : ''}`;
            b.disabled = !live;
            if (live) b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); onChoice?.(c); });
            box.append(b);
        }
        if (parsed.choices?.length) root.append(box);
    }
    // Speaker lines: "Name [expression]:" at the start of a text node.
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
        if (node.parentElement?.closest('.ss-inline-choices, .ss-nameplate-inline, a, code')) continue;
        const m = /^(\s*)([A-Z][\w .'-]{0,40}?)\s*\[(\w+)\]\s*:\s*/.exec(node.nodeValue || '');
        if (!m) continue;
        const span = doc.createElement('span');
        span.className = `ss-nameplate-inline ss-expr-${m[3].toLowerCase()}`;
        span.textContent = m[2].trim();
        span.title = m[3].toLowerCase();
        const rest = doc.createTextNode(` ${node.nodeValue.slice(m[0].length)}`);
        const lead = doc.createTextNode(m[1]);
        node.replaceWith(lead, span, rest);
    }
}

/** Undo the decoration (when the extension is turned off). */
export function undecorate(root) {
    if (!root?.dataset.ssDone) return;
    delete root.dataset.ssDone;
}

/**
 * The SillyTavern settings that matter for this extension: what they should be and why.
 * `key` is the power-user setting (and the checkbox id in SillyTavern's User Settings).
 */
export const ST_CHECKS = [
    { key: 'disable_group_trimming', want: true, label: 'Relax message trim in Groups', why: 'In a group chat SillyTavern cuts a reply where another member\'s name appears. Scenes where two girls talk need this on.', groupOnly: true },
    { key: 'auto_scroll_chat_to_bottom', want: true, label: 'Auto-scroll Chat', why: 'The choices sit at the end of the newest message; keep the chat scrolled to them.' },
    { key: 'collapse_newlines', want: false, label: 'Collapse Consecutive Newlines', why: 'Blank lines separate narration, dialogue and the [CHOICES] block.' },
    { key: 'forbid_external_media', want: true, label: 'Forbid External Media', why: 'Fine to leave on: the sprites and backgrounds are saved in your SillyTavern, not loaded from outside.' , info: true },
];

/** What each check says now, given the power-user settings object. */
export function runChecks(power, { inGroup = false } = {}) {
    return ST_CHECKS.map((c) => {
        const value = Boolean(power?.[c.key]);
        const ok = c.info || value === c.want || (c.groupOnly && !inGroup);
        return { ...c, value, ok };
    });
}
