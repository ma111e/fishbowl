/**
 * FishBowl - Investigation Sandbox: Block Drag Module
 *
 * Makes entity type blocks draggable within the canvas and persists
 * positions back into the investigation via a save callback.
 *
 * Exposed on `window.SbDrag`.
 */

(function () {
    function enableDrag(canvasInner, onPositionChange) {
        // Clear selection when clicking empty canvas space
        canvasInner.addEventListener('mousedown', (e) => {
            if (e.target === canvasInner || e.target.tagName.toLowerCase() === 'svg') {
                canvasInner.querySelectorAll('.sb-block-selected').forEach(b => b.classList.remove('sb-block-selected'));
            }
        });

        canvasInner.querySelectorAll('.sb-block').forEach(block => {
            attachDrag(block, onPositionChange);
        });
    }

    /** Interactive selectors that should NOT start a drag */
    const INTERACTIVE_SELECTOR = 'button, input, select, textarea, .sb-entity-value, .sb-detail-val, .sb-enrichment-derived-val';

    /**
     * Attach drag to a single block element.
     * Drag starts from anywhere on the block except interactive elements.
     */
    function attachDrag(block, onPositionChange) {
        // Avoid double-binding
        if (block.dataset.dragBound) return;
        block.dataset.dragBound = '1';

        let startMouseX, startMouseY;
        let draggingBlocks = [];
        let isDragging = false;

        function onMouseDown(e) {
            // Ignore right-clicks/middle-clicks
            if (e.button !== 0) return;

            // Don't drag when clicking on interactive elements
            if (e.target.closest(INTERACTIVE_SELECTOR)) return;

            e.preventDefault();

            // Handle selection logic early
            const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;

            if (isMultiSelect) {
                // Toggle selection state
                block.classList.toggle('sb-block-selected');
                // If it was just deselected, don't start a drag
                if (!block.classList.contains('sb-block-selected')) return;
            } else {
                // If clicking an unselected block without modifiers, clear others and select this one
                // If clicking an already selected block, keep others selected (we might be starting a group drag)
                if (!block.classList.contains('sb-block-selected')) {
                    document.querySelectorAll('.sb-block-selected').forEach(b => b.classList.remove('sb-block-selected'));
                    block.classList.add('sb-block-selected');
                }
            }

            startMouseX = e.clientX;
            startMouseY = e.clientY;

            // Gather all selected blocks for dragging
            const selectedBlocks = Array.from(document.querySelectorAll('.sb-block-selected'));
            // If the current block somehow isn't in the selection, make sure it is included
            if (!selectedBlocks.includes(block)) {
                selectedBlocks.push(block);
            }

            draggingBlocks = selectedBlocks.map(b => ({
                el: b,
                startLeft: parseInt(b.style.left, 10) || 0,
                startTop: parseInt(b.style.top, 10) || 0,
                id: b.dataset.workspaceId || b.dataset.enrichmentId || b.dataset.type
            }));

            isDragging = false;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            // Divide delta by zoom so the block follows the cursor at any zoom level
            const zoom = (window.SbViewport && window.SbViewport.getTransform) ? window.SbViewport.getTransform().zoom : 1;
            const dx = (e.clientX - startMouseX) / zoom;
            const dy = (e.clientY - startMouseY) / zoom;

            // Wait for at least 3px of movement to consider it a drag vs a click
            if (!isDragging && (Math.abs(e.clientX - startMouseX) > 3 || Math.abs(e.clientY - startMouseY) > 3)) {
                isDragging = true;
                draggingBlocks.forEach(b => b.el.classList.add('sb-block-dragging'));
            }

            if (!isDragging) return;

            draggingBlocks.forEach(b => {
                const newLeft = Math.max(0, b.startLeft + dx);
                const newTop = Math.max(0, b.startTop + dy);
                b.el.style.left = `${newLeft}px`;
                b.el.style.top = `${newTop}px`;
            });

            // Re-render links and minimap while dragging
            if (window.SbLinks) window.SbLinks.render();
            if (window.SbViewport) window.SbViewport.renderMinimap();
        }

        function onMouseUp(e) {
            const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (!isDragging) {
                // It was just a click, not a drag. 
                // If modifiers were NOT used and we clicked a selected block,
                // we should clear all other selections now (making it the only selection).
                if (!isMultiSelect) {
                    document.querySelectorAll('.sb-block-selected').forEach(b => {
                        if (b !== block) b.classList.remove('sb-block-selected');
                    });
                }
                draggingBlocks = [];
                return;
            }

            draggingBlocks.forEach(b => b.el.classList.remove('sb-block-dragging'));

            if (onPositionChange && draggingBlocks.length > 0) {
                const updates = draggingBlocks.filter(b => b.id).map(b => ({
                    id: b.id,
                    x: parseInt(b.el.style.left, 10) || 0,
                    y: parseInt(b.el.style.top, 10) || 0
                }));
                onPositionChange(updates);
            }

            draggingBlocks = [];
            if (window.SbViewport) window.SbViewport.renderMinimap();
        }

        block.addEventListener('mousedown', onMouseDown);
    }

    window.SbDrag = { enableDrag, attachDrag };
})();
