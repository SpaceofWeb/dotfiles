import _ from 'lodash';
import uuid from 'uuid';
import { getScrollableParent } from '../utils/html-utils';
import { isEnabledOnSite, getLang } from '../ui/settings';
import { sendEvent, logoutUser } from '../requests/index';
import updateStatusIndicator from '../ui/status';
import { requestQueuedCalls, updateCache, clearCacheForContainer } from '../requests/cache';
import { hideEditControlsImmediatelyIfNoActiveEdit, hideEditControls, disableEditControls } from '../ui/edit-controls';
import { disableSlideCheck, getUserProperties } from '../ui/embed';
import { initOrUpdateTextAreaOverlay, updateTextAreaOverlayWithText, updateTextAreaScroll, removeTextAreaFromParentContainer } from '../ui/highlight/textarea';
import { validateTagWithOverlayFormat, onMouseMoveWithOverlayFormat, initOrUpdateContainerOverlay, onResizeOverlayFormatPerContainer, clearOverlay, updateRangeForOverlayFormatForCharacterData, onUpdateTagForOverlayFormatPerContainer, updateRangeForOverlayFormatForChildList, removeContainerIdForOverlayFormat } from '../ui/highlight/overlay';
import ResizeObserver from 'resize-observer-polyfill';

// existing observers:
//   1) onContentMutationForMutationObserver -> content mutation
//   2) initializeTextAreaObserver -> (textarea only) -> content mutation

//   3) 2x initEditableScrollObserver (contenteditable only) -> on scroll
//   4) 2x initTextAreaScrollObserver (textarea only) -> on scroll

//   5) initCursorMoveObserver (contenteditable only) -> click/key for cursor change
//   6) resizeObserverForEditable/resizeObserverForTextArea -> on resize

//   7) onInputBlock -> on input
//   8) initializeFocusObservers (per frame) -> on focus
//   9) initializeMouseObserver (per frame) -> on focus

//   10) initializeHtmlObserver (optional, window, for wordpress.com) -> on all html change

//   11) initializeMeasureObservers -> (for pages where we detect ratings)
//   12) initializeSaplingLogoutObserver ->  sync extension and browser sessions

// {
//   containerId: {
//     domElement:,
//     mutationObservers: [],
//     resizeObservers: [],
//     jqueryObservers: [],
//     eventListeners: [],
//   },
// }
const containerIdToObservers = {};
// {
//   textAreaId: {
//     domElement:,
//     resizeObservers: [],  # unobserve
//     jqueryObservers: [],  # off
//     eventListeners: [],  # removeEventListener
//     intervals: [],  # clearInterval
//   },
// }
const textAreaIdToObservers = {};

// used to determine if container valid for content script
const SAPLING_CONTAINER_IDS = new Set();
const SAPLING_TEXTAREA_IDS = new Set();
const SAPLING_INPUT_IDS_SENT = new Set();

let SAPLING_OBSERVERS = [];
let SAPLING_EVENT_LISTENERS = [];

let SAPLING_CHATLOG_DETECTED = false;

function disableObserver(containerId, isTextArea) {
  const globalObj = isTextArea ? textAreaIdToObservers : containerIdToObservers;
  if (containerId in globalObj) {
    const containerObj = globalObj[containerId];
    if ('intervals' in containerObj) {
      containerObj.intervals.forEach((interval) => {
        clearInterval(interval);
      });
    }
    if ('eventListeners' in containerObj) {
      containerObj.eventListeners.forEach((info) => {
        info.element.removeEventListener(info.event, info.handler, info.options);
      });
    }
    if ('jqueryObservers' in containerObj) {
      containerObj.jqueryObservers.forEach((element) => {
        $(element).off();
      });
    }
    if ('resizeObservers' in containerObj) {
      containerObj.resizeObservers.forEach((info) => {
        info.observer.unobserve(info.container);
      });
    }
    if ('mutationObservers' in containerObj) {
      containerObj.mutationObservers.forEach((observer) => {
        observer.disconnect();
      });
    }

    delete globalObj[containerId];
  }
}

function disableObservers() {
  Object.keys(containerIdToObservers).forEach((containerId) => {
    disableObserver(containerId, false);
  });
  Object.keys(textAreaIdToObservers).forEach((containerId) => {
    disableObserver(containerId, true);
  });
}

export function disconnectAllObservers() {
  SAPLING_OBSERVERS.forEach((observer) => {
    observer.disconnect();
  });
  SAPLING_OBSERVERS = [];
  SAPLING_EVENT_LISTENERS.forEach((info) => {
    info.element.removeEventListener(info.event, info.handler, info.options);
  });
  SAPLING_EVENT_LISTENERS = [];
  disableObservers();
  clearOverlay();
  disableEditControls();
  disableSlideCheck();
}

function checkAndDisableInactiveObservers() {
  Object.keys(containerIdToObservers).forEach((containerId) => {
    if (!document.contains(containerIdToObservers[containerId].domElement)) {
      disableObserver(containerId, false);
    }
  });
  Object.keys(textAreaIdToObservers).forEach((containerId) => {
    if (!document.contains(textAreaIdToObservers[containerId].domElement)) {
      disableObserver(containerId, true);
    }
  });
}

function saveObservers(containerId, domElement, isTextArea, type, object) {
  const globalObj = isTextArea ? textAreaIdToObservers : containerIdToObservers;
  let containerObj = {};
  if (containerId in globalObj) {
    containerObj = globalObj[containerId];
  }
  if (!('domElement' in containerObj)) {
    containerObj.domElement = domElement;
  }
  let observers = [];
  if (type in containerObj) {
    observers = containerObj[type];
  }

  observers.push(object);
  containerObj[type] = observers;
  globalObj[containerId] = containerObj;
}

export function sendMessageHandler(action, properties = {}, onSuccess = null, onFailure = null) {
  // only call onSuccess if we've verified that content script is valid
  // and can communicate with background script.
  try {
    initializeMeasureObservers();

    const payload = {};
    payload.action = action;
    payload.data = properties;
    chrome.runtime.sendMessage(payload, (response) => {
      if (response && response.status) {
        if (onSuccess && response.success) {
          onSuccess(response.data);
        }
        if (onFailure && !response.success) {
          onFailure(response.data);
        }
      } else if (onFailure) {
        onFailure({ message: 'Error contacting background script.' });
      }
    });
  } catch (e) {
    // assume all failures mean content script has been orphaned
    disconnectAllObservers();
  }
}

function onTextChange(obj) {
  // debounced function that gets called every 250 ms.
  $($.find(`[sapling-id="${obj.saplingId}"]`)).each((ind, container) => {
    updateCache(container, obj.useVisibleText || false, getLang());
    requestQueuedCalls(obj.saplingId);
    updateStatusIndicator(false);
  });
}

// debounce and filtered so it only gets called per container and every 250ms.
const QUERY_WAIT_IN_MILLISECONDS = 250;
const onTextChangeDebounced = _.wrap(_.memoize(() => _.debounce(
  onTextChange,
  QUERY_WAIT_IN_MILLISECONDS,
  {
    leading: false,
    trailing: true,
  },
), _.property('id')), (func, obj) => func(obj)(obj));

function getSaplingIdFromMutation(mutation) {
  let container;
  if (mutation.type === 'childList' &&
    mutation.target.hasAttribute('sapling-id')) {
    // possible cut/copy-paste situation where mutation observer only
    // triggers in an empty textbox if we use childList=True
    container = mutation.target;
  } else {
    const containerParents = $(mutation.target).parents('[sapling-id]');
    if (containerParents.length === 0) {
      return [null, null];
    }
    [container] = containerParents;
  }

  return container.getAttribute('sapling-id');
}

function onContentMutationForMutationObserver(mutationsList) {
  const modifiedContainerIdSet = new Set();
  for (let k = 0; k < mutationsList.length; k += 1) {
    const mutation = mutationsList[k];
    const saplingId = getSaplingIdFromMutation(mutation);
    if (saplingId === null) {
      // this can happen if there are deletions.
      continue;
    }
    modifiedContainerIdSet.add(saplingId);
    onTextChangeDebounced({ id: saplingId, saplingId });
    if (mutation.type === 'characterData') {
      updateRangeForOverlayFormatForCharacterData(saplingId, mutation);
    } else if (mutation.type === 'childList') {
      updateRangeForOverlayFormatForChildList(saplingId, mutation);
    }
  }

  modifiedContainerIdSet.forEach((containerId) => {
    validateTagWithOverlayFormat(containerId);
    onUpdateTagForOverlayFormatPerContainer(containerId);
  });

  hideEditControlsImmediatelyIfNoActiveEdit();
}

function makeInitialEditIfEnabled(parentContainer) {
  const containerId = parentContainer.getAttribute('sapling-id');
  if (containerId) {
    updateCache(parentContainer, false, getLang());
    requestQueuedCalls(containerId);
    updateStatusIndicator(false);
  }
}

function initCursorMoveObserver(editable, saplingId) {
  $(editable).on('focus click keyup', (e) => {
    if (isEnabledOnSite()) {
      if (e.type === 'keyup') {
        if (e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown') {
          onTextChangeDebounced({ id: saplingId, saplingId });
        }
      } else {
        onTextChangeDebounced({ id: saplingId, saplingId });
      }
    }
  });

  saveObservers(saplingId, editable, false, 'jqueryObservers', editable);
}

function initEditableScrollObserver(editable, saplingId) {
  $(editable).on('scroll', () => {
    onUpdateTagForOverlayFormatPerContainer(saplingId);
  });
  saveObservers(saplingId, editable, false, 'jqueryObservers', editable);

  const scrollable = getScrollableParent(editable);
  if (scrollable) {
    $(scrollable).on('scroll', () => {
      if (isEnabledOnSite()) {
        onTextChangeDebounced({
          id: saplingId,
          saplingId,
          useVisibleText: true,
        });
      }
      hideEditControls();
    });
    saveObservers(saplingId, editable, false, 'jqueryObservers', scrollable);
  }
}

function onTypeInBlock(event) {
  const inputId = $(event.target).attr('sapling-input-id');
  if (inputId && !SAPLING_INPUT_IDS_SENT.has(inputId)) {
    const properties = {
      node_type: event.target.nodeName,
    };
    const containerId = event.target.getAttribute('sapling-id');
    sendEvent('input_content', properties, containerId);
    SAPLING_INPUT_IDS_SENT.add(inputId);
  }
}

function initializeMutationObserver(block, containerId) {
  const contentMutationCfg = {
    attributes: false,
    childList: true, // primarily for copy-paste in empty textbox.
    characterData: true,
    subtree: true,
    characterDataOldValue: true,
  };
  const contentCallback = onContentMutationForMutationObserver;
  const contentObserver = new MutationObserver(contentCallback);
  contentObserver.observe(block, contentMutationCfg);

  saveObservers(containerId, block, false, 'mutationObservers', contentObserver);
}

let resizeObserverForEditable = null;
let resizeObserverForTextArea = null;

function deactivateContainer(container, isTextArea) {
  const inputId = container.getAttribute('sapling-input-id');
  if (inputId) {
    disableObserver(inputId, isTextArea);
  }
  if (isTextArea) {
    const textAreaId = container.getAttribute('sapling-textarea-id');
    if (textAreaId) {
      removeTextAreaFromParentContainer(container);
      disableObserver(textAreaId, isTextArea);
    }
  } else {
    const containerId = container.getAttribute('sapling-id');
    if (containerId) {
      removeContainerIdForOverlayFormat(containerId);
      disableObserver(containerId, isTextArea);
      clearCacheForContainer(containerId);
    }
  }
}

function onResizeObserverForEditable(entries) {
  entries.forEach((entry) => {
    const parentContainer = entry.target;
    if (document.contains(parentContainer)) {
      onResizeOverlayFormatPerContainer(parentContainer);
    } else {
      deactivateContainer(parentContainer, false);
    }
  });
}

function onResizeObserverForTextArea(entries) {
  entries.forEach((entry) => {
    const parentContainer = entry.target;
    if (document.contains(parentContainer)) {
      initOrUpdateTextAreaOverlay(parentContainer);
    } else {
      deactivateContainer(parentContainer, true);
    }
  });
}

resizeObserverForEditable = new ResizeObserver(onResizeObserverForEditable);
SAPLING_OBSERVERS.push(resizeObserverForEditable);
resizeObserverForTextArea = new ResizeObserver(onResizeObserverForTextArea);
SAPLING_OBSERVERS.push(resizeObserverForTextArea);

function onContentMutationForTextAreaObserver(event) {
  const { target } = event;
  if (!target.hasAttribute('sapling-textarea-id')) {
    return;
  }

  const textAreaId = target.getAttribute('sapling-textarea-id');
  updateTextAreaOverlayWithText(textAreaId, target.value);
}

function initializeTextAreaObserver(textArea) {
  const textAreaId = textArea.getAttribute('sapling-textarea-id');
  const options = { passive: true };
  textArea.addEventListener('input', onContentMutationForTextAreaObserver, options);
  saveObservers(textAreaId, textArea, true, 'eventListeners', {
    element: textArea,
    event: 'input',
    handler: onContentMutationForTextAreaObserver,
    options,
  });

  const interval = setInterval(() => {
    updateTextAreaOverlayWithText(textAreaId, textArea.value);
  }, 1000);
  saveObservers(textAreaId, textArea, true, 'intervals', interval);
}

function initTextAreaScrollObserver(textArea, textAreaId) {
  $(textArea).on('scroll', () => {
    updateTextAreaScroll(textAreaId);
  });
  saveObservers(textAreaId, textArea, true, 'jqueryObservers', textArea);
}

function initializeObserversPerEditableBlock(block) {
  if (!isEnabledOnSite() && block.id !== 'sapling-embedded-editable') {
    return;
  }

  // add unique id to each editable container.
  const currentContainerId = $(block).attr('sapling-id');
  if (!currentContainerId || !SAPLING_CONTAINER_IDS.has(currentContainerId)) {
    const containerId = uuid();
    $(block).attr('sapling-id', containerId);
    SAPLING_CONTAINER_IDS.add(containerId);

    // for overlay format
    initOrUpdateContainerOverlay(block);
    initializeMutationObserver(block, containerId);
    resizeObserverForEditable.observe(block);
    saveObservers(containerId, block, false, 'resizeObservers', {
      container: block,
      observer: resizeObserverForEditable,
    });

    initCursorMoveObserver(block, containerId);
    initEditableScrollObserver(block, containerId);

    makeInitialEditIfEnabled(block);
  }
}

function initializeObserversPerTextArea(textArea) {
  if (!isEnabledOnSite() && textArea.id !== 'sapling-embedded-editable') {
    return;
  }

  const textAreaId = $(textArea).attr('sapling-textarea-id');
  if (!textAreaId || !SAPLING_TEXTAREA_IDS.has(textAreaId)) {
    const newTextAreaId = uuid();
    $(textArea).attr('sapling-textarea-id', newTextAreaId);
    SAPLING_TEXTAREA_IDS.add(newTextAreaId);

    const editableOverlay = initOrUpdateTextAreaOverlay(textArea);
    initializeTextAreaObserver(textArea);
    resizeObserverForTextArea.observe(textArea);
    saveObservers(newTextAreaId, textArea, true, 'resizeObservers', {
      container: textArea,
      observer: resizeObserverForEditable,
    });

    initTextAreaScrollObserver(textArea, newTextAreaId);

    // make initial edit.
    updateTextAreaOverlayWithText(newTextAreaId, textArea.value);
    updateTextAreaScroll(newTextAreaId);

    // need to force observing, cause we don't focusin.
    initializeObserversPerEditableBlock(editableOverlay);
  }
}

function onInputBlock(block, isTextArea) {
  const currentContainerId = $(block).attr('sapling-input-id');
  if (!currentContainerId) {
    const inputId = uuid();
    $(block).attr('sapling-input-id', inputId);

    const options = { capture: false, passive: true, once: true };
    block.addEventListener('input', onTypeInBlock, options);
    saveObservers(inputId, block, isTextArea, 'eventListeners', {
      element: block,
      event: 'input',
      handler: onTypeInBlock,
      options,
    });
  }
}

// debounce so it only gets called every 100ms.
const MOUSE_WAIT_IN_MILLISECONDS = 100;
const onMouseMoveThrottled = _.throttle(
  onMouseMoveWithOverlayFormat,
  MOUSE_WAIT_IN_MILLISECONDS,
  {
    leading: false,
    trailing: true,
  },
);

function containsElement(path, elementId) {
  for (let k = 0; k < path.length; k += 1) {
    const p = path[k];
    if (p.id === elementId) {
      return true;
    }
  }

  return false;
}

function onMouseDown(event) {
  const { path } = event;
  if (containsElement(path, 'accept-button') ||
    containsElement(path, 'ignore-button') ||
    containsElement(path, 'explanations')) {
    event.preventDefault();
  }
}

function initializeMouseObserver() {
  const options = { passive: true };
  document.addEventListener('mousemove', onMouseMoveThrottled, options);
  SAPLING_EVENT_LISTENERS.push({
    element: document,
    event: 'mousemove',
    handler: onMouseMoveThrottled,
    options,
  });
  // we need to below for web.whatsapp.com where
  // a mousedown event blocks click from propagating
  document.addEventListener('mousedown', onMouseDown, {});
  SAPLING_EVENT_LISTENERS.push({
    element: document,
    event: 'mousedown',
    handler: onMouseDown,
    options: {},
  });
}

function onFocusBlock(event) {
  const { target } = event;
  if (target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === 'plaintext-only') {
    onInputBlock(target, false);
    initializeObserversPerEditableBlock(target);
  } else if (target.nodeName.toLowerCase() === 'textarea') {
    onInputBlock(target, true);
    initializeObserversPerTextArea(target);
  }
  checkAndDisableInactiveObservers();
}

function initializeFocusObservers() {
  const options = { passive: true };
  document.addEventListener('focusin', onFocusBlock, options);
  SAPLING_EVENT_LISTENERS.push({
    element: document,
    event: 'focusin',
    handler: onFocusBlock,
    options,
  });
}

function initializeObserversPerInput() {
  $('textarea').each((ind, textArea) => {
    if (textArea.textContent !== '' || $(textArea).is(':focus')) {
      initializeObserversPerTextArea(textArea);
    }
  });

  $('[contenteditable=true], [contenteditable=plaintext-only]').each((ind, block) => {
    if (block.textContent !== '' || $(block).is(':focus')) {
      initializeObserversPerEditableBlock(block);
    }
  });
}

// now just google docs observer.
function onHtmlMutation(mutationsList) {
  for (let k = 0; k < mutationsList.length; k += 1) {
    const mutation = mutationsList[k];
    if (mutation.type === 'childList') {
      for (let j = 0; j < mutation.addedNodes.length; j += 1) {
        const addedNode = mutation.addedNodes[j];
        if (addedNode.nodeType === Node.ELEMENT_NODE && addedNode.tagName === 'IFRAME') {
          addedNode.onload = function() { sendMessageHandler('init/NEW_IFRAME_LOADED'); };
          //return;
        }
      }
    }
  }
}

function initializeHtmlObserver() {
  // observer to detect new iframe.
  const { body } = document;
  if (body) {
    const mutationCfg = { attributes: false, childList: true, subtree: true };
    const observer = new MutationObserver(onHtmlMutation);
    observer.observe(body, mutationCfg);
    SAPLING_OBSERVERS.push(observer);
  }
}

function initializeMeasureObservers() {
  // Check if appropriate host and path
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  if (!hostname.includes('zendesk.com') || !pathname.includes('/agent/dashboard')) {
    return
  }

  var iframe;
  try {
    iframe = $($('.app_view_wrapper iframe')[0].contentWindow.document);
  }
  catch (e) {
    return;
  }
  iframe.keypress(function() {
    //console.log('Starting measure observer...');
    if (SAPLING_CHATLOG_DETECTED)
      return;

    //console.log('Finding container...')
    var chatLog = iframe.find('.chat_log_container');
    if (!chatLog.length) return;
    //console.log('Detected container.');

    chatLog = chatLog[0];
    const contentCallback = function(mutationsList, observer) {
      for (var mutation of mutationsList) {
        //console.log(mutation);
        let GOT_RATING = false;
        for (var n of mutation.addedNodes) {
          if ($(n).find('.rating_icon.chatrating_good').length) {
            console.log('good');
            const properties = {
              rating: 'good',
            };
            sendEvent('rating', properties);
            GOT_RATING = true;
          }
          else if ($(n).find('.rating_icon.chatrating_bad').length) {
            console.log('bad');
            const properties = {
              rating: 'bad',
            };
            sendEvent('rating', properties);
            GOT_RATING = true;
          }
        }
        if (GOT_RATING) break;
      }
    };
    const mutationCfg = { attributes: false, childList: true, subtree: true };
    const contentObserver = new MutationObserver(contentCallback);
    contentObserver.observe(chatLog, mutationCfg);

    SAPLING_CHATLOG_DETECTED = true;
  });
}

function initializeSaplingLogoutObserver() {
  const hostname = window.location.hostname;
  if (!hostname.includes(SAPLING_WEBSITE_HOSTNAME)) {
    return;
  }
  const logoutButton = document.getElementById('logout-button');
  if (!logoutButton) {
    return;
  }
  logoutButton.addEventListener("click",  function() { 
      logoutUser(function(){}, function(){});
      logoutUser(() => {
        getUserProperties();
      }, () => {
        getUserProperties();
      });
  });
}

export function initializeObservers() {
  initializeHtmlObserver();
  initializeSaplingLogoutObserver();
  initializeFocusObservers();
  initializeMouseObserver();
  initializeObserversPerInput();
}
