import saplingLog from '../utils/logger';
import { cleanse } from '../utils/html-utils';
import { applyTagWithOverlayFormat } from '../ui/highlight/overlay';

function splitEndingWord(data, index) {
  // currently only checks ahead of current index
  // don't apply edit if it cuts a word in half
  if (data === undefined || data.length <= index || index === 0) {
    return false;
  }
  return cleanse(data.substr(index, 1)) !== ' ' && cleanse(data.substr(index - 1, 1)) !== ' ' &&
    cleanse(data.substr(index, 1)) !== '\n' && cleanse(data.substr(index - 1, 1)) !== '\n';
}

export function isValidRange(editRange, edit, log = true) {
  const existingText = cleanse(editRange.toString());
  const startText = cleanse(edit.startText);
  const endText = cleanse(edit.endText);
  const existingStart = existingText.substring(0, startText.length);
  const existingEnd = existingText.substring(existingText.length - endText.length);
  if (existingStart !== startText || existingEnd !== endText) {
    if (log) {
      saplingLog(`Incorrect inner text |${existingStart}|!=|${startText}||${existingEnd}|!=|${endText}|`);
    }
    return false;
  }

  if (splitEndingWord(editRange.endContainer.data, editRange.endOffset)) {
    if (log) {
      saplingLog('Cannot apply tag that splits word');
    }
    return false;
  }

  return true;
}

export function applyTag(
  parentContainer,
  startDomElement,
  startIndex,
  endDomElement,
  endIndex,
  edit,
  overlappingEditsForOverlay = null,
) {
  // Apply tag edit to selected word.  Make sure cursor position is maintained.
  const editRange = document.createRange();
  editRange.setStart(startDomElement, startIndex);
  editRange.setEnd(endDomElement, endIndex);

  if (!isValidRange(editRange, edit)) {
    return null;
  }

  return applyTagWithOverlayFormat(
    parentContainer, editRange, edit,
    overlappingEditsForOverlay,
  );
}
