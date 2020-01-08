import { getEdits, sendEvent } from '../requests/index';
import { setLoadingState, requestQueuedCalls, cacheEditsResponse } from '../requests/cache';
import { enableControls, getEditCount } from '../ui/edit-controls';
import { makeToolbarIconActive, makeToolbarIconThrottled, makeToolbarIconLoading, updateToolbarIconEditCount, updateToolbarIconDisconnected, setConnectionEstablished, getConnectionEstablished } from '../ui/toolbar';
import updateStatusIndicator from '../ui/status';

const SAPLING_EDITS_APPLIED_IDS_SENT = new Set();

export default function getAndApplyEditsForContainer(
  innerHtml,
  htmlHash,
  parentContainer,
  containerId,
  language,
) {
  // initialize network call and handle button states.
  makeToolbarIconLoading();
  return getEdits(innerHtml, language, containerId, (data) => {
    const { edits } = data;
    if (edits.includes('throttled')) {
      makeToolbarIconThrottled();
      sendEvent('throttled', {}, containerId);
      return;
    }

    setLoadingState(containerId, htmlHash);
    requestQueuedCalls();

    let count = 0;
    cacheEditsResponse(
      parentContainer,
      containerId,
      htmlHash,
      edits,
    );
    count = getEditCount(parentContainer);
    setConnectionEstablished(true);
    enableControls();
    if (count > 0 && !SAPLING_EDITS_APPLIED_IDS_SENT.has(containerId)) {
      const properties = {
        num_edits: count,
      };
      sendEvent('edits_applied', properties, containerId);
      SAPLING_EDITS_APPLIED_IDS_SENT.add(containerId);
    }

    if (getConnectionEstablished()) {
      if (parentContainer.id === 'sapling-embedded-editable') {
        makeToolbarIconActive(); // Current behavior: do not display count for popup window edits
      } else {
        updateToolbarIconEditCount(count);
      }
    }
    updateStatusIndicator(false);
  }, () => {
    setConnectionEstablished(false);
    updateToolbarIconDisconnected();
    updateStatusIndicator(true);
  });
}
