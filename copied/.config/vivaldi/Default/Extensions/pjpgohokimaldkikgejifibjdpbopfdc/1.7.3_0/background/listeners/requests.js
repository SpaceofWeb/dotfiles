import Raven from 'raven-js';
import { sendEvent, getEdits, postEdit, postSettings, getSettings, getUser, getUserUsage, getPopupMessage, registerUser, loginUser, logoutUser, resendEmailConfirmation, forgotPassword, getBanners } from '../requests';


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    const { data, action } = request;
    if (action === 'request/GET_EDITS') {
      getEdits(data.html, data.sessionId, data.context, sendResponse);
    } else if (action === 'request/SEND_EVENT') {
      sendEvent(data.eventAction, data.context);
      sendResponse({ status: true, success: true });
    } else if (action === 'request/POST_EDIT') {
      postEdit(data.editHash, data.sessionId, data.action, data.context);
      sendResponse({ status: true, success: true });
    } else if (action === 'request/POST_SETTINGS') {
      postSettings(data.settings, data.context);
      sendResponse({ status: true, success: true });
    } else if (action === 'request/GET_SETTINGS') {
      getSettings(data.hostname, data.pathname, data.context, sendResponse);
    } else if (action === 'request/GET_BANNERS') {
      getBanners(data.hostname, data.pathname, data.context, sendResponse);
    } else if (action === 'request/GET_USER') {
      getUser(sendResponse, data.ignoreCache);
    } else if (action === 'request/GET_USER_USAGE') {
      getUserUsage(sendResponse);
    } else if (action === 'request/GET_POPUP_MESSAGE') {
      getPopupMessage(sendResponse);
    } else if (action === 'request/REGISTER_USER') {
      registerUser(data.email, data.password, sendResponse);
    } else if (action === 'request/LOGIN_USER') {
      loginUser(data.email, data.password, sendResponse);
    } else if (action === 'request/LOGOUT_USER') {
      logoutUser(sendResponse);
    } else if (action === 'request/RESEND_EMAIL_CONFIRMATION') {
      resendEmailConfirmation(sendResponse);
    } else if (action === 'request/FORGOT_PASSWORD') {
      forgotPassword(data.email, sendResponse);
    }
  } catch (e) {
    Raven.captureException(e);
    sendResponse({ status: true, success: false, data: { message: 'Error in background script.' } });
  }

  return true;
});
