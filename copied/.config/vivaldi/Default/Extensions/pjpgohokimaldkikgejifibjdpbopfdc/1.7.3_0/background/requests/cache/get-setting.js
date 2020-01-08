import { sendAuthenticatedBackendRequest } from '../utils';


let SETTING_RESPONSES = {};


function setSettingInCache(paramKey, settings) {
  const currentDate = new Date();
  SETTING_RESPONSES[paramKey].setTimeMilliseconds = currentDate.getTime();
  SETTING_RESPONSES[paramKey].data = settings;
}


function stringifyParams(params) {
  return JSON.stringify(params, Object.keys(params).sort());
}


export function getSettingAndCache(params, sendResponse) {
  const paramKey = stringifyParams(params);
  if (paramKey in SETTING_RESPONSES) {
    SETTING_RESPONSES[paramKey].responses.push(sendResponse);
  } else {
    SETTING_RESPONSES[paramKey] = {
      responses: [sendResponse],
      isActiveAt: null,
      setTimeMilliseconds: null,
      data: null,
    };
  }

  const currentDate = new Date();
  const currentTime = currentDate.getTime();
  const { isActiveAt } = SETTING_RESPONSES[paramKey];
  if (!isActiveAt || currentTime - isActiveAt > 5 * 1000) {
    SETTING_RESPONSES[paramKey].isActiveAt = currentTime;
    const url = `/users/me/settings?${$.param(params)}`;
    sendAuthenticatedBackendRequest(url, 'get', {}, (settings) => {
      SETTING_RESPONSES[paramKey].isActiveAt = null;
      setSettingInCache(paramKey, settings);
      const { responses } = SETTING_RESPONSES[paramKey];
      for (let idx = 0; idx < responses.length; idx += 1) {
        const response = responses[idx];
        response({ data: settings, status: true, success: true });
      }
      SETTING_RESPONSES[paramKey].responses = [];
    }, () => {
      SETTING_RESPONSES[paramKey].isActiveAt = null;
      const { responses } = SETTING_RESPONSES[paramKey];
      for (let idx = 0; idx < responses.length; idx += 1) {
        const response = responses[idx];
        response({ status: true, success: false });
      }
      SETTING_RESPONSES[paramKey].responses = [];
    });
  }
}


export function clearSettingCache() {
  const paramKeys = Object.keys(SETTING_RESPONSES);
  for (let idx = 0; idx < paramKeys.length; idx += 1) {
    const paramKey = paramKeys[idx];
    const { responses } = SETTING_RESPONSES[paramKey];
    for (let idx2 = 0; idx2 < responses.length; idx2 += 1) {
      const response = responses[idx2];
      response({ status: true, success: false });
    }
  }

  SETTING_RESPONSES = {};
}


export function getSettingFromCache(params) {
  const paramKey = stringifyParams(params);

  const currentDate = new Date();
  const currentTime = currentDate.getTime();
  if (paramKey in SETTING_RESPONSES) {
    const { setTimeMilliseconds, data } = SETTING_RESPONSES[paramKey];
    if (setTimeMilliseconds && currentTime - setTimeMilliseconds > 60 * 1000) {
      return null;
    }
    return data;
  }

  return null;
}
