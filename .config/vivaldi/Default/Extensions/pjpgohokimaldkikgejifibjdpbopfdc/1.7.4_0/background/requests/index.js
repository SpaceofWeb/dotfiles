import { sendBackendRequest, sendAuthenticatedBackendRequest, setRefreshToken, clearRefreshToken } from './utils';
import { getUserFromCache, getUserAndCache, clearUserCache } from './cache/get-user';
import { getSettingFromCache, getSettingAndCache, clearSettingCache } from './cache/get-setting';


function getContextProperties() {
  return {
    version: chrome.runtime.getManifest().version,
    source: EXTENSION_SOURCE,
  };
}


export function getUser(sendResponse, ignoreCache) {
  const cachedUser = getUserFromCache();
  if (cachedUser && !ignoreCache) {
    sendResponse({ data: cachedUser, status: true, success: true });
  } else {
    getUserAndCache(sendResponse);
  }
}

export function getUserUsage(sendResponse) {
  sendAuthenticatedBackendRequest('/users/usage', 'get', {}, (usage) => {
    sendResponse({ data: usage, status: true, success: true });
  }, () => {
    sendResponse({ status: true, success: false });
  });
}


export function getPopupMessage(sendResponse) {
  sendAuthenticatedBackendRequest('/messages/popup', 'get', {}, (msg) => {
    sendResponse({ data: msg, status: true, success: true });
  }, () => {
    sendResponse({ status: true, success: false });
  });
}


export function sendChromeUserIdentity(chromeUserId, chromeUserEmail, onSuccess, onFailure) {
  sendAuthenticatedBackendRequest('/users', 'post', {
    google_id: chromeUserId,
    google_email: chromeUserEmail,
  }, onSuccess, onFailure);
}


export function sendEvent(eventName, frameContext) {
  const defaultContextProperties = getContextProperties();
  const context = Object.assign({}, defaultContextProperties, frameContext);
  const data = {
    context,
    name: eventName,
  };
  sendAuthenticatedBackendRequest('/events', 'post', data);
}


export function getEdits(html, sessionId, frameContext, sendResponse) {
  const defaultContextProperties = getContextProperties();
  const context = Object.assign({}, defaultContextProperties, frameContext);
  const params = {
    html,
    context,
    session_id: sessionId,
  };
  sendAuthenticatedBackendRequest('/edits', 'post', params, (edits) => {
    sendResponse({ data: { edits }, status: true, success: true });
  }, () => {
    sendResponse({ status: true, success: false });
  });
}


export function postEdit(editHash, sessionId, action, frameContext) {
  const defaultContextProperties = getContextProperties();
  const context = Object.assign({}, defaultContextProperties, frameContext);
  const data = {
    context,
    session_id: sessionId,
  };
  sendAuthenticatedBackendRequest(`/edits/${editHash}/${action}`, 'post', data);
}


export function postSettings(settings, frameContext) {
  const defaultContextProperties = getContextProperties();
  const context = Object.assign({}, defaultContextProperties, frameContext);
  const data = {
    settings,
    context,
  };
  sendAuthenticatedBackendRequest('/users/me/settings', 'post', data);
}


export function getBanners(hostname, pathname, frameContext, sendResponse) {
  const params = {
    hostname,
    pathname,
  };
  const url = `/banners?${$.param(params)}`;
  sendAuthenticatedBackendRequest(url, 'get', {}, (settings) => {
    sendResponse({ data: settings, status: true, success: true });
  }, () => {
    sendResponse({ status: true, success: false });
  });
}


export function getSettings(hostname, pathname, frameContext, sendResponse) {
  const params = {
    hostname,
    pathname,
  };

  const cachedSetting = getSettingFromCache(params);
  if (cachedSetting) {
    sendResponse({ data: cachedSetting, status: true, success: true });
  } else {
    getSettingAndCache(params, sendResponse);
  }
}


export function registerUser(email, password, sendResponse) {
  const params = {
    email,
    password,
  };
  sendBackendRequest('/auth/register', 'post', params, {}, (authData) => {
    const authTokens = {
      refreshToken: authData.refresh_token,
      accessToken: authData.access_token,
    };
    setRefreshToken(authTokens);
    clearSettingCache();
    clearUserCache();
    sendResponse({ status: true, success: true });
  }, (e) => {
    sendResponse({ data: { message: e.responseJSON.msg }, status: true, success: false });
  });
}


export function loginUser(email, password, sendResponse) {
  const params = {
    email,
    password,
  };
  sendBackendRequest('/auth/login', 'post', params, {}, (authData) => {
    const authTokens = {
      refreshToken: authData.refresh_token,
      accessToken: authData.access_token,
    };
    setRefreshToken(authTokens);
    clearSettingCache();
    clearUserCache();
    sendResponse({ status: true, success: true });
  }, (e) => {
    sendResponse({ data: { message: e.responseJSON.msg }, status: true, success: false });
  });
}


export function logoutUser(sendResponse) {
  sendAuthenticatedBackendRequest('/auth/logout', 'post', {}, () => {
    clearRefreshToken();
    clearSettingCache();
    clearUserCache();
    sendResponse({ status: true, success: true });
  }, () => {
    clearRefreshToken();
    clearSettingCache();
    clearUserCache();
    sendResponse({ status: true, success: false });
  });
}


export function resendEmailConfirmation(sendResponse) {
  sendAuthenticatedBackendRequest('/auth/resend-email-confirmation', 'post', {}, () => {
    sendResponse({ status: true, success: true });
  }, () => {
    sendResponse({ status: true, success: false });
  });
}


export function forgotPassword(email, sendResponse) {
  const params = {
    email,
  };
  sendBackendRequest('/auth/forgot-password', 'post', params, {}, () => {
    sendResponse({ status: true, success: true });
  }, (e) => {
    sendResponse({ data: { message: e.responseJSON.msg }, status: true, success: false });
  });
}
