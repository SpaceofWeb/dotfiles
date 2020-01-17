/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

/**
 *
 * This script must be product agnostic,
 * as it is intended to be copy/paste between Designer and Tester.
 *
 */
const styles = {
  TRANSITION_DURATION_IN_SECONDS: 2,
  DONUT_SIZE_IN_PX: 50,
  Z_INDEX_IFRAME: 9998,
};

const messageTypes = {
  SHARING_IFRAME_HAS_LOADED: 'SHARING_IFRAME_HAS_LOADED',
  SHARING_MODAL_HAS_LOADED: 'SHARING_MODAL_HAS_LOADED',
  SHARING_MODAL_CLOSE: 'SHARING_MODAL_CLOSE',
  CREDENTIALS_PROVIDED: 'CREDENTIALS_PROVIDED',
};

const sharingPaths = {
  OPEN_SHARING_FOR_API_TEST: 'open_sharing_for_api_test',
  OPEN_SHARING_FOR_API_TEST_ENVIRONMENT: 'open_sharing_for_api_test_environment',
  OPEN_SHARING_FOR_API_DESIGN: 'open_sharing_for_api_design',
};

let state = {};

function newNodeStyleForLoadingWidget (animationName) {

  const rules = document.createTextNode(`
      @keyframes ${animationName} {
          0% { transform: rotate(0deg);   }
        100% { transform: rotate(360deg); }
      }`);

  const el = document.createElement('style');
  el.type = 'text/css';
  el.appendChild(rules);
  return el;
}

function newNodeForAnimatedLoader (animationName) {

  const donutSize = `${styles.DONUT_SIZE_IN_PX}px`;
  const donutMargin = `${(-1 * styles.DONUT_SIZE_IN_PX) / 2}px`;

  const el = document.createElement('div');
  el.id = 'sharing-loader';
  el.style.cssText = `
      display: inline-block;
      border: 4px solid rgba(0, 0, 0, .2);
      border-left-color: rgba(0, 0, 0, .4);
      border-radius: 50%;
      width: ${donutSize};
      height: ${donutSize};
      position: absolute;
      top: 50%;
      left: 50%;
      margin: ${donutMargin} 0 0 ${donutMargin};
      animation: ${animationName} 1.2s linear infinite;
    `;
  return el;
}

function newNodeForBackdrop () {
  const el = document.createElement('div');
  el.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      background-color: #000;
      opacity: .2;
    `;
  return el;
}

function newNodeForLoadingWidget () {

  const el = document.createElement('div');
  el.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: ${styles.Z_INDEX_IFRAME + 1};
      transition: opacity ${styles.TRANSITION_DURATION_IN_SECONDS}s ease-out;
    `;
  return el;
}

function newNodeIframeForSharingApplication () {
  const el = document.createElement('iframe');
  el.style.cssText = `
      width: 100%;
      height: 100%;
      border: 0;
      z-index: ${styles.Z_INDEX_IFRAME};
      position: absolute;
    `;
  return el;
}

function displayLoading () {

  const animationName = 'sharing-donut-spin';

  state.sharingLoadingStyle = newNodeStyleForLoadingWidget(animationName);
  document.head.appendChild(state.sharingLoadingStyle);

  state.sharingLoading = newNodeForLoadingWidget();
  state.sharingLoading.appendChild(newNodeForBackdrop());
  state.sharingLoading.appendChild(newNodeForAnimatedLoader(animationName));
  document.body.appendChild(state.sharingLoading);
}

function hideLoading () {

  state.sharingLoading.style.opacity = 0; // it triggers the `transition`

  setTimeout(() => { // real cleanup
    // Let's use "removeChild" instead of "remove" because of IE 11 compatibility
    // https://stackoverflow.com/questions/20428877/javascript-remove-doesnt-work-in-ie
    state.sharingLoading.parentNode.removeChild(state.sharingLoading);
    state.sharingLoading = null;

    state.sharingLoadingStyle.parentNode.removeChild(state.sharingLoadingStyle);
    state.sharingLoadingStyle = null;
  }, styles.TRANSITION_DURATION_IN_SECONDS * 1000);
}

function isApiTester (pathForEntityType) {
  return [
    sharingPaths.OPEN_SHARING_FOR_API_TEST,
    sharingPaths.OPEN_SHARING_FOR_API_TEST_ENVIRONMENT,
  ].includes(pathForEntityType);
}

function isApiDesigner (pathForEntityType) {
  return pathForEntityType === sharingPaths.OPEN_SHARING_FOR_API_DESIGN;
}

function addEventListenerOnMessage (listener, { pathForEntityType }) {

  if (isApiTester(pathForEntityType)) {
    window.chrome.runtime.onMessage.addListener(listener);

  } else if (isApiDesigner(pathForEntityType)) {
    window.addEventListener('message', listener, false);

  } else {
    throw new Error('Unknown host application');
  }
}

function removeEventListenerOnMessage (listener, { pathForEntityType }) {

  if (isApiTester(pathForEntityType)) {
    window.chrome.runtime.onMessage.removeListener(listener);

  } else if (isApiDesigner(pathForEntityType)) {
    window.removeEventListener('message', listener, false);

  } else {
    throw new Error('Unknown host application');
  }
}

function listenerToMessage (messageType, fnToApply) {
  return ({ origin, data }) => {

    if (origin !== state.originOfIframe) {
      // eslint-disable-next-line no-console
      console.warn(`Received a message from an origin different from the sharing iframe: ${origin}`);
      return;
    }

    if (data && data.type === messageType) {
      fnToApply({
        origin,
        data,
      });
    }

  };
}

const listenerToLoadingModal = listenerToMessage(messageTypes.SHARING_MODAL_HAS_LOADED, () => {

  setTimeout(hideLoading, 250); // let's give time for the Sharing application to appear

  state.hasLoaded = true;
  clearTimeout(state.timeoutId);

  removeEventListenerOnMessage(listenerToLoadingModal, state);

  // eslint-disable-next-line no-use-before-define
  addEventListenerOnMessage(listenerToClosingModal, state);
});

const listenerToLoadedIFrame = listenerToMessage(messageTypes.SHARING_IFRAME_HAS_LOADED, () => {
  removeEventListenerOnMessage(listenerToLoadedIFrame, state);
  addEventListenerOnMessage(listenerToLoadingModal, state);

  const message = {
    type: messageTypes.CREDENTIALS_PROVIDED,
    accessToken: state.accessToken,
    idToken: state.idToken,
    userLanguage: state.userLanguage,
  };

  // Compatible with Chrome extension and browsers
  state.sharingIframe.contentWindow.postMessage(message, state.originOfIframe);
});

function removeIframe () {
  state.sharingIframe.parentNode.removeChild(state.sharingIframe);
  state.sharingIframe = null;

  // eslint-disable-next-line no-use-before-define
  removeEventListenerOnMessage(listenerToClosingModal, state);
}

const listenerToClosingModal = listenerToMessage(messageTypes.SHARING_MODAL_CLOSE, ({ data: eventData }) => {
  removeIframe();
  return state.deferred.resolve(eventData);
});

function checkIFrameIsLoaded () {
  if (!state.hasLoaded) {
    removeIframe();
    hideLoading();
    return state.deferred.reject('The application sharing wasn\'t loaded.');
  }

  return true;
}

/**
 *
 * @param sharingAppUrl e.g. `http://localhost:8786`
 *
 * @param pathForEntityType
 * it can be either
 * - `open_sharing_for_api_test` or
 * - `open_sharing_for_api_test_environment` or
 * - `open_sharing_for_api_design`,
 * see tadt-sharing routes configuration
 *
 * @param entityId
 * @param env: optional, Tester only, it can be either 'DEV', 'STAGING' or 'PROD'
 * @param accessToken
 * @param idToken
 * @param userLanguage the user's preferred language
 * @returns {Promise<any>}
 */
export function openModal ({
  sharingAppUrl,
  pathForEntityType,
  entityId,
  env,
  accessToken,
  idToken,
  userLanguage,
}) {

  return new Promise((resolve, reject) => {

    state = {
      pathForEntityType,
      accessToken,
      idToken,
      userLanguage,
    }; // reset state

    state.deferred = {
      resolve,
      reject,
    };

    //
    // Give instant UI feedback to the user.
    // And let's wait until the Sharing application appears.
    //
    displayLoading();

    //
    // Init the probes to monitor the loading of the Sharing application.
    //
    state.hasLoaded = false;
    state.timeoutId = setTimeout(checkIFrameIsLoaded, 10 * 1000);
    addEventListenerOnMessage(listenerToLoadedIFrame, state);

    //
    // Let's load the Sharing application.
    //
    const baseUrl = sharingAppUrl.replace(/\/$/, ''); // remove trailing slash if any
    let url = `${baseUrl}/${pathForEntityType}/${entityId}`;

    if (isApiTester(pathForEntityType)) {
      const envQueryParam = env !== 'PROD' ? `#env=${env}` : '';
      url += envQueryParam;
    }

    state.originOfIframe = baseUrl; // needed for validation when listening to postMessage

    state.sharingIframe = newNodeIframeForSharingApplication();
    state.sharingIframe.setAttribute('src', url);
    document.body.appendChild(state.sharingIframe);
  });
}

const sharingAPI = {
  openModal,
  _getCurrentState: () => state,
  _displayLoading: displayLoading,
  _hideLoading: hideLoading,
};

window.RESTLET = window.RESTLET || {};
window.RESTLET.sharing = sharingAPI; // needed for Tester (to be used through JSNI)

export default sharingAPI;
