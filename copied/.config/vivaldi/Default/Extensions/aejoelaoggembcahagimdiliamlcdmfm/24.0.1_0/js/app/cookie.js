/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

const removeCookie = cookieObject => new Promise((resolve) => {
  chrome.cookies.remove({
    url: `https://${cookieObject.domain}`,
    name: cookieObject.name,
  }, resolve);
});

const setCookie = function (cookieObject) {
  return new Promise((resolve) => {
    chrome.cookies.set({
      url: `https://${cookieObject.domain}`,
      domain: cookieObject.domain,
      name: cookieObject.name,
      value: encodeURIComponent(JSON.stringify(cookieObject.value)),
    }, resolve);
  });
};

const readCookie = definition => new Promise((resolve) => {
  chrome.cookies.getAll(definition, (cookies) => {
    if (!cookies || cookies.length === 0) {
      return resolve(null);
    }

    // return only the first one
    const jsonValue = JSON.parse(decodeURIComponent(cookies[ 0 ].value));
    return resolve(jsonValue);
  });
});

window.APP.cookieUtils = {
  removeCookie,
  setCookie,
  readCookie,
};
