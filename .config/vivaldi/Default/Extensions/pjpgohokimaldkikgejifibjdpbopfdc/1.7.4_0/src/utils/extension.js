function isPopupEnvironment() {
  return window.location.protocol === EXTENSION_PROTOCOL;
}

export { isPopupEnvironment as default };
