import Raven from 'raven-js';
import './globals';
import './listeners';
import './listeners/requests';
import './users';

if (SAPLING_ENV.SENTRY_DSN) {
  const manifestData = chrome.runtime.getManifest();
  Raven.config(SAPLING_ENV.SENTRY_DSN, {
    tags: { version: manifestData.version, background: true },
  }).install();
}

Raven.context(() => {
  chrome.runtime.setUninstallURL('http://sapling.ai/uninstall');


  const MAX_TIME_SAVED_SECONDS = 60 * 60 * 4;


  function getTimeSeconds() {
    return Math.floor(Date.now() / 1000);
  }


  let popupHtml = '';
  let lastTimeSeconds = getTimeSeconds();


  chrome.storage.local.get('popupStorage', (obj) => {
    const { popupStorage } = obj;
    if (obj && typeof popupStorage !== 'undefined' && getTimeSeconds() - popupStorage.lastTimeSeconds <= MAX_TIME_SAVED_SECONDS) {
      popupHtml = popupStorage.html;
    } else {
      chrome.storage.local.remove('popupStorage');
    }
  });


  chrome.runtime.onConnect.addListener((externalPort) => {
    externalPort.onMessage.addListener((msg) => {
      popupHtml = msg;
    });
    externalPort.onDisconnect.addListener(() => {
      lastTimeSeconds = getTimeSeconds();
      const popupStorage = {
        lastTimeSeconds,
        html: popupHtml,
      };
      chrome.storage.local.set({ popupStorage });
    });
  });


  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request) {
      return;
    }

    if (request.action === 'popup/GET_HTML') {
      let returnedHtml = popupHtml;
      if (getTimeSeconds() - lastTimeSeconds > MAX_TIME_SAVED_SECONDS) {
        returnedHtml = '';
      }
      sendResponse({ status: true, success: true, data: { popupHtml: returnedHtml } });
    }
  });
});
