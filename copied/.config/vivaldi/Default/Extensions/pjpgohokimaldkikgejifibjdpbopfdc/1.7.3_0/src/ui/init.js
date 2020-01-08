import Raven from 'raven-js';
import { initializeObservers, disconnectAllObservers, sendMessageHandler } from '../ui/observers';
import { initToolbar } from '../ui/toolbar';
import initializeSaplingEmbedded from '../ui/embed';
import initPremiumStatusBar from '../ui/triggers';
import { setIsEnabledOnSiteLocally, setUserProperties, setSiteSettings } from '../ui/settings';
import { setTopFrameUrl, getTopFrameHostname, getTopFramePathname } from '../utils/location';
import isPopupEnvironment from '../utils/extension';
import { getUser, getSettings } from '../requests/index';

let SAPLING_INITIALIZED = false;

if (SAPLING_ENV.SENTRY_DSN) {
  const manifestData = chrome.runtime.getManifest();
  Raven.config(SAPLING_ENV.SENTRY_DSN, {
    tags: { version: manifestData.version, background: false },
  }).install();
}

// This is safe: https://developer.chrome.com/extensions/content_scripts#run_time
// used for determining when we should display "install" button on our site
if (document.body) {
  document.body.setAttribute('sapling-installed', true);
  document.body.setAttribute('crio-installed', true);
}

function initApp() {
  initializeObservers();
  initToolbar();
  initPremiumStatusBar();
  if (isPopupEnvironment()) {
    initializeSaplingEmbedded();
  }
}

function getStoragePromise() {
  return new Promise((resolve) => {
    const hostname = getTopFrameHostname();
    const syncKey = `crioenabled${hostname}`;
    chrome.storage.sync.get(syncKey, (obj) => {
      setIsEnabledOnSiteLocally(obj[syncKey]);
      resolve();
    });
  });
}

function getUserPromise() {
  return new Promise((resolve) => {
    getUser(false, (user) => {
      setUserProperties(user);
      resolve();
    }, () => {
      resolve();
    });
  });
}

function getSettingsPromise() {
  return new Promise((resolve) => {
    getSettings(getTopFrameHostname(), getTopFramePathname(), (settings) => {
      setSiteSettings(settings);
      resolve();
    }, () => {
      resolve();
    });
  });
}

function getAllPromises() {
  //return Promise.all([getStoragePromise(), getUserPromise(), getSettingsPromise()]);
  return Promise.all([getStoragePromise(), getSettingsPromise()]);
}

function init() {
  new Promise((resolve) => {
    sendMessageHandler('init/GET_LOCATION', {}, (response) => {
      setTopFrameUrl(response.url);
      resolve();
    });
  }).then(() => getUserPromise()).then(() => getAllPromises()).then(() => {
    initApp();
  });//.catch((reason) => {
  //  console.log('Rejected promise: ' + reason);
  //});
}

function initWithRaven() {
  Raven.context(() => {
    init();
  });

  SAPLING_INITIALIZED = true;
}

function isWindowLoaded() {
  return document.readyState === 'complete';
}

$(window).on('load', () => {
  initWithRaven();
});

$(window).on('unload', () => {
  disconnectAllObservers();
});

// TODO When does this affect already open tabs?
if (isWindowLoaded() && !SAPLING_INITIALIZED) {
  initWithRaven();
}

