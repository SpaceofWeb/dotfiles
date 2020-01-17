import { sendAuthenticatedBackendRequest } from '../utils';


let USER = null;
let SET_TIME_MILLISECONDS = null;
let USER_REQUEST_IS_ACTIVE_AT = null;
let USER_RESPONSES = [];
let TIME_DELTA = 5 * 1000;


function setUserInCache(user) {
  const currentDate = new Date();
  SET_TIME_MILLISECONDS = currentDate.getTime();
  USER = user;
}


export function getUserAndCache(sendResponse) {
  USER_RESPONSES.push(sendResponse);
  const currentDate = new Date();
  const currentTime = currentDate.getTime();
  if (!USER_REQUEST_IS_ACTIVE_AT || currentTime - USER_REQUEST_IS_ACTIVE_AT > TIME_DELTA) {
    USER_REQUEST_IS_ACTIVE_AT = currentTime;
    sendAuthenticatedBackendRequest('/users/me', 'get', {}, (user) => {
      USER_REQUEST_IS_ACTIVE_AT = null;
      setUserInCache(user);
      for (let idx = 0; idx < USER_RESPONSES.length; idx += 1) {
        const response = USER_RESPONSES[idx];
        response({ data: user, status: true, success: true });
      }
      USER_RESPONSES = [];
    }, () => {
      USER_REQUEST_IS_ACTIVE_AT = null;
      for (let idx = 0; idx < USER_RESPONSES.length; idx += 1) {
        const response = USER_RESPONSES[idx];
        response({ status: true, success: false });
      }
      USER_RESPONSES = [];
    });
  }
}


export function clearUserCache() {
  USER = null;
  SET_TIME_MILLISECONDS = null;
  for (let idx = 0; idx < USER_RESPONSES.length; idx += 1) {
    const response = USER_RESPONSES[idx];
    response({ status: true, success: false });
  }
  USER_RESPONSES = [];
}


export function getUserFromCache() {
  const currentDate = new Date();
  const currentTime = currentDate.getTime();
  if (SET_TIME_MILLISECONDS && currentTime - SET_TIME_MILLISECONDS > TIME_DELTA) {
    return null;
  }
  return USER;
}
