class FishBowlActivityProgress {
    constructor() {
        this.state = new Map();

        this.circleCircumference = 2 * Math.PI * 7;
    }

    getRoot() {
        try {
            const root = window.fishTankHUD?.hudShadowRoot || document;
            return root.getElementById('activity-progress');
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to get progress root', e);
            return null;
        }
    }

    getContainer() {
        try {
            const root = this.getRoot();
            if (!root) return null;
            return root.querySelector('.progress-container');
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to get progress container', e);
            return null;
        }
    }

    getRow(kind) {
        try {
            const container = this.getContainer();
            if (!container) return null;
            return container.querySelector(`.progress-row[data-kind="${kind}"]`);
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to get progress row', e);
            return null;
        }
    }

    ensureRow(kind) {
        try {
            const existing = this.getRow(kind);
            if (existing) return existing;

            const container = this.getContainer();
            if (!container) return null;

            const row = document.createElement('div');
            row.className = 'progress-row';
            row.setAttribute('data-kind', kind);
            row.hidden = true;

            const label = document.createElement('span');
            label.className = 'progress-label';
            label.textContent = kind;

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            circle.setAttribute('class', 'progress-circle');
            circle.setAttribute('viewBox', '0 0 20 20');
            circle.setAttribute('role', 'progressbar');
            circle.setAttribute('aria-valuemin', '0');
            circle.setAttribute('aria-valuemax', '100');
            circle.setAttribute('aria-valuenow', '0');

            const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            track.setAttribute('class', 'progress-circle-track');
            track.setAttribute('cx', '10');
            track.setAttribute('cy', '10');
            track.setAttribute('r', '7');

            const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            indicator.setAttribute('class', 'progress-circle-indicator');
            indicator.setAttribute('cx', '10');
            indicator.setAttribute('cy', '10');
            indicator.setAttribute('r', '7');

            circle.appendChild(track);
            circle.appendChild(indicator);

            const status = document.createElement('span');
            status.className = 'progress-status';
            status.textContent = '';

            row.appendChild(label);
            row.appendChild(circle);
            row.appendChild(status);

            container.appendChild(row);

            if (!this.state.has(kind)) {
                this.state.set(kind, { percent: 0, indeterminate: false });
            }

            // Initialize circle to 0 without calling setPercent (avoid recursion)
            try {
                const dash = this.circleCircumference;
                indicator.style.strokeDasharray = String(dash);
                indicator.style.strokeDashoffset = String(dash);
            } catch (e) {
                console.warn('[FishBowlActivityProgress] Failed to initialize progress ring', e);
            }

            return row;
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to ensure progress row', e);
            return null;
        }
    }

    updateVisibility() {
        try {
            const root = this.getRoot();
            if (!root) return;

            const rows = root.querySelectorAll('.progress-row');
            const hasVisible = Array.from(rows).some(r => r && !r.hidden);
            root.hidden = !hasVisible;
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to update progress visibility', e);
        }
    }

    setLabel(kind, text) {
        try {
            const row = this.ensureRow(kind);
            if (!row) return;
            const label = row.querySelector('.progress-label');
            if (!label) return;
            label.textContent = text || '';
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to set progress label', e);
        }
    }

    setStatus(kind, text) {
        try {
            const row = this.ensureRow(kind);
            if (!row) return;
            const status = row.querySelector('.progress-status');
            if (!status) return;
            status.textContent = text || '';

            const root = this.getRoot();
            if (root) {
                root.setAttribute('aria-label', text || '');
            }
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to set progress status', e);
        }
    }

    setPercent(kind, pct) {
        try {
            const row = this.ensureRow(kind);
            if (!row) return;
            const circle = row.querySelector('.progress-circle');
            const indicator = row.querySelector('.progress-circle-indicator');

            const clamped = Math.max(0, Math.min(100, pct));

            if (circle) {
                circle.setAttribute('aria-valuenow', String(Math.round(clamped)));
                circle.classList.remove('progress-circle-indeterminate');
            }

            if (indicator) {
                const dash = this.circleCircumference;
                const offset = dash * (1 - (clamped / 100));
                indicator.style.strokeDasharray = String(dash);
                indicator.style.strokeDashoffset = String(offset);
            }

            const st = this.state.get(kind) || { percent: 0, indeterminate: false };
            st.percent = clamped;
            st.indeterminate = false;
            this.state.set(kind, st);
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to set progress percent', e);
        }
    }

    setIndeterminate(kind, active = true) {
        try {
            const row = this.ensureRow(kind);
            if (!row) return;
            const circle = row.querySelector('.progress-circle');
            const indicator = row.querySelector('.progress-circle-indicator');

            if (circle) {
                if (active) {
                    circle.removeAttribute('aria-valuenow');
                    circle.classList.add('progress-circle-indeterminate');
                } else {
                    circle.setAttribute('aria-valuenow', '0');
                    circle.classList.remove('progress-circle-indeterminate');
                }
            }

            if (indicator) {
                const dash = this.circleCircumference;
                indicator.style.strokeDasharray = String(dash);
                indicator.style.strokeDashoffset = String(dash * 0.6);
            }

            const st = this.state.get(kind) || { percent: 0, indeterminate: false };
            st.indeterminate = !!active;
            this.state.set(kind, st);
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to set progress indeterminate', e);
        }
    }

    setActive(kind, active = true) {
        try {
            const row = active ? this.ensureRow(kind) : this.getRow(kind);
            if (!row) return;
            row.hidden = !active;

            this.updateVisibility();
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to set progress active state', e);
        }
    }

    complete(kind) {
        try {
            this.setPercent(kind, 100);
            this.setStatus(kind, 'Done');
            setTimeout(() => {
                try {
                    const row = this.getRow(kind);
                    if (row && row.parentNode) {
                        row.parentNode.removeChild(row);
                    }
                    this.state.delete(kind);
                    this.updateVisibility();
                } catch (e) {
                    console.warn('[FishBowlActivityProgress] Failed to hide completed progress row', e);
                }
            }, 250);
        } catch (e) {
            console.warn('[FishBowlActivityProgress] Failed to complete progress', e);
        }
    }
}

window.FishBowlActivityProgress = FishBowlActivityProgress;
