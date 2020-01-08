/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

import { formatDistance, formatRelative, parseISO } from 'date-fns';
import { enUS, fr, ja } from 'date-fns/locale';

const availableLocales = {
  en: enUS,
  fr,
  ja,
};

const getLocaleWithFallback = locale => availableLocales[ locale ] || availableLocales.en;

function parseISOSafe (theDate) {
  // Note that `parseISO` doesn't throw an exception
  // but it returns an object `Invalid date` if a `null` is given.
  // As it creates an exception in GWT's bridge JSNI, let's prevent us from this case.

  if (!theDate) {
    return null;
  }

  return parseISO(theDate);
}

export const formatDistanceFromDate = (fromDate, locale) => {

  const fromDateOrNull = parseISOSafe(fromDate);
  if (!fromDateOrNull) {
    return '';
  }

  return formatDistance(fromDateOrNull, new Date(), {
    locale: getLocaleWithFallback(locale),
  });

};

export const formatRelativeFromDate = (fromDate, locale) => {

  const fromDateOrNull = parseISOSafe(fromDate);
  if (!fromDateOrNull) {
    return '';
  }

  return formatRelative(fromDateOrNull, new Date(), {
    locale: getLocaleWithFallback(locale),
  });

};

window.APP.dates = {
  formatDistanceFromDate,
  formatRelativeFromDate,
};
