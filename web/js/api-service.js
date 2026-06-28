/**
 * Send analysis data to the backend server via the background service worker.
 * Routing through background ensures WebCrypto signing runs in a secure context
 * regardless of whether the current page is HTTP or HTTPS.
 * @param {Object} payload The payload
 * @returns {Promise<Object>} The analysis results
 */
async function sendAnalysisRequest(payload) {
    const resp = await browser.runtime.sendMessage({ action: 'proxyAnalyzePage', payload });
    if (!resp || !resp.ok) {
        throw new Error(resp?.error || 'Analysis request failed');
    }
    return resp.data;
}
