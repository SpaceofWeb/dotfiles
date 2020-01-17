import truncate from 'truncate-utf8-bytes';
import { getHtmlIdFromContainerId } from '../utils/html-utils';
import { getTopFrameHostname, getTopFramePathname } from '../utils/location';
import { sendMessageHandler } from '../ui/observers';
import { getLang, isEnabledOnSite, isSupportedHost } from '../ui/settings';


function getContextProperties(containerId = null) {
  const context = {
    is_enabled: isEnabledOnSite(),
    is_supported: isSupportedHost(),
    language: getLang(),
    browserLanguage: window.navigator.language,
    hostname: getTopFrameHostname(),
    pathname: getTopFramePathname(),
    frame_hostname: window.location.hostname,
    frame_pathname: window.location.pathname,
  };
  if (containerId) {
    const htmlId = getHtmlIdFromContainerId(containerId);
    context.is_sapling_textbox = htmlId === 'sapling-embedded-editable';
    context.is_enabled = context.is_enabled || context.is_sapling_textbox;
  }
  return context;
}


/**
 * getEdits
 * ---------
 * Makes a call to the server on given text.
 * Returns server response for plain text, or error.
 *
 * Usually called when sapling query button is clicked.
 *
 * @param html_str original html string
 *
 * @return JSON document describing response
 *    if error is set to true, there is an error and a response is not returned.
 *    if error is false or not in response document, response is success
 */
export function getEdits(queryText, language, containerId, onSuccess, onFailure) {
  // FIXME This can break HTML tags
  // Could switch to other tool to try and fix this
  // https://github.com/huang47/nodejs-html-truncate did not work
  const queryTextTruncated = truncate(queryText, 2 * 1024 * 1024);
  sendMessageHandler('request/GET_EDITS', {
    html: queryTextTruncated,
    sessionId: containerId,
    context: getContextProperties(),
  }, onSuccess, onFailure);
}

/**
 * event
 * ---------------
 *  Send events to backend for tracking purposes.
 */
export function sendEvent(action, properties, containerId = null) {
  const contextProperties = getContextProperties(containerId);
  const context = Object.assign({}, contextProperties, properties);
  const params = {
    context,
    eventAction: action,
  };

  sendMessageHandler('request/SEND_EVENT', params);
}

/**
 * /edits/<edit-hash>/{accept, reject}
 * -----------
 */
export function postEdit(
  editHash,
  editAccepted,
  containerId,
  properties,
) {
  const contextProperties = getContextProperties(containerId);
  const context = Object.assign({}, contextProperties, properties);
  const action = editAccepted ? 'accept' : 'reject';
  const params = {
    editHash,
    context,
    action,
    sessionId: containerId,
  };
  sendMessageHandler('request/POST_EDIT', params);
}

/**
 * settings
 * ---------------
 *  Keep track of websites on which user enables/disables Sapling.
 */
export function postSettings(enable) {
  const context = getContextProperties();
  const hostnameSetting = {
    hostname: context.hostname,
    enabled: enable,
  };
  const settings = [hostnameSetting];
  const params = {
    context,
    settings,
  };

  sendMessageHandler('request/POST_SETTINGS', params);
}


/**
 * settings
 * ---------------
 *  Fetch settings and what stuff should be shown.
 */
export function getBanners(hostname, pathname, onSuccess) {
  const context = getContextProperties();
  const params = {
    context,
    hostname,
    pathname,
  };

  sendMessageHandler('request/GET_BANNERS', params, onSuccess);
}


/**
 * settings
 * ---------------
 *  Fetch settings and what stuff should be shown.
 */
export function getSettings(hostname, pathname, onSuccess, onFailure) {
  const context = getContextProperties();
  const params = {
    context,
    hostname,
    pathname,
  };

  sendMessageHandler('request/GET_SETTINGS', params, onSuccess, onFailure);
}


/**
 * user
 * ---------------
 *  Fetch user and registration info.
 */
export function getUser(ignoreCache, onSuccess, onFailure) {
  const params = {
    ignoreCache,
  };
  sendMessageHandler('request/GET_USER', params, onSuccess, onFailure);
}

export function getUserUsage(onSuccess, onFailure) {
  sendMessageHandler('request/GET_USER_USAGE', {}, onSuccess, onFailure);
}


export function getPopupMessage(onSuccess, onFailure) {
  sendMessageHandler('request/GET_POPUP_MESSAGE', {}, onSuccess, onFailure);
}


/**
 * login
 * ---------------
 *  Login user with email and password
 */
export function loginUser(email, password, onSuccess, onFailure) {
  const params = {
    email,
    password,
  };
  sendMessageHandler('request/LOGIN_USER', params, onSuccess, onFailure);
}


/**
 * logout
 * ---------------
 *  Logout user
 */
export function logoutUser(onSuccess, onFailure) {
  sendMessageHandler('request/LOGOUT_USER', {}, onSuccess, onFailure);
}


/**
 * register
 * ---------------
 *  Register user with email and password
 */
export function registerUser(email, password, onSuccess, onFailure) {
  const params = {
    email,
    password,
  };
  sendMessageHandler('request/REGISTER_USER', params, onSuccess, onFailure);
}


/**
 * resend email confirmation
 * ---------------
 *  Resend email confirmation
 */
export function resendEmailConfirmation(onSuccess, onFailure) {
  sendMessageHandler('request/RESEND_EMAIL_CONFIRMATION', {}, onSuccess, onFailure);
}


/**
 * forgot password
 * ---------------
 *  Forgot password
 */
export function forgotPassword(email, onSuccess, onFailure) {
  const params = {
    email,
  };
  sendMessageHandler('request/FORGOT_PASSWORD', params, onSuccess, onFailure);
}
