(function (root) {
    'use strict';

    const actions = () => root.FishBowlContracts?.ACTIONS || {};

    async function getInvestigations() {
        return browser.runtime.sendMessage({
            action: actions().GET_INVESTIGATIONS || 'getInvestigations'
        });
    }

    async function saveInvestigation(investigation) {
        return browser.runtime.sendMessage({
            action: actions().SAVE_INVESTIGATION || 'saveInvestigation',
            investigation
        });
    }

    async function deleteInvestigation(id) {
        return browser.runtime.sendMessage({
            action: actions().DELETE_INVESTIGATION || 'deleteInvestigation',
            id
        });
    }

    async function setActiveInvestigation(id) {
        return browser.runtime.sendMessage({
            action: actions().SET_ACTIVE_INVESTIGATION || 'setActiveInvestigation',
            id
        });
    }

    async function importEntitiesToInvestigation(payload) {
        return browser.runtime.sendMessage({
            action: actions().IMPORT_ENTITIES_TO_INVESTIGATION || 'importEntitiesToInvestigation',
            ...payload
        });
    }

    async function addEntityToWorkspace(payload) {
        return browser.runtime.sendMessage({
            action: actions().ADD_ENTITY_TO_WORKSPACE || 'addEntityToWorkspace',
            ...payload
        });
    }

    async function patchInvestigationResults(payload) {
        return browser.runtime.sendMessage({
            action: actions().PATCH_INVESTIGATION_RESULTS || 'patchInvestigationResults',
            ...payload
        });
    }

    root.SbStore = {
        addEntityToWorkspace,
        deleteInvestigation,
        getInvestigations,
        importEntitiesToInvestigation,
        patchInvestigationResults,
        saveInvestigation,
        setActiveInvestigation
    };
})(typeof window !== 'undefined' ? window : globalThis);
