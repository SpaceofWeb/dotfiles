const restoreOptions = () => {
  chrome.runtime.sendMessage({ type: 'refresh_popup' });
};

const resetOptions = () => {
  chrome.runtime.sendMessage({ type: 'logout' });
};

const config = () => {
  chrome.runtime.sendMessage({ type: 'login' });
};

const clearDownloads = () => {
  chrome.runtime.sendMessage({ type: 'clear_downloads' });
};

const savePin = () => {
  const pin = document.getElementById('pin').value;

  chrome.runtime.sendMessage({ type: 'save_pin', pin });
};

restoreOptions();

document.getElementById('config').addEventListener('click', config);
document.getElementById('clear_downloads').addEventListener('click', clearDownloads);
document.getElementById('reset').addEventListener('click', resetOptions);
document.getElementById('save_pin').addEventListener('click', savePin);
