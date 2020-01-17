const API = 'https://vkmt-server.now.sh';

const socket = io(API);

const storageSet = data => new Promise(resolve =>  { chrome.storage.sync.set(data, resolve); });
const storageGet = () => new Promise(resolve =>  { chrome.storage.sync.get(null, resolve); });

const setBadgeBackground = color => chrome.browserAction.setBadgeBackgroundColor({ color });
const setBadge = text => chrome.browserAction.setBadgeText({ text });

const sendNotification = message => {
  chrome.notifications.create(null, {
    iconUrl: './assets/img/128x128.png',
    message,
    title: 'VK Music to Telegram',
    type: 'basic'
  });
};

const createTrackEl = ({ completed, progress, err, trackId, fileName }) => {
  const div = document.createElement('div');

  div.setAttribute('data-id', trackId);
  div.classList.add('track');

  const error = document.createElement('div');
  const loading = document.createElement('div');
  const success = document.createElement('div');
  const title = document.createElement('div');

  error.classList.add(...(`error ${completed && err ? '' : 'hidden'}`.split(' ').filter(i => !!i.trim())));
  loading.classList.add(...(`loading ${completed ? 'hidden' : ''}`.split(' ').filter(i => !!i.trim())));
  success.classList.add(...(`success ${!completed || err ? 'hidden' : ''}`.split(' ').filter(i => !!i.trim())));
  title.classList.add('title');

  error.innerText = `Ошибка!`;
  loading.innerText = `${progress}%`;
  success.innerText = `Отправлено!`;
  title.innerText = fileName;

  div.appendChild(title);
  div.appendChild(success);
  div.appendChild(error);
  div.appendChild(loading);

  return div;
};

const refreshBadge = async () => {
  const { user, downloads } = await storageGet();

  if (!user) {
    await setBadgeBackground('#D23C26');
    await setBadge('!');
  } else {
    const downloadsInProgress = (downloads || []).filter(d => !d.completed).length;

    await setBadgeBackground('#6056d2');
    await setBadge(downloadsInProgress ? downloadsInProgress.toString() : '');
  }
};

const refreshPopupData = async (options = {}) => {
  const [popup] = chrome.extension.getViews({ type: "popup" });

  if (popup) {
    const { user, downloads } = await storageGet();
    const statusEl = popup.document.getElementById('status');
    const statusTextEl = popup.document.getElementById('status__text');

    if (socket.connected) {
      statusEl.classList.remove('offline');
      statusEl.classList.add('online');
      statusTextEl.innerText = 'online';
    } else {
      statusEl.classList.remove('online');
      statusEl.classList.add('offline');
      statusTextEl.innerText = 'offline';
    }

    const authorizedOnly = popup.document.querySelectorAll('.authorized_only');
    const unauthorizedOnly = popup.document.querySelectorAll('.unauthorized_only');
    const header = popup.document.querySelector('header');

    if (!user || !user.chatId) {
      header.classList.add('unauthorized');

      authorizedOnly.forEach(el => {
        el.classList.add('hidden');
      });

      unauthorizedOnly.forEach(el => {
        el.classList.remove('hidden');
      });
    } else {
      authorizedOnly.forEach(el => {
        el.classList.remove('hidden');
      });

      unauthorizedOnly.forEach(el => {
        el.classList.add('hidden');
      });

      header.classList.remove('unauthorized');

      const countEl = popup.document.getElementById('tracks_sent');
      const fullNameEl = popup.document.getElementById('fullName');
      const photoEl = popup.document.getElementById('photo');
      const tracksEmptyEl = popup.document.getElementById('tracks_empty');
      const tracksListEl = popup.document.getElementById('tracks_list');
      const usernameEl = popup.document.getElementById('username');

      if (user.photoUrl && photoEl.getAttribute('style') !== `background-image: url('${user.photoUrl}')`) {
        photoEl.setAttribute('style', `background-image: url('${user.photoUrl}')`);
      }

      if (user.username) {
        usernameEl.innerText = user.username;
      }

      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

      if (fullName) {
        fullNameEl.innerText = fullName;
      }

      if (user.count) {
        countEl.innerText = user.count;
      }

      if ((downloads || []).length === 0) {
        tracksListEl.classList.add('hidden');
        tracksEmptyEl.classList.remove('hidden');
        tracksListEl.innerHTML = '';
      } else {
        tracksEmptyEl.classList.add('hidden');
        tracksListEl.classList.remove('hidden');
      }

      (downloads || [])
        .sort((a, b) => a.started - b.started)
        .forEach(download => {
          const existing = tracksListEl.querySelector(`[data-id="${download.trackId}"]`);

          if (existing) {
            const loader = existing.querySelector('.loading');
            const success = existing.querySelector('.success');
            const err = existing.querySelector('.error');

            if (download.completed) {
              loader.classList.add('hidden');

              if (download.err) {
                err.classList.remove('hidden');
                success.classList.add('hidden');
              } else {
                err.classList.add('hidden');
                success.classList.remove('hidden');
              }
            } else {
              loader.classList.remove('hidden');
              loader.innerText = `${download.progress}%`;
              err.classList.add('hidden');
              success.classList.add('hidden');
            }
          } else {
            tracksListEl.appendChild(createTrackEl(download))
          }
      });
    }


    if (options && options.isOpenByClick) {
      const loader = popup.document.querySelector('#loader');

      setTimeout(() => {
        loader.classList.add('hidden');
      }, 500);
    }
  }
};

const login = () => {
  chrome.tabs.create({ url: `${API}` });
};

const logout = async () => {
  await storageSet({ user: null, downloads: [] });
  await setBadge('!');
};

const checkUser = async () => {
  const { user } = await storageGet();

  if (user) {
    await setBadgeBackground('#6056d2');
    socket.emit('get_user', user);
  } else {
    await setBadgeBackground('#D23C26');
    await setBadge('!');
    sendNotification(`Необходимо настроить расширение. Нажмите, пожалуйста на иконку VK Music to Telegram`);
  }
};

socket.on('connect', async () => {
  await refreshPopupData();
  await refreshBadge();
});
socket.on('reconnecting', async () => {
  await refreshPopupData();
  await refreshBadge();
});
socket.on('disconnect', async () => {
  await refreshPopupData();
  await refreshBadge();
});

socket.on('auth_completed', async user => {
  chrome.tabs.query({}, async tabs => {
    await storageSet({ user });
    await setBadge('');

    const vkTabs = tabs.filter(t => t.url && t.url.includes('vk.com'));

    vkTabs.forEach(t => chrome.tabs.reload(t.id));

    sendNotification('Установка завершена!');
  });
});

socket.on('auth_error', async () => {
  sendNotification('Настройка не удалась :с');
});

socket.on('update_user', async user => {
  await storageSet({ user });
});

chrome.runtime.onInstalled.addListener(options => {
  if (options.reason === 'install') {
    chrome.tabs.create({ url: 'https://vkmt-server.now.sh' });
  }

  checkUser();
});

chrome.runtime.onStartup.addListener(checkUser);

chrome.runtime.onMessage.addListener(async request => {
  if (request.type === 'refresh_popup') {
    await refreshPopupData({ isOpenByClick: true });
  }

  if (request.type === 'logout') {
    await logout();
  }

  if (request.type === 'login') {
    login();
  }

  if (request.type === 'clear_downloads') {
    await storageSet({ downloads: [] })
  }

  if (request.type === 'start_download') {
    const { downloads } = await storageGet();
    const existing = (downloads || []).find(d => d.trackId === request.trackId);

    sendNotification(`Загрузка ${request.fileName} началась`);

    await storageSet({
      downloads: existing
        ? (downloads || []).map(d => d.trackId === request.trackId
          ? ({ ...d, completed: false, err: '', started: new Date().toISOString(), progress: 0 })
          : d)
        : [...(downloads || []), { ...request, started: new Date().toISOString(), progress: 0 }]
    });
  }

  if (request.type === 'save_pin') {
    socket.emit('auth', { chatId: request.pin });
  }

  if (request.type === 'download_progress') {
    const { downloads } = await storageGet();

    await storageSet({
      downloads: (downloads || []).map(d => d.trackId === request.trackId
        ? ({ ...d, progress: request.progress })
        : d
      )
    });
  }

  if (request.type === 'stop_download') {
    const { downloads, user } = await storageGet();

    if (request.err) {
      sendNotification(`Ошибка отправки ${request.fileName}`);
    } else {
      sendNotification(`${request.fileName} отправлен`);
    }

    socket.emit('get_user', user);

    await storageSet({
      downloads: (downloads || []).map(d => d.trackId === request.trackId
        ? ({ ...d, completed: true, err: request.err })
        : d)
    });
  }

  if (request.type === 'auth') {
    socket.emit('auth', { ...request.user, chatId: request.user.id.toString() });
  }
});

chrome.storage.onChanged.addListener(async () => {
  await refreshPopupData();
  await refreshBadge();
});
