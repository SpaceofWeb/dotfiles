export function firstRangeIntersect(rangeOne, rangeTwo) {
  // touching does not signifiy intersects
  const {
    startContainer,
    startOffset,
    endContainer,
    endOffset,
  } = rangeTwo;
  return rangeOne.isPointInRange(startContainer, startOffset) ||
    rangeOne.isPointInRange(endContainer, endOffset);
}

export function rangesIntersect(rangeOne, rangeTwo) {
  // touching does not signifiy intersects
  return firstRangeIntersect(rangeOne, rangeTwo) ||
    firstRangeIntersect(rangeTwo, rangeOne);
}

function isValidOffset(node, offset) {
  return offset <= (node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length);
}

export function rangeIsValid(range) {
  const {
    startContainer,
    startOffset,
    endContainer,
    endOffset,
  } = range;
  return !!startContainer && !!endContainer &&
    startContainer.ownerDocument === endContainer.ownerDocument &&
    isValidOffset(startContainer, startOffset) &&
    isValidOffset(endContainer, endOffset);
}
