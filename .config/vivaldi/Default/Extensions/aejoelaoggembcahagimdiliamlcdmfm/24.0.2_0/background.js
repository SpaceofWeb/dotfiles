/* eslint-disable no-bitwise,no-mixed-operators, no-console */

/**
 * Constants
 */

const EXTENSION_ID = chrome.runtime.id;
const EXTENSION_VERSION = chrome.app.getDetails().version;
const PAYLOAD_TYPE_NONE = 'none';
const MESSAGE_PAYLOAD_TYPES = [ 'none', 'restletClient', 'apiTester' ]; // From: MessagePayloadProcessor

const TRUSTED_DOMAINS = [ // /!\ To be used on new URL(url).host /!\
  new RegExp(EXTENSION_ID), // Host for extensions is extension ID
  /^[a-zA-Z0-9-.]+\.talend\.com$/,
  /^[a-zA-Z0-9-.]+\.talend\.com:[0-9]+$/, // Local stacks (demo)
  /^[a-zA-Z0-9-.]+\.api-documentation\.com$/,
  /^localhost:[0-9]+$/,
  /^127\.0\.0\.1\.xip\.io:[0-9]+$/,
];

/* /!\/!\/!\ DO NOT CHANGE THE LINE BELOW, USE npm run transition-double-packaging instead /!\/!\/!\ */
const isFreeUser = EXTENSION_ID === 'aejoelaoggembcahagimdiliamlcdmfm'
  || EXTENSION_ID.includes('fgemelbdnkclcmb');
/* /!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\/!\ */

window.isFreeUser = isFreeUser;
window.extensionId = EXTENSION_ID;

/**
 * Utility functions
 */

const adaptQueryStringFirstPart = (queryStringFirstPart) => {
  const queryStringStarter = /^[?]/.test(queryStringFirstPart || '') ? '' : '?';
  return `${queryStringStarter}${queryStringFirstPart}&`;
};

const generateQueryString = (queryStringFirstPart, querySecondPart) => {
  const queryStringSecondPart = Object.keys(querySecondPart)
    .filter(key => querySecondPart[ key ])
    .map(key => `${key}=${querySecondPart[ key ]}`)
    .join('&');

  return `${adaptQueryStringFirstPart(queryStringFirstPart)}${queryStringSecondPart}`;
};

const getExtensionUrl = (isDevMode, queryString) =>
  `chrome-extension://${EXTENSION_ID}/index${isDevMode ? '_dev' : ''}.html${queryString || ''}`;

// From: https://gist.github.com/jcxplorer/823878, changed to pass linting
const uuid = () => {
  const hyphensIndexes = [ 8, 13, 18, 23 ];
  return Array(36)
    .fill(0)
    .map((__, index) => {
      // eslint-disable-next-line no-bitwise
      const random = Math.random() * 16 | 0;

      if (hyphensIndexes.includes(index)) {
        return '-';
      }

      if (index === 14) {
        return (4).toString(16);
      }

      if (index === 19) {
        // eslint-disable-next-line no-bitwise,no-mixed-operators
        return (random & 3 | 8).toString(16);
      }

      return (random).toString(16);
    })
    .join('');
};

const closeTabById = tabId => new Promise((resolve, reject) => {
  chrome.tabs.remove(tabId, () => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
});

/**
 * Returns false if no Tester tab is opened, the id of the opened tab otherwise.
 */
const findOpenedExtensionTab = () => Promise.all(chrome.extension.getViews({ type: 'tab' }))
  .then(tabs => (Array.isArray(tabs) && tabs.length ? tabs[ 0 ].testerTabId : false));

const closeAllExtensionTabs = () => Promise.all(chrome.extension.getViews({ type: 'tab' })
  .map(tab => closeTabById(tab.testerTabId /* Set on tab by ChromeAppEntryPoint#registerTabId */)));

/**
 * Initialization
 */

const restoreLastSessionTabs = () => {
  const clearOpenedTabs = () => chrome.storage.local.remove('app.opened.tabs');

  chrome.storage.local.get('app.opened.tabs', (openedTabs) => {
    const apiTesterOpenedTabs = openedTabs[ 'app.opened.tabs' ];
    if (apiTesterOpenedTabs) {
      apiTesterOpenedTabs.forEach((url) => {
        chrome.tabs.create({ url }, clearOpenedTabs);
      });
    }
  });
};

restoreLastSessionTabs();

const payloadStore = {};

// Used in ChromeAppEntryPoint, don't delete no matter what IntelliJ says
// eslint-disable-next-line no-unused-vars
window.retrieveApplicationPayloadDefinition = (key) => {
  const data = payloadStore[ key ];
  if (data) {
    delete payloadStore[ key ];
  }
  return data;
};

/**
 * Message handling
 */

const stripPatchVersion = applicationVersion => /^([0-9]+\.[0-9]+\.[0-9]+)(\.[0-9]+)?$/.exec(applicationVersion)[ 1 ];

const validateQueryString = (queryString) => {
  if (!queryString || typeof queryString === 'string') {
    return true;
  }

  console.warn('Field queryString of a message must be a string. Message ignored.');
  return false;
};

const validateEnumField = (fieldName, message, enumAsArray) => {
  if (enumAsArray.includes(message[ fieldName ])) { return true; }

  const acceptedValues = enumAsArray.join(', ');
  console.warn(`Field ${fieldName} of a message must be one of [ ${acceptedValues} ]. Message ignored`);
  return false;
};

const validateBooleanField = (fieldName, message) => {
  const fieldValue = message[ fieldName ] || false;
  if (typeof fieldValue === 'boolean') {
    return true;
  }

  console.warn(`Field ${fieldName} of a message must be a boolean. Message ignored.`);
  return false;
};

// BEGIN: message handlers

const handleUpgrade = () => {
  const openedTabsUrl = chrome.extension.getViews({ type: 'tab' })
    .map(tab => tab.location.href);

  chrome.storage.local.set(
    { 'app.opened.tabs': openedTabsUrl },
    () => {
      if (chrome.runtime.lastError) {
        // Just in case
        chrome.storage.local.remove('app.opened.tabs');
        return;
      }
      chrome.runtime.reload();
    },
  );
};

/**
 * See documentation in $TAT_CLIENT/doc/bridges.md
 */
const handleOpenApiOrRequest = (message, sender) => {
  if (sender.tab == null) { return false; }
  if (!validateEnumField('payloadType', message, MESSAGE_PAYLOAD_TYPES)) { return false; }
  if (!validateQueryString(message.queryString)) { return false; }
  if (!validateBooleanField('isDevMode', message)) { return false; }
  if (!validateBooleanField('shouldReplaceOriginTab', message)) { return false; }
  if (!validateBooleanField('shouldReplaceTab', message)) { return false; }
  if (!validateBooleanField('useExistingTab', message)) { return false; }

  const query = { key: uuid(), payloadType: message.payloadType };
  const queryString = generateQueryString(message.queryString, query);
  const targetUrl = getExtensionUrl(message.isDevMode, queryString);
  const senderTabId = sender.tab.id;

  const shouldReplaceOriginTab = message.shouldReplaceOriginTab
    // TODO: remove the two below when all callers use the new version above (see TAD-342)
    || message.shouldReplaceTab
    || message.useExistingTab;

  payloadStore[ query.key ] = {
    messageType: message.type,
    payloadType: message.payloadType,
    payload: JSON.stringify(message.payload), // MUST be parsed with AutoBean T-T => parsing done elsewhere.
    url: sender.url,
  };

  if (shouldReplaceOriginTab) {
    return closeAllExtensionTabs()
      .then(() => chrome.tabs.update(senderTabId, { url: targetUrl, active: true }, () => {}));
  }

  return findOpenedExtensionTab()
    .then(openedTabId => (
      openedTabId
        ? chrome.tabs.update(openedTabId, { url: targetUrl, active: true }, () => {})
        : chrome.tabs.create({ url: targetUrl, active: true }, () => {})
    ));
};

const getApplicationInstances = sender => chrome.extension.getViews({ type: 'tab' })
  .filter(applicationWindow => applicationWindow.testerTabId !== sender.tab.id);

const checkRootNameAvailability = (message, sender, sendResponse) => {
  const applicationInstancesPromiseList = getApplicationInstances(sender)
    .map(applicationWindow => new Promise((resolve, reject) => {
      const onFailureCheckAvailability = setTimeout(reject, 5000);
      chrome.tabs.sendMessage(applicationWindow.testerTabId, message, (isAvailable) => {
        clearTimeout(onFailureCheckAvailability);
        resolve(isAvailable);
      });
    }));

  Promise.all(applicationInstancesPromiseList)
    .then(availabilities => availabilities.reduce((accumulator, availability) => accumulator && availability, true))
    .then(sendResponse)
    .catch(() => sendResponse(false));
  return true;
};

const notifyRunningInstances = (message, sender) => {
  getApplicationInstances(sender)
    .forEach(applicationWindow => chrome.tabs.sendMessage(applicationWindow.testerTabId, message));
};

const handleDiscovery = (message, sender, sendResponse) => {
  sendResponse(stripPatchVersion(EXTENSION_VERSION));
};

/**
 * See documentation in $TAT_CLIENT/doc/bridges.md
 */
const openExtension = (message, sender) => {
  if (!validateQueryString(message.queryString)) { return; }
  if (!validateBooleanField('isDevMode', message)) { return; }
  if (!validateBooleanField('shouldReplaceOriginTab', message)) { return; }
  if (!validateBooleanField('shouldReplaceTab', message)) { return; }
  if (!validateBooleanField('useExistingTab', message)) { return; }

  const query = { key: uuid(), payloadType: PAYLOAD_TYPE_NONE };
  const queryString = generateQueryString(message.queryString, query);
  const targetUrl = getExtensionUrl(message.isDevMode, queryString);
  const senderTabId = sender.tab.id;

  const shouldReplaceOriginTab = message.shouldReplaceOriginTab
    // TODO: remove the two below when all callers use the new version above (see TAD-342)
    || message.shouldReplaceTab
    || message.useExistingTab;

  payloadStore[ query.key ] = {
    messageType: message.type,
    payloadType: PAYLOAD_TYPE_NONE,
    url: sender.url,
  };

  findOpenedExtensionTab()
    .then((openTesterTabId) => {
      if (openTesterTabId) {
        return chrome.tabs.update(openTesterTabId, { active: true }, () => {}); // No URL change, just bring to front
      }

      return closeAllExtensionTabs()
        .then(() => (shouldReplaceOriginTab
          ? chrome.tabs.update(senderTabId, { url: targetUrl, active: true }, () => {})
          : chrome.tabs.create({ url: targetUrl, active: true }, () => {})));
    });
};

const MESSAGE_TYPES = {
  // related to multi tabs (do not remove, this feature will be reintroduced soon)
  checkRootNameAvailability: {
    isProtected: true,
    handler: checkRootNameAvailability,
  },
  notifyRunningInstances: {
    isProtected: true,
    handler: notifyRunningInstances,
  },

  // allow any caller to check the current version of Tester
  discovery: {
    isProtected: false,
    handler: handleDiscovery,
  },
  // allow authorized callers to ask to upgrade Tester
  upgrade: {
    isProtected: true,
    handler: handleUpgrade,
  },

  // open Tester from an authorized application
  openApi: {
    isProtected: true,
    handler: handleOpenApiOrRequest,
  },
  openRequest: {
    isProtected: false,
    handler: handleOpenApiOrRequest,
  },
  openExtension: {
    isProtected: false,
    handler: openExtension,
  },
};
// END: message handlers

const createMessageListener = () => (message, sender, sendResponse) => {
  if (!message || !message.type || !MESSAGE_TYPES[ message.type ]) { return false; }

  const messageType = MESSAGE_TYPES[ message.type ];

  if (messageType.isProtected) {
    const senderHost = new URL(sender.url).host;
    const validatedUrlRegexes = TRUSTED_DOMAINS
      .filter(trustedDomainRegex => trustedDomainRegex.test(senderHost));

    if (validatedUrlRegexes.length < 1) {
      console.warn(`Message of type ${message.type} from URL ${sender.url} was blocked for your safety, it's domain is not trusted.`);
      return false;
    }
  }

  return messageType.handler(message, sender, sendResponse);
};

chrome.runtime.onMessage.addListener(createMessageListener());
chrome.runtime.onMessageExternal.addListener(createMessageListener());

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      'api.tester.installed': 'true',
      last_migration_ran: EXTENSION_VERSION,
    });
  }

  // In case of fresh install or update then notify the opened websites that want to be API Tester aware
  if (details.reason === 'install' || details.reason === 'update') {
    chrome.windows.getAll({}, (windows) => {
      windows.forEach((applicationWindow) => {
        chrome.tabs.getAllInWindow(applicationWindow.id, (tabs) => {
          tabs
            .filter(tab => tab && tab.url && tab.url.indexOf('http') === 0)
            .forEach((tab) => {
              chrome.tabs.executeScript(
                tab.id,
                { file: 'contentScript.js' },
                () => { // Swallows the exception and logs it in JS console
                  const { lastError } = chrome.runtime;
                  if (lastError) {
                    console.warn(`contentScript injection failed on ${tab.url}\n Error: ${JSON.stringify(lastError)}`);
                  }
                },
              );
            });
        });
      });
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If an URL is available it means it is not the chrome-extension since the URL is not provided for chrome-extension
  if (tab.url) {
    return;
  }

  // onUpdated is called when the tab is considered created and will be returned in the extension's list of tabs
  // https://developer.chrome.com/extensions/extension#method-getViews
  // Returns only the tab related with our extension
  const extensionTabs = chrome.extension.getViews({ type: 'tab' });

  // Tabs in the array are ordered by age so let's keep the first
  if (!isFreeUser && extensionTabs.length > 1) {
    // Drop the newly created
    chrome.tabs.remove(tabId);
    // Focus the appropriate window and appropriate tab
    chrome.windows.update(extensionTabs[ 0 ].testerWindowId, { focused: true }, () => {
      chrome.tabs.update(extensionTabs[ 0 ].testerTabId, { active: true });
    });
  }
});
