import { sendChromeUserIdentity, sendEvent } from '../requests';


let USER_INFO_RECEIVED = false;
let SEND_INSTALL_EVENT_IS_UPDATE = null;


function sendInstallEvent(isUpdate) {
  if (isUpdate) {
    sendEvent('update_extension');
  } else {
    sendEvent('install_extension');
  }
}


function onUserInfoReceived() {
  sendEvent('background_active');
  if (SEND_INSTALL_EVENT_IS_UPDATE !== null) {
    sendInstallEvent(SEND_INSTALL_EVENT_IS_UPDATE);
    SEND_INSTALL_EVENT_IS_UPDATE = null;
  }
  USER_INFO_RECEIVED = true;
}

if (EXTENSION_BROWSER === 'chrome') {
  chrome.identity.getProfileUserInfo((info) => {
    if (info.id !== '') {
      sendChromeUserIdentity(info.id, info.email, () => {
        onUserInfoReceived();
      }, () => {
        onUserInfoReceived();
      });
      const uninstallURL = `http://sapling.ai/uninstall?google_id=${info.id}`;
      chrome.runtime.setUninstallURL(uninstallURL);
    } else {
      onUserInfoReceived();
    }
  });
} else {
  onUserInfoReceived();
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    if (navigator.userAgent !== 'PuppeteerAgent') {
      chrome.tabs.create({ url: 'http://sapling.ai/on_install' });
    }
  }

  if (details.reason === 'install' || details.reason === 'update') {
    const isUpdate = details.reason === 'update';
    if (!USER_INFO_RECEIVED) {
      SEND_INSTALL_EVENT_IS_UPDATE = isUpdate;
    } else {
      sendInstallEvent(isUpdate);
    }
  }
});


chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'backgroundActiveEvent') {
    sendEvent('background_active');
  }
});

chrome.alarms.create('backgroundActiveEvent', { periodInMinutes: 6 * 60 });
