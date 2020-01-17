/*
 * Copyright 2010-2018 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

/* eslint-disable no-console */

(() => {
  const EXTENSION_ID = chrome.runtime.id;

  const { log } = console;

  window.addEventListener('message', (event) => {
    log('Received message', event.data);

    if (event.source !== window) {
      log('Message is ignored since it is from the wrong window');
      return;
    }

    if (!event.data) {
      log('Message is ignored since it is empty');
      return;
    }

    if (!event.data.type) {
      log("Message is ignored since 'type' property is missing");
      return;
    }

    if (event.data.target !== EXTENSION_ID) {
      log('Message is ignored since mother-extension is not its target');
      return;
    }

    log('Message is valid, delegating it to API Tester');

    const { data } = event;
    data.location = document.location;

    chrome.runtime.sendMessage(data, () => {});
  }, false);
})();
