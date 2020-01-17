import { getLocationFromOffset } from '../utils/html-utils';
import getCursorTextOffset from '../utils/cursor-placement';

const maxSectionLength = 4000;
const maxNumSections = 8;
const sectionRegexes = [
  new RegExp(`[\\s\\S]{0,${maxSectionLength}}</div>`, 'imy'),
  new RegExp(`[\\s\\S]{0,${maxSectionLength}}</p>`, 'imy'),
  new RegExp(`[\\s\\S]{0,${maxSectionLength}}<br ?/?>`, 'imy'),
  new RegExp(`[\\s\\S]{0,${maxSectionLength}}(\\.|\\?|!)(?=[^>]*(<|$))`, 'imy'),
];
// TODO: Make matching logic cleaner
// const sectionRegex = new RegExp(
// `[\\s\\S]{0,${maxSectionLength}}(</div>|</p>|<br[^>]*>|\\?|\\.)`, 'imy'
// );

function findEndOfSection(html, htmlOffset) {
  if ((html.length - htmlOffset) <= maxSectionLength) {
    return html.length;
  }
  // Try to split at paragraphs, then sentences, then spaces, then anywhere.
  for (let i = 0; i < sectionRegexes.length; i += 1) {
    const regex = sectionRegexes[i];
    regex.lastIndex = htmlOffset;
    const match = html.match(sectionRegexes[i]);
    if (match) {
      return htmlOffset + match[0].length;
    }
  }
  return htmlOffset + maxSectionLength;
}

function hashString(str) {
  let hash = 0;
  let i = null;
  let chr = null;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i += 1) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr; // eslint-disable-line no-bitwise
    hash |= 0; // eslint-disable-line no-bitwise
  }
  return hash;
}

function createSections(fullHtml) {
  const sections = [];
  let htmlOffset = 0;
  let textOffset = 0; // excludes html tags
  while (htmlOffset < fullHtml.length) {
    const endIndex = findEndOfSection(fullHtml, htmlOffset);
    const sectionHtml = fullHtml.substring(htmlOffset, endIndex);
    const textLength = $(`<span>${sectionHtml}</span>`).text().length;
    sections.push({
      html: sectionHtml,
      htmlLength: sectionHtml.length,
      htmlOffset,
      htmlHash: hashString(sectionHtml),
      textOffset,
      textLength,
    });
    htmlOffset = endIndex;
    textOffset += textLength;
  }

  return sections;
}

function getSectionTopOffset(parentContainer, section) {
  const start = getLocationFromOffset(
    parentContainer, 0, section.textOffset,
    parentContainer, false, false,
  );
  const range = document.createRange();
  range.selectNodeContents(start.domElement);
  return range.getBoundingClientRect().top;
}

function sortAndPrioritizeVisibleSections(sections, parentContainer) {
  // Use middle of browser window as heuristic for what is visible
  const visibleMiddle = window.innerHeight / 2;

  // Sort regions by proximity to visible heuristic
  sections.sort((a, b) => {
    const aTop = getSectionTopOffset(parentContainer, a);
    const bTop = getSectionTopOffset(parentContainer, b);
    return Math.abs(aTop - visibleMiddle) - Math.abs(bTop - visibleMiddle);
  });

  // Find edits for portion of document near cursor
  for (let k = 0; k < sections.length; k += 1) {
    const section = sections[k];
    if (k < maxNumSections) {
      section.priority = k;
    } else {
      section.priority = 100;
    }
  }
  return sections;
}

function sortAndPrioritizeSectionsAroundCursor(sections, cursorPos) {
  // Sort sections by proximity to cursor
  sections.sort((a, b) => Math.abs(a.textOffset - cursorPos) - Math.abs(b.textOffset - cursorPos));
  // Only find edits for portion of document near cursor
  for (let k = 0; k < sections.length; k += 1) {
    const section = sections[k];
    if (k < maxNumSections) {
      section.priority = k;
    } else {
      section.priority = 100;
    }
  }
  return sections;
}

export function getSectionsAroundCursor(strippedInnerHtml, parentContainer) {
  const cursorPos = getCursorTextOffset(parentContainer) || 0;
  const sections = createSections(strippedInnerHtml);
  if (sections.length === 0) {
    return [];
  }
  return sortAndPrioritizeSectionsAroundCursor(sections, cursorPos);
}

export function getVisibleSections(strippedInnerHtml, parentContainer) {
  const sections = createSections(strippedInnerHtml);
  if (sections.length === 0) {
    return [];
  }
  return sortAndPrioritizeVisibleSections(sections, parentContainer);
}

