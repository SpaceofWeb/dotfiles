import regexCreator from 'emoji-regex';


const EMOJI_REGEX = regexCreator();


function replacer(match) {
  // p1 is nondigits, p2 digits, and p3 non-alphanumerics
  return ' '.repeat(match.length);
}


export function cleanse(str) {
  // character code 160 is "non-breaking space" looks like whitespace
  const newStr = str.replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, ' ')
    .replace(/\u00A9/g, ' ')
    .replace(/\u00AE/g, ' ')
    .replace(/&nbsp;/g, ' ');
  return newStr.replace(EMOJI_REGEX, replacer);
}

export function isScrollable(element) {
  return $(element).css('overflow-y') === 'scroll' || $(element).css('overflow-y') === 'auto' ||
    $(element).css('overflow-x') === 'scroll' || $(element).css('overflow-x') === 'auto';
}

// Finds first scrollable parent
export function getScrollableParent(editable) {
  if (isScrollable(editable)) {
    return editable;
  }

  const parents = $(editable).parentsUntil('body');
  for (let k = 0; k < parents.length; k += 1) {
    const parent = parents[k];
    if (isScrollable(parent)) {
      return parent;
    }
  }
  return null;
}

// Finds region of edit elem that is visible within scrolling window
export function getVisibleEditElem(el) {
  let visibleArea = el;
  const parents = $(el).parentsUntil('body');
  let minHeight = el.clientHeight;
  let minWidth = el.clientWidth;

  for (let k = 0; k < parents.length; k += 1) {
    const parent = parents[k];
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width === 0 || height === 0) {
      continue;
    }
    if (height < minHeight || width < minWidth) {
      minHeight = height;
      minWidth = width;
      visibleArea = parent;
    }
    const positionType = window.getComputedStyle(parent).position;
    if (positionType === 'absolute') {
      break;
    }
  }
  return visibleArea;
}

// Given element e, compute min(dim(e), dim(parent(e)), dim(parent(parent(e)))), etc.
export function getContainingDims(el) {
  return {
    height: el.clientHeight,
    width: el.clientWidth,
  };
}

export function getHtmlIdFromContainerId(containerId) {
  return $(`[sapling-id=${containerId}]`).attr('id');
}

export function getBounds(parentContainer) {
  const visibleEditElem = getVisibleEditElem(parentContainer);
  const dims = getContainingDims(visibleEditElem);
  const offset = $(visibleEditElem).offset();
  return {
    top: offset.top,
    bottom: offset.top + dims.height,
    left: offset.left,
    right: offset.left + dims.width,
  };
}

export function nextDomElement(domElement, parentContainer, includeChild = true) {
  // parentContainer = null means we don't consider bounds
  const retDomElement = domElement;
  if (retDomElement.firstChild && includeChild) {
    return retDomElement.firstChild;
  } else if (retDomElement.nextSibling) {
    return retDomElement.nextSibling;
  }

  // go back up to parent level and inspect sibling
  let tempParent = retDomElement.parentNode;
  while (parentContainer === null || tempParent !== parentContainer) {
    if (tempParent.nextSibling) {
      return tempParent.nextSibling;
    }
    tempParent = tempParent.parentNode;
  }

  return null;
}

function excludeElementChild(domElement) {
  if (domElement.tagName) {
    return ['script', 'style', 'xml'].includes(domElement.tagName.toLowerCase());
  }

  return false;
}

export function getLocationFromOffset(
  startNode, startIndexSum, textOffset,
  endNode, includeBreaks = false, prioritizeLast = true,
) {
  // startNode = where we start crawling
  // startIndexSum = sum of length of text before startNode
  // offset we are searching for, from beginning of container
  // endNode = node at which we terminate searching
  // prioritizeLast = we prefer prioritizing the last dom element over the first if index on edge
  if (startIndexSum > textOffset) {
    return null;
  }
  let domElement = startNode;
  let indexSum = startIndexSum;
  while (domElement !== null) {
    if (includeBreaks && $(domElement).is('br')) {
      if (textOffset === indexSum) {
        return {
          domElement,
          indexSum,
          domOffset: indexSum,
        };
      }
    } else if (domElement.nodeType === Node.TEXT_NODE) {
      const domLength = domElement.data.length;
      const domOffset = textOffset - indexSum;
      if (domOffset < domLength || (prioritizeLast && domOffset === domLength)) {
        return {
          domElement,
          domOffset,
          indexSum,
        };
      }
      indexSum += domLength;
    }

    domElement = nextDomElement(domElement, endNode, !excludeElementChild(domElement));
  }

  return null;
}

function getFirstParentNotStatic(domElement) {
  let parentElementTemp = domElement.parentElement;
  while (parentElementTemp !== null) {
    if (getComputedStyle(parentElementTemp).position !== 'static') {
      return parentElementTemp;
    }
    parentElementTemp = parentElementTemp.parentElement;
  }

  return null;
}

export function getCSSOverlayForElement(domElement) {
  const { position } = getComputedStyle(domElement);
  const frameDimensions = {
    position,
    left: getComputedStyle(domElement).left,
    top: getComputedStyle(domElement).top,
    height: getComputedStyle(domElement).height,
    width: getComputedStyle(domElement).width,
  };
  if (position === 'static' || position === 'relative') {
    frameDimensions.position = 'absolute';
    const elementRect = domElement.getBoundingClientRect();
    frameDimensions.left = elementRect.left;
    frameDimensions.top = elementRect.top;

    const nonstaticParent = getFirstParentNotStatic(domElement);
    if (nonstaticParent) {
      const nonstaticParentRect = nonstaticParent.getBoundingClientRect();
      frameDimensions.left -= (nonstaticParentRect.left - (nonstaticParent.scrollLeft || 0));
      frameDimensions.top -= (nonstaticParentRect.top - (nonstaticParent.scrollTop || 0));
    } else {
      // need to handle whole page scroll
      const { pageXOffset, pageYOffset } = window;
      if (pageXOffset !== undefined) {
        frameDimensions.top += pageYOffset;
      }
      if (pageYOffset !== undefined) {
        frameDimensions.top += pageXOffset;
      }
    }
  }

  return frameDimensions;
}
