const port = chrome.runtime.connect();

const contentBlock = document.getElementById('sapling-embedded-editable');

function statusCallback() {
  const block = document.getElementById('sapling-status-message');
  const status = block.getAttribute('status');
  if (status === 'loading') {
    block.innerHTML = 'One second. Sapling is <b>loading...</b>';
  } else if (status === 'server_success') {
    const numErrors = document.getElementsByClassName('sapling-edit').length;
    if (numErrors === 0) {
      block.innerHTML = 'No errors detected.';
    } else if (numErrors === 1) {
      block.innerHTML = 'Sapling found <b>1 error</b>.';
    } else {
      block.innerHTML = `Sapling found <b>${numErrors} errors</b>.`;
    }
  } else if (status === 'server_error') {
    block.innerHTML = 'Error contacting server. Please try again.';
  } else {
    block.innerHTML = '';
  }
}

const block = document.getElementById('sapling-status-message');
const mutationCfg = {
  attributes: true,
  childList: false,
  characterData: false,
  subtree: false,
  characterDataOldValue: false,
};
const statusObserver = new MutationObserver(statusCallback);
statusObserver.observe(block, mutationCfg);

function onContentMutationForMutationObserver() {
  port.postMessage(contentBlock.innerHTML);
}

const contentMutationCfg = {
  attributes: true,
  childList: true,
  characterData: true,
  subtree: true,
  characterDataOldValue: false,
};
const contentCallback = onContentMutationForMutationObserver;
const contentObserver = new MutationObserver(contentCallback);
contentObserver.observe(contentBlock, contentMutationCfg);
