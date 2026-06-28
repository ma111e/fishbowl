(function (root) {
    'use strict';

    function linkEntityToEnrichmentBlocks(inv, type, value, workspaceId) {
        if (!inv || !workspaceId) return false;
        if (!inv.links) inv.links = [];
        let added = false;
        const enrichmentBlocks = inv.enrichmentBlocks || [];
        for (const block of enrichmentBlocks) {
            const derived = block.derivedEntities || [];
            const found = derived.some(de => de.value === value && de.type === type);
            if (!found) continue;

            const linkKey = `${block.id} -> ${workspaceId}`;
            const legacyLinkKey = `${block.id} → ${workspaceId}`;
            if (!inv.links.find(l => l.key === linkKey || l.key === legacyLinkKey)) {
                inv.links.push({
                    key: legacyLinkKey,
                    from: { blockId: block.id },
                    to: { blockId: workspaceId },
                    label: 'derived'
                });
                added = true;
            }
        }
        return added;
    }

    function buildAdjacency(inv, allEntities) {
        const adj = new Map();
        allEntities.forEach(e => adj.set(e.id, []));

        (inv.links || []).forEach(l => {
            const from = l.from.blockId;
            const to = l.to.blockId;
            if (adj.has(from) && adj.has(to)) {
                adj.get(from).push(to);
                adj.get(to).push(from);
            }
        });

        (inv.enrichmentBlocks || []).forEach(b => {
            if (b.parentId && adj.has(b.id) && adj.has(b.parentId)) {
                adj.get(b.id).push(b.parentId);
                adj.get(b.parentId).push(b.id);
            }
        });

        return adj;
    }

    function buildClusters(allEntities, adj) {
        const visited = new Set();
        const clusters = [];

        for (const ent of allEntities) {
            if (!visited.has(ent.id)) {
                const cluster = [];
                const q = [ent.id];
                visited.add(ent.id);

                while (q.length > 0) {
                    const curr = q.shift();
                    const e = allEntities.find(x => x.id === curr);
                    if (e) cluster.push(e);

                    for (const neighbor of (adj.get(curr) || [])) {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            q.push(neighbor);
                        }
                    }
                }
                clusters.push(cluster);
            }
        }

        clusters.sort((a, b) => b.length - a.length);
        return clusters;
    }

    function resolveOverlaps(allEntities, getSize) {
        const PAD = 20;
        const MAX_PASSES = 30;
        const sizes = new Map();

        allEntities.forEach(ent => {
            const size = getSize(ent);
            sizes.set(ent.id, {
                w: (size ? size.w : 250) + PAD,
                h: (size ? size.h : 150) + PAD
            });
        });

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            let moved = false;

            for (let i = 0; i < allEntities.length; i++) {
                for (let j = i + 1; j < allEntities.length; j++) {
                    const a = allEntities[i];
                    const b = allEntities[j];
                    const sa = sizes.get(a.id);
                    const sb = sizes.get(b.id);
                    const overlapX = Math.min(a.x + sa.w, b.x + sb.w) - Math.max(a.x, b.x);
                    const overlapY = Math.min(a.y + sa.h, b.y + sb.h) - Math.max(a.y, b.y);

                    if (overlapX > 0 && overlapY > 0) {
                        moved = true;
                        if (overlapX < overlapY) {
                            const shift = Math.ceil(overlapX / 2) + 1;
                            if (a.x <= b.x) { a.x -= shift; b.x += shift; }
                            else { a.x += shift; b.x -= shift; }
                        } else {
                            const shift = Math.ceil(overlapY / 2) + 1;
                            if (a.y <= b.y) { a.y -= shift; b.y += shift; }
                            else { a.y += shift; b.y -= shift; }
                        }
                    }
                }
            }

            if (!moved) break;
        }

        let minX = Infinity;
        let minY = Infinity;
        for (const ent of allEntities) {
            if (ent.x < minX) minX = ent.x;
            if (ent.y < minY) minY = ent.y;
        }
        if (minX < 40 || minY < 40) {
            const shiftX = minX < 40 ? 40 - minX : 0;
            const shiftY = minY < 40 ? 40 - minY : 0;
            for (const ent of allEntities) {
                ent.x = Math.round(ent.x + shiftX);
                ent.y = Math.round(ent.y + shiftY);
            }
        }
    }

    root.SbLayout = {
        buildAdjacency,
        buildClusters,
        linkEntityToEnrichmentBlocks,
        resolveOverlaps
    };
})(typeof window !== 'undefined' ? window : globalThis);
