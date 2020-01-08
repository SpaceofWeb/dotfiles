/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

const maxInactivityInSeconds = (60 * 2);

// the watcher interval that can be stopped
let activityWatcherInterval;

// the number of seconds that have passed since the user was active
let secondsSinceLastActivity = 0;
const resetSecondsSinceLastActivity = () => { secondsSinceLastActivity = 0; };

// an array of DOM events that should be interpreted as user activity
const activityEvents = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
];

activityEvents.forEach((eventName) => {
  document.addEventListener(eventName, resetSecondsSinceLastActivity, true);
});

function isActive () {
  return secondsSinceLastActivity <= maxInactivityInSeconds;
}

function startWatchActivity (activityCallback) {
  resetSecondsSinceLastActivity();

  if (!activityWatcherInterval) {
    activityWatcherInterval = setInterval(() => {
      secondsSinceLastActivity++;
      activityCallback(isActive());
    }, 1000); // every second
  }
}

function stopWatchActivity () {
  clearInterval(activityWatcherInterval);
  activityWatcherInterval = null;
  resetSecondsSinceLastActivity();
}

window.APP.activity = {
  isActive,
  startWatchActivity,
  stopWatchActivity,
};
