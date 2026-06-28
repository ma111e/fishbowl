class FishBowlDraggablePanels {
    constructor() {
        this.enabled = false;
        this.activeDrag = null;
        this.activeResize = null;
        this.rafId = null;
        this.pendingDx = 0;
        this.pendingDy = 0;

        this.setDraggingActive(false);
        this.pendingWidth = 0;
        this.pendingHeight = 0;
        this.pendingLeft = 0;
        this.pendingTop = 0;

        this.setDraggingActive(false);
        this.boundOnPointerMove = this.onPointerMove.bind(this);
        this.boundOnPointerUp = this.onPointerUp.bind(this);
    }

    setDraggingActive(active) {
        try {
            if (!document || !document.body || !document.body.classList) return;
            const host = window.fishTankHUD?.hudHost;
            if (active) {
                document.body.classList.add('fishbowl-dragging-active');
                if (host) host.classList.add('fishbowl-dragging-active');
            } else {
                document.body.classList.remove('fishbowl-dragging-active');
                if (host) host.classList.remove('fishbowl-dragging-active');
            }
        } catch (e) {
            console.warn('[FishBowlDraggablePanels] Failed to toggle dragging-active class', e);
        }
    }

    getCurrentDomainKey() {
        return (window.location.hostname || '').toLowerCase();
    }

    async getSettings() {
        const result = await browser.storage.local.get(['settings']);
        return result?.settings || {};
    }

    async updateSettings(nextSettings) {
        await browser.storage.local.set({ settings: nextSettings });
    }

    async getDomainPositions() {
        const settings = await this.getSettings();
        const all = settings.hudPanelPositionsByDomain && typeof settings.hudPanelPositionsByDomain === 'object'
            ? settings.hudPanelPositionsByDomain
            : {};

        const domainKey = this.getCurrentDomainKey();
        const domainPositions = all[domainKey] && typeof all[domainKey] === 'object' ? all[domainKey] : {};
        return { settings, all, domainKey, domainPositions };
    }

    async getDomainVisibility() {
        const settings = await this.getSettings();
        const all = settings.hudPanelVisibilityByDomain && typeof settings.hudPanelVisibilityByDomain === 'object'
            ? settings.hudPanelVisibilityByDomain
            : {};

        const domainKey = this.getCurrentDomainKey();
        const domainVisibility = all[domainKey] && typeof all[domainKey] === 'object' ? all[domainKey] : {};
        return { settings, all, domainKey, domainVisibility };
    }

    getDraggableTargets() {
        const targets = [];
        const root = window.fishTankHUD?.hudShadowRoot || document;

        // Info panels
        Array.from(root.querySelectorAll('.info-panel'))
            .filter(el => el && el.id)
            .forEach(el => targets.push({ key: el.id, el, resizable: true, hidable: true }));

        // Activity feed (log) panel container
        const activityPanel = root.querySelector('.fishbowl-panel-left');
        if (activityPanel) {
            targets.push({ key: 'activity-feed-panel', el: activityPanel, resizable: true, hidable: true });
        }

        return targets;
    }

    createOverlayForPanel(target) {
        if (!target || !target.el || !target.key) return null;
        const panel = target.el;

        const existing = panel.querySelector(`.fishbowl-drag-overlay[data-panel-id="${target.key}"]`);
        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.className = 'fishbowl-drag-overlay';
        overlay.setAttribute('data-panel-id', target.key);
        overlay.textContent = 'Drag anywhere';

        overlay.addEventListener('pointerdown', (e) => {
            this.onPointerDown(e, target);
        });

        if (target.hidable) {
            const hideButton = document.createElement('button');
            hideButton.className = 'fishbowl-panel-hide-button';
            hideButton.type = 'button';
            hideButton.textContent = 'Hide';
            hideButton.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') {
                    e.stopImmediatePropagation();
                }
            });
            hideButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hidePanel(target);
            });
            overlay.appendChild(hideButton);
        }

        if (target.resizable) {
            const resizeHandleTl = document.createElement('div');
            resizeHandleTl.className = 'fishbowl-resize-handle fishbowl-resize-handle-tl';
            resizeHandleTl.setAttribute('data-panel-id', target.key);
            resizeHandleTl.addEventListener('pointerdown', (e) => {
                this.onResizePointerDown(e, target, 'tl');
            });
            overlay.appendChild(resizeHandleTl);

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'fishbowl-resize-handle fishbowl-resize-handle-br';
            resizeHandle.setAttribute('data-panel-id', target.key);
            resizeHandle.addEventListener('pointerdown', (e) => {
                this.onResizePointerDown(e, target, 'br');
            });
            overlay.appendChild(resizeHandle);
        }

        try {
            // Don't override anchored panels like the Activity Log (which uses position:absolute in CSS).
            const computed = window.getComputedStyle(panel);
            if (computed && computed.position === 'static' && !panel.style.position) {
                panel.style.position = 'relative';
            }
        } catch (e) {
            console.warn('[FishBowlDraggablePanels] Failed to ensure panel positioning for drag overlay', e);
        }
        panel.appendChild(overlay);

        return overlay;
    }

    async applySavedVisibility() {
        const { domainVisibility } = await this.getDomainVisibility();
        const targets = this.getDraggableTargets();

        targets.forEach(target => {
            if (!target.hidable) return;
            const panel = target.el;
            const value = domainVisibility[target.key];
            if (value === false) {
                panel.setAttribute('data-fishbowl-user-hidden', '1');
                panel.style.display = 'none';
            } else {
                const wasUserHidden = panel.hasAttribute('data-fishbowl-user-hidden');
                panel.removeAttribute('data-fishbowl-user-hidden');
                if (wasUserHidden) {
                    panel.style.display = '';
                }
            }
        });
    }

    async setPanelVisibility(panelKey, visible) {
        const { settings, all, domainKey, domainVisibility } = await this.getDomainVisibility();

        if (visible) {
            if (Object.prototype.hasOwnProperty.call(domainVisibility, panelKey)) {
                delete domainVisibility[panelKey];
            }
        } else {
            domainVisibility[panelKey] = false;
        }

        all[domainKey] = domainVisibility;
        settings.hudPanelVisibilityByDomain = all;
        await this.updateSettings(settings);
    }

    async hidePanel(target) {
        if (!target || !target.el || !target.key || !target.hidable) return;
        await this.setPanelVisibility(target.key, false);
        target.el.setAttribute('data-fishbowl-user-hidden', '1');
        target.el.style.display = 'none';
    }

    removeOverlayForPanel(target) {
        if (!target || !target.el || !target.key) return;
        const panel = target.el;
        const overlay = panel.querySelector(`.fishbowl-drag-overlay[data-panel-id="${target.key}"]`);
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    async applySavedPositions() {
        const { domainPositions } = await this.getDomainPositions();
        const targets = this.getDraggableTargets();

        targets.forEach(target => {
            const panel = target.el;
            const pos = domainPositions[target.key];

            if (!pos) {
                if (target.key === 'activity-feed-panel') {
                    panel.style.width = '550px';
                    panel.style.height = '125px';
                    panel.style.flex = '0 0 auto';
                }
                return;
            }

            if (Number.isFinite(pos.width) && pos.width > 0) {
                panel.style.width = `${pos.width}px`;
                panel.style.flex = '0 0 auto';
            }
            if (Number.isFinite(pos.height) && pos.height > 0) {
                panel.style.height = `${pos.height}px`;
                panel.style.flex = '0 0 auto';
            }

            if (!Number.isFinite(pos.left) || !Number.isFinite(pos.top)) {
                return;
            }

            panel.classList.add('fishbowl-draggable-panel');
            panel.style.position = 'fixed';
            panel.style.left = `${pos.left}px`;
            panel.style.top = `${pos.top}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.margin = '0';
            panel.style.zIndex = String(globalThis.FishBowlConstants?.Z.PANEL_DRAGGING ?? 1000001);
            panel.style.transform = 'translate3d(0, 0, 0)';
        });
    }

    async savePanelLayout(panelKey, partial) {
        const { settings, all, domainKey, domainPositions } = await this.getDomainPositions();

        const prev = domainPositions[panelKey] && typeof domainPositions[panelKey] === 'object'
            ? domainPositions[panelKey]
            : {};

        const next = { ...prev };
        if (Object.prototype.hasOwnProperty.call(partial, 'left')) next.left = Math.round(partial.left);
        if (Object.prototype.hasOwnProperty.call(partial, 'top')) next.top = Math.round(partial.top);
        if (Object.prototype.hasOwnProperty.call(partial, 'width')) next.width = Math.round(partial.width);
        if (Object.prototype.hasOwnProperty.call(partial, 'height')) next.height = Math.round(partial.height);

        domainPositions[panelKey] = next;

        all[domainKey] = domainPositions;
        settings.hudPanelPositionsByDomain = all;

        await this.updateSettings(settings);
    }

    async resetCurrentDomainPositions() {
        const { settings, all, domainKey } = await this.getDomainPositions();

        if (all && Object.prototype.hasOwnProperty.call(all, domainKey)) {
            delete all[domainKey];
        }

        settings.hudPanelPositionsByDomain = all;
        await this.updateSettings(settings);

        this.getDraggableTargets().forEach(target => {
            const panel = target.el;
            panel.classList.remove('fishbowl-draggable-panel');
            panel.style.position = '';
            panel.style.left = '';
            panel.style.top = '';
            panel.style.right = '';
            panel.style.bottom = '';
            panel.style.margin = '';
            panel.style.zIndex = '';
            panel.style.transform = '';
            panel.style.width = '';
            panel.style.height = '';
            panel.style.flex = '';
        });
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;

        document.addEventListener('pointermove', this.boundOnPointerMove, true);
        document.addEventListener('pointerup', this.boundOnPointerUp, true);

        this.getDraggableTargets().forEach(target => {
            this.createOverlayForPanel(target);
        });
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;

        document.removeEventListener('pointermove', this.boundOnPointerMove, true);
        document.removeEventListener('pointerup', this.boundOnPointerUp, true);

        this.activeDrag = null;
        this.activeResize = null;
        this.setDraggingActive(false);
        this.getDraggableTargets().forEach(target => {
            this.removeOverlayForPanel(target);
        });
    }

    onPointerDown(e, target) {
        if (!this.enabled) return;
        if (!target || !target.el || !target.key) return;
        const panel = target.el;

        this.setDraggingActive(true);

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }

        const rect = panel.getBoundingClientRect();

        const width = rect.width;
        const height = rect.height;

        panel.classList.add('fishbowl-draggable-panel');
        panel.style.position = 'fixed';
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.margin = '0';
        panel.style.zIndex = '1000001';
        panel.style.transform = 'translate3d(0, 0, 0)';

        this.activeDrag = {
            panel,
            panelKey: target.key,
            pointerId: e.pointerId,
            startLeft: rect.left,
            startTop: rect.top,
            startX: e.clientX,
            startY: e.clientY,
            width,
            height
        };

        this.pendingDx = 0;
        this.pendingDy = 0;

        try {
            e.target.setPointerCapture(e.pointerId);
        } catch (err) {
            console.warn('[FishBowlDraggablePanels] Failed to set pointer capture for drag', err);
        }
    }

    onResizePointerDown(e, target, corner = 'br') {
        if (!this.enabled) return;
        if (!target || !target.el || !target.key || !target.resizable) return;

        const panel = target.el;

        this.setDraggingActive(true);

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }

        const rect = panel.getBoundingClientRect();

        panel.classList.add('fishbowl-draggable-panel');
        panel.style.position = 'fixed';
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.margin = '0';
        panel.style.zIndex = '1000001';
        panel.style.transform = 'translate3d(0, 0, 0)';
        panel.style.flex = '0 0 auto';

        this.activeResize = {
            panel,
            panelKey: target.key,
            pointerId: e.pointerId,
            corner,
            startWidth: rect.width,
            startHeight: rect.height,
            startLeft: rect.left,
            startTop: rect.top,
            startX: e.clientX,
            startY: e.clientY
        };

        this.pendingWidth = rect.width;
        this.pendingHeight = rect.height;
        this.pendingLeft = rect.left;
        this.pendingTop = rect.top;

        try {
            e.target.setPointerCapture(e.pointerId);
        } catch (err) {
            console.warn('[FishBowlDraggablePanels] Failed to set pointer capture for resize', err);
        }
    }

    onPointerMove(e) {
        if (!this.enabled) return;

        if (this.activeResize) {
            if (e.pointerId !== this.activeResize.pointerId) return;
            e.preventDefault();

            const { startWidth, startHeight, startLeft, startTop, startX, startY, corner } = this.activeResize;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const minWidth = 160;
            const minHeight = 80;

            if (corner === 'tl') {
                const nextWidth = Math.max(minWidth, startWidth - dx);
                const nextHeight = Math.max(minHeight, startHeight - dy);
                const nextLeft = startLeft + (startWidth - nextWidth);
                const nextTop = startTop + (startHeight - nextHeight);

                this.pendingWidth = nextWidth;
                this.pendingHeight = nextHeight;
                this.pendingLeft = Math.max(0, nextLeft);
                this.pendingTop = Math.max(0, nextTop);
            } else {
                const nextWidth = Math.max(minWidth, startWidth + dx);
                const nextHeight = Math.max(minHeight, startHeight + dy);

                this.pendingWidth = nextWidth;
                this.pendingHeight = nextHeight;
                this.pendingLeft = startLeft;
                this.pendingTop = startTop;
            }

            if (this.rafId) return;
            this.rafId = requestAnimationFrame(() => {
                this.rafId = null;
                if (!this.activeResize) return;
                this.activeResize.panel.style.width = `${Math.round(this.pendingWidth)}px`;
                this.activeResize.panel.style.height = `${Math.round(this.pendingHeight)}px`;

                if (this.activeResize.corner === 'tl') {
                    this.activeResize.panel.style.left = `${Math.round(this.pendingLeft)}px`;
                    this.activeResize.panel.style.top = `${Math.round(this.pendingTop)}px`;
                }
            });
            return;
        }

        if (!this.activeDrag) return;
        if (e.pointerId !== this.activeDrag.pointerId) return;

        e.preventDefault();

        const { startLeft, startTop, startX, startY, width, height } = this.activeDrag;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const clampedLeft = Math.min(
            Math.max(0, startLeft + dx),
            Math.max(0, window.innerWidth - width)
        );
        const clampedTop = Math.min(
            Math.max(0, startTop + dy),
            Math.max(0, window.innerHeight - height)
        );

        this.pendingDx = clampedLeft - startLeft;
        this.pendingDy = clampedTop - startTop;

        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            if (!this.activeDrag) return;
            this.activeDrag.panel.style.transform = `translate3d(${this.pendingDx}px, ${this.pendingDy}px, 0)`;
        });
    }

    async onPointerUp(e) {
        if (!this.enabled) return;

        if (this.activeResize) {
            if (e.pointerId !== this.activeResize.pointerId) return;
            e.preventDefault();

            const { panelKey, corner } = this.activeResize;
            const finalWidth = Math.round(this.pendingWidth);
            const finalHeight = Math.round(this.pendingHeight);
            const finalLeft = Math.round(this.pendingLeft);
            const finalTop = Math.round(this.pendingTop);
            this.activeResize = null;
            this.pendingWidth = 0;
            this.pendingHeight = 0;
            this.pendingLeft = 0;
            this.pendingTop = 0;

            if (corner === 'tl') {
                await this.savePanelLayout(panelKey, { left: finalLeft, top: finalTop, width: finalWidth, height: finalHeight });
            } else {
                await this.savePanelLayout(panelKey, { width: finalWidth, height: finalHeight });
            }

            this.setDraggingActive(false);
            return;
        }

        if (!this.activeDrag) return;
        if (e.pointerId !== this.activeDrag.pointerId) return;

        e.preventDefault();

        const { panel, panelKey, startLeft, startTop } = this.activeDrag;
        const finalLeft = startLeft + this.pendingDx;
        const finalTop = startTop + this.pendingDy;

        panel.style.transform = 'translate3d(0, 0, 0)';
        panel.style.left = `${finalLeft}px`;
        panel.style.top = `${finalTop}px`;

        this.activeDrag = null;
        this.pendingDx = 0;
        this.pendingDy = 0;

        this.setDraggingActive(false);

        await this.savePanelLayout(panelKey, { left: finalLeft, top: finalTop });
    }
}

window.FishBowlDraggablePanels = window.FishBowlDraggablePanels || new FishBowlDraggablePanels();
