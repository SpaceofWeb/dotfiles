/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

const { hash } = window.location;
const EXTENSION_ID = chrome.app.getDetails().id;

const htmlPage = '/index.html';
const tabUrl = `chrome-extension://${EXTENSION_ID}${htmlPage}`;

// Uncomment to help you debug, displays the input in a div in the popup
// const debug = (text) => {
//   const textnode = document.createElement('div');
//   textnode.innerHTML = `${text}<br>`;
//   document.body.appendChild(textnode);
// };

chrome.windows.getCurrent((currentWindow) => {
  const extensionsTabs = chrome.extension.getViews({
    type: 'tab',
    windowId: currentWindow.id,
  });
  const launcher = extensionsTabs
    .find(extensionTab => extensionTab.location.pathname === '/application_launcher.html');

  // Let's create the tab anyway and let it be handled in the `background.js`
  chrome.tabs.create({
    url: tabUrl + hash,
  });

  if (launcher) {
    launcher.close();
  }
  window.close();
});

