/**
 * FishBowl - Investigation Sandbox: Viewport (Pan + Zoom + Minimap)
 *
 * Manages the canvas transform (translate + scale) so the user can:
 *   - Pan by middle-click-drag or Ctrl+left-drag on empty canvas
 *   - Zoom with scroll wheel
 *   - See a minimap with a white viewport rectangle and gray block rects
 *
 * Exposed on `window.SbViewport`.
 */

(function () {
    'use strict';

    let _canvas = null;      // #sb-canvas  (the overflow:hidden clip)
    let _inner = null;       // #sb-canvas-inner  (transformed layer)
    let _minimap = null;     // minimap canvas element
    let _minimapCtx = null;

    let panX = 0;
    let panY = 0;
    let zoom = 1;

    const MIN_ZOOM = 0.15;
    const MAX_ZOOM = 3;
    const ZOOM_STEP = 0.08;

    // Minimap sizing
    const MINIMAP_W = 180;
    const MINIMAP_H = 120;

    function init(canvas, inner) {
        _canvas = canvas;
        _inner = inner;

        // Create minimap canvas
        _minimap = document.createElement('canvas');
        _minimap.id = 'sb-minimap';
        _minimap.width = MINIMAP_W;
        _minimap.height = MINIMAP_H;
        _canvas.parentElement.appendChild(_minimap);
        _minimapCtx = _minimap.getContext('2d');

        // ── Wheel → zoom ────────────────────────
        _canvas.addEventListener('wheel', onWheel, { passive: false });

        // ── Pan via middle-click or Ctrl+left-click on empty area ──
        _canvas.addEventListener('mousedown', onPanStart);

        // ── Minimap click → jump viewport ──
        _minimap.addEventListener('mousedown', onMinimapClick);

        applyTransform();
    }

    function applyTransform() {
        if (!_inner) return;
        _inner.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    }

    // ── Zoom ─────────────────────────────────────────────────

    function onWheel(e) {
        // If the cursor is over a block, let the block scroll instead of zooming
        if (e.target.closest('.sb-block')) return;

        e.preventDefault();

        const rect = _canvas.getBoundingClientRect();
        // Mouse position relative to the canvas viewport
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const oldZoom = zoom;
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta * zoom));

        // Adjust pan so the point under the cursor stays fixed
        const scale = zoom / oldZoom;
        panX = mx - scale * (mx - panX);
        panY = my - scale * (my - panY);

        applyTransform();
        renderMinimap();
        if (window.SbLinks) window.SbLinks.render();
    }

    // ── Pan ──────────────────────────────────────────────────

    function onPanStart(e) {
        // Left-click on empty canvas area pans the view
        const isLeft = e.button === 0;

        if (!isLeft) return;

        // Don't pan if the click started on a block or interactive element
        if (e.target.closest('.sb-block')) return;
        if (e.target.closest('button')) return;
        if (e.target.closest('input')) return;
        if (e.target.closest('textarea')) return;
        if (e.target.closest('select')) return;

        // Don't pan during placement mode (ghost block present)
        if (_inner && _inner.querySelector('.sb-ghost-block')) return;

        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startPanX = panX;
        const startPanY = panY;

        _canvas.classList.add('sb-panning');

        function onMove(ev) {
            panX = startPanX + (ev.clientX - startX);
            panY = startPanY + (ev.clientY - startY);
            applyTransform();
            renderMinimap();
            if (window.SbLinks) window.SbLinks.render();
        }

        function onUp() {
            _canvas.classList.remove('sb-panning');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ── Public helpers ───────────────────────────────────────

    /** Convert a screen (client) point to canvas-inner coordinates */
    function screenToCanvas(clientX, clientY) {
        const rect = _canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left - panX) / zoom,
            y: (clientY - rect.top - panY) / zoom
        };
    }

    function getTransform() {
        return { panX, panY, zoom };
    }

    function resetView() {
        panX = 0;
        panY = 0;
        zoom = 1;
        applyTransform();
        renderMinimap();
        if (window.SbLinks) window.SbLinks.render();
    }

    // ── Minimap ─────────────────────────────────────────────

    function renderMinimap() {
        if (!_minimapCtx || !_inner || !_canvas) return;
        const ctx = _minimapCtx;
        ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

        // Gather all block bounding boxes (in canvas-inner coords)
        const blocks = _inner.querySelectorAll('.sb-block');
        const rects = [];
        blocks.forEach(b => {
            const x = parseInt(b.style.left, 10) || 0;
            const y = parseInt(b.style.top, 10) || 0;
            const w = b.offsetWidth || 260;
            const h = b.offsetHeight || 100;
            rects.push({ x, y, w, h });
        });

        if (rects.length === 0) {
            // Draw faint background only
            ctx.fillStyle = 'rgba(22,27,34,0.85)';
            ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);
            drawViewportRect(ctx, 0, 0, 4000, 3000);
            return;
        }

        // Compute world bounding box with some padding
        const PAD = 200;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        rects.forEach(r => {
            if (r.x < minX) minX = r.x;
            if (r.y < minY) minY = r.y;
            if (r.x + r.w > maxX) maxX = r.x + r.w;
            if (r.y + r.h > maxY) maxY = r.y + r.h;
        });
        minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
        const worldW = maxX - minX || 1;
        const worldH = maxY - minY || 1;

        // Scale to fit minimap
        const scaleX = MINIMAP_W / worldW;
        const scaleY = MINIMAP_H / worldH;
        const s = Math.min(scaleX, scaleY);

        // Centre within minimap
        const offX = (MINIMAP_W - worldW * s) / 2;
        const offY = (MINIMAP_H - worldH * s) / 2;

        // Background
        ctx.fillStyle = 'rgba(22,27,34,0.85)';
        ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

        // Draw blocks as gray rectangles
        ctx.fillStyle = 'rgba(139,148,158,0.5)';
        rects.forEach(r => {
            const bx = offX + (r.x - minX) * s;
            const by = offY + (r.y - minY) * s;
            const bw = Math.max(2, r.w * s);
            const bh = Math.max(2, r.h * s);
            ctx.fillRect(bx, by, bw, bh);
        });

        // Draw viewport rectangle (white outline)
        const canvasRect = _canvas.getBoundingClientRect();
        const vpLeft = (-panX / zoom);
        const vpTop = (-panY / zoom);
        const vpW = canvasRect.width / zoom;
        const vpH = canvasRect.height / zoom;

        const vx = offX + (vpLeft - minX) * s;
        const vy = offY + (vpTop - minY) * s;
        const vw = vpW * s;
        const vh = vpH * s;

        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx, vy, vw, vh);
    }

    function drawViewportRect(ctx, minX, minY, worldW, worldH) {
        const s = Math.min(MINIMAP_W / worldW, MINIMAP_H / worldH);
        const offX = (MINIMAP_W - worldW * s) / 2;
        const offY = (MINIMAP_H - worldH * s) / 2;
        const canvasRect = _canvas.getBoundingClientRect();
        const vpLeft = (-panX / zoom);
        const vpTop = (-panY / zoom);
        const vpW = canvasRect.width / zoom;
        const vpH = canvasRect.height / zoom;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
            offX + (vpLeft - minX) * s,
            offY + (vpTop - minY) * s,
            vpW * s,
            vpH * s
        );
    }

    /** Click on minimap → jump viewport */
    function onMinimapClick(e) {
        e.stopPropagation();
        if (!_inner || !_canvas) return;

        const blocks = _inner.querySelectorAll('.sb-block');
        const rects = [];
        blocks.forEach(b => {
            const x = parseInt(b.style.left, 10) || 0;
            const y = parseInt(b.style.top, 10) || 0;
            const w = b.offsetWidth || 260;
            const h = b.offsetHeight || 100;
            rects.push({ x, y, w, h });
        });

        if (rects.length === 0) return;

        const PAD = 200;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        rects.forEach(r => {
            if (r.x < minX) minX = r.x;
            if (r.y < minY) minY = r.y;
            if (r.x + r.w > maxX) maxX = r.x + r.w;
            if (r.y + r.h > maxY) maxY = r.y + r.h;
        });
        minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
        const worldW = maxX - minX || 1;
        const worldH = maxY - minY || 1;

        const scaleX = MINIMAP_W / worldW;
        const scaleY = MINIMAP_H / worldH;
        const s = Math.min(scaleX, scaleY);
        const offX = (MINIMAP_W - worldW * s) / 2;
        const offY = (MINIMAP_H - worldH * s) / 2;

        const mmRect = _minimap.getBoundingClientRect();
        const clickX = e.clientX - mmRect.left;
        const clickY = e.clientY - mmRect.top;

        // Convert minimap click to world coords
        const worldClickX = minX + (clickX - offX) / s;
        const worldClickY = minY + (clickY - offY) / s;

        // Centre viewport on that world point
        const canvasRect = _canvas.getBoundingClientRect();
        panX = -(worldClickX * zoom - canvasRect.width / 2);
        panY = -(worldClickY * zoom - canvasRect.height / 2);

        applyTransform();
        renderMinimap();
        if (window.SbLinks) window.SbLinks.render();
    }

    window.SbViewport = { init, screenToCanvas, getTransform, resetView, renderMinimap, applyTransform };
})();
