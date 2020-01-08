import getAndApplyEditsForContainer from '../requests/callback';
import { getHtmlWithLastSentence, applyEditsToHtml } from '../utils/html-editing';
import { getVisibleSections, getSectionsAroundCursor } from '../requests/sections';

// We store a cache of our results with structure:
// {
//   containerId: {
//     hashedInnerHtml: { # hashed innerHTML corresponding to our cached response
//       edits: [] # list of edits, reconstructed with friendly js names
//       requestFunction,
//       requestObj,
//       requestTime,
//       priority,
//       hash,
//       requestTime,
//       isLoading,
//       isComplete,
//       textOffsets: (textOffset, textLength),
//       containerId,
//     }
//   }
// }
//
// We use this cache to reapply edits on cache hit but where
// user may not have accepted/rejected an edit.
const saplingIdToLastResponse = {};
const htmlHashToDeactivatedResponse = {};
const MAX_CONCURRENT_REQUESTS = 1;
const MAX_QUERY_TIME = 5000;

export function isInLoadingState() {
  const requests = [];
  Object.keys(saplingIdToLastResponse).forEach((saplingId) => {
    const lastResponse = saplingIdToLastResponse[saplingId];
    Object.keys(lastResponse).forEach((htmlHash) => {
      requests.push(lastResponse[htmlHash]);
    });
  });

  Object.keys(htmlHashToDeactivatedResponse).forEach((htmlHash) => {
    requests.push(htmlHashToDeactivatedResponse[htmlHash]);
  });

  return requests.filter(request => request.isLoading).length > 0;
}

function deactivateHtmlHashRequest(containerId, htmlHash) {
  if (containerId in saplingIdToLastResponse) {
    const lastResponse = saplingIdToLastResponse[containerId];
    if (htmlHash in lastResponse) {
      // TODO: deactivate running requests
      if (lastResponse[htmlHash].isLoading) {
        htmlHashToDeactivatedResponse[htmlHash] = lastResponse[htmlHash];
      }
      delete lastResponse[htmlHash];
    }
  }
}

export function requestQueuedCalls(containerId = null) {
  const requests = [];
  Object.keys(saplingIdToLastResponse).forEach((saplingId) => {
    const lastResponse = saplingIdToLastResponse[saplingId];
    Object.keys(lastResponse).forEach((htmlHash) => {
      requests.push(lastResponse[htmlHash]);
    });
  });

  const date = new Date();
  const time = date.getTime();
  const queuedRequests = requests.filter(request => !request.isComplete);
  const loadingRequests = requests.filter(request => request.isLoading &&
    time - request.requestTime < MAX_QUERY_TIME);
  queuedRequests.sort((a, b) => {
    if (containerId) {
      if (a.containerId !== b.containerId) {
        if (a.containerId === containerId) {
          return -1;
        }
        if (a.containerId === containerId) {
          return 1;
        }
      }
    }
    return a.priority - b.priority;
  });
  const deactivatedRequests = [];
  Object.keys(htmlHashToDeactivatedResponse).forEach((htmlHash) => {
    deactivatedRequests.push(htmlHashToDeactivatedResponse[htmlHash]);
  });
  const loadingDeactivatedRequests = deactivatedRequests.filter(request => request.isLoading &&
    time - request.requestTime < MAX_QUERY_TIME);

  const loadCount = loadingRequests.length + loadingDeactivatedRequests.length;
  if (loadCount < MAX_CONCURRENT_REQUESTS) {
    const maxNewRequests = Math.min(
      queuedRequests.length,
      MAX_CONCURRENT_REQUESTS - loadCount,
    );
    for (let k = 0; k < maxNewRequests; k += 1) {
      const request = queuedRequests[k];
      request.requestTime = (new Date()).getTime();
      request.isLoading = true;
      if (request.htmlHash in htmlHashToDeactivatedResponse) {
        request.requestObj = htmlHashToDeactivatedResponse[request.htmlHash].requestObj;
        delete htmlHashToDeactivatedResponse[request.htmlHash];
      } else {
        request.requestObj = request.requestFunction();
        request.requestTime = time;
      }
    }
  }
}

export function updateCache(parentContainer, useVisibleText, lang) {
  const strippedInnerHtml = getHtmlWithLastSentence(parentContainer);
  const containerId = $(parentContainer).attr('sapling-id');
  let sections;
  if (useVisibleText) {
    sections = getVisibleSections(strippedInnerHtml, parentContainer);
  } else {
    sections = getSectionsAroundCursor(strippedInnerHtml, parentContainer);
  }

  saplingIdToLastResponse[containerId] = saplingIdToLastResponse[containerId] || [];
  const lastResponse = saplingIdToLastResponse[containerId];
  const hashHtmlDictionary = {};
  sections.forEach((section) => {
    const innerText = $(`<span>${section.html}</span>`).text();
    const strippedText = innerText.replace(/(\r\n\t|\n|\r\t)/gm, '').trim();
    if (strippedText.length === 0) {
      return; // move to next section
    }

    hashHtmlDictionary[section.htmlHash] = hashHtmlDictionary[section.htmlHash] || [];
    hashHtmlDictionary[section.htmlHash].push([section.textOffset, section.textLength]);
    if (section.htmlHash in lastResponse) {
      const response = lastResponse[section.htmlHash];
      response.priority = section.priority;
      if ('edits' in response) {
        applyEditsToHtml(parentContainer, response.edits, section.textOffset, section.textLength);
      } else {
        // requeue cause it failed
        response.isComplete = false;
      }
    } else {
      const requestFunction = () => getAndApplyEditsForContainer(
        section.html,
        section.htmlHash,
        parentContainer,
        containerId,
        lang,
      );
      lastResponse[section.htmlHash] = {
        requestFunction,
        containerId,
        priority: section.priority,
        hash: section.htmlHash,
        requestTime: null,
      };
    }
  });

  Object.keys(lastResponse).forEach((htmlHash) => {
    if (!(htmlHash in hashHtmlDictionary)) {
      deactivateHtmlHashRequest(containerId, htmlHash);
    } else {
      lastResponse[htmlHash].textOffsets = hashHtmlDictionary[htmlHash];
    }
  });
}

export function getCachedEdit(containerId, saplingEditId) {
  if (containerId in saplingIdToLastResponse) {
    const lastResponse = saplingIdToLastResponse[containerId];
    const htmlHashes = Object.keys(lastResponse);
    for (let idx = 0; idx < htmlHashes.length; idx += 1) {
      const htmlHash = htmlHashes[idx];
      if (saplingEditId in lastResponse[htmlHash].edits) {
        return lastResponse[htmlHash].edits[saplingEditId];
      }
    }
  }
  return null;
}

export function removeCachedEdit(containerId, saplingEditId) {
  if (containerId in saplingIdToLastResponse) {
    const lastResponse = saplingIdToLastResponse[containerId];
    const htmlHashes = Object.keys(lastResponse);
    for (let idx = 0; idx < htmlHashes.length; idx += 1) {
      const htmlHash = htmlHashes[idx];
      if (saplingEditId in lastResponse[htmlHash].edits) {
        delete lastResponse[htmlHash].edits[saplingEditId];
      }
    }
  }
}

export function setLoadingState(containerId, htmlHash) {
  if (containerId in saplingIdToLastResponse) {
    if (htmlHash in saplingIdToLastResponse[containerId]) {
      saplingIdToLastResponse[containerId][htmlHash].isLoading = false;
      saplingIdToLastResponse[containerId][htmlHash].isComplete = true;
    }
  }
  if (htmlHash in htmlHashToDeactivatedResponse) {
    delete htmlHashToDeactivatedResponse[htmlHash];
  }
}

export function cacheEditsResponse(parentContainer, containerId, hashedInnerHtml, edits) {
  const editsMap = {};
  let sortId = 0;

  for (let j = 0; j < edits.length; j += 1) {
    const edit = edits[j];
    const editId = edit.id;
    editsMap[editId] = {
      sortId,
      editId,
      startIndex: edit.start.offset,
      endIndex: edit.end.offset,
      startText: edit.start.text,
      endText: edit.end.text,
      originalText: edit.original_text,
      replacementText: edit.replacement_text,
      replacementContext: edit.replacement_context,
      premium: edit.premium,
      requireLogin: edit.require_login,
    };
    sortId += 1;
  }

  if (saplingIdToLastResponse[containerId] &&
    (hashedInnerHtml in saplingIdToLastResponse[containerId])) {
    const lastResponse = saplingIdToLastResponse[containerId][hashedInnerHtml];
    lastResponse.edits = editsMap;
    const { textOffsets } = lastResponse;
    for (let k = 0; k < textOffsets.length; k += 1) {
      const [textOffset, textLength] = textOffsets[k];
      applyEditsToHtml(parentContainer, editsMap, textOffset, textLength);
    }
  }
}

export function clearCacheForContainer(containerId) {
  if (containerId in saplingIdToLastResponse) {
    // TODO: clear all pending or running requests.
    delete saplingIdToLastResponse[containerId];
  }
}
