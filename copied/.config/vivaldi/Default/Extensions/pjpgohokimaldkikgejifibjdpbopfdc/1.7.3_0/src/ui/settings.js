// global variable indicating if should be turned on for site
let isEnabledOnSiteLocally = null; // null means not set
let lang = 'en'; // eslint-disable-line no-unused-vars
let isAnonymous = true;
let isEmailConfirmed = true;
let subscriptionTier = 'free';
let subscriptionEndDatetime = null;
let fetchedUserProperties = false;
let disableToggleOnSiteRemotely = null;
let isEnabledOnSiteRemotely = null;
let isSupportedOnSiteRemotely = null;


export function setIsEnabledOnSiteLocally(newIsEnabledOnSiteLocally) {
  isEnabledOnSiteLocally = newIsEnabledOnSiteLocally;
}

export function setUserProperties(user) {
  isAnonymous = user.is_anonymous;
  isEmailConfirmed = user.email_confirmed;

  const { subscription } = user;
  if (subscription) {
    subscriptionTier = subscription.tier;
    subscriptionEndDatetime = subscription.end_datetime;
  }
  fetchedUserProperties = true;
}

export function setSiteSettings(settings) {
  for (let idx = 0; idx < settings.length; idx += 1) {
    const setting = settings[idx];
    const {
      disable_toggle: disableToggle,
      enabled,
      supported,
    } = setting;
    disableToggleOnSiteRemotely = disableToggleOnSiteRemotely || disableToggle;
    isSupportedOnSiteRemotely = isSupportedOnSiteRemotely || supported;
    isEnabledOnSiteRemotely = isEnabledOnSiteRemotely || enabled;
  }
}

export function didFetchUserProperties() {
  return fetchedUserProperties;
}

export function isUserAnonymous() {
  return isAnonymous;
}

export function isUserEmailConfirmed() {
  return isEmailConfirmed;
}

export function isSubscription() {
  return subscriptionTier !== 'free';
}

export function getSubscriptionTier() {
  return subscriptionTier;
}

export function getSubscriptionTrialDaysLeft() {
  if (!subscriptionEndDatetime) {
    return subscriptionEndDatetime;
  }


  const day = 24 * 60 * 60 * 1000;
  const currentDate = new Date();
  const endDate = new Date(subscriptionEndDatetime);
  if (endDate.getTime() - currentDate.getTime() < 0) {
    return null;
  }

  const numDays = Math.round(Math.abs((endDate.getTime() - currentDate.getTime()) / day));
  return Math.max(numDays, 1);
}

export function isSupportedHost() {
  return isSupportedOnSiteRemotely;
}

export function isEnabledOnSite() {
  if (isEnabledOnSiteRemotely !== null) {
    return isEnabledOnSiteRemotely;
  }
  if (isSubscription() && isEnabledOnSiteLocally === true) {
    return true;
  }
  return isEnabledOnSiteLocally !== false && isSupportedHost();
}

export function isToggleDisabled() {
  if (disableToggleOnSiteRemotely !== null) {
    return disableToggleOnSiteRemotely;
  }
  return !(isSupportedHost() || isEnabledOnSite() || isSubscription());
}

export function showToggleDisabledTag() {
  return disableToggleOnSiteRemotely === true;
}

export function showPremiumOnlyTag() {
  return false;
}

export function setLang(newLang) {
  lang = newLang;
}

export function getLang() {
  return 'en';
}
