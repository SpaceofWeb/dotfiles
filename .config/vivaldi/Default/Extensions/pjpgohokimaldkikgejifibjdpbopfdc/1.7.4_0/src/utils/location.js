// let HOST_CONFIG = null;

let TOP_FRAME_HOSTNAME = null;
let TOP_FRAME_PATHNAME = null;

export function setTopFrameUrl(url) {
  const parser = document.createElement('a');
  parser.href = url;
  TOP_FRAME_HOSTNAME = parser.hostname;
  TOP_FRAME_PATHNAME = parser.pathname;
}

export function getTopFrameHostname() {
  if (!TOP_FRAME_HOSTNAME) {
    return window.location.hostname;
  }
  return TOP_FRAME_HOSTNAME;
}

export function getTopFramePathname() {
  if (!TOP_FRAME_PATHNAME) {
    return window.location.pathname;
  }
  return TOP_FRAME_PATHNAME;
}

// function getHostConfig() {
//   if (HOST_CONFIG !== null) {
//     return HOST_CONFIG;
//   }

//   const hostname = getTopFrameHostname();
//   const pathname = getTopFramePathname();
//   Object.keys(SAPLING_ENV.ENABLED_HOSTNAMES).forEach((regexHostString) => {
//     const reg = RegExp(regexHostString);
//     if (reg.test(hostname)) {
//       HOST_CONFIG = SAPLING_ENV.ENABLED_HOSTNAMES[regexHostString];
//       return; // eslint-disable-line no-useless-return
//     }
//   });
//   Object.keys(SAPLING_ENV.ENABLED_PATHNAMES).forEach((regexPathString) => {
//     const reg = RegExp(regexPathString);
//     if (reg.test(pathname)) {
//       HOST_CONFIG = SAPLING_ENV.ENABLED_PATHNAMES[regexPathString];
//       return; // eslint-disable-line no-useless-return
//     }
//   });

//   return HOST_CONFIG;
// }
