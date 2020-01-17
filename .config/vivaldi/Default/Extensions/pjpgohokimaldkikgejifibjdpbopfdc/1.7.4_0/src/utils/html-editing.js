import { cleanse, getLocationFromOffset, nextDomElement } from '../utils/html-utils';
import { applyTag } from '../utils/node-operations';
import { clearTagsForOverlayFormat, getOverlappingEditsForOverlayFormat } from '../ui/highlight/overlay';


export function getHtmlWithLastSentence(parentContainer) {
  /*
   *  Returns innerHTML.  Removes last incomplete sentence.  So if there's:
   *             Let's go to the gym. I will go
   *
   *  it will only return "Let's go to the gym.". We use this to hash and see
   *  if we should make repeated calls to backend.
   */
  if (parentContainer.type === 'textarea') {
    return parentContainer.value;
  }

  const clonedParent = parentContainer.cloneNode(true);
  $(clonedParent).find('script').remove();
  $(clonedParent).find('style').remove();
  $(clonedParent).find('xml').remove();

  let domElement = clonedParent.firstChild;
  while (domElement !== null) {
    const { nodeType } = domElement;
    if (nodeType !== Node.TEXT_NODE && nodeType !== Node.ELEMENT_NODE) {
      const currentDomElement = domElement;
      if (currentDomElement.nextSibling) {
        domElement = currentDomElement.nextSibling;
      } else {
        let tempParent = currentDomElement.parentNode;
        if (tempParent) {
          while (tempParent !== clonedParent) {
            if (tempParent.nextSibling) {
              domElement = tempParent.nextSibling;
              break;
            }
            tempParent = tempParent.parentNode;
          }
        } else {
          domElement = null;
        }
      }

      currentDomElement.remove();
    } else {
      domElement = nextDomElement(domElement, clonedParent);
    }
  }
  $(clonedParent).find('*').each((idx, elem) => {
    const { attributes } = elem;
    while (attributes.length !== 0) {
      const attribute = attributes[0];
      elem.removeAttribute(attribute.name);
    }
  });

  return cleanse(clonedParent.innerHTML || '');
}

function applyEditToHtml(
  parentContainer, textOffset, domElement, indexSum, edit,
  overlappingEditsForOverlay,
) {
  let currentDomElement = domElement;
  let currentIndexSum = indexSum;

  const startLocation = getLocationFromOffset(
    currentDomElement, currentIndexSum,
    edit.startIndex + textOffset, parentContainer, false, false,
  );
  if (startLocation === null) {
    return [currentDomElement, currentIndexSum];
  }
  const {
    domElement: startDomElement,
    domOffset: startOffset,
    indexSum: startIndexSum,
  } = startLocation;
  currentDomElement = startDomElement;
  currentIndexSum = startIndexSum;
  const endLocation = getLocationFromOffset(
    currentDomElement, currentIndexSum,
    edit.endIndex + textOffset, parentContainer, false, true,
  );
  if (endLocation === null) {
    return [currentDomElement, currentIndexSum];
  }
  const {
    domElement: endDomElement,
    domOffset: endOffset,
    indexSum: endIndexSum,
  } = endLocation;
  currentDomElement = endDomElement;
  currentIndexSum = endIndexSum;
  const saplingSpan = applyTag(
    parentContainer,
    startDomElement,
    startOffset,
    endDomElement,
    endOffset,
    edit,
    overlappingEditsForOverlay,
  );

  if (saplingSpan) {
    currentDomElement = saplingSpan;
    currentIndexSum = edit.startIndex + textOffset;
  }

  return [currentDomElement, currentIndexSum];
}

function getOverlappingEditsForOverlay(parentContainer, startOffset, endOffset) {
  const start = getLocationFromOffset(
    parentContainer, 0,
    startOffset, parentContainer, false, false,
  );
  if (!start) {
    return [];
  }
  const end = getLocationFromOffset(
    start.domElement,
    start.indexSum, endOffset, parentContainer, false, true,
  );
  if (!end) {
    return [];
  }
  return getOverlappingEditsForOverlayFormat(
    parentContainer,
    start.domElement,
    start.domOffset,
    end.domElement,
    end.domOffset,
  );
}

export function applyEditsToHtml(parentContainer, editMap, textOffset, textLength) {
  const editList = Object.keys(editMap).map(key => editMap[key])
    .sort((x, y) => x.sortId - y.sortId);

  const overlappingEditsForOverlayObj = getOverlappingEditsForOverlay(
    parentContainer, textOffset,
    textOffset + textLength,
  );
  let currentDomElement = parentContainer;
  let indexSum = 0;
  for (let k = 0; k < editList.length; k += 1) {
    const edit = editList[k];
    const location = applyEditToHtml(
      parentContainer, textOffset, currentDomElement,
      indexSum, edit, overlappingEditsForOverlayObj,
    );
    [currentDomElement, indexSum] = location;
  }

  if (overlappingEditsForOverlayObj) {
    clearTagsForOverlayFormat(parentContainer, Object.keys(overlappingEditsForOverlayObj));
  }
  return true;
}
