let AUTH_TOKENS = null;
let IS_FETCHING_TOKEN = false;
let TOKEN_SUCCESS_CALLBACKS = [];
let TOKEN_FAILURE_CALLBACKS = [];
let IS_FETCHING_AUTH_TOKEN = false;
let AUTH_TOKEN_CALLBACKS = [];


export function sendBackendRequest(
  path,
  type,
  requestData = {},
  headers = {},
  onSuccess = null,
  onFailure = null,
) {
  // path: /users
  // type: POST
  const defaultRequest = {
    type,
    headers,
    url: `${SAPLING_HOSTNAME}${path}`, // eslint-disable-line no-undef
    contentType: 'application/json',
  };
  let additionalRequest = {};
  if (Object.keys(requestData).length !== 0 || type !== 'get') {
    additionalRequest = {
      dataType: 'json',
      data: JSON.stringify(requestData),
    };
  }
  const request = Object.assign({}, defaultRequest, additionalRequest);
  $.ajax(request).done((data) => {
    if (!onSuccess) {
      return;
    }
    onSuccess(data);
  })
    .fail((error) => {
      if (!onFailure) {
        return;
      }
      onFailure(error);
    });
}


export function setRefreshToken(authTokens) {
  AUTH_TOKENS = authTokens;
  chrome.storage.local.set({ authTokens });
}


function fetchAccessToken(onSuccess, onFailure) {
  if (AUTH_TOKENS) {
    onSuccess(AUTH_TOKENS.accessToken);
    return;
  }
  chrome.storage.local.get('authTokens', (data) => {
    if (AUTH_TOKENS) {
      onSuccess(AUTH_TOKENS.accessToken);
      return;
    }
    if (chrome.runtime.lastError || Object.keys(data).length === 0) {
      TOKEN_SUCCESS_CALLBACKS.push(onSuccess);
      TOKEN_FAILURE_CALLBACKS.push(onFailure);
      if (!IS_FETCHING_TOKEN) {
        IS_FETCHING_TOKEN = true;
        sendBackendRequest('/auth/login', 'post', {}, {}, (authData) => {
          IS_FETCHING_TOKEN = false;
          const authTokens = {
            refreshToken: authData.refresh_token,
            accessToken: authData.access_token,
          };
          setRefreshToken(authTokens);
          for (let idx = 0; idx < TOKEN_SUCCESS_CALLBACKS.length; idx += 1) {
            const callback = TOKEN_SUCCESS_CALLBACKS[idx];
            callback(authTokens.accessToken);
          }
          TOKEN_SUCCESS_CALLBACKS = [];
        }, (error) => {
          IS_FETCHING_TOKEN = false;
          for (let idx = 0; idx < TOKEN_FAILURE_CALLBACKS.length; idx += 1) {
            const callback = TOKEN_FAILURE_CALLBACKS[idx];
            callback(error);
          }
          TOKEN_FAILURE_CALLBACKS = [];
        });
      }
      return;
    }
    AUTH_TOKENS = data.authTokens;
    onSuccess(AUTH_TOKENS.accessToken);
  });
}


function getRefreshToken() {
  if (AUTH_TOKENS) {
    return AUTH_TOKENS.refreshToken;
  }

  return null;
}


export function clearRefreshToken() {
  chrome.storage.local.remove('authTokens');
  if (AUTH_TOKENS) {
    AUTH_TOKENS = null;
  }
}


export function sendAuthenticatedBackendRequest(
  path,
  type,
  requestData = {},
  onSuccess = null,
  onFailure = null,
  fetchNewRefreshToken = true,
) {
  fetchAccessToken((accessToken) => {
    const headers = {};
    headers.Authorization = `Bearer ${accessToken}`;
    sendBackendRequest(path, type, requestData, headers, onSuccess, (error) => {
      const refreshToken = getRefreshToken();
      if (error.status === 401 && refreshToken && fetchNewRefreshToken) {
        AUTH_TOKEN_CALLBACKS.push(() => {
          sendAuthenticatedBackendRequest(path, type, requestData, onSuccess, onFailure, false);
        });
        if (!IS_FETCHING_AUTH_TOKEN) {
          // try to get a new access token, then retry same request.
          const refreshHeaders = {
            Authorization: `Bearer ${refreshToken}`,
          };
          IS_FETCHING_AUTH_TOKEN = true;
          sendBackendRequest('/auth/refresh', 'post', {}, refreshHeaders, (data) => {
            AUTH_TOKENS.accessToken = data.access_token;
            chrome.storage.local.set({ authTokens: AUTH_TOKENS });
            for (let idx = 0; idx < AUTH_TOKEN_CALLBACKS.length; idx += 1) {
              const callback = AUTH_TOKEN_CALLBACKS[idx];
              callback();
            }
            IS_FETCHING_AUTH_TOKEN = false;
            AUTH_TOKEN_CALLBACKS = [];
          }, (err) => {
            IS_FETCHING_AUTH_TOKEN = false;
            if (err.status === 422 || err.status === 401) {
              clearRefreshToken();
              sendAuthenticatedBackendRequest(path, type, requestData, onSuccess, onFailure, false);
            } else {
              if (!onFailure) {
                return;
              }
              onFailure(err);
            }
          });
        }
      } else if (error.status === 422) {
        clearRefreshToken();
        sendAuthenticatedBackendRequest(path, type, requestData, onSuccess, onFailure, false);
      } else {
        if (!onFailure) {
          return;
        }
        onFailure(error);
      }
    });
  }, (error) => {
    if (!onFailure) {
      return;
    }
    onFailure(error);
  });
}
