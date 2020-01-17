import { sendEvent } from '../requests/index';
import { getVisibleEditElem, getBounds } from '../utils/html-utils';
import { getTopFrameHostname, getTopFramePathname } from '../utils/location';
import { acceptCallbackForOverlayFormat, rejectCallbackForOverlayFormat, getEditCountForOverlay, onEditControlsHidden, hasMishoveredElement } from '../ui/highlight/overlay';
import { isSubscription, getSubscriptionTrialDaysLeft, isUserEmailConfirmed, isUserAnonymous } from '../ui/settings';

// We have to wait to see if user moves mouse over edit controls before hiding
let hoverTimer = null;
const HOVER_WAIT = 500;

/* Overview
   - First editControlsInit to embed edit controls elements
   - During page init and when DOM changed, setup_editables(_helper) is called
     which sets up callback for when query button is clicked and when
     characters in editables are modified. Calls enableControls.
*/

// Helper function -- keeps timer in scope
export const hoverWaitTrigger = ((() => {
  let timer = 0;
  return (callback, ms) => {
    clearTimeout(timer);
    timer = setTimeout(callback, ms);
  };
})());
export const queryWaitTrigger = ((() => {
  let timer = 0;
  return (callback, ms) => {
    clearTimeout(timer);
    timer = setTimeout(callback, ms);
  };
})());


export function editControlsInit() {
  if (!$('sapling-controls').length) {
    $('html').append('<sapling-controls></sapling-controls>');
    $('sapling-controls').hide();
  }
  $('sapling-controls').html(`
    <div id="edit-controls-hidden" style="opacity: 0; height: 0px;"></div>
    <div id="edit-controls-buttons">
      <div class="edit-controls-row">
        <div id="accept-button">
          <div id="accept-check"><i class="icon-sapling-check"></i></div>
          <div id="accept-text"></div>
        </div>
      </div>
      <div class="edit-controls-row">
        <div id="ignore-button">
          <div id="ignore-times"><i class="icon-sapling-times"></i></div>
          <div id="ignore-text">Ignore</div>
        </div>
      </div>
      <div id="premium-banner-row" class="edit-controls-row" style="display: none;">
        <div id="premium-button">
          <div id="premium-text">
            Your trial ends in 1 day
          </div>
        </div>
      </div>
    </div>`);
}

/*
 * For each edit controls, set up callbacks for whenm ignore
 * and accept buttons are clicked.
 */
export function getEditCount(editDiv) {
  return getEditCountForOverlay(editDiv);
}

function acceptCallback(e) {
  acceptCallbackForOverlayFormat();
  e.stopPropagation();
}

function rejectCallback(e) {
  rejectCallbackForOverlayFormat();
  e.stopPropagation();
}

function premiumCallback(e) {
  window.open('https://sapling.ai/plans#trial_pro_edit_click');
  e.stopPropagation();
}

export function enableControls() {
  $('#accept-button').off('click');
  $('#ignore-button').off('click');
  $('#premium-button').off('click');
  $('#accept-button').click((e) => { acceptCallback(e); });
  $('#ignore-button').click((e) => { rejectCallback(e); });
  $('#premium-button').click((e) => { premiumCallback(e); });
}

export function hideEditControls() {
  $('#active-edit').removeAttr('id');
  $('#active-edit').removeAttr('sapling-edit-id');
  $('#active-edit').removeAttr('sapling-container-id');
  $('sapling-controls').remove();

  onEditControlsHidden();
}

export function disableEditControls() {
  $('#premium-button').off('click');
  $('#accept-button').off('click');
  $('#ignore-button').off('click');
}

export function hideEditControlsImmediatelyIfNoActiveEdit() {
  if (hasMishoveredElement()) {
    hideEditControls();
  }
}

export function clearHoverTimer() {
  clearTimeout(hoverTimer);
}

export function setControlText(edit) {
  const isWelcomePage = getTopFrameHostname() === 'sapling.ai';
  if (isUserAnonymous() && edit.requireLogin && !isWelcomePage) {
    sendEvent('require_login_applied', {});
    $('#accept-text').html('<a class="register-edit" target="_blank" href="https://sapling.ai/user/sign-in#edit_click">[Sign in + refresh to see edit.]</a>');
    disableEditControls();
    $('#ignore-button').click((e) => { rejectCallback(e); });
    return;
  //} else if (!isUserEmailConfirmed() && edit.requireLogin && !isWelcomePage) {
    //$('#accept-text').html('<a class="register-edit" target="_blank" href="https://sapling.ai/user/register#edit_click">[Confirm email and refresh page to see edit.]</a>');
    //disableEditControls();
    //$('#ignore-button').click((e) => { rejectCallback(e); });
    //return;
  } else if (edit.premium && isUserAnonymous() && !isWelcomePage) {
    sendEvent('pro_edit_applied', {});
    $('#accept-text').html('<a class="register-edit" target="_blank" href="https://sapling.ai/user/sign-in#edit_click">[Sign in + refresh to see premium edit.]</a>');
    disableEditControls();
    $('#ignore-button').click((e) => { rejectCallback(e); });
    return;
  } else if (edit.premium && !isUserEmailConfirmed() && !isWelcomePage) {
    sendEvent('pro_edit_applied', {});
    $('#accept-text').html('<a class="register-edit" href="#DNE">[Confirm email + refresh to see premium edit.]</a>');
    disableEditControls();
    $('#ignore-button').click((e) => { rejectCallback(e); });
    return;
  } else if (edit.premium && !isSubscription() && !isWelcomePage) {
  //if (edit.premium && !isSubscription() && !isWelcomePage) {
    sendEvent('pro_edit_applied', {});
    $('#accept-text').html('<a class="advanced-edit" target="_blank" href="https://sapling.ai/plans#pro_edit_click">[Pro Edit: Only in Sapling Pro]</a>');
    disableEditControls();
    $('#ignore-button').click((e) => { rejectCallback(e); });
    return;
  }
  enableControls();
  const deletedText = `<del> ${edit.originalText} </del>`;
  if (edit.replacementText === '') {
    $('#accept-text').html(deletedText);
  } else {
    $('#accept-text').html(edit.replacementText);
  }
}

function displayOrHidePremiumBanner(premium) {
  const trialDaysLeft = getSubscriptionTrialDaysLeft();
  if (trialDaysLeft !== null && premium && trialDaysLeft < 4) {
    if (trialDaysLeft === 1) {
      $('#premium-text').html('Your trial ends in 1 day');
    } else if (trialDaysLeft < 4) {
      $('#premium-text').html(`Your trial ends in ${trialDaysLeft} days`);
    }
    $('#premium-banner-row').show();
  } else {
    $('#premium-banner-row').hide();
  }
}

export function showEditControlForOverlayFormat(containerId, edit, domElements, parentOverlay) {
  clearTimeout(hoverTimer);
  $('#active-edit').removeAttr('id');

  if (!$('sapling-controls').length) {
    editControlsInit();
  }
  setControlText(edit);

  $('sapling-controls').attr('sapling-edit-id', edit.editId);
  $('sapling-controls').attr('sapling-container-id', containerId);

  const target = domElements[0];
  $(target).attr('id', 'active-edit');

  const clientRect = target.getBoundingClientRect();
  // Center edit controls around phrase origin
  let leftPos = clientRect.left - 18;
  leftPos = Math.min(leftPos, (window.innerWidth + window.scrollX) - $('sapling-controls').width() - 16);
  leftPos = Math.max(leftPos, 8);

  // Calculate center of phrase
  const originTop = clientRect.top + $(target).height();
  let topPos = originTop + window.scrollY;
  if (topPos + $('sapling-controls').height() > window.innerHeight + window.scrollY) {
    const newOriginTop = (clientRect.top - $('sapling-controls').height()) + window.scrollY;
    if (newOriginTop >= 0) {
      topPos = newOriginTop;
    }
  }
  // Shift within bounds of text input
  const visibleEditElem = getVisibleEditElem(parentOverlay);
  const textInputBounds = getBounds(visibleEditElem);

  $('sapling-controls').data('bounds', textInputBounds);
  $('sapling-controls').data('defaultHeight', $('sapling-controls').outerHeight());
  $('sapling-controls').data('defaultOrigin', { left: leftPos, top: topPos });

  displayOrHidePremiumBanner(edit.premium);
  $('sapling-controls').css({
    left: leftPos,
    top: topPos,
  });
  $('sapling-controls').fadeIn(200);
  const properties = {
    is_premium: edit.premium,
  };
  sendEvent('hover_on', properties, containerId);
}

export function hideEditControlForOverlayFormat() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  hoverTimer = setTimeout(hideEditControls, HOVER_WAIT);
}
