/**
 * FishBowl - Investigation Sandbox: SVG Link Rendering
 *
 * Draws SVG lines between blocks using element positions (style.left/top)
 * so links stay correct at any zoom level.
 *
 * Exposed on `window.SbLinks`.
 */

(function () {
    let _svg = null;
    let _canvasInner = null;
    let _links = [];

    function init(svg, canvasInner) {
        _svg = svg;
        _canvasInner = canvasInner;
    }

    function setLinks(links) {
        _links = links || [];
    }

    /**
     * Return the bounding rect of a block in canvas-inner coordinates.
     * Uses the element's own position (style.left/top) + dimensions,
     * not getBoundingClientRect, so it's zoom-independent.
     */
    function getBlockRect(endpoint) {
        if (!_canvasInner || !endpoint) return null;

        let el = null;
        if (endpoint.blockId) {
            el = _canvasInner.querySelector(`[data-enrichment-id="${CSS.escape(endpoint.blockId)}"]`) ||
                _canvasInner.querySelector(`[data-workspace-id="${CSS.escape(endpoint.blockId)}"]`);
        }

        if (!el) return null;

        const left = parseInt(el.style.left, 10) || 0;
        const top = parseInt(el.style.top, 10) || 0;
        const w = el.offsetWidth || 260;
        const h = el.offsetHeight || 80;

        return { left, top, w, h, cx: left + w / 2, cy: top + h / 2 };
    }

    /**
     * Return the point on the edge of `rect` that faces `targetCenter`,
     * placed at the midpoint of the closest side.
     */
    function getEdgePoint(rect, targetCx, targetCy) {
        const dx = targetCx - rect.cx;
        const dy = targetCy - rect.cy;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Compare aspect-ratio-scaled distances to pick the dominant axis
        if (absDx / rect.w > absDy / rect.h) {
            // Horizontal - connect on left or right side
            if (dx > 0) return { x: rect.left + rect.w, y: rect.cy }; // right
            return { x: rect.left, y: rect.cy };                      // left
        }
        // Vertical - connect on top or bottom side
        if (dy > 0) return { x: rect.cx, y: rect.top + rect.h };      // bottom
        return { x: rect.cx, y: rect.top };                            // top
    }

    /**
     * Redraw all link lines with optional labels.
     */
    function render() {
        if (!_svg) return;

        // Remove old lines and labels (keep <defs>)
        Array.from(_svg.children).forEach(el => {
            if (el.tagName !== 'defs') el.remove();
        });

        _links.forEach(link => {
            const fromRect = getBlockRect(link.from);
            const toRect = getBlockRect(link.to);
            if (!fromRect || !toRect) return;

            const from = getEdgePoint(fromRect, toRect.cx, toRect.cy);
            const to = getEdgePoint(toRect, fromRect.cx, fromRect.cy);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('class', 'sb-link-line');
            line.setAttribute('x1', from.x);
            line.setAttribute('y1', from.y);
            line.setAttribute('x2', to.x);
            line.setAttribute('y2', to.y);
            line.setAttribute('marker-end', 'url(#sb-arrowhead)');
            _svg.appendChild(line);

            if (link.label) {
                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2;
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('class', 'sb-link-label');
                text.setAttribute('x', midX);
                text.setAttribute('y', midY - 4);
                text.textContent = link.label;
                _svg.appendChild(text);
            }
        });
    }

    function getLinks() {
        return _links;
    }

    /** Add a link if it doesn't already exist. */
    function addLink(fromBlockId, toBlockId, label) {
        const exists = _links.some(l => l.from.blockId === fromBlockId && l.to.blockId === toBlockId);
        if (exists) return false;
        _links.push({ from: { blockId: fromBlockId }, to: { blockId: toBlockId }, label: label || '' });
        render();
        return true;
    }

    /** Update the label of an existing link. */
    function updateLink(fromBlockId, toBlockId, newLabel) {
        const link = _links.find(l => l.from.blockId === fromBlockId && l.to.blockId === toBlockId);
        if (link) {
            link.label = newLabel;
            render();
            return true;
        }
        return false;
    }

    /** Remove a link between two blocks. Returns the removed link or null. */
    function removeLink(fromBlockId, toBlockId) {
        const idx = _links.findIndex(l => l.from.blockId === fromBlockId && l.to.blockId === toBlockId);
        if (idx >= 0) {
            const removed = _links.splice(idx, 1)[0];
            render();
            return removed;
        }
        return null;
    }

    window.SbLinks = { init, setLinks, render, addLink, updateLink, removeLink, getLinks };
})();
