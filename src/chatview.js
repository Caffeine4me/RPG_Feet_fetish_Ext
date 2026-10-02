// The bookkeeping tags in an AI message become small chips at the bottom of the message; the prose
// stays as written. Display only: the stored message text is unchanged.

import { parseTags, tagLabel } from './tags.js';

const TAG_LINE = /^\s*(\[(?:HEALTH|HP|STAMINA|STAM|NERVE|MONEY|CASH|ITEM|COND|XP|NPC|CHECK|TIME|PLACE|NOTE)\b[^\]]*\]\s*)+$/i;
const TAG_INLINE = /\[(?:HEALTH|HP|STAMINA|STAM|NERVE|MONEY|CASH|ITEM|COND|XP|NPC|CHECK|TIME|PLACE|NOTE)\b[^\]]*\]/gi;

/**
 * @param {HTMLElement} root the message's .mes_text element
 * @param {string} text the raw message text
 * @param {{currency?: string, hide?: boolean}} o hide: remove the tags from view (default true)
 */
export function decorateMessage(root, text, { currency = '$', hide = true } = {}) {
    if (!root) return;
    root.querySelectorAll('.sf-chips').forEach((n) => n.remove());
    const tags = parseTags(text);
    if (!tags.length) { delete root.dataset.sfDone; return; }
    root.dataset.sfDone = '1';
    const doc = root.ownerDocument;
    if (hide) {
        for (const block of [...root.querySelectorAll('p, div, li')]) {
            if (block.querySelector('p, div, li')) continue;
            if (TAG_LINE.test(block.textContent || '')) block.remove();
        }
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) if (TAG_INLINE.test(node.nodeValue || '')) node.nodeValue = node.nodeValue.replace(TAG_INLINE, '').replace(/ {2,}/g, ' ');
        for (const br of [...root.querySelectorAll('br')]) if (!br.nextSibling || (br.nextSibling.nodeType === 3 && !br.nextSibling.nodeValue.trim() && !br.nextSibling.nextSibling)) br.remove();
    }
    const box = doc.createElement('div');
    box.className = 'sf-chips';
    for (const t of tags) {
        const label = tagLabel(t, currency);
        if (!label) continue;
        const chip = doc.createElement('span');
        chip.className = `sf-chip sf-chip-${t.type}${t.type === 'meter' || t.type === 'money' ? (t.delta < 0 ? ' sf-bad' : ' sf-good') : t.type === 'item' ? (t.qty < 0 ? ' sf-bad' : ' sf-good') : ''}`;
        chip.textContent = label;
        box.append(chip);
    }
    root.append(box);
}

export function undecorate(root) {
    root?.querySelectorAll('.sf-chips').forEach((n) => n.remove());
    if (root) delete root.dataset.sfDone;
}
