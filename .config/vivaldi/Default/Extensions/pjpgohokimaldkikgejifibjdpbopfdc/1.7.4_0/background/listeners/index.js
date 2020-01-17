let SAPLING_INIT_FRAME_IDS = new Set();

// Reset toolbar icon badge
chrome.browserAction.setBadgeText({ text: '' });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) {
    return;
  }

  if (request.action === 'makeToolbarIconActive') {
    chrome.browserAction.setIcon({ path: 'assets/sapling-32x32.png' });
    chrome.browserAction.setBadgeText({ text: '' });
    chrome.browserAction.setTitle({ title: 'Sapling is ready to go.' });
    sendResponse({ status: true, success: true });
  } else if (request.action === 'makeToolbarIconInactive') {
    chrome.browserAction.setIcon({ path: 'assets/sapling-inactive-32x32.png' });
    chrome.browserAction.setBadgeText({ text: '' });
    chrome.browserAction.setTitle({ title: 'Sapling disabled.' });
    sendResponse({ status: true, success: true });
  } else if (request.action === 'makeToolbarIconThrottled') {
    chrome.browserAction.setIcon({ path: 'assets/sapling-inactive-32x32.png' });
    chrome.browserAction.setBadgeText({ text: '!' });
      chrome.browserAction.setBadgeBackgroundColor({ color: 'orange' });
    chrome.browserAction.setTitle({ title: 'Daily limit exceeded for this site.' });
    sendResponse({ status: true, success: true });
  } else if (request.action === 'makeToolbarIconLoading') {
    chrome.browserAction.setBadgeText({ text: '*' });
    chrome.browserAction.setBadgeBackgroundColor({ color: '#CFBB16' });
    chrome.browserAction.setTitle({ title: 'Loading edits...' });
    sendResponse({ status: true, success: true });
  } else if (request.action === 'updateToolbarIconEditCount') {
    const count = request.data.editCount;
    if (count === 0) {
      chrome.browserAction.setBadgeText({ text: '0' });
      chrome.browserAction.setBadgeBackgroundColor({ color: 'green' });
      chrome.browserAction.setTitle({ title: 'No errors detected!' });
    } else {
      chrome.browserAction.setBadgeText({ text: count.toString() });
      chrome.browserAction.setBadgeBackgroundColor({ color: 'red' });
      const message = `${count.toString()} ${(count === 1) ? 'error' : 'errors'} detected.`;
      chrome.browserAction.setTitle({ title: message });
    }
    sendResponse({ status: true, success: true });
  } else if (request.action === 'updateToolbarIconDisconnected') {
    chrome.browserAction.setBadgeText({ text: '-' });
    chrome.browserAction.setBadgeBackgroundColor({ color: 'black' });
    chrome.browserAction.setTitle({ title: 'Cannot connect to server.' });
    sendResponse({ status: true, success: true });
  } else if (request.action === 'init/CHECK_CONTENT_SCRIPT_ACTIVE') {
    sendResponse({ status: true, success: true });
  }
});

function isTabWithValidUrl(url) {
  if (EXTENSION_BROWSER === 'edge') {
    // TODO Determine whether chrome:// okay
    return !url.startsWith('chrome://') && !url.startsWith('ms-browser-extension://') && 
      !url.startsWith('chrome-error://')  && !url.startsWith('about:');
  } else if (EXTENSION_BROWSER === '') {
    // FF uses chrome:// too, not sure about chrome-error://
    return !url.startsWith('chrome://') && !url.startsWith('moz-extension://') &&
      !url.startsWith('chrome-error://') && !url.startsWith('about:');
  }
  return !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') &&
    !url.startsWith('chrome-error://');
}

function injectIfNotInitialized(tabId) {
  chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
    if (!frames) {
      return;
    }
    frames.forEach((frame) => {
      // Salesforce editor frames are 'about:blank' for some reason
      if (!frame.errorOccurred && frame.url !== 'about:srcdoc') {
        if (SAPLING_INIT_FRAME_IDS.has(frame.frameId)) return;
        SAPLING_INIT_FRAME_IDS.add(frame.frameId);
        chrome.tabs.sendMessage(
          tabId,
          { action: 'init/CONTENT_SCRIPT_LOADED' },
          { frameId: frame.frameId },
          () => {
            chrome.runtime.getManifest().content_scripts.forEach((contentScript) => {
              contentScript.css.forEach((cssFilePath) => {
                chrome.tabs.insertCSS(tabId, {
                  file: cssFilePath,
                  frameId: frame.frameId,
                  matchAboutBlank: true,
                });
              });
              // Can also put allFrames here; got slowdowns on SFDC
              contentScript.js.forEach((jsFilePath) => {
                chrome.tabs.executeScript(tabId, {
                  file: jsFilePath,
                  frameId: frame.frameId,
                  matchAboutBlank: true,
                });
              });
            });
          },
        );
      }
      else {
        //console.log('skipping frame ' + frame.frameId + ' ' + frame.url)
      }
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // all_frames in manifest not sufficient
  if (request.action === 'init/NEW_IFRAME_LOADED') {
    if (sender.tab) {
      injectIfNotInitialized(sender.tab.id);
    }
    else {
      //console.log('no sender.tab');
    }
    sendResponse({ status: true, success: true });
  } else if (request.action === 'init/GET_LOCATION') {
    if (sender.tab) {
      chrome.webNavigation.getFrame({ tabId: sender.tab.id, frameId: 0 }, (frame) => {
        if (frame) {
          sendResponse({ status: true, success: true, data: { url: frame.url } });
        }
        else {
          sendResponse({ status: true, success: true, data: { url: '' } });
        }
      });
    } else {
      chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
        if (tabs) {
          sendResponse({ status: true, success: true, data: { url: tabs[0].url } });
        } else {
          sendResponse({ status: true, success: true, data: { url: '' } });
        }
      });
    }
    return true; // returning asynchronously
  }

  return false;
});

// The below code is responsible for making sure all active tabs
// have a valid content script.  Content scripts get invalidated
// on update/installs.  Inject content script if doesn't exist.
// WARNING: there is the possibility that two content scripts get
// loaded if tab.status != "complete".
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (isTabWithValidUrl(tab.url) && tab.status === 'complete') {
      injectIfNotInitialized(tab.id);
    }
  });
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (isTabWithValidUrl(tab.url) && tab.active && changeInfo.status === 'complete') {
    injectIfNotInitialized(tab.id);
  }
});
chrome.tabs.query({ active: true }, (tabs) => {
  for (let i = 0; i < tabs.length; i += 1) {
    const tab = tabs[i];
    if (isTabWithValidUrl(tab.url) && tab.status === 'complete') {
      injectIfNotInitialized(tab.id);
    }
  }
});
