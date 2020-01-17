import { rangesIntersect, rangeIsValid } from '../../utils/range';
import { postEdit } from '../../requests/index';
import { removeCachedEdit } from '../../requests/cache';
import { isValidRange } from '../../utils/node-operations';
import { showEditControlForOverlayFormat, hideEditControlForOverlayFormat, hideEditControls, clearHoverTimer } from '../../ui/edit-controls';
import { getLocationFromOffset, getCSSOverlayForElement } from '../../utils/html-utils';
import { getTextAreaContainerId, acceptCallbackForTextArea } from '../../ui/highlight/textarea';
import { sendMessageHandler } from '../../ui/observers';

// We cache results that should be shown and propagate the changes
// to the frontend overlay.
// {
//   containerId: {
//     overlayDomElement: (domElement),
//     textAreaId: uuid,
//     edits: {
//       editId: {  # TODO: we may need to self-generate this
//         edit: {},
//         editRange: {},
//         domElements: [(domElement)],
//         isHover: true/false,
//       }
//     }
//   }
// }
const saplingIdToInfo = {};

// {
//   containerId: (id),
//   editId: (id),
// }
let hoveredElement = null;
let SHOULD_CALL_CLEAR_HOVER = false;

// Remove all overlay dom elements
export function clearOverlay() {
  Object.keys(saplingIdToInfo).forEach((key) => {
    if (saplingIdToInfo[key].overlayDomElement) {
      saplingIdToInfo[key].overlayDomElement.remove();
    }
  });
}

// Get edit count to display total in toolbar
export function getEditCountForOverlay(parentContainer) {
  const containerId = parentContainer.getAttribute('sapling-id');
  if (containerId) {
    const parentContainerInfo = saplingIdToInfo[containerId];
    if (parentContainerInfo) {
      return Object.keys(parentContainerInfo.edits).length;
    }
  }

  return 0;
}

// TODO Refactor and comment this
export function initOrUpdateContainerOverlay(parentContainer) {
  const containerId = parentContainer.getAttribute('sapling-id');
  saplingIdToInfo[containerId] = saplingIdToInfo[containerId] || { edits: {} };
  let { overlayDomElement } = saplingIdToInfo[containerId];
  if (overlayDomElement && !document.contains(overlayDomElement)) {
    overlayDomElement.remove();
    overlayDomElement = null;
  }
  if (!overlayDomElement) {
    // remove if exists
    const { nextSibling } = parentContainer;
    if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE && nextSibling.getAttribute('is-sapling-overlay')) {
      // only active scripts are allowed to clear
      sendMessageHandler('init/CHECK_CONTENT_SCRIPT_ACTIVE', {}, () => {
        nextSibling.remove();
      });
    }

    overlayDomElement = document.createElement('div');
    overlayDomElement.setAttribute('is-sapling-overlay', true);
    $(parentContainer).after(overlayDomElement);
    saplingIdToInfo[containerId].overlayDomElement = overlayDomElement;
    saplingIdToInfo[containerId].textAreaId = $(parentContainer).attr('sapling-textarea-id');
  }

  const frameDimensions = getCSSOverlayForElement(parentContainer);
  $(overlayDomElement).css({
    'pointer-events': 'none',
    'z-index': document.defaultView.getComputedStyle(parentContainer).getPropertyValue('z-index'),
    'box-sizing': 'content-box',
    overflow: 'hidden',
    position: frameDimensions.position,
    left: frameDimensions.left,
    top: frameDimensions.top,
    height: frameDimensions.height, // facebook requires this 2px buffer
    width: frameDimensions.width,
  });
}

// TODO Refactor and comment this
function getRangeClientRects(editRange, overlayDomElement) {
  const overlayClientRect = overlayDomElement.getBoundingClientRect();

  const finalRects = [];
  const clientRects = editRange.getClientRects();
  for (let i = 0; i < clientRects.length; i += 1) {
    const clientRect = clientRects[i];
    finalRects.push({
      left: clientRect.left - overlayClientRect.left,
      top: clientRect.top - overlayClientRect.top,
      height: clientRect.height,
      width: clientRect.width,
    });
  }

  return finalRects;
}

// Get background image for edits
function getBackgroundImage(isPremium, isHover) {
  if (isPremium) {
    if (isHover) {
      return 'linear-gradient(to right, rgba(255, 214, 51, 0.15), rgba(255, 214, 51, 0.15))';
    }
    return 'linear-gradient(to right, #ffd633, #ffd633)';
  }

  if (isHover) {
    return 'linear-gradient(to right, rgba(255, 0, 0, 0.15), rgba(255, 0, 0, 0.15))';
  }

  return 'linear-gradient(to right, #ff0000, #ff0000)';
}

// Get background color for edits
function getBackgrounColor(isPremium, isHover) {
  if (isHover) {
    if (isPremium) {
      return '#ffd633';
    }
    return '#ff0000';
  }

  return '';
}

function applyTagCSS(editInfo, isHover) {
  const editInfoTemp = editInfo;
  editInfoTemp.isHover = isHover;
  let tagCSS = {
    opacity: 0.85,
    transition: '',
    'background-color': getBackgrounColor(editInfo.edit.premium, isHover),
    'background-image': getBackgroundImage(editInfo.edit.premium, isHover),
    '-webkit-transition': '',
    '-ms-transition': '',
  };

  if (isHover) {
    tagCSS = {
      opacity: 0.15,
      transition: 'background-color 200ms linear',
      'background-color': getBackgrounColor(editInfo.edit.premium, isHover),
      'background-image': getBackgroundImage(editInfo.edit.premium, isHover),
      '-webkit-transition': 'background-color 200ms linear',
      '-ms-transition': 'background-color 200ms linear',
    };
  }
  editInfo.domElements.forEach((domElement) => {
    $(domElement).css(tagCSS);
  });
}

function updateTagOverlay(containerId, editId) {
  const parentContainerInfo = saplingIdToInfo[containerId];
  const editInfo = parentContainerInfo.edits[editId];
  const { editRange } = parentContainerInfo.edits[editId];

  // clear old edit overlays
  if (editId in parentContainerInfo.edits) {
    editInfo.domElements.forEach((domElement) => {
      domElement.remove();
    });
  }
  editInfo.domElements = [];

  const clientRects = getRangeClientRects(
    editRange,
    parentContainerInfo.overlayDomElement,
  );
  for (let i = 0; i < clientRects.length; i += 1) {
    const clientRect = clientRects[i];
    const saplingSpan = document.createElement('span');
    saplingSpan.classList.add('sapling-edit');
    saplingSpan.setAttribute('sapling-edit-id', editId);
    saplingSpan.setAttribute('sapling-container-id', containerId);
    $(saplingSpan).css({
      position: 'absolute',
      'box-sizing': 'content-box',
      left: clientRect.left,
      top: clientRect.top,
      height: clientRect.height,
      width: clientRect.width,

      // below is from css file
      display: 'inline',
      'min-width': '0.5em',
      opacity: 0.85,
      'background-image': getBackgroundImage(editInfo.edit.premium, false),
      'background-position': '0px calc(100% + 1px)',
      'background-repeat': 'no-repeat',
      'background-size': 'calc(100% + 1px) 2px',
      'border-bottom': '2px solid transparent',
      //visibility: 'hidden',
    });

    parentContainerInfo.overlayDomElement.append(saplingSpan);
    editInfo.domElements.push(saplingSpan);
    // This looks spazzy, updates too frequently
    //$(saplingSpan).css('visibility', 'visible').hide().fadeIn(500);
  }

  if (editInfo.isHover) {
    applyTagCSS(editInfo, true);
  }
}

export function onEditControlsHidden() {
  if (hoveredElement) {
    if (hoveredElement.containerId in saplingIdToInfo) {
      const { edits } = saplingIdToInfo[hoveredElement.containerId];
      if (hoveredElement.editId in edits) {
        const editInfo = edits[hoveredElement.editId];
        applyTagCSS(editInfo, false);
      }
    }
    hoveredElement = null;
  }
}

function clearHoveredEdit() {
  // means we no longer hovering over it.
  hideEditControlForOverlayFormat();
}

function clearTagForOverlayFormat(containerId, editId) {
  const { edits } = saplingIdToInfo[containerId];
  edits[editId].domElements.forEach(elem => elem.remove());
  if (edits[editId].isHover) {
    clearHoveredEdit();
  }
  delete edits[editId];
}

export function clearTagsForOverlayFormat(parentContainer, editIds) {
  const containerId = parentContainer.getAttribute('sapling-id');
  for (let idx = 0; idx < editIds.length; idx += 1) {
    clearTagForOverlayFormat(containerId, editIds[idx]);
  }
}

export function applyTagWithOverlayFormat(
  parentContainer, editRange, edit,
  overlappingEditsForOverlay,
) {
  const overlappingEditsForOverlayObj = overlappingEditsForOverlay;
  const editObj = edit;
  const containerId = parentContainer.getAttribute('sapling-id');
  if (!(containerId in saplingIdToInfo)) {
    return;
  }
  if (editObj.editId in saplingIdToInfo[containerId].edits) {
    // if already exists and valid. don't reapply.
    const {
      editRange: origEditRange,
    } = saplingIdToInfo[containerId].edits[editObj.editId];
    if (isValidRange(origEditRange, edit, false)) {
      if (overlappingEditsForOverlayObj) {
        delete overlappingEditsForOverlayObj[editObj.editId];
      }
      return;
    }
  }
  if (overlappingEditsForOverlayObj) {
    for ( // eslint-disable-line no-restricted-syntax
      const editId of Object.keys(overlappingEditsForOverlayObj)
    ) {
      const {
        edit: overlappingEdit,
        editRange: overlappingEditRange,
      } = overlappingEditsForOverlayObj[editId];

      if (rangesIntersect(overlappingEditRange, editRange)) {
        if (overlappingEditRange.toString() === editRange.toString()) {
          if (overlappingEdit.editId in saplingIdToInfo[containerId].edits) {
            clearTagForOverlayFormat(containerId, overlappingEdit.editId);
          }

          delete overlappingEditsForOverlayObj[editId];
          break;
        }

        clearTagForOverlayFormat(containerId, editId);
        delete overlappingEditsForOverlayObj[editId];
        // TODO: keep hover if approximately in right place.
      }
    }
  }

  if (editObj.editId in saplingIdToInfo[containerId].edits) {
    saplingIdToInfo[containerId].edits[editObj.editId].edit = editObj;
    saplingIdToInfo[containerId].edits[editObj.editId].editRange = editRange;
  } else {
    saplingIdToInfo[containerId].edits[editObj.editId] = {
      editRange,
      edit: editObj,
      domElements: [],
      isHover: false,
    };
  }

  updateTagOverlay(containerId, editObj.editId);
}

function getOffset(offset, container, removedNodes) {
  let runningOffset = 0;
  for (let idx = 0; idx < removedNodes.length; idx += 1) {
    const removedNode = removedNodes[idx];
    const textLength = removedNode.textContent.length;
    if (removedNode.contains(container)) {
      return runningOffset + offset;
    }

    runningOffset += textLength;
  }

  return null;
}

function getOldLength(mutation) {
  let length = 0;
  let prev = mutation.previousSibling;
  while (prev) {
    length += prev.textContent.length;
    prev = prev.previousSibling;
  }
  let next = mutation.nextSibling;
  while (next) {
    length += next.textContent.length;
    next = next.nextSibling;
  }

  for (let idx = 0; idx < mutation.removedNodes.length; idx += 1) {
    const removedNode = mutation.removedNodes[idx];
    length += removedNode.textContent.length;
  }

  return length;
}

function getNewRangeFromOffset(oldEditRange, startNode, newStartOffset, endNode, newEndOffset) {
  let {
    startContainer, startOffset,
    endContainer, endOffset,
  } = oldEditRange;
  if (!document.contains(startNode) || !document.contains(endNode)) {
    return null;
  }

  if (newStartOffset !== null) {
    const start =
      getLocationFromOffset(startNode, 0, newStartOffset, endNode, false, false);
    if (start) {
      startContainer = start.domElement;
      startOffset = start.domOffset;
    }
  }
  if (newEndOffset !== null) {
    const end =
      getLocationFromOffset(startNode, 0, newEndOffset, endNode, false, true);
    if (end) {
      endContainer = end.domElement;
      endOffset = end.domOffset;
    }
  }

  const newEditRange = document.createRange();
  if (!document.contains(startContainer) || !document.contains(endContainer) ||
    startContainer.length <= startOffset || endContainer.length <= endOffset ||
    startOffset < 0 || endOffset < 0) {
    return null;
  }
  newEditRange.setStart(startContainer, startOffset);
  newEditRange.setEnd(endContainer, endOffset);

  return newEditRange;
}

export function updateRangeForOverlayFormatForChildList(containerId, mutation) {
  if (!(containerId in saplingIdToInfo)) {
    return;
  }

  const { removedNodes } = mutation;
  if (removedNodes.length === 0) {
    return;
  }

  const { edits } = saplingIdToInfo[containerId];
  Object.keys(edits).forEach((editId) => {
    const { edit, editRange } = edits[editId];
    const newStartOffset =
      getOffset(editRange.startOffset, editRange.startContainer, removedNodes);
    const newEndOffset =
      getOffset(editRange.endOffset, editRange.endContainer, removedNodes);

    if (newStartOffset !== null || newEndOffset !== null) {
      const startNode = mutation.previousSibling || mutation.target;
      const newEditRange = getNewRangeFromOffset(
        editRange,
        startNode, newStartOffset,
        mutation.target, newEndOffset,
      );
      if (newEditRange && isValidRange(newEditRange, edit, false)) {
        edits[editId].editRange = newEditRange;
        updateTagOverlay(
          containerId,
          editId,
        );
      } else {
        const possibleDiff = mutation.target.textContent.length - getOldLength(mutation);
        const diffEditRange = getNewRangeFromOffset(
          editRange,
          startNode, newStartOffset + possibleDiff,
          mutation.target, newEndOffset + possibleDiff,
        );
        if (diffEditRange && isValidRange(diffEditRange, edit, false)) {
          edits[editId].editRange = diffEditRange;
          updateTagOverlay(
            containerId,
            editId,
          );
        }
      }
    }
  });
}

export function updateRangeForOverlayFormatForCharacterData(containerId, mutation) {
  if (!(containerId in saplingIdToInfo)) {
    return;
  }

  const { edits } = saplingIdToInfo[containerId];
  Object.keys(edits).forEach((editId) => {
    const { edit, editRange } = edits[editId];

    // only relevant if startContainer or before modified.
    if (editRange.startContainer !== mutation.target) {
      return;
    }
    // if below true, then just update the range.
    if (rangeIsValid(editRange)) {
      const recreatedEditRange = editRange.cloneRange();
      if (isValidRange(recreatedEditRange, edit, false)) {
        edits[editId].editRange = recreatedEditRange;
        return;
      }
    }

    // try to shift range and see if it still works.
    const indexDiff = mutation.target.length - mutation.oldValue.length;
    const newStartOffset = editRange.startOffset + indexDiff;
    let newEndOffset = editRange.endOffset;
    if (editRange.endContainer === mutation.target) {
      newEndOffset += indexDiff;
    }
    if (newStartOffset >= 0 && newStartOffset <= editRange.startContainer.length &&
        newEndOffset >= 0 && newEndOffset <= editRange.endContainer.length) {
      const newEditRange = document.createRange();
      newEditRange.setStart(editRange.startContainer, newStartOffset);
      newEditRange.setEnd(editRange.endContainer, newEndOffset);
      if (isValidRange(newEditRange, edit, false)) {
        edits[editId].editRange = newEditRange;
        updateTagOverlay(
          containerId,
          editId,
        );
      }
    }

    // ultimately if something is invalid, then clear it.
    if (!rangeIsValid(edits[editId].editRange)) {
      clearTagForOverlayFormat(containerId, editId);
    }
  });
}

export function getOverlappingEditsForOverlayFormat(
  parentContainer,
  startNode,
  startIndex,
  endNode,
  endIndex,
) {
  const selectRange = document.createRange();
  selectRange.setStart(startNode, startIndex);
  selectRange.setEnd(endNode, endIndex);

  const containerId = parentContainer.getAttribute('sapling-id');
  if (containerId in saplingIdToInfo) {
    const { edits } = saplingIdToInfo[containerId];
    const overlappingEditsForOverlay = {};
    Object.keys(edits).forEach((editId) => {
      const { editRange } = edits[editId];
      if (document.contains(editRange.startContainer) &&
          document.contains(editRange.endContainer) &&
          rangesIntersect(editRange, selectRange)) {
        overlappingEditsForOverlay[editId] = edits[editId];
      }
    });

    return overlappingEditsForOverlay;
  }

  return null;
}

export function validateTagWithOverlayFormat(containerId) {
  if (containerId in saplingIdToInfo) {
    const { edits } = saplingIdToInfo[containerId];
    Object.keys(edits).forEach((editId) => {
      const { editRange, edit } = edits[editId];
      if (!isValidRange(editRange, edit, false)) {
        clearTagForOverlayFormat(containerId, editId);
      }
    });
  }
}

function isCursorInRange(editRange, containerId, event) {
  const { target } = event;
  const hoveredContainerId = target.getAttribute('sapling-id') ||
    $(target).parents('[sapling-id]').attr('sapling-id') ||
    (target.hasAttribute('sapling-textarea-id') &&
      getTextAreaContainerId(target.getAttribute('sapling-textarea-id')));
  if (hoveredContainerId === containerId) {
    const clientRects = editRange.getClientRects();
    for (let i = 0; i < clientRects.length; i += 1) {
      const clientRect = clientRects[i];
      if (clientRect.top <= event.clientY &&
          clientRect.top + clientRect.height >= event.clientY &&
          clientRect.left <= event.clientX &&
          clientRect.left + clientRect.width >= event.clientX) {
        return true;
      }
    }
  }

  return false;
}

export function hasMishoveredElement() {
  if (hoveredElement) {
    if (hoveredElement.containerId in saplingIdToInfo) {
      const { edits } = saplingIdToInfo[hoveredElement.containerId];
      if (hoveredElement.editId in edits) {
        const edit = edits[hoveredElement.editId];
        const { editRange } = edit;
        if (!document.contains(editRange.startContainer) ||
          !document.contains(editRange.endContainer)) {
          return true;
        }
      } else {
        return true;
      }
    }
  }

  return false;
}

function isCursorInEditControl(event) {
  const editControl = $('sapling-controls').get(0);
  const clientRects = editControl.getClientRects();
  for (let i = 0; i < clientRects.length; i += 1) {
    const clientRect = clientRects[i];
    if (clientRect.top <= event.clientY &&
        clientRect.top + clientRect.height >= event.clientY &&
        clientRect.left <= event.clientX &&
        clientRect.left + clientRect.width >= event.clientX) {
      return true;
    }
  }
  return false;
}

export function onMouseMoveWithOverlayFormat(event) {
  if (hoveredElement) {
    if (hoveredElement.containerId in saplingIdToInfo) {
      const { edits } = saplingIdToInfo[hoveredElement.containerId];
      if (hoveredElement.editId in edits) {
        const edit = edits[hoveredElement.editId];
        if (isCursorInRange(edit.editRange, hoveredElement.containerId, event) ||
            isCursorInEditControl(event)) {
          clearHoverTimer();
          SHOULD_CALL_CLEAR_HOVER = true;
          return;
        }
      }
    }
    if (SHOULD_CALL_CLEAR_HOVER) {
      clearHoveredEdit();
      SHOULD_CALL_CLEAR_HOVER = false;
    }
  }

  Object.keys(saplingIdToInfo).forEach((containerId) => {
    const { edits, overlayDomElement } = saplingIdToInfo[containerId];
    Object.keys(edits).forEach((editId) => {
      const editInfo = edits[editId];
      const { edit, editRange, domElements } = editInfo;
      if (isCursorInRange(editRange, containerId, event)) {
        onEditControlsHidden();
        applyTagCSS(editInfo, true);
        hoveredElement = {
          editId,
          containerId,
        };

        showEditControlForOverlayFormat(containerId, edit, domElements, overlayDomElement);
        SHOULD_CALL_CLEAR_HOVER = true;
      }
    });
  });
}

// only apply focus
function applySingleRange(range) {
  const nativeSelection = window.getSelection();
  const newRange = document.createRange();
  if (typeof nativeSelection.setBaseAndExtent === 'function') {
    nativeSelection.setBaseAndExtent(
      range.endContainer, range.endOffset,
      range.endContainer, range.endOffset,
    );
  } else {
    newRange.setStart(range.endContainer, range.endOffset);
    nativeSelection.addRange(newRange);
  }
}

export function acceptCallbackForOverlayFormat() {
  const containerId = $('sapling-controls').attr('sapling-container-id');
  const editId = $('sapling-controls').attr('sapling-edit-id');
  const { edits, textAreaId } = saplingIdToInfo[containerId];
  if (edits) {
    const editObj = edits[editId];
    if (editObj) {
      const { edit, editRange } = editObj;
      const { replacementText } = edit;
      const properties = {
        is_premium: edit.premium,
      };
      postEdit(
        edit.editId,
        true,
        containerId,
        properties,
      );

      if (textAreaId) {
        acceptCallbackForTextArea(textAreaId, editRange, replacementText);
      } else {
        // we need cursor to be in input or else "dispatchEvent" doesn't work.
        // for instance in facebook.com
        applySingleRange(editRange);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

        const {
          startContainer, startOffset,
          endContainer, endOffset,
        } = editRange;
        if (startContainer === endContainer) {
          startContainer.replaceData(startOffset, endOffset - startOffset, replacementText);
        } else {
          editRange.deleteContents();
          startContainer.insertData(startOffset, replacementText);
        }

        // fire these events so React works on fb sites.
        editRange.startContainer.dispatchEvent(new Event('input', { bubbles: true, cancelable: false }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      }

      clearTagForOverlayFormat(containerId, editId);
    }
  }

  hideEditControls();
  hoveredElement = null;
}

export function rejectCallbackForOverlayFormat() {
  const containerId = $('sapling-controls').attr('sapling-container-id');
  const editId = $('sapling-controls').attr('sapling-edit-id');
  const { edits } = saplingIdToInfo[containerId];
  if (edits) {
    const editObj = edits[editId];
    if (editObj) {
      const { edit } = editObj;
      const properties = {
        is_premium: edit.premium,
      };
      postEdit(
        edit.editId,
        false,
        containerId,
        properties,
      );

      removeCachedEdit(containerId, editId);
      clearTagForOverlayFormat(containerId, editId);
    }
  }

  hideEditControls();
  hoveredElement = null;
}

// readjust positions on resize

export function onUpdateTagForOverlayFormatPerContainer(containerId) {
  if (containerId in saplingIdToInfo) {
    const { edits } = saplingIdToInfo[containerId];
    Object.keys(edits).forEach((editId) => {
      updateTagOverlay(
        containerId,
        editId,
      );
    });
  }
}

export function onResizeOverlayFormatPerContainer(parentContainer) {
  initOrUpdateContainerOverlay(parentContainer);

  const containerId = parentContainer.getAttribute('sapling-id');
  onUpdateTagForOverlayFormatPerContainer(containerId);
}

export function removeContainerIdForOverlayFormat(containerId) {
  if (containerId in saplingIdToInfo) {
    saplingIdToInfo[containerId].overlayDomElement.remove();
    delete saplingIdToInfo[containerId];
  }
}
