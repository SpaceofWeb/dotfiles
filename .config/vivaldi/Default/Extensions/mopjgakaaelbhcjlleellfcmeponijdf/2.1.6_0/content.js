const API = 'https://vkmt-server.now.sh';

try {
  const storageGet = () => new Promise(resolve => {
    chrome.storage.sync.get(null, resolve);
  });

  const decode = function (r, n) {
    function t(r) {
      if (!r || r.length % 4 == 1) {
        return !1;
      }
      for (var n, t, i = 0, o = 0, f = ''; (t = r.charAt(o++));)
        ~(t = e.indexOf(t)) &&
        ((n = i % 4 ? 64 * n + t : t), i++ % 4) &&
        (f += String.fromCharCode(255 & (n >> ((-2 * i) & 6))));
      return f;
    }

    function i(r, n) {
      var t = r.length,
        i = [];
      if (t) {
        var e = t;
        for (n = Math.abs(n); e--;) (n = ((t * (e + 1)) ^ (n + e)) % t), (i[e] = n);
      }
      return i;
    }

    var e = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0PQRSTUVWXYZO123456789+/=',
      o = {
        v: function (r) {
          return r
            .split('')
            .reverse()
            .join('');
        },
        r: function (r, n) {
          r = r.split('');
          for (var t, i = e + e, o = r.length; o--;) ~(t = i.indexOf(r[o])) && (r[o] = i.substr(t - n, 1));
          return r.join('');
        },
        s: function (r, n) {
          var t = r.length;
          if (t) {
            var e = i(r, n),
              o = 0;
            for (r = r.split(''); ++o < t;) r[o] = r.splice(e[t - 1 - o], 1, r[o])[0];
            r = r.join('');
          }
          return r;
        },
        i: function (r, t) {
          return o.s(r, t ^ n);
        },
        x: function (r, n) {
          var t = [];
          return (
            (n = n.charCodeAt(0)),
              each(r.split(''), function (r, i) {
                t.push(String.fromCharCode(i.charCodeAt(0) ^ n));
              }),
              t.join('')
          );
        },
      };

    return (function (r) {
      if (r && ~r.indexOf('audio_api_unavailable')) {
        var n = r.split('?extra=')[1].split('#'),
          i = '' === n[1] ? '' : t(n[1]);
        if (((n = t(n[0])), 'string' != typeof i || !n)) {
          return r;
        }
        for (var e, f, u = (i = i ? i.split(String.fromCharCode(9)) : []).length; u--;) {
          if (((f = i[u].split(String.fromCharCode(11))), (e = f.splice(0, 1, n)[0]), !o[e])) {
            return r;
          }
          n = o[e].apply(null, f);
        }
        if (n && 'http' === n.substr(0, 4)) {
          return n;
        }
      }
      return r;
    })(r);
  };

  const setCookie = (name, value, props) => {
    props = props || {};

    let exp = props.expires;

    if (typeof exp == 'number' && exp) {
      const d = new Date();

      d.setTime(d.getTime() + exp * 1000);

      exp = props.expires = d;
    }

    if (exp && exp.toUTCString) {
      props.expires = exp.toUTCString();
    }

    value = encodeURIComponent(value);

    let updatedCookie = name + '=' + value;

    for (let propName in props) {
      updatedCookie += '; ' + propName;

      const propValue = props[propName];

      if (propValue !== true) {
        updatedCookie += '=' + propValue;
      }
    }

    document.cookie = updatedCookie;
  };

  const getBuffer = ({ url, onProgress }) => new Promise((resolve, reject) => {
    bufferM3u({
      m3uUrl: url,
      onBuffer: resolve,
      onError: reject,
      onProgress,
    });
  });

  const sendTrackToBot = async ({ trackId, url, title, blob }) => {
    const ism3u = /^http.*\/index\.m3u8\?/.test(url);

    if (ism3u) {
      const splitted = url.split('/');
      let mp3Url;

      if (splitted.length === 7 && !splitted.includes('audios')) {
        mp3Url = `https://${ splitted[2] }/${ splitted[3] }/${ splitted[5] }${ splitted[6].replace(
          'index.m3u8',
          '.mp3',
        ) }`;
      }

      if (blob) {
        await sendBlobAudio({
          blob,
          onProgress: percent => {
            chrome.runtime.sendMessage({ type: 'download_progress', trackId, progress: Math.ceil(percent / 2 + 50) });
          },
          title,
        });
      } else {
        try {
          if (mp3Url) {
            await sendAudio({ audio: mp3Url, title });
          } else {
            throw new Error('can\'t hack url', url);
          }

        } catch (err) {
          console.log('can\'t hack url', url, mp3Url);

          const blob = await getBuffer({
            url,
            onProgress: percent => {
              if (percent) {
                chrome.runtime.sendMessage({ type: 'download_progress', trackId, progress:Math.ceil(percent / 2) });
              }
            },
          });

          await sendTrackToBot({
            blob,
            url,
            title,
          });
        }
      }
    } else {
      await sendAudio({ audio: url, title });
    }
  };

  const bufferM3u = ({ m3uUrl, onStart, onProgress, onBuffer, onError }) => {
    let loadData;

    if (loadData === undefined) {
      loadData = {
        fragsDataArray: [],
        startPosition: -1,
        lastError: {},
      };
    }

    let fragData = null;
    let fragsDataArray = loadData.fragsDataArray;
    let fragsCount = 0;
    let remove8BytesHeader = false;
    let mediaErrorCount = 0;
    let lastError = loadData.lastError;

    if (Hls.isSupported()) {
      let audio = document.createElement('audio');
      let hls = new Hls({ enableWorker: false, defaultAudioCodec: 'mp3', startPosition: loadData.startPosition });

      let idleTimeout = null;

      let clear = function () {
        hls.stopLoad();
        hls.destroy();
        fragData = null;
        fragsDataArray = null;
        idleTimeout && clearTimeout(idleTimeout);
        idleTimeout = null;
      };

      hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
        fragsCount = data.levels[0].details.fragments.length;

        let path = data.levels[0].details.url.match(/^http.*\//);
        let size = 0;

        if (path) {
          path = path[0];
          for (let i = 0; i < fragsCount; i++) {
            if (!/^http/.test(data.levels[0].details.fragments[i].relurl)) {
              data.levels[0].details.fragments[i].relurl = path + data.levels[0].details.fragments[i].relurl;
            }

            size += data.levels[0].details.fragments[i].loaded;
          }
        }

        onStart && onStart();
      });
      hls.on(Hls.Events.BUFFER_CODECS, function (event, data) {
        // not sure why: not all audio players can play mp4 audio correct, but without first 8 header bytes all is ok
        remove8BytesHeader = data.audio && data.audio.container == 'audio/mp4';
      });
      hls.on(Hls.Events.BUFFER_APPENDING, function (event, data) {
        fragData = data.data;
      });
      hls.on(Hls.Events.FRAG_BUFFERED, function (event, data) {
        if (fragData) {
          fragsDataArray.push(remove8BytesHeader ? fragData.slice(8, fragData.length) : fragData);
        }

        audio.currentTime = data.frag.start + data.frag.duration;

        let fragsSaved = fragsDataArray.length;
        onProgress && onProgress(Math.round((fragsSaved / fragsCount) * 100));

        // sometimes hls stops load music without any errors
        idleTimeout && clearTimeout(idleTimeout);
        idleTimeout = setTimeout(function () {
          hlsOnError(null, lastError);
        }, 7000);

        if (fragsSaved >= fragsCount) {
          // full buffered

          let total_length = fragsDataArray.reduce(function (prev, cur) {
            return prev + cur.length;
          }, 0);
          let totalData = new Uint8Array(total_length);
          let offset = 0;

          fragsDataArray.forEach(function (element) {
            totalData.set(element, offset);
            offset += element.length;
          });

          clear();

          let blob = new Blob([totalData], { type: 'application/octet-stream' });

          onBuffer && onBuffer(blob);
        }
      });

      function hlsOnError(event, data) {
        lastError = data;

        console.log('hls error', event, data);

        if (data.details == 'bufferFullError' || data.details == 'fragLoadError') {
          let load_data = {
            fragsDataArray: fragsDataArray.map(function (fragArr) {
              return fragArr.slice();
            }),
            startPosition: audio.currentTime,
            lastError,
          };

          clear();
          bufferM3u({ m3uUrl, onStart, onProgress, onBuffer, onError, load_data });

          return;
        }
      }

      hls.on(Hls.Events.ERROR, hlsOnError);

      hls.loadSource(m3uUrl);
      hls.attachMedia(audio);
    } else {
      onError && onError();
    }
  };

  const reloadAudio = async trackId => {
    const { data } = await axios({
      data: `act=reload_audio&al=1&ids=${ trackId }`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      url: 'https://vk.com/al_audio.php',
    });

    return data;
  };

  const sendAudio = async ({ audio, title }) => {
    const { user } = await storageGet();
    const el = document.createElement('div');

    el.innerHTML = title;

    const { data } = await axios({
      url: `${ API }/sendAudio`,
      method: 'POST',
      data: { audio, chatId: user.chatId, title: el.innerText },
    });

    return data;
  };

  const sendBlobAudio = async ({ blob, title, onProgress }) => {
    const { user } = await storageGet();

    const el = document.createElement('div');

    el.innerHTML = title;

    const formattedTitle = el.innerText;
    const formData = new FormData();

    formData.append('audio', blob, formattedTitle);
    formData.append('chatId', user.chatId);
    formData.append('title', formattedTitle);

    const { data } = await axios({
      data: formData,
      method: 'POST',
      url: `${ API }/proxyAudio`,
      onUploadProgress: e => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;

          onProgress(percentComplete);
        }
      },
    });

    return data;
  };

  const createButton = async acts => {
    if (acts.querySelector('.download_button')) {
      return;
    }

    const { user } = await storageGet();

    if (!user.chatId) {
      return;
    }

    const [audioRowDiv] = $(acts).closest('.audio_row');

    if (!audioRowDiv || !audioRowDiv.classList.contains('audio_can_add')) {
      return;
    }

    const info = JSON.parse(audioRowDiv.dataset['audio']);
    const trackHashInfo = info[13];

    const check1 = '/';
    const check2 = '//';
    const check3 = '///';

    let sec;

    if (trackHashInfo.includes(check3)) {
      sec = trackHashInfo.split(check3)[1];

      if (sec.includes(check1)) {
        sec = sec.split(check1)[0];
      }
    } else {
      const split2 = trackHashInfo.split(check2);

      if (split2.length > 2) {
        sec = trackHashInfo.split(check2)[2];
      } else {
        sec = trackHashInfo.split(check2)[1];
      }

      if (sec.includes(check1)) {
        sec = sec.split(check1)[0];
      }
    }

    let fileName = info[3].trim() + ' - ' + info[4].trim();

    fileName = fileName.replace(/^ +/, '');

    const button = document.createElement('div');

    button.classList.add('download_button');
    button.classList.add('audio_row__action');

    acts.insertBefore(button, acts.firstChild);

    const trackId = `${ audioRowDiv.dataset.fullId }_${ trackHashInfo.split('/')[2] }_${ sec }`;
    const a = document.createElement('a');

    a.className = 'download_button__icon';
    a.id = trackId;

    const { downloads } = await storageGet();
    const existing = (downloads || []).find(d => d.trackId === trackId && !d.completed);

    if (!existing) {
      button.appendChild(a);
    }

    a.addEventListener('click', async e => {
      try {
        chrome.runtime.sendMessage({ type: 'start_download', trackId, fileName });

        e.preventDefault();
        e.stopPropagation();

        setCookie('remixcurr_audio', acts.dataset.fullId);

        let reloadedRes;

        try {
          reloadedRes = await reloadAudio(trackId);
        } catch (err) {
          console.error('can\'t reload track', err);
        }

        console.log('reloaded', reloadedRes);

        let unavailableLink;

        if (reloadedRes && typeof reloadedRes === 'string' && reloadedRes.includes('<!json>')) {
          const info = reloadedRes.split('<!json>')[1] || '';
          const json = info.split('<!>')[0];
          const data = JSON.parse(json);

          unavailableLink = data[0][2];
        }

        if (reloadedRes && typeof reloadedRes === 'string' && reloadedRes.includes('<!--')) {
          const info = reloadedRes.split('<!--')[1] || '';
          const data = JSON.parse(info);

          unavailableLink = data.payload[1][0][0][2];
        }

        if (reloadedRes && typeof reloadedRes === 'object' && reloadedRes.payload) {
          const data = reloadedRes.payload[1];

          unavailableLink = data[0][0][2];
        }

        if (!unavailableLink) {
          throw new Error('Can\'t get link');
        }

        const script = document.createElement('script');

        script.text = `
          (function () {
            document.body.setAttribute('userId', window.vk && window.vk.id)
          })();`;

        document.body.appendChild(script);

        const userId = document.body.getAttribute('userId');
        const audioLink = decode(unavailableLink, userId);

        await sendTrackToBot({ trackId, audioRowDiv, url: audioLink, title: fileName });

        chrome.runtime.sendMessage({ type: 'stop_download', trackId, fileName });
      } catch (err) {
        console.error('Can\'t send track');
        console.error(err);
        chrome.runtime.sendMessage({ type: 'stop_download', trackId, err, fileName });
      }

      a.classList.remove('hidden');
    });
  };

  const setObserver = () => {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.classList && node.classList.contains('audio_row__actions')) {
              createButton(node);
            }

            if (node.classList && node.classList.contains('audio_page_player2')) {
              const acts = node.querySelector('.audio_page_player_ctrl');

              createButton(acts);
            }
          });
        }
      });
    });

    observer.observe(document.querySelector('body'), { subtree: true, childList: true });
  };

  setObserver();

  document.addEventListener('auth', e => {
    const user = e.detail;

    chrome.runtime.sendMessage({ type: 'auth', user });
  });
} catch (err) {
  console.error(err);
}
