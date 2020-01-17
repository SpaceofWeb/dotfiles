/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

// CHROME HELPERS
const getSelected = () => new Promise(resolve => chrome.tabs.getSelected(resolve));

const create = configuration => new Promise(resolve => chrome.tabs.create(configuration, resolve));

const update = (tabIdOrIds, configuration) =>
  new Promise(resolve => chrome.tabs.update(tabIdOrIds, configuration, resolve));

const remove = tabIdOrIds => new Promise(resolve => chrome.tabs.remove(tabIdOrIds, resolve));

window.APP.chromeHelpers = {
  tabs: {
    getSelected,
    create,
    update,
    remove,
  },
};
