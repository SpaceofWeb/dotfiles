/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

/* eslint-disable no-use-before-define */ // TODO: remove and fix file

import _ from 'lodash';

(($) => {
  const INSITUS = [
    // examples from 2.12:
    // { key: 'newdraft_2110', placement: 'bottom' },
    // { key: 'save_2110', placement: 'left' }
  ];

  //
  // `allInsituKeys` are for external usage,
  // e.g.: `$wnd.APP.insitusService.hideInsitu($wnd.APP.insitusService.keys.print_report_240);`
  //
  const allInsituKeys = _.reduce(INSITUS, (accu, insitu) => ({ ...accu, [ insitu.key ]: insitu.key }), {});

  window.APP.insitusService = {
    setInsitusForFirstInstallation,
    loadInsituForUnsigned,
    loadInsituForSignedUser,
    onSignin,
    fireInsitu,
    hideInsitu,
    keys: allInsituKeys,
    /* Example:
    keys: {
     'export_to_maven_240': 'export_to_maven_240',
     'print_report_240': 'print_report_240'
     } */
    viewedInsitus: [],
    insituWaitingToBeDisplayed: null,
  };

  const { insitusService } = window.APP;
  const STORAGE_KEY = 'viewed-insitu-messages-';
  const COMMON_USER_ID = 'common';

  let currentElementWithPopover;

  function setInsitusForFirstInstallation () {
    const allInsitus = _.map(INSITUS, 'key');
    saveInStorage(COMMON_USER_ID, allInsitus);
  }

  function loadInsituForUnsigned () {
    readViewedInsitus(COMMON_USER_ID)
      .then((result) => {
        insitusService.viewedInsitus = result.viewedInsitus;
        showInsituToUser(insitusService.viewedInsitus);
      });
  }

  function loadInsituForSignedUser (userId) {

    isUserInStorage(userId)
      .then((isInStorage) => {
        if (isInStorage) {

          readViewedInsitus(userId)
            .then((result) => {
              insitusService.viewedInsitus = result.viewedInsitus;
              showInsituToUser(insitusService.viewedInsitus);

              // init `common` and remove `user`
              saveInStorage(
                COMMON_USER_ID, insitusService.viewedInsitus,
                _.partial(removeUserFromStorage, userId),
              );
            });

        } else {

          readViewedInsitus(COMMON_USER_ID)
            .then((result) => {
              insitusService.viewedInsitus = result.viewedInsitus;
              showInsituToUser(insitusService.viewedInsitus);
            });
        }
      });

  }

  function onSignin (userId) {

    isUserInStorage(userId)
      .then((isInStorage) => {

        if (isInStorage) {

          readViewedInsitus(userId)
            .then((result) => {

              const userVieweds = result.viewedInsitus;
              const commonVieweds = insitusService.viewedInsitus;

              insitusService.viewedInsitus = _.union(commonVieweds, userVieweds);
              showInsituToUser(insitusService.viewedInsitus);

              // remove `user`
              saveInStorage(
                COMMON_USER_ID, insitusService.viewedInsitus,
                _.partial(removeUserFromStorage, userId),
              );
            });
        }
      });
  }

  function fireInsitu (cssOfAvailableElement) {
    if (!_.get(insitusService, 'insituWaitingToBeDisplayed')) {
      return;
    }

    if (cssOfAvailableElement.includes(insitusService.insituWaitingToBeDisplayed.key)) {
      showInsituToUser(insitusService.viewedInsitus);
    }

  }

  function removeUserFromStorage (userId) {
    const key = STORAGE_KEY + userId;
    chrome.storage.local.remove(key);
  }

  function isUserInStorage (userId) {

    const key = STORAGE_KEY + userId;

    return new Promise(((resolve) => {

      chrome.storage.local.get(key, (storedVieweds) => {

        // Note: `local.get` returns an empty object `{}` if it doesn't find a stored item for the specified `key`
        // e.g. it doesn't return `undefined` nor `null`
        const isInStorage = _.has(storedVieweds, key);
        return resolve(isInStorage);
      });
    }));
  }

  function readViewedInsitus (userId) {

    const key = STORAGE_KEY + userId;

    return new Promise(((resolve) => {

      chrome.storage.local.get(key, (storedVieweds) => {

        // Note: `local.get` returns an empty object `{}` if it doesn't find a stored item for the specified `key`
        // e.g. it doesn't return `undefined` nor `null`

        const vieweds = storedVieweds[ key ] || [];

        return resolve({
          viewedInsitus: vieweds,
        });
      });
    }));
  }

  function showInsituToUser (viewedInsitus) {

    const insituKeyToDisplay = getInsituKeyToDisplay(viewedInsitus);

    if (insituKeyToDisplay) {

      const insituToDisplay = _.find(INSITUS, { key: insituKeyToDisplay });

      const elementToApplyInsitu = $(`.${insituKeyToDisplay}`);
      if (!_.isEmpty(elementToApplyInsitu)) {
        show(insituToDisplay, elementToApplyInsitu.first() /* you may have several results */);

      } else {
        insitusService.insituWaitingToBeDisplayed = insituToDisplay;
      }
    }
  }

  function getInsituKeyToDisplay (viewedInsitus) {

    const allInsitus = _.map(INSITUS, 'key');
    const insitusToBeViewed = _.difference(allInsitus, viewedInsitus);

    return _.first(insitusToBeViewed);
  }

  function show (insitu, elementToApplyInsitu) {

    hideCurrent();

    newPopover(insitu, elementToApplyInsitu);

    setTimeout(() => {

      currentElementWithPopover.rPopover('show');

      //
      // attach click handler to the insitu's button
      // because GWT does not allow inlined `onclick`
      //
      const actionBtn = $(`.${getFullKey(insitu)} button`);
      if (actionBtn) {
        actionBtn.click(() => {
          closeAndAcknowledge(insitu.key);
        });
      }

    }, 300 /* gives time for UI to render properly */);

  }

  function closeAndAcknowledge (insituKey) {
    hideCurrent();

    // save
    insitusService.viewedInsitus.push(insituKey);
    saveInStorage(COMMON_USER_ID, insitusService.viewedInsitus);

    // show next
    showInsituToUser(insitusService.viewedInsitus);
  }

  function newPopover (insitu, elementToApplyInsitu) {
    const fullKey = getFullKey(insitu);
    const customClasses = _.flatten([ 'r-whatsnew-insitu', fullKey ]);

    const options = {
      animation: true,
      customClass: customClasses.join(' '),
      html: true,
      placement: insitu.placement,
      templateId: fullKey,
      trigger: 'manual',
    };

    elementToApplyInsitu.rPopover(options);
    currentElementWithPopover = elementToApplyInsitu;
  }

  function hideInsitu (insituKey) {

    if (currentElementWithPopover
      && currentElementWithPopover.hasClass(insituKey)) {
      closeAndAcknowledge(insituKey);
    }

  }

  function hideCurrent () {
    if (currentElementWithPopover) {
      currentElementWithPopover.rPopover('destroy');
      currentElementWithPopover = null;

      if (_.get(insitusService, 'insituWaitingToBeDisplayed')) {
        insitusService.insituWaitingToBeDisplayed = null;
      }

    }
  }

  function getFullKey (insitu) {
    return `r_insitu_${insitu.key}`;
  }

  function saveInStorage (userId, viewedInsitus, callback) {

    const afterSettingCb = callback || _.noop;

    chrome.storage.local.set({
      [ STORAGE_KEY + userId ]: viewedInsitus,
    }, afterSettingCb);
  }

})(window.jQuery);

