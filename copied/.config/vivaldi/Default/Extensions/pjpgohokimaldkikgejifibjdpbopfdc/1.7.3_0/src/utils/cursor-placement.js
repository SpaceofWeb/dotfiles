function getTextOffset(node, offset, dummyRange) {
  if (!dummyRange.isPointInRange(node, offset)) {
    return null;
  }

  const cloneRange = dummyRange.cloneRange();
  cloneRange.setEnd(node, offset);
  return cloneRange.toString().length;
}

export default function getCursorTextOffset(parentContainer) {
  const dummyRange = document.createRange();
  dummyRange.selectNodeContents(parentContainer);

  const sel = window.getSelection();
  let anchorCursorOffset = null;
  let focusCursorOffset = null;
  if (sel.anchorNode) {
    anchorCursorOffset = getTextOffset(sel.anchorNode, sel.anchorOffset, dummyRange);
  }
  if (sel.focusNode) {
    focusCursorOffset = getTextOffset(sel.focusNode, sel.focusOffset, dummyRange);
  }

  if (anchorCursorOffset && focusCursorOffset) {
    return Math.min(anchorCursorOffset, focusCursorOffset);
  }

  return anchorCursorOffset || focusCursorOffset;
}
