(function () {
    globalThis.FishBowlBgReputationState = globalThis.FishBowlBgReputationState || {};

    FishBowlBgReputationState.create = function create() {
        return {
            reputationCompletedServicesByKey: {},
            inFlightReputationAnalyses: new Set()
        };
    };
})();
