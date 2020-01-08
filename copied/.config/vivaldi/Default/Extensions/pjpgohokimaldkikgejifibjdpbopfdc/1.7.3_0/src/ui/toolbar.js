import { sendMessageHandler } from '../ui/observers';
import { isEnabledOnSite } from '../ui/settings';
import { updateSaplingEmbedded } from '../ui/embed';

let isConnectionEstablished = true;

export function setConnectionEstablished(connectionEstablished) {
  isConnectionEstablished = connectionEstablished;
}

export function getConnectionEstablished() {
  return isConnectionEstablished;
}

export function makeToolbarIconActive() {
  sendMessageHandler('makeToolbarIconActive');
}

export function makeToolbarIconThrottled() {
  sendMessageHandler('makeToolbarIconThrottled');
  updateSaplingEmbedded(throttled=true);
}

export function makeToolbarIconInactive() {
  sendMessageHandler('makeToolbarIconInactive');
}

export function makeToolbarIconLoading() {
  sendMessageHandler('makeToolbarIconLoading');
}

export function updateToolbarIconEditCount(count) {
  sendMessageHandler('updateToolbarIconEditCount', { editCount: count });
}

export function updateToolbarIconDisconnected() {
  sendMessageHandler('updateToolbarIconDisconnected');
}

export function initToolbar() {
  if (isEnabledOnSite() || window.location.hostname === 'docs.google.com') {
    if (isConnectionEstablished) {
      makeToolbarIconActive();
    }
  } else {
    makeToolbarIconInactive();
  }
}
