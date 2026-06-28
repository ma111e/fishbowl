(function (root) {
    'use strict';

    // ── Canonical response helpers ────────────────────────────────────────────
    // Background handlers should use these rather than building {success:...}
    // literals by hand. Both `ok` (new) and `success` (legacy) are emitted so
    // existing callers that check `response.success` continue to work while
    // new code migrates to checking `response.ok`.

    /**
     * Build a success response.
     * @param {object} [data] - extra properties to merge into the envelope
     * @returns {{ ok: true, success: true } & data}
     */
    function respond(data) {
        return Object.assign({ ok: true, success: true }, data || {});
    }

    /**
     * Build an error response.
     * @param {string} code   - machine-readable error code (snake_case)
     * @param {string} [message] - human-readable detail (optional)
     * @returns {{ ok: false, success: false, error: { code, message } }}
     */
    function respondError(code, message) {
        return { ok: false, success: false, error: { code, message: message || code } };
    }

    // ── Request validation ────────────────────────────────────────────────────
    /**
     * Validate a message request against a simple schema.
     *
     * @param {{ required?: string[], types?: Record<string,string> }} schema
     * @param {object} request
     * @returns {{ valid: true } | { valid: false, error: { code, message } }}
     *
     * Example:
     *   validateRequest({ required: ['value', 'serviceId'], types: { value: 'string' } }, request)
     */
    function validateRequest(schema, request) {
        const required = schema.required || [];
        for (const field of required) {
            if (request[field] == null) {
                return { valid: false, error: { code: 'missing_field', message: `Missing required field: ${field}` } };
            }
        }
        const types = schema.types || {};
        for (const [field, expectedType] of Object.entries(types)) {
            if (request[field] != null && typeof request[field] !== expectedType) {
                return { valid: false, error: { code: 'invalid_type', message: `Field '${field}' must be ${expectedType}` } };
            }
        }
        return { valid: true };
    }

    // ── Action constants ──────────────────────────────────────────────────────

    const ACTIONS = Object.freeze({
        OPEN_DASHBOARD: 'openDashboard',
        PROXY_ANALYZE_PAGE: 'proxyAnalyzePage',
        GET_EXTENSION_CSS_TEXT: 'getExtensionCssText',
        BYPASS_CSP: 'bypassCSP',
        ANALYZE_REPUTATION: 'analyze-reputation',
        ANALYZE_REPUTATION_SINGLE: 'analyze-reputation-single',
        DOM_EXTRACTED: 'domExtracted',
        UPDATE_VERDICT: 'updateVerdict',
        ALL_SERVICES_COMPLETE: 'allServicesComplete',
        OPEN_SANDBOX: 'openSandbox',
        GET_INVESTIGATIONS: 'getInvestigations',
        SAVE_INVESTIGATION: 'saveInvestigation',
        DELETE_INVESTIGATION: 'deleteInvestigation',
        SET_ACTIVE_INVESTIGATION: 'setActiveInvestigation',
        IMPORT_ENTITIES_TO_INVESTIGATION: 'importEntitiesToInvestigation',
        ADD_ENTITY_TO_WORKSPACE: 'addEntityToWorkspace',
        PATCH_INVESTIGATION_RESULTS: 'patchInvestigationResults',
        RESCAN: 'fishbowl_rescan',
        PAIR_NOW: 'fishbowl_pair_now'
    });

    function normalizeEntityType(entityType) {
        return (entityType || '').toString().trim().toLowerCase();
    }

    function cacheKey(entityType, value) {
        if (!root.FishBowlConsts?.reputationCacheKey) return '';
        return root.FishBowlConsts.reputationCacheKey(entityType, value);
    }

    function serviceDefsFor(entityType) {
        const t = normalizeEntityType(entityType);
        return root.FishBowlConfig?.REPUTATION_SERVICE_DEFS?.[t] || [];
    }

    function serviceById(entityType, serviceId) {
        const id = (serviceId || '').toString().trim();
        return serviceDefsFor(entityType).find(service => service.id === id) || null;
    }

    function dashboardServices() {
        if (Array.isArray(root.FishBowlConfig?.ALL_SERVICES)) {
            return root.FishBowlConfig.ALL_SERVICES;
        }

        const defs = root.FishBowlConfig?.REPUTATION_SERVICE_DEFS || {};
        const byId = new Map();
        Object.values(defs).flat().forEach((service) => {
            if (service?.id && !byId.has(service.id)) {
                byId.set(service.id, service);
            }
        });
        return Array.from(byId.values());
    }

    root.FishBowlContracts = Object.freeze({
        ACTIONS,
        ENTITY_TYPES: root.FishBowlConsts?.ENTITY_TYPES || {},
        cacheKey,
        dashboardServices,
        normalizeEntityType,
        respond,
        respondError,
        serviceById,
        serviceDefsFor,
        validateRequest
    });
})(typeof window !== 'undefined' ? window : globalThis);
