/**
 * FishBowl - Investigation Sandbox: Entity Operations
 *
 * Handles all entity-level actions:
 *   • Lookup - trigger reputation analysis via background
 *   • Copy   - clipboard
 *   • Remove - remove entity from investigation
 *   • Note   - inline note editing
 *   • OpenVT - open VirusTotal in new tab
 *
 * Exposed on `window.SbOperations`.
 */

(function () {
    const VT_BASE = {
        ip: 'https://www.virustotal.com/gui/ip-address/',
        domain: 'https://www.virustotal.com/gui/domain/',
        hash: 'https://www.virustotal.com/gui/file/',
        file: 'https://www.virustotal.com/gui/file/',
    };

    /**
     * Run reputation analysis for one entity via background script.
     * @param {string} type  Entity type
     * @param {string} value
     * @param {HTMLButtonElement} btn  Lookup button to disable while running
     * @param {Function} onComplete  Called with (type, value) when bg responds
     */
    function lookup(type, value, btn, onComplete) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '';
            btn.classList.add('sb-btn-loading');
        }
        browser.runtime.sendMessage({
            action: 'analyze-reputation',
            entityType: type,
            value
        }).then(() => {
            // Don't re-enable - button stays in loading state until
            // allServicesComplete triggers a full re-render with fresh DOM.
            if (onComplete) onComplete(type, value);
        }).catch(e => {
            console.warn('[SbOperations] Analyze failed', e);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Analyze';
                btn.classList.remove('sb-btn-loading');
            }
        });
    }

    /**
     * Run reputation analysis for a single failed service via background script.
     * @param {string} type  Entity type
     * @param {string} value
     * @param {string} serviceId Target service identifier
     * @param {HTMLButtonElement} btn  Retry button to disable while running
     * @param {Function} onComplete  Called with (type, value) when bg responds
     */
    function retryLookup(type, value, serviceId, btn, onComplete) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '';
            btn.classList.add('sb-btn-loading');
        }
        browser.runtime.sendMessage({
            action: 'analyze-reputation-single',
            entityType: type,
            value,
            serviceId
        }).then(() => {
            if (onComplete) onComplete(type, value);
        }).catch(e => {
            console.warn('[SbOperations] Single Analyze failed', e);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Retry';
                btn.classList.remove('sb-btn-loading');
            }
        });
    }

    /**
     * Copy entity value to clipboard. Shows brief feedback.
     * @param {string} value
     */
    function copy(value) {
        navigator.clipboard.writeText(value).catch(() => {
            // Fallback for older browsers / restricted contexts
            const el = document.createElement('textarea');
            el.value = value;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        });
    }

    /**
     * Open entity on VirusTotal.
     * @param {string} type
     * @param {string} value
     */
    function openVT(type, value) {
        const base = VT_BASE[type];
        if (!base) return;
        window.open(`${base}${encodeURIComponent(value)}`, '_blank');
    }

    /**
     * Show/hide an inline note editor on an entity card.
     * Calls onSave(type, value, noteText) when the user presses Enter or blurs.
     * @param {string} type
     * @param {string} value
     * @param {HTMLElement} card
     * @param {Function} onSave
     */
    function editNote(type, value, card, onSave) {
        // Toggle existing editor off
        const existing = card.querySelector('.sb-note-input');
        if (existing) {
            existing.remove();
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.className = 'sb-note-input';
        textarea.placeholder = 'Add a note…';

        // Pre-fill with existing note text if shown
        const existingNote = card.querySelector('.sb-entity-note');
        if (existingNote) textarea.value = existingNote.textContent;

        const save = () => {
            const text = textarea.value.trim();
            if (onSave) onSave(type, value, text);

            // Update displayed note
            let noteEl = card.querySelector('.sb-entity-note');
            if (text) {
                if (!noteEl) {
                    noteEl = document.createElement('div');
                    noteEl.className = 'sb-entity-note';
                    card.insertBefore(noteEl, card.querySelector('.sb-entity-ops'));
                }
                noteEl.textContent = text;
            } else if (noteEl) {
                noteEl.remove();
            }

            textarea.remove();
        };

        textarea.addEventListener('blur', save);
        textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                textarea.blur();
            }
            if (e.key === 'Escape') {
                textarea.value = '';
                textarea.blur();
            }
        });

        const ops = card.querySelector('.sb-entity-ops');
        if (ops) card.insertBefore(textarea, ops);
        else card.appendChild(textarea);

        textarea.focus();
    }

    window.SbOperations = { lookup, retryLookup, copy, openVT, editNote };
})();
