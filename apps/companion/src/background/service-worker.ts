/**
 * SEO OS Companion — background service worker (MV3).
 * Phase 1: keep-alive messaging + future bridge to SEO OS API.
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.info('[SEO OS Companion] installed', details.reason);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'companion.ping') {
    sendResponse({ ok: true, phase: 1, name: 'SEO OS Companion' });
    return true;
  }
  return false;
});
