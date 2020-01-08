// used to determine if content script has been loaded properly.
// non-response means content script not loaded, and background script
// will attempt to re-inject content script.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'init/CONTENT_SCRIPT_LOADED') {
    sendResponse({ status: true, success: true });
  }
});
