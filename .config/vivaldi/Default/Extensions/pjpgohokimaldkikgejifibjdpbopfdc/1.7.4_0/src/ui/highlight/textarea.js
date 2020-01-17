import { diffChars } from 'diff';
import { onUpdateTagForOverlayFormatPerContainer } from '../../ui/highlight/overlay';
import { getCSSOverlayForElement } from '../../utils/html-utils';

// We cache results that should be shown and propagate the changes
// to the frontend overlay.
// {
//   saplingTextAreaId: {
//     textArea: (domElement),
//     overlayDomElement: (domElement),
//   }
// }
const saplingIdToTextAreaInfo = {};


export function initOrUpdateTextAreaOverlay(textArea) {
  const saplingTextAreaId = textArea.getAttribute('sapling-textarea-id');
  saplingIdToTextAreaInfo[saplingTextAreaId] = saplingIdToTextAreaInfo[saplingTextAreaId] || {};
  let { overlayDomElement } = saplingIdToTextAreaInfo[saplingTextAreaId];

  if (overlayDomElement && !document.contains(overlayDomElement)) {
    overlayDomElement.remove();
    overlayDomElement = null;
  }
  if (!overlayDomElement) {
    // remove if exists
    const { nextSibling } = textArea;
    if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE && nextSibling.getAttribute('sapling-textarea-id')) {
      nextSibling.remove();
    }

    overlayDomElement = document.createElement('div');
    overlayDomElement.setAttribute('contenteditable', true);
    overlayDomElement.setAttribute('sapling-textarea-id', saplingTextAreaId);
    $(textArea).after(overlayDomElement);
    saplingIdToTextAreaInfo[saplingTextAreaId].overlayDomElement = overlayDomElement;
    saplingIdToTextAreaInfo[saplingTextAreaId].textArea = textArea;
  }

  const frameDimensions = getCSSOverlayForElement(textArea);

  $(overlayDomElement).css({
    spellcheck: false,
    font: $(textArea).css('font'),
    color: 'transparent',
    background: $(textArea).css('background'),
    'overflow-x': $(textArea).css('overflowX'),
    'overflow-y': $(textArea).css('overflowY'),
    'background-color': 'transparent',
    'white-space': $(textArea).css('whiteSpace'),
    'pointer-events': 'none',
    'border-radius': $(textArea).css('borderRadius'),
    'border-width': $(textArea).css('borderWidth'),
    'border-style': $(textArea).css('borderStyle'),
    'z-index': document.defaultView.getComputedStyle(textArea).getPropertyValue('z-index'),
    'box-sizing': $(textArea).css('boxSizing'),
    padding: $(textArea).css('padding'),
    overflow: $(textArea).css('overflow'),
    display: $(textArea).css('display'),
    position: frameDimensions.position,
    left: frameDimensions.left,
    top: frameDimensions.top,
    height: frameDimensions.height,
    width: frameDimensions.width,
  });

  return overlayDomElement;
}

export function getTextAreaContainerId(textAreaId) {
  if (textAreaId in saplingIdToTextAreaInfo) {
    return saplingIdToTextAreaInfo[textAreaId].overlayDomElement.getAttribute('sapling-id');
  }

  return null;
}

export function updateTextAreaOverlayWithText(textAreaId, value) {
  if (textAreaId in saplingIdToTextAreaInfo) {
    const { overlayDomElement } = saplingIdToTextAreaInfo[textAreaId];
    const { firstChild } = overlayDomElement;
    const oldValue = overlayDomElement.textContent;
    const newValue = `${value}\n`;
    if (oldValue !== newValue) {
      // if difference in text is really big, then just replace everything.
      if (Math.abs(newValue.length - oldValue.length) > 250) {
        overlayDomElement.textContent = newValue;
      } else if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
        const diffs = diffChars(oldValue, newValue);
        let runningOffset = 0;
        for (let idx = 0; idx < diffs.length; idx += 1) {
          const diff = diffs[idx];
          const valueLength = diff.value.length;
          const currentValue = overlayDomElement.textContent;
          if (diff.added) {
            firstChild.insertData(runningOffset, diff.value);
            runningOffset += valueLength;
          } else {
            // check value is correct
            if (diff.value !== currentValue.substr(runningOffset, valueLength)) {
              // if fail then just replace everything
              overlayDomElement.textContent = newValue;
              break;
            }
            if (diff.removed) {
              firstChild.deleteData(runningOffset, valueLength);
            } else {
              runningOffset += valueLength;
            }
          }
        }
      } else {
        overlayDomElement.textContent = newValue;
      }
    }
  }
}

export function acceptCallbackForTextArea(textAreaId, editRange, replacementText) {
  if (textAreaId in saplingIdToTextAreaInfo) {
    const { textArea } = saplingIdToTextAreaInfo[textAreaId];
    $(textArea).setSelection(editRange.startOffset, editRange.endOffset);
    $(textArea).replaceSelectedText(replacementText);
  }
}

export function updateTextAreaScroll(textAreaId) {
  if (textAreaId in saplingIdToTextAreaInfo) {
    const { textArea, overlayDomElement } = saplingIdToTextAreaInfo[textAreaId];
    overlayDomElement.scrollTop = textArea.scrollTop;
    overlayDomElement.scrollLeft = textArea.scrollLeft;

    // the below makes it far less laggy.
    const containerId = overlayDomElement.getAttribute('sapling-id');
    onUpdateTagForOverlayFormatPerContainer(containerId);
  }
}

function removeTextAreaIdForOverlayFormat(saplingTextAreaId) {
  if (saplingTextAreaId in saplingIdToTextAreaInfo) {
    saplingIdToTextAreaInfo[saplingTextAreaId].overlayDomElement.remove();
    delete saplingIdToTextAreaInfo[saplingTextAreaId];
  }
}

export function removeTextAreaFromParentContainer(textArea) {
  const saplingTextAreaId = textArea.getAttribute('sapling-textarea-id');
  if (saplingTextAreaId) {
    removeTextAreaIdForOverlayFormat(saplingTextAreaId);
  }
}
