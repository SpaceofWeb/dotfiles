/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

/*
 * Developer documentation for Google Analytics
 * https://developers.google.com/analytics/devguides/collection/analyticsjs/
 * https://developer.chrome.com/extensions/tut_analytics
 */

function setGoogleAnalyticsId (googleAnalyticsId) {
  if (!window.ga) {
    console.debug('It seems you have an ad-blocker, Google Analytics was not loaded.');
    return;
  }

  window.ga('create', googleAnalyticsId, 'auto');
  window.ga('set', 'transport', 'beacon');
  window.ga('set', 'checkProtocolTask', () => document.location.protocol === 'chrome-extension:'); // @see: http://stackoverflow.com/a/22152353/1958200
  window.ga('send', 'pageview', '/restlet_client.html');
}

function sendGoogleAnalyticsEvent (eventCategory, eventAction, eventLabel, eventValue) {
  if (!window.ga) {
    console.debug('It seems you have an ad-blocker, Google Analytics was not loaded.');
    return;
  }

  if (!eventCategory && !eventAction) { // safe guard, eventCategory and eventAction are mandatory to send an event
    return;
  }

  const gaEvent = {
    hitType: 'event',
    eventCategory,
    eventAction,
  };

  if (eventLabel) { // safe guard, can be null
    gaEvent.eventLabel = eventLabel;
  }

  if (eventValue) { // safe guard, can be null
    gaEvent.eventValue = eventValue;
  }

  window.ga('send', gaEvent);
}

window.APP.googleAnalytics = {
  setGoogleAnalyticsId,
  sendGoogleAnalyticsEvent,
};
