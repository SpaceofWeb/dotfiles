// Copyright Jason Savard

var accounts = [];
var ignoredAccounts = [];
var pollingAccounts = false;

var accountWithNewestMail;
var notificationAudio;
var lastNotificationAccountDates;
var lastNotificationAudioSource;
var voiceMessageAudio;

var notification;
var checkEmailTimer;
var unauthorizedAccounts;
var checkingEmails = false;
var buttonIcon;
const fcmUpdateTimers = {};

//init objects once in this background page and read them from all other views (html/popup/notification pages etc.)
ChromeTTS();
Controller();

const storagePromise = storage.init();
storagePromise.catch(error => {
	window.settingsError = true;
})

var detectSleepMode = new DetectSleepMode(async () => {
    // wakeup from sleep mode action...
    const accountSummaries = await getAccountsSummary(accounts);
	if (accountSummaries.signedIntoAccounts >= 1) {
		console.log("hasAtleastOneSuccessfullAccount - so don't check")
	} else {
		checkEmails("wakeupFromSleep");
	}
});

// Methods declared for "html-css-sanitizer-minified.js"
function allowAllUrls(url, mime) { return url; }
function rewriteIds(id) { return HTML_CSS_SANITIZER_REWRITE_IDS_PREFIX + id; }
//Loosen restrictions of Caja's html-sanitizer to allow for styling
html4.ATTRIBS['*::style'] = 0;
html4.ATTRIBS['*::background'] = 0;
html4.ATTRIBS['a::target'] = 0;
html4.ATTRIBS['audio::src'] = 0;
html4.ATTRIBS['video::src'] = 0;
html4.ATTRIBS['video::poster'] = 0;
html4.ATTRIBS['video::controls'] = 0;
//html4.ATTRIBS['video::autoplay'] = 0;
html4.ATTRIBS['video::controls'] = 0;
html4.ELEMENTS['audio'] = 0;
html4.ELEMENTS['video'] = 0;

async function firstInstall() {
	// Note: Install dates only as old as implementation of this today, Dec 14th 2013
	await storage.set("installDate", new Date());
	await storage.set("installVersion", chrome.runtime.getManifest().version);
	
	// only show options if NOT locked
	if (await storage.get("settingsAccess") != "locked") {
		const optionsUrl = chrome.runtime.getURL("options.html?action=install");
		chrome.tabs.create({url: "https://jasonsavard.com/thankYouForInstalling?app=gmail&optionsUrl=" + encodeURIComponent(optionsUrl)});
	}
	
	// commented because too many for quota
	//sendGA("installed", chrome.runtime.getManifest().version);
}

// seems alert()'s can stop the oninstalled from being called
chrome.runtime.onInstalled.addListener(async details => {
	//console.log("onInstalled: " + details.reason);
	await storagePromise;
	
	// patch: when extension crashes and restarts the reason is "install" so ignore if it installdate exists
	if (details.reason == "install" && !await storage.get("installDate")) {
		firstInstall();
	} else if (details.reason == "update") {
		// seems that Reloading extension from extension page will trigger an onIntalled with reason "update"
		// so let's make sure this is a real version update by comparing versions
		var realUpdate = details.previousVersion != chrome.runtime.getManifest().version;
		if (realUpdate) {
			console.log("real version changed");
			// extension has been updated to let's resync the data and save the new extension version in the sync data (to make obsolete any old sync data)
			// but let's wait about 60 minutes for (if) any new settings have been altered in this new extension version before saving syncing them
			chrome.alarms.create(Alarms.EXTENSION_UPDATED_SYNC, {delayInMinutes:60});
		}
		
		var previousVersionObj = parseVersionString(details.previousVersion)
        var currentVersionObj = parseVersionString(chrome.runtime.getManifest().version);
        const extensionUpdates = await storage.get("extensionUpdates");
		if ((extensionUpdates == "all" && realUpdate) || (extensionUpdates == "interesting" && (previousVersionObj.major != currentVersionObj.major || previousVersionObj.minor != currentVersionObj.minor))) {
			//if (details.previousVersion != "16.5") { // details.previousVersion != "16.2" && details.previousVersion != "16.3" && details.previousVersion != "16.4"
				var options = {
						type: "basic",
						title: getMessage("extensionUpdated"),
						message: "Checker Plus for Gmail " + chrome.runtime.getManifest().version,
						iconUrl: Icons.NOTIFICATION_ICON_URL,
						buttons: [{title: getMessage("seeUpdates")}]
				}

				if (DetectClient.isFirefox()) {
					options.priority = 2;
				} else {
                    if (!DetectClient.isMac()) { // patch for macOS Catalina not working with requireinteraction
                        options.requireInteraction = true;
                    }
				}

				chrome.notifications.create("extensionUpdate", options, function(notificationId) {
					if (chrome.runtime.lastError) {
						console.error(chrome.runtime.lastError.message);
					}
				});
			//}
		}
    }
    
    //init();
});

if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
        //init();
    })
}

if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener(async alarm => {
        if (alarm.name == Alarms.EVERY_MINUTE) {
            // for detecting and update the DND status to the user
            updateBadge();

            // ping
            detectSleepMode.ping();

            // repeat notification
            if (lsNumber("unreadCount") >= 1) {
                if (await storage.get("repeatNotification")) {
                    buttonIcon.startAnimation();
                    if (await storage.get("notificationSound")) {
                        playNotificationSound(await storage.get("_recentEmailSoundSource"));
                    }
                }
            }

            // make sure there are no duplicate accounts that could create lockout issue
            if (await storage.get("accountAddingMethod") == "autoDetect") {
                if (accounts.length == 0) {
                    await pollAccounts({showNotification:true});
                } else {
                    let uniqueAccounts = [];
                    let foundSomeDuplicateAccounts;
                    let duplicateAccountFlag;
                    // start from end so that we remove duplicates from the end, assuming the first ones in the array in their correct position
                    for (let a=accounts.length-1; a>=0; a--) {
                        for (let b=a-1; b>=0; b--) {
                            if (accounts[a].getEmail().trim() == accounts[b].getEmail().trim()) {
                                console.warn("dupe detection interval: remove ", accounts[a].getEmail());
                                duplicateAccountFlag = true;
                                break;
                            }
                        }
                        if (duplicateAccountFlag) {
                            foundSomeDuplicateAccounts = true;
                            duplicateAccountFlag = false;
                        } else {
                            uniqueAccounts.unshift(accounts[a]);                            
                        }
                    }
                    
                    if (foundSomeDuplicateAccounts) {
                        accounts = uniqueAccounts;
                    }
                }
            }
        } else if (alarm.name == Alarms.EXTENSION_UPDATED_SYNC) {
            syncOptions.save("extensionUpdatedSync");
        } else if (alarm.name == Alarms.SYNC_DATA) {
            syncOptions.save("sync key");
        } else if (alarm.name == Alarms.COLLECT_STATS) {
            console.log("collecting optionstats")
                
            var optionStatCounter = 1;
            
            async function sendOptionStat(settingName) {
                var settingValue = await storage.get(settingName);
                
                // Convert booleans to string because google analytics doesn't process them
                if (settingValue === true) {
                    settingValue = "true";
                } else if (settingValue === false || settingValue == null) {
                    settingValue = "false";
                }
                
                // issue: seems like the 1st 10 are being logged only in Google Analytics - migth be too many sent at same time
                // so let's space out the sending to every 2 seconds
                setTimeout(function() {
                    sendGA("optionStats", settingName, settingValue);
                }, optionStatCounter++ * seconds(2));
            }
            
            if (accounts.length >= 1) {
                //sendGA("optionStats", "totalAccounts", accounts.length + " accounts", accounts.length);
            }
            
            //sendOptionStat("browserButtonAction");
            //sendOptionStat("checkerPlusBrowserButtonActionIfNoEmail");
            //sendOptionStat("gmailPopupBrowserButtonActionIfNoEmail");
            //sendOptionStat("desktopNotification");
            //sendOptionStat("notificationSound");
            //sendOptionStat("notificationVoice");
            //sendOptionStat("accountAddingMethod");
            //sendOptionStat("donationClicked");
            //sendOptionStat("extensionUpdates");
            //sendOptionStat("icon_set");
            //sendOptionStat("showContactPhoto");
            //sendOptionStat("showNotificationEmailImagePreview");
            //sendOptionStat("showfull_read");
            
            storage.setDate("lastOptionStatsSent");
        } else if (alarm.name == Alarms.UPDATE_CONTACTS) {
            if (await storage.get("showContactPhoto")) {
                // update contacts
                updateContacts().catch(function(error) {
                    console.warn("updateContacts() error: " + error);
                });
            }
        } else if (alarm.name == Alarms.SYNC_SIGN_IN_ORDER) {
            if (await storage.get("accountAddingMethod") == "oauth") {
                syncSignInOrderForAllAccounts().catch(error => {
                    console.warn("syncSignInOrderForAllAccounts() error: " + error);
                });
            }
        } else if (alarm.name.startsWith(Alarms.ENABLE_PUSH_NOTIFICATIONS_EMAIL_ALARM_PREFIX)) {
            var email = alarm.name.split(Alarms.ENABLE_PUSH_NOTIFICATIONS_EMAIL_ALARM_PREFIX)[1];
            var account = getAccountByEmail(email);
            if (account) {
                account.enablePushNotifications();
            }
        } else if (alarm.name.startsWith(Alarms.WATCH_EMAIL_ALARM_PREFIX)) {
            var email = alarm.name.split(Alarms.WATCH_EMAIL_ALARM_PREFIX)[1];
            var account = getAccountByEmail(email);
            if (account) {
                account.watch();
            }
        } else if (alarm.name.startsWith(Alarms.RESYNC_ALARM_PREFIX)) {
            const email = alarm.name.split(Alarms.RESYNC_ALARM_PREFIX)[1];
            const account = getAccountByEmail(email);
            if (account) {
                if (account.resyncAttempts > 0) {
                    account.resyncAttempts--;
                    account.syncSignInId().then(async () => {
                        await serializeOauthAccounts();
                        account.mustResync = false;
                    }).catch(errorResponse => {
                        console.error("syncsignin error: " + errorResponse);
                    });
                }
            }
        } else if (alarm.name.startsWith(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX)) {
            const email = alarm.name.split(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX)[1];
            const account = getAccountByEmail(email);
            if (account) {
                getEmailsFromFCMUpdate(account);
            }
        } else if (alarm.name == Alarms.UPDATE_SKINS) {
            console.log("updateSkins...");
            
            var skinsSettings = await storage.get("skins");
            const skinsIds = skinsSettings.map(skin => skin.id);
            
            if (skinsIds.length) {
                const skins = await Controller.getSkins(skinsIds, await storage.get("_lastUpdateSkins"));
                console.log("skins:", skins);
                
                var foundSkins = false;
                skins.forEach(skin => {
                    skinsSettings.some(skinSetting => {
                        if (skinSetting.id == skin.id) {
                            foundSkins = true;
                            console.log("update skin: " + skin.id);
                            copyObj(skin, skinSetting);
                            //skinSetting.css = skin.css;
                            //skinSetting.image = skin.image;
                            return true;
                        }
                    });
                });
                
                if (foundSkins) {
                    storage.set("skins", skinsSettings);
                }
                
                storage.setDate("_lastUpdateSkins");
            }
        } else if (alarm.name == Alarms.UPDATE_UNINSTALL_URL) {
			// do this every day so that the daysellapsed is updated in the uninstall url
            setUninstallUrl(await getFirstActiveEmail(accounts));
        } else if (alarm.name == Alarms.CLEAR_SUBJECTS_SPOKEN) {
            storage.remove("_subjectsSpoken");
        } else if (alarm.name == "test") {
            localStorage.test = new Date();
        }
    });    
}

function getEmailsFromFCMUpdate(account) {
    account.getEmails().then(() => {
        mailUpdate({showNotification:true});
    }).catch(error => {
        // nothing
    });
}

if (chrome.gcm) {
	
	var MIN_SECONDS_BETWEEN_MODIFICATIONS_BY_EXTENSION_AND_GCM_MESSAGES = 15;
	var MIN_SECONDS_BETWEEN_GET_EMAILS = 5;
	var MIN_SECONDS_BETWEEN_PROCESSING_GCM_MESSAGES = 1;
	
	chrome.gcm.onMessage.addListener(async message => {
		console.log("gcm.onMessage", new Date(), message);
		if (message.from == GCM_SENDER_ID) {
			// detect push notifiation about change
			if (message.data.historyId) {
				if (await storage.get("poll") == "realtime") {
					// reset check email timer (as a backup it runs every 5min)
					restartCheckEmailTimer(true);

                    const email = message.data.email;
					var account = getAccountByEmail(email);
					if (account) {
						if (!account.getHistoryId() || message.data.historyId > account.getHistoryId()) {

                            clearTimeout(fcmUpdateTimers[email]);

                            const lastGmailAPIActionByExtension = await storage.get("_lastGmailAPIActionByExtension");
							if (lastGmailAPIActionByExtension.diffInSeconds() >= -MIN_SECONDS_BETWEEN_MODIFICATIONS_BY_EXTENSION_AND_GCM_MESSAGES) { // avoid race condition
                                chrome.alarms.create(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX + email, {delayInMinutes: 1});
                            } else {
                                chrome.alarms.clear(Alarms.GET_EMAILS_FROM_FCM_UPDATE_PREFIX + email);

                                let delay;
                                if (account.lastGetEmailsDate.diffInSeconds() < -MIN_SECONDS_BETWEEN_GET_EMAILS) {
                                    delay = 500; // small buffer because when snoozing multiple emails I would get quick consecutive gcm calls
                                } else {
                                    delay = seconds(MIN_SECONDS_BETWEEN_PROCESSING_GCM_MESSAGES);
                                }

                                fcmUpdateTimers[email] = setTimeout(() => {
                                    getEmailsFromFCMUpdate(account);
                                }, delay);
                            }
						} else {
							console.warn("historyId is old: " + message.data.historyId);
						}
					}
				}
			} else {
				console.warn("Unknown message", message);
			}
		} else {
			console.warn("Unknown message sender: " + message.from);
		}
	});
	
	chrome.gcm.onMessagesDeleted.addListener(response => {
		console.log("messages deleted: ", response);
	});
	
	chrome.gcm.onSendError.addListener(error => {
		console.error("Message " + error.messageId + " failed to be sent: " + error.errorMessage);
	});	
}

if (chrome.instanceID) {
    chrome.instanceID.onTokenRefresh.addListener(async function() {
        console.log("onTokenRefresh args", arguments);
        storage.remove("registrationId");
    });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    await storagePromise;

    if (ContextMenu.OPEN_GMAIL == info.menuItemId) {
        openGmail(accounts);
    } else if (ContextMenu.COMPOSE == info.menuItemId) {
        const firstActiveAccount = await getFirstActiveAccount(accounts);
        firstActiveAccount.openCompose();
    } else if (ContextMenu.REFRESH == info.menuItemId) {
        chrome.browserAction.setBadgeText({ text: "..." });
        refreshAccounts();
    } else if (ContextMenu.MARK_ALL_AS_READ == info.menuItemId) {
        markAllAsRead();
    } else if (ContextMenu.QUICK_COMPOSE == info.menuItemId) {
        openQuickCompose();
    } else if (ContextMenu.SEND_PAGE_LINK == info.menuItemId) {
        sendPageLink(info, tab, accounts.first());
    } else if (ContextMenu.SEND_PAGE_LINK_TO_CONTACT == info.menuItemId) {
        if (await storage.get("accountAddingMethod") == "autoDetect") {
            sendPageLinkToContact(info, tab);
        } else {
            var sendEmailParams = generateSendPageParams(info, tab);
            sendEmailParams.to = {email:await storage.get("quickComposeEmail")}; // name:storage.get("quickComposeEmailAlias")
            
            var originalMessage = sendEmailParams.message;
            sendEmailParams.htmlMessage = sendEmailParams.message + "<br><br><span style='color:gray'>Sent from <a style='color:gray;text-decoration:none' href='https://jasonsavard.com/Checker-Plus-for-Gmail?ref=sendpage'>Checker Plus for Gmail</a></span>";
            // remove message since we put it into the htmlMessage and because it seems when gmail api sends in html only it generates the text/plain
            sendEmailParams.message = null;
            
            const firstActiveAccount = await getFirstActiveAccount(accounts);
            firstActiveAccount.sendEmail(sendEmailParams).then(() => {
                var options = {
                        type: "basic",
                        title: getMessage("email") + " " + getMessage("sent"),
                        message: sendEmailParams.subject,
                        contextMessage: originalMessage,
                        iconUrl: Icons.NOTIFICATION_ICON_URL
                }
                
                var EMAIL_SENT_NOTIFICATION_ID = "emailSent";
                chrome.notifications.create(EMAIL_SENT_NOTIFICATION_ID, options, async function(notificationId) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError.message);
                    } else {
                        await sleep(seconds(4));
                        chrome.notifications.clear(EMAIL_SENT_NOTIFICATION_ID, function() {});
                    }
                });
            }).catch(error => {
                alert("Error sending email: " + error);
            });
        }
    } else if (ContextMenu.SEND_PAGE_LINK_TO_CONTACT_WITH_MESSAGE == info.menuItemId) {
        sendPageLinkToContact(info, tab);
    } else if (ContextMenu.DND_OFF == info.menuItemId) {
        setDND_off();
    } else if (ContextMenu.DND_30_MIN == info.menuItemId) {
        setDND_minutes(30);
    } else if (ContextMenu.DND_1_HOUR == info.menuItemId) {
        setDND_minutes(60);
    } else if (ContextMenu.DND_2_HOURS == info.menuItemId) {
        setDND_minutes(120);
    } else if (ContextMenu.DND_4_HOURS == info.menuItemId) {
        setDND_minutes(240);
    } else if (ContextMenu.DND_8_HOURS == info.menuItemId) {
        setDND_minutes(480);
    } else if (ContextMenu.DND_TODAY == info.menuItemId) {
        setDND_today();
    } else if (ContextMenu.DND_INDEFINITELY == info.menuItemId) {
        setDND_indefinitely();
    } else if (ContextMenu.DND_OPTIONS == info.menuItemId) {
        openDNDOptions();
    } else {
        showMessageNotification("No code assigned to this menu", "Try re-installing the extension.");
    }
});

async function setUninstallUrl(email) {
	if (chrome.runtime.setUninstallURL) {
		await storagePromise;
		var url = "https://jasonsavard.com/uninstalled?app=gmail";
		url += "&version=" + encodeURIComponent(chrome.runtime.getManifest().version);
		url += "&daysInstalled=" + await daysElapsedSinceFirstInstalled();
		if (email && !/mail\.google\.com/.test(email)) {
            url += "&e=" + encodeURIComponent(btoa(email));
            storage.set("_uninstallEmail", email);
		}
		chrome.runtime.setUninstallURL(url);
	}
}

async function onButtonClicked(notificationId, buttonIndex) {
	console.log("onbuttonclicked", notificationId, buttonIndex);
	if (notificationId == "extensionUpdate") {
		if (buttonIndex == -1 || buttonIndex == 0) {
			openUrl("https://jasonsavard.com/wiki/Checker_Plus_for_Gmail_changelog");
			chrome.notifications.clear(notificationId, function() {});
			sendGA("extensionUpdateNotification", "clicked button - see updates");
		} else if (buttonIndex == 1) {
			storage.set("extensionUpdates", "none");
			chrome.notifications.clear(notificationId, function(wasCleared) {
				// nothing
			});
			sendGA("extensionUpdateNotification", "clicked button - do not show future notifications");
		}
	} else if (notificationId == "message") {
		// nothing
	} else if (notificationId == "error") {
		openUrl(Urls.NotificationError);
		chrome.notifications.clear(notificationId, function() {});
		sendGA("errorNotification", "clicked button on notification");
	} else if (notificationId == "extensionConflict") {
		openUrl(Urls.ExtensionConflict);
		chrome.notifications.clear(notificationId, function() {});
		sendGA("errorNotification", "clicked button on notification");
	} else if (notificationId == "corruptProfile") {
		openUrl(Urls.CorruptProfile);
		chrome.notifications.clear(notificationId, function() {});
		sendGA("errorNotification", "clicked button on notification");
	} else {
		stopAllSounds();
		let notificationButtonValue;
		if (buttonIndex == -1) { // when Windows native notifications were enabled in Chrome 68 this was equivalent to clicking anywhere
			notificationButtonValue = await storage.get("notificationClickAnywhere");
		} else {
            const richNotifButtonsWithValues = await storage.get("_richNotifButtonsWithValues");
			notificationButtonValue = richNotifButtonsWithValues[buttonIndex].value;
		}
		performButtonAction({notificationButtonValue:notificationButtonValue, notificationId:notificationId});
	}
}

if (chrome.notifications) {

	// clicked anywhere
	chrome.notifications.onClicked.addListener(function(notificationId) {
		onButtonClicked(notificationId, -1);
	});

	// buttons clicked
	chrome.notifications.onButtonClicked.addListener(function(notificationId, buttonIndex) {
		onButtonClicked(notificationId, buttonIndex);
	});
	
	// closed notif
	chrome.notifications.onClosed.addListener(function(notificationId, byUser) {
		console.log("notif onclose", notificationId, byUser, new Date());
		
		if (notificationId == "extensionUpdate") {
			if (byUser) {
				sendGA("extensionUpdateNotification", "closed notification");
			}
		} else if (notificationId == "message") {
			// nothing
		} else if (notificationId == "error") {
			// nothing
		} else {
            storage.remove("_richNotifId");
			
			// Chrome <=60 byUser happens ONLY when X is clicked ... NOT by closing browser, NOT by clicking action buttons, ** NOT by calling .clear
			// Chrome 61 update: calling .clear will set byUser = true
			if (byUser && !window.notificationClosedByDuration) {
				stopAllSounds();
			}
			// reset value
			window.notificationClosedByDuration = false;
		}
	});
}

if (chrome.runtime.onMessageExternal) {
	chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
		if (sender.id == "blacklistedExtension") {
			//sendResponse({});  // don't allow this extension access
		} else if (message.action == "turnOffDND") {
			setDND_off(true);
			sendResponse();
		} else if (message.action == "setDNDEndTime") {
            (async function() {
                var endTime = new Date(message.endTime);
                if (!message.triggeredByCalendarExtension) {
                    setDNDEndTime(endTime, true);
                } else if (message.triggeredByCalendarExtension && await storage.get("dndDuringCalendarEvent")) {
                    // only overrite endtime from calendar extension if it's longer than the user's specifically set end time
                    if (!await storage.get("DND_endTime") || endTime.isAfter(await storage.get("DND_endTime"))) {
                        setDNDEndTime(endTime, true);
                    }
                }
                sendResponse();
            })();
            return true;
		} else if (message.action == "getEventDetails") {
			// do not sendresponse here because we are alredy litening for this event in the popup window context
		} else if (message.action == "getInfo") {
			sendResponse({installed:true});
		} else if (message.action == "version") {
			sendResponse(chrome.runtime.getManifest().version);
		}
	});
}

// Add listener once only here and it will only activate when browser action for popup = ""
chrome.browserAction.onClicked.addListener(async tab => {
    const browserButtonAction = await storage.get("browserButtonAction");
    const checkerPlusBrowserButtonActionIfNoEmail = await storage.get("checkerPlusBrowserButtonActionIfNoEmail");
    const gmailPopupBrowserButtonActionIfNoEmail = await storage.get("gmailPopupBrowserButtonActionIfNoEmail");

	var checkerPlusElseCompose = browserButtonAction == BROWSER_BUTTON_ACTION_CHECKER_PLUS && checkerPlusBrowserButtonActionIfNoEmail == BROWSER_BUTTON_ACTION_COMPOSE && lsNumber("unreadCount") === 0;
	var gmailInboxElseCompose = browserButtonAction == BROWSER_BUTTON_ACTION_GMAIL_INBOX && gmailPopupBrowserButtonActionIfNoEmail == BROWSER_BUTTON_ACTION_COMPOSE && lsNumber("unreadCount") === 0;
	
	if (browserButtonAction == BROWSER_BUTTON_ACTION_CHECKER_PLUS_POPOUT) {
		openInPopup();
	} else if (browserButtonAction == BROWSER_BUTTON_ACTION_COMPOSE || checkerPlusElseCompose || gmailInboxElseCompose) {
		// open compose mail
		if (accounts.length) {
            const firstActiveAccount = await getFirstActiveAccount(accounts);
			firstActiveAccount.openCompose();
		} else {
			openUrl(getSignInUrl());
		}
	} else {
		// open Gmail
        var accountId = 0;
        const activeAccounts = await getActiveAccounts(accounts);
		activeAccounts.some(function(account, i) {
			if (account.getUnreadCount() > 0) {
				accountId = account.id;
				return true;
			}
		});

		// means not signed in so open gmail.com for user to sign in
		var accountToOpen = getAccountById(accountId);
		if (accountToOpen) {
			var params = {};
			if (browserButtonAction == BROWSER_BUTTON_ACTION_GMAIL_IN_NEW_TAB || checkerPlusBrowserButtonActionIfNoEmail == BROWSER_BUTTON_ACTION_GMAIL_IN_NEW_TAB) {
				params.openInNewTab = true;
			}
			accountToOpen.openInbox(params);
		} else {
			console.error("No mailaccount(s) found with account id " + accountId);		
			openUrl(getSignInUrl());
		}
	}
});

function maybeAppendAllMsg(msg, emails) {
	if (emails.length == 1) {
		return msg;
	} else {
		return msg + " (" + getMessage("all") + ")";
	}
}

async function generateNotificationButton(buttons, buttonsWithValues, value, emails) {
	if (value) {
		let button;

        let NOTIF_BUTTONS_FOLDER;
        const notificationButtonIcon = await storage.get("notificationButtonIcon");
		if (notificationButtonIcon == "gray") {
			NOTIF_BUTTONS_FOLDER = "images/notifButtonsGray/";
		} else {
			NOTIF_BUTTONS_FOLDER = "images/notifButtons/";
        }
        
        function initButtonObj(title, icon) {
            let button = {
                title: title
            }

            if (notificationButtonIcon && icon) {
                button.iconUrl = NOTIF_BUTTONS_FOLDER + icon;
            }

            return button;
        }
		
		if (value == "markAsRead") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("readLink"), emails), "checkmark.svg");
		} else if (value == "delete") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("delete"), emails), "trash.svg");
		} else if (value == "archive") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("archiveLink"), emails), "archive.svg");
		} else if (value == "spam") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("spamLinkTitle"), emails), "spam.svg");
		} else if (value == "star") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("starLinkTitle"), emails), "star.svg");
		} else if (value == "starAndArchive") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("starAndArchive"), emails), "star.svg");
		} else if (value == "open") {
            button = initButtonObj(getMessage("open"), "open.svg");
		} else if (value == "openInNewTab") {
            button = initButtonObj(getMessage("open"), "open.svg");
		} else if (value == "openInPopup") {
			button = initButtonObj(getMessage("open"), "open.svg");
		} else if (value == "reply") {
            button = initButtonObj(getMessage("reply"), "reply.svg");
		} else if (value == "replyInPopup") {
            button = initButtonObj(getMessage("reply"), "reply.svg");
		} else if (value == "reducedDonationAd") {
            button = initButtonObj(getMessage("moreInfo") + " [" + getMessage("dismiss") + "]");
		} else if (value == "markDone") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("markDone"), emails), "checkmark.svg");
		} else if (value == "dismiss") {
            button = initButtonObj(maybeAppendAllMsg(getMessage("dismiss"), emails), "checkmark.svg");
		}

		if (button) {
			buttons.push(button);
			
			var buttonWithValue = shallowClone(button);
			buttonWithValue.value = value;
			buttonsWithValues.push(buttonWithValue);
		}
	}
}

function clearRichNotification(notificationId) {
	return new Promise((resolve, reject) => {
		if (notificationId) {
			chrome.notifications.clear(notificationId, function() {
				resolve();
			});
		} else {
			resolve();
		}
	});
}

function canDisplayImageInNotification(image) {
	var src = image.getAttribute("src");
	
	var imageRemovedBySender = false;
	if (image.getAttribute("alt") && image.getAttribute("alt").indexOf("Image removed by sender") != -1) {
		imageRemovedBySender = true;
	}
	
	if (src && (src.parseUrl().hostname.indexOf(".google.com") != -1 || src.parseUrl().hostname.indexOf(".googleusercontent.com")) && !imageRemovedBySender) { // src.indexOf("/proxy/") == -1
		return true;
	} else {
		return false;
	}
}

// watch out for returns here, we don't want to callback twice or not callback at all!
async function fetchEmailImagePreview(options, mail, callback) {
	if (await storage.get("showNotificationEmailImagePreview")) {
		
		if (await storage.get("accountAddingMethod") == "autoDetect") {
			
			// image domain host must be in permissions manifest or else notifications.create gives me download image errors and notification does not appear!
			if (chrome.permissions) {
				chrome.permissions.contains({origins: [Origins.ALL]}, function(result) {
					var skipLastCallback;
					
					if (result) {
						if (mail.messages && mail.messages.last()) {
							const messageContent = parseHtml(mail.messages.last().content);
							console.log("mail.messages", messageContent);
							fixRelativeLinks(messageContent, mail);
							
							Array.from(messageContent.querySelectorAll("img, imghidden")).some(image => {
								var src = image.getAttribute("src");
								
								// do not show common gmail images such as these by ignore /images/
								// .vcf icon = https://mail.google.com/mail/u/0/images/generic.gif
								// .wav icon = https://mail.google.com/mail/u/0/images/sound.gif	
								// /proxy/ used by Google news letters https://ci6.googleusercontent.com/proxy/b0dQF6UdprOZnNdy4YkkZRZYSz4OKeP6tnNaKKhKAHzc5DoRLm-6T9Ofs1I_nxTMa7p63sQXCvlyhmMf4nIKJxbU6hMDZ46Wv5esDXgENaw2csOyvTEfyb2ycnSEic4Yi7N81kiF=s0-d-e1-ft#https://www.gstatic.com/gmktg/mtv-img/cloudplatform_hero_image_2014_mar_w538.jpg
								// google logo 						   https://ci4.googleusercontent.com/proxy/GYehbMfqpOfmkZni3YXcVpYFnSdFa4_3HNmCzVHxFFhtCBk_QulXrkB97v_UVSU0gt8t42RnDKOqw0SvszkMjvrdKHZjm3UErjYHQI7vsurAMj3tGuzIFiqw8xIvgCy_aoN9ujcdkHDJYGLdO9h6jySufmfLtNIRr8tXVfdR=s0-d-e1-ft#https://ssl.gstatic.com/s2/oz/images/notifications/logo/google-plus-6617a72bb36cc548861652780c9e6ff1.png
								// twitter profile image: https://ci4.googleusercontent.com/proxy/6gEsiJis1bR3V0VjLSVPlXWkvG5gpih1SXl76ZtlPej0gbvzyT5csZHqRvspHtFm6RSN3GMjr341ggvV8bL1kUfidvh40p5QhrHlZHUgvGD9Rzzka29xynqxWPMupf5w0YCPXAterd8WXA=s0-d-e1-ft#https://pbs.twimg.com/profile_images/1710068300/avatar-sel-port_reasonably_small.jpg
								// pinterest logos "/logo" ... https://ci4.googleusercontent.com/proxy/FljV4IcGHkNGLK57gCiy7cBamDrSWta_-7hOh_NMFw5xEjJo3MUga5TaUfk3gGcoZ2HQTvCgLoEUu60kokQkHWfke_Zg0QENUV_Z4flLXGIYhV7As6dHwGc=s0-d-e1-ft#http://email-assets.pinterest.com/email/shared/brand/logo_large.gif
	
								if (src && canDisplayImageInNotification(image) && src.parseUrl().pathname.indexOf("/images/") == -1 && src.indexOf("notifications/") == -1 && src.indexOf("/logo") == -1) {
									// hostname is .google.com if they embedded the image
									// hostname is .googleusercontent.com if they in Gmail > clicked Insert Photo > by Web address (URL)							
									if (src.parseUrl().hostname.indexOf(".google.com") != -1) {
										options.type = "image";
										// assign default low res embedded image
										options.imageUrl = src;
										
										// see if we can change that default image with hig res image
										if (src.indexOf("disp=thd") != -1) {
											var fullImageSrc = src.replace("disp=thd", "disp=inline");
											
                                            skipLastCallback = true;
                                            try {
                                                fetch(fullImageSrc).then(response => {
                                                    if (response.ok) {
                                                        options.imageUrl = fullImageSrc;
                                                    } else {
                                                        throw response.statusText;
                                                    }
                                                }).catch(error => {
                                                    throw error;
                                                });
                                            } catch (error) {
                                                logError("could not load preview image: " + error);
                                            } finally {
                                                callback();
                                            }
										}
										// exit image loop
										return true;
									} else {
										// Google+ email: let's pull the first image as iconurl and 2nd as the imageurl
										if (mail.authorMail && mail.authorMail.indexOf("@plus.google.com") != -1) { //noreply-2fe90779@plus.google.com
											// detect 1st profile photo
											if (src.indexOf("photo.jpg") != -1) {
												var callbackParams = {};
												callbackParams.detectedIconUrl = src;
												
												// find a posted large photo if in the email...
												Array.from(messageContent.find("img, imghidden")).some(image => {
													// skip any other possible "profile photos" until we find one without a width
													// profile pic: <img width="75" height="75" style="border:solid 1px #cccccc" src="https://lh5.googleusercontent.com/-AaGu6jEK0vQ/AAAAAAAAAAI/AAAAAAAAPyw/Ri1xBFp8ZTk/s75-c-k-a-no/photo.jpg"></a></td>
													// attached pic: https://lh4.googleusercontent.com/-zZ09UJ_sZeM/UyKo78Wy74I/AAAAAAAFPUc/uR1p1NvrCd8/w506-h750/1979464_675320629180179_9739741_n.jpg
													// and no static images like Google+ image found at this ex. url: https://ssl.gstatic.com/s2/oz/images/notifications/logo/google-plus-6617a72bb36cc548861652780c9e6ff1.png
													console.log("detected image: " + image.getAttribute("src"));
													if (!image.getAttribute("width") && canDisplayImageInNotification(image) && image.getAttribute("src") && image.getAttribute("src").indexOf("notifications/") == -1) {
														options.type = "image";
														options.imageUrl = image.getAttribute("src");
														return true;
													}
												});
												
												skipLastCallback = true;
												callback(callbackParams);
												return true;
											}
										} else if (mail.authorMail && mail.authorMail.indexOf("@facebookmail.com") != -1) {
											// https://ci3.googleusercontent.com/proxy/g96-WnOcJ8aMpwH8MgjPEGTy5Q32qaOHpaF30q0s6tJRXXxs8yRr5jFkDIWAX_-wDIkjnoGpvMmPqJp_GGHk4U5yhSmUiBmDma-tPDyIE7Y_2-jWYC0PmPxhRU8mcSqqJxoqi27HTYG6sh9Jcbzsuw=s0-d-e1-ft#https://fbcdn-profile-a.akamaihd.net/hprofile-ak-prn2/t5/1117010_779426678_323617099_q.jpg
											if (src.indexOf("profile") != -1) {
												var callbackParams = {};
												callbackParams.detectedIconUrl = src;
												skipLastCallback = true;
												callback(callbackParams);
												return true;
											}
										} else if ((image.getAttribute("width") && image.getAttribute("width") >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT) && (image.getAttribute("height") && image.getAttribute("height") >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT)) {
											options.type = "image";
											options.imageUrl = src;
											// exit image loop
											return true;
										} else { // could not determine width/height
                                            // Get the real width/height											
                                            const copyOfImage = new Image();
											copyOfImage.src = src;
	
											skipLastCallback = true;
											
											loadImage(copyOfImage).then(() => {
												if (copyOfImage.width >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT && copyOfImage.height >= PREVIEW_IMAGE_MIN_WITDH_HEIGHT) {
													options.type = "image";
													options.imageUrl = src;
												}
											}).catch(error => {
												logError("could not load image: " + src + " " + error);
											}).then(() => {
												callback({});
											});
	
											// exit image loop
											return true;
										}									
									}
								} else {
									console.log("did not pass image tests");
								}
							});
						}
					}
					
					if (!skipLastCallback) {
						callback();
					}
				});
			} else {
				callback();
			}
			// because we return here, make sure we call callback everywhere before this line
			return;
		} else {
			// oauth
			var skipLastCallback;
			if (mail.messages && mail.messages.last()) {
				var lastMessage = mail.messages.last();
				var foundPossibleImage = lastMessage.files.some(function(file, fileIndex) {
					if (file.mimeType && file.mimeType.indexOf("image/") == 0 && file.body.size >= PREVIEW_IMAGE_MIN_SIZE && file.body.size < PREVIEW_IMAGE_MAX_SIZE) {
						var queuedFile = mail.queueFile(lastMessage.id, file);
						queuedFile.fetchPromise.then(function(response) {
							options.type = "image";
							options.imageUrl = generateBlobUrl(response.data, file.mimeType);
							console.log("mimetype: " + file.mimeType);
						}).catch(function(errorResponse) {
							logError("could not fetch preview image (oauth) " + errorResponse.message);
						}).then(function() {
							callback();
						});
						return true;
					}
				});

				if (foundPossibleImage) {
					skipLastCallback = true;
				}
			}
			
			if (!skipLastCallback) {
				callback();
			}
			return;
		}
	}
	callback();
}

function ensureDoNotShowNotificationIfGmailTabOpenTest(params = {}) {
	return new Promise(async (resolve, reject) => {
		if (params.testType) {
			resolve(true);
		} else if (accountWithNewestMail && await storage.get("doNotShowNotificationIfGmailTabOpen")) {
			// url: must be URL pattern like in manifest ex. http://abc.com/* (star is almost mandatory)
			chrome.tabs.query({url:accountWithNewestMail.getMailUrl() + "*"}, function(tabs) {
				console.log("gmail tabs: ", tabs);
				if (tabs && tabs.length) {
					console.warn("Not showing notification because of option: doNotShowNotificationIfGmailTabOpen");
					resolve(false);
				} else {
					resolve(true);
				}
			});
		} else {
			resolve(true);
		}
	});
} 

async function showNotification(params = {}) {
    storage.setDate("_lastNotificationDate");
    chrome.idle.queryState(60, newState => {
        console.log("show notif state: " + newState + " " + now());
        if (newState == "active") {
            storage.setDate("_lastNotificationDateWhileActive");
        }
    });
    
    var notificationDisplay = await storage.get("notificationDisplay");
    
    if (!params.unsnoozedEmails) {
        params.unsnoozedEmails = [];
    }
    if (!params.newEmails) {
        params.newEmails = [];
    }

    if (params.unsnoozedEmails.length) {
        params.emails = params.unsnoozedEmails.concat(params.newEmails);
    } else {
        params.emails = params.newEmails;
    }

    if (!params.skipSerializing && params.newEmails.length) {
        try {
            storage.set("_lastShowNotifParams", serializeMails(params));
        } catch (error) {
            console.warn("Could not serialize newEmails: " + error);
        }
    }

    const onlySnoozedEmails = params.unsnoozedEmails.length && !params.newEmails.length;

    const desktopNotification = await storage.get("desktopNotification");
    if (desktopNotification) {
        const dndState = await getDNDState();
        if (dndState) {
            return "DND is enabled";
        } else {
            const passedDoNotShowNotificationIfGmailTabOpenTest = await ensureDoNotShowNotificationIfGmailTabOpenTest(params);
            if (passedDoNotShowNotificationIfGmailTabOpenTest) {
                var firstEmail;
                if (params.emails) {
                    firstEmail = params.emails.first();
                }
                if (!firstEmail) {
                    var error = "Could not find any emails";
                    console.error(error);
                    throw new Error(error);
                }
                
                var NOTIFICATION_DISABLE_WARNING = "Normally a notification for this email or some of these emails will not appear because you unchecked the notification in your Accounts/Labels settings for this particular email/label";
                
                var notificationFlagForLabelsOfNewestEmail;
                if (firstEmail) {
                    const notifications = await firstEmail.account.getSetting("notifications");
                    notificationFlagForLabelsOfNewestEmail = await getSettingValueForLabels(firstEmail.account, notifications, firstEmail.labels, desktopNotification);
                }			

                var textNotification = params.testType == "text" || (params.testType == undefined && desktopNotification == "text");
                var richNotification = params.testType == "rich" || (params.testType == undefined && desktopNotification == "rich");

                if (textNotification || !chrome.notifications) {
                    // text window
                    if (notificationFlagForLabelsOfNewestEmail || params.testType) {					
                        var fromName = await generateNotificationDisplayName(firstEmail);
                        
                        var subject = firstEmail.title;
                        if (subject == null) {
                            subject = "";
                        }
                        
                        var body = firstEmail.getLastMessageText({maxSummaryLetters:101, htmlToText:true});
        
                        if (window.Notification) {
                            
                            var title = "";
                            
                            if (accounts.length >= 2 && await storage.get("displayAccountReceivingEmail")) {
                                title = await firstEmail.account.getEmailDisplayName() + "\n";
                            }
                            
                            if (notificationDisplay == "newEmail") {
                                title += firstEmail.unSnoozed ? getMessage("snoozed") : getMessage("newEmail");
                                body = "";
                            } else if (notificationDisplay == "from") {
                                title += firstEmail.unSnoozed ? getMessage("snoozed") + ": " : "" + fromName;
                                body = "";
                            } else if (notificationDisplay == "from|subject") {
                                title += firstEmail.unSnoozed ? getMessage("snoozed") + ": " : "" + fromName;
                                body = subject;
                            } else {
                                title += formatEmailNotificationTitle(fromName, subject);
                            }
                            
                            body = shortenUrls(body);
                            
                            await new Promise((resolve, reject) => {
                                notification = new Notification(title, {body:body, icon:"/images/icons/icon_48.png", requireInteraction: !DetectClient.isMac()});
                                notification.mail = firstEmail;
                                notification.onclick = function() {
                                    firstEmail.open();
                                    if (notification) {
                                        notification.close();
                                    }
                                }
                                notification.onshow = function() {
                                    resolve();
                                }
                                notification.onclose = function() {
                                    console.log("onclose notification");
                                    notification = null;
                                }
                                notification.onerror = function(e) {
                                    //logError("showNotification error: " + e);
                                    reject("onerror with notification");
                                }
                            });
                            
                            var showNotificationDuration = await storage.get("showNotificationDuration");
                            
                            if (!isNaN(showNotificationDuration)) {
                                if (notification) {
                                    await sleep(seconds(showNotificationDuration));
                                    notification.close();
                                }
                            }
                        } else {
                            var error = "This browser does not support these notifications";
                            console.warn(error);
                            throw new Error(error);
                        }
                    } else {
                        var error = "Notification disabled for this email";
                        console.warn(error);
                        throw new Error(error);
                    }
                } else if (richNotification) {
                    // rich notif
                    
                    console.log("rich params: ", params);

                    var iconUrl = Icons.NOTIFICATION_ICON_URL;
                    
                    var buttons = [];
                    var buttonsWithValues = []; // used to associate button values inside notification object
                    var buttonValue;
                    
                    buttonValue = await storage.get("notificationButton1");

                    if (onlySnoozedEmails && buttonValue == "markAsRead") {
                        // no button
                    } else {
                        await generateNotificationButton(buttons, buttonsWithValues, buttonValue, params.emails);
                    }
                    
                    var buttonValue;
                    if (await shouldShowReducedDonationMsg()) {
                        buttonValue = "reducedDonationAd";
                    } else {
                        buttonValue = await storage.get("notificationButton2");
                    }				
                    await generateNotificationButton(buttons, buttonsWithValues, buttonValue, params.emails);
                    
                    var options;

                    if (params.emails.length == 1) {
                        // single email
                        
                        if (notificationFlagForLabelsOfNewestEmail || params.testType) {
                            var fromName = await generateNotificationDisplayName(firstEmail);
        
                            var subject = "";
                            if (firstEmail.title) {
                                //subject = firstEmail.title.htmlToText();
                                subject = firstEmail.title;
                                if (subject == null) {
                                    subject = "";
                                }
                            }
        
                            options = {
                                type: "basic",
                                title: "",
                                message: "",
                                iconUrl: iconUrl
                            }

                            // Window Chrome notifications can display 2 bold + 3 regular lines
                            // Mac only 1 bold + 2 regular lines
                            // v2 seems new notifs in Windows can't display more lines https://jasonsavard.com/forum/discussion/comment/22748#Comment_22748
                            let manyLinesNotifs = false; //!DetectClient.isMac() && !DetectClient.isChromeOS();

                            if (accounts.length >= 2 && await storage.get("displayAccountReceivingEmail")) {
                                options.title = await firstEmail.account.getEmailDisplayName();
                                if (manyLinesNotifs) {
                                    options.title += "\n";
                                }
                            }

                            let canUseTitle = manyLinesNotifs || !options.title;

                            let confidentialString = firstEmail.unSnoozed ? getMessage("snoozed") : getMessage("newEmail");
                            let prefixString = firstEmail.unSnoozed ? getMessage("snoozed") + ": " : "";
                            
                            if (notificationDisplay == "newEmail") {
                                if (canUseTitle) {
                                    options.title += confidentialString;
                                } else {
                                    options.message = confidentialString;
                                }
                            } else if (notificationDisplay == "from") {
                                if (canUseTitle) {
                                    options.title += prefixString + fromName;
                                } else {
                                    options.message = prefixString + fromName;
                                }
                            } else if (notificationDisplay == "from|subject") {
                                if (canUseTitle) {
                                    options.title += prefixString + fromName;
                                    options.message = subject;
                                } else {
                                    options.message = prefixString + fromName + "\n" + subject;
                                }
                            } else {
                                let emailMessage = firstEmail.getLastMessageText({ maxSummaryLetters: 170, htmlToText: true, EOM_Message: " [" + getMessage("EOM") + "]" });
                                if (!emailMessage) {
                                    emailMessage = "";
                                }
                                emailMessage = shortenUrls(emailMessage);

                                if (canUseTitle) {
                                    options.title += prefixString + formatEmailNotificationTitle(fromName, subject);
                                    options.message = emailMessage;
                                } else {
                                    options.message = prefixString + formatEmailNotificationTitle(fromName, subject) + "\n" + emailMessage;
                                }
                            }
                            
                            if (DetectClient.isChrome()) {
                                options.buttons = buttons;
                            }
                            
                            fetchEmailImagePreview(options, firstEmail, fetchEmailImagePreviewResult => {
                                preloadProfilePhotos(params.emails, async () => {
                                    var email = params.emails.first();
                                    if (email.contactPhoto && email.contactPhoto.src) {									
                                        console.log("iconUrl: " + email.contactPhoto.src);
                                        options.iconUrl = email.contactPhoto.src;
                                    } else {
                                        if (fetchEmailImagePreviewResult && fetchEmailImagePreviewResult.detectedIconUrl) {
                                            console.log("iconUrl2: " + email.contactPhoto.src);
                                            options.iconUrl = fetchEmailImagePreviewResult.detectedIconUrl;
                                        }
                                    }
                                    await createNotification({
                                        options: options,
                                        buttonsWithValues: buttonsWithValues,
                                        emails: params.emails
                                    });
                                    if (notificationFlagForLabelsOfNewestEmail) {
                                        return;
                                    } else {
                                        return NOTIFICATION_DISABLE_WARNING;
                                    }
                                });
                            });
                        } else {
                            var warning = "Notification disabled for this email";
                            console.warn(warning);
                            return warning;
                        }
                    } else {
                        var items = [];
                        
                        await asyncForEach(params.emails, async (email, index) => {
                            
                            console.log("item.push:", email);
                            let prefix = email.unSnoozed ? getMessage("snoozed") + ": " : "";
                            
                            var subject = email.title;
                            if (subject) {
                                subject = subject.htmlToText();
                            }
                            if (!subject) {
                                subject = "";
                            }
                            
                            var item = {};
                            
                            if (notificationDisplay == "from") {
                                item.title = prefix + await generateNotificationDisplayName(email);
                                item.message = "";
                            } else if (notificationDisplay == "from|subject") {
                                item.title = prefix + await generateNotificationDisplayName(email);
                                item.message = subject;
                            } else {
                                item.title = prefix + formatEmailNotificationTitle(await generateNotificationDisplayName(email), subject);
                                var message = email.getLastMessageText();
                                if (message) {
                                    message = message.htmlToText();
                                }
                                if (!message) {
                                    message = "";
                                }
                                item.message = message;
                            }
                            
                            items.push(item);
                        });

                        options = {
                            message: "",
                            iconUrl: iconUrl
                        }
                        
                        if (DetectClient.isChrome()) {
                            options.buttons = buttons;
                        }

                        if (notificationDisplay == "newEmail") {
                            options.type = "basic";
                        } else {
                            if (false) { // commented because native Windows notifications didnt actually list more than 1 item... DetectClient.isChrome()
                                options.type = "list";
                                options.items = items;
                            } else {
                                options.type = "basic";
                                var str = "";
                                items.forEach((item, index) => {
                                    str += item.title; // + " - " + item.message.summarize(10);
                                    if (index < items.length-1) {
                                        str += "\n";
                                    }
                                });
                                options.message = str;
                            }
                        }

                        var newEmailsCount;
                        // because i use a max fetch the total unread email count might not be accurate - so if user is just signing in or startup then fetch the totalunread instead of the emails.length  
                        if (await storage.get("accountAddingMethod") == "oauth" && (params.source == Source.SIGN_IN || params.source == Source.STARTUP)) {
                            newEmailsCount = params.totalUnread;
                        } else {
                            newEmailsCount = params.newEmails.length;
                        }

                        options.title = "";
                        if (params.unsnoozedEmails.length) {
                            options.title += getMessage("XSnoozedEmails", [params.unsnoozedEmails.length]);
                            if (newEmailsCount) {
                                options.title += "\n";
                            }
                        }
                        if (newEmailsCount) {
                            options.title += getMessage("XNewEmails", [newEmailsCount]);
                        }

                        await createNotification({
                            options: options,
                            buttonsWithValues: buttonsWithValues,
                            emails: params.emails
                        });
                    }
                } else {
                    // notification are probably set to Off
                    return "Notification settings are incorrect";
                }							
            } else {
                console.info("failed: passedDoNotShowNotificationIfGmailTabOpenTest");
            }
        }
    } else {
        return "Notifications are probably disabled in the extension";
    }
}

async function showNotificationTest(params = {}) {
    const response = await ensureUserHasUnreadEmails();
    if (response.hasUnreadEmails) {
        
        if (params.showAll) {
            // fetch all unread emails
            params.newEmails = getAllUnreadMail(accounts);
        } else {
            // first only one unread email			
            var email;
            if (accountWithNewestMail) {
                email = accountWithNewestMail.getNewestMail();			
                if (!email) {
                    // else get most recent mail (not the newest because it might not have been fetch recently, this shwnotif could be done after a idle etc.)
                    email = accountWithNewestMail.getMails().first();
                }
            }
            if (!email) {
                email = getAnyUnreadMail();
            }
            
            // put one email into array to pass to shownotification
            params.newEmails = [email];
        }
        
        let timeoutLength;
        if (notification) {
            timeoutLength = 500;
            notification.close();
        } else {
            timeoutLength = 0;
        }
        await sleep(timeoutLength);
        await showNotification(params).then(warning => {
            if (warning) {
                throw new Error(warning);
            }
        }).catch(error => {
            throw new Error("Error: " + error + " You might have disabled the notifications");
        });
    } else {
        throw new Error(params.requirementText);
    }
}

async function createNotification(params) { // expected args: options, buttonsWithValues, emails
    // remove previous notifications
    await clearRichNotification(await storage.get("_richNotifId"));

    // let's identify my notification with the mini icon IF we aren't already showing the extension logo in the notification iconurl
    if (DetectClient.isWindows() && params.options.iconUrl != Icons.NOTIFICATION_ICON_URL) {
        params.options.appIconMaskUrl = Icons.APP_ICON_MASK_URL;
    }
    if (DetectClient.isFirefox()) {
        params.options.priority = 2;
    } else {
        // if never and disble requireInteraction and chrome "show notifications in action center" then they will automatically go into action center after ~5 seconds
        // requireInteraction will awake computer if screen is off
        if (!DetectClient.isMac() && !await storage.get("moveIntoActionCenter")) {
            params.options.requireInteraction = true;
        }
        params.options.silent = true; // only disables Windows notification sound (Chrome 71 still turns screen on)
    }
    
    var showNotificationDuration = await storage.get("showNotificationDuration");
    
    if (showNotificationDuration != "infinite") {
        setTimeout(async () => {
            const richNotifId = await storage.get("_richNotifId");
            if (richNotifId) {
                console.log("timeout close notif");
                window.notificationClosedByDuration = true;
                clearRichNotification(richNotifId);
            }
        }, seconds(showNotificationDuration));
    }

    console.log("show notif", params.options, new Date());
    return new Promise((resolve, reject) => {
        chrome.notifications.create("", params.options, notificationId => {
            if (chrome.runtime.lastError) {
                console.error("create error: " + chrome.runtime.lastError.message);
                if (!params.secondAttempt && chrome.runtime.lastError.message.indexOf("Unable to download all specified images") != -1) {
                    params.options.iconUrl = Icons.NOTIFICATION_ICON_URL;
                    params.secondAttempt = true;
                    createNotification(params).then(notificationId => {
                        resolve(notificationId);
                    }).catch(error => {
                        reject(error);
                    });
                } else {
                    reject(chrome.runtime.lastError.message);
                }
            } else {
                storage.set("_richNotifId", notificationId);
                storage.set("_richNotifButtonsWithValues", params.buttonsWithValues);
                resolve(notificationId);
            }
        });
    });
}

function getChromeWindowOrBackgroundMode() {
	return new Promise((resolve, reject) => {
		if (chrome.permissions && !DetectClient.isFirefox()) { // ff returns error when tring to detedt "background" permission
			chrome.permissions.contains({permissions: ["background"]}, function(result) {
                if (chrome.runtime.lastError) {
                    console.warn(chrome.runtime.lastError.message);
                    resolve(false);
                } else {
                    resolve(result);
                }
			});
		} else {
			resolve(false);
		}
	}).then(result => {
		return new Promise((resolve, reject) => {
			if (result) {
				resolve();
			} else {
				chrome.windows.getAll(null, function(windows) {
					if (windows && windows.length) {
						resolve();
					} else {
						reject("No windows exist");
					}
				});
			}
		});
	});
}

async function checkEmails(source) {
    await getChromeWindowOrBackgroundMode();
    let intervalStopped = false;
    if (source == "wentOnline" || source == "wakeupFromSleep") {
        if (checkingEmails) {
            console.log("currently checking emails so bypass instant check");
            return;
        } else {
            intervalStopped = true;
            console.log("check now for emails");
            // stop checking interval
            clearInterval(checkEmailTimer);
        }
    }
    
    checkingEmails = true;
    const allEmailsCallbackParams = await getAllEmails({accounts:accounts});
    await mailUpdate({
        showNotification: true,
        allEmailsCallbackParams: allEmailsCallbackParams
    });
    checkingEmails = false;

    if (intervalStopped) {
        // resume checking interval
        restartCheckEmailTimer();
    }

    return allEmailsCallbackParams;
}

async function startCheckEmailTimer() {
	var pollIntervalTime = await calculatePollingInterval(accounts);
	
	if (pollIntervalTime == "realtime") {
		pollIntervalTime = minutes(5);
	} else {
		// make sure it's not a string or empty because it will equate to 0 and thus run all the time!!!
		// make sure it's not too small like 0 or smaller than 15 seconds
		if (isNaN(pollIntervalTime) || parseInt(pollIntervalTime) < seconds(15)) {
			pollIntervalTime = seconds(30);
		}
	}
	
    console.log("polling interval: " + (pollIntervalTime / ONE_SECOND) + "s");
    clearInterval(checkEmailTimer); // need to add this here also, sometimes we had quick consecutive calls and lots of getHistory polling, probably due to lingering watches from adding and removing the account often
	checkEmailTimer = setIntervalSafe(function() {
		checkEmails("interval");
	}, pollIntervalTime);
}

function restartCheckEmailTimer(immediately) {
	console.log("restarting check email timer")
	clearInterval(checkEmailTimer);
	
	// wait a little bit before restarting timer to let it's last execution run fully
	setTimeout(function() {
		startCheckEmailTimer();
	}, immediately ? 0 : seconds(30));
}

function shortcutNotApplicableAtThisTime(title) {
	var notif;
	var body = "Click here to remove this shortcut.";
	notif = new Notification(title, {body:body, icon:"/images/icons/icon_48.png"});
	notif.onclick = function() {
		openUrl("https://jasonsavard.com/wiki/Keyboard_shortcuts");
		this.close();
	}
}

// execute action on all mails
function executeAction(mails, actionName) {
	if (mails.length <= MAX_EMAILS_TO_ACTION) {
		var promises = [];
		
		mails.forEach(mail => {
			var promise = mail[actionName]({instantlyUpdatedCount:true});
			promises.push(promise);
		});
		
		Promise.all(promises).then(async () => {
			if (actionName != "star" && actionName != "starAndArchive") {
				if (await storage.get("accountAddingMethod") == "oauth") {
					ls["unreadCount"] = lsNumber("unreadCount") - mails.length;
				}
				updateBadge(lsNumber("unreadCount"));
			}
		}).catch(async error => {
			var extensionConflictFlag = await storage.get("accountAddingMethod") == "autoDetect";
			showCouldNotCompleteActionNotification(error, extensionConflictFlag);
		});
	} else {
		showMessageNotification("Too many emails to " + actionName + " , please use the Gmail webpage!", error);
		mails.first().account.openInbox();
	}
}

async function openInPopup(params = {}) {
	let url = getPopupFile() + "?source=notification";
	
	if (params.previewMail) {
        const notifMails = await restoreLastNotifParams(true);
        if (notifMails.length == 1) {
            const mail = notifMails.first();
            url += "&previewMailId=" + mail.id;
        }
	}

    const LS_POPUP_WINDOW_ID = "_popupWindowId";
    const windowId = localStorage[LS_POPUP_WINDOW_ID];
	if (windowId) {
		localStorage.removeItem(LS_POPUP_WINDOW_ID);
		chrome.windows.remove(parseInt(windowId), () => {
            if (chrome.runtime.lastError) {
                //console.warn(chrome.runtime.lastError.message);
            }
        });
	}
	
	const createWindowParams = await getPopupWindowSpecs({
        width: await storage.get("popupWidth"),
        height: await storage.get("popupHeight"),
        url: url,
        openPopupWithChromeAPI: true
    });
	chrome.windows.create(createWindowParams, newWindow => {
		localStorage[LS_POPUP_WINDOW_ID] = newWindow.id;
	});

	if (params.notificationId) {
		clearRichNotification(params.notificationId);
	}
}

async function performButtonAction(params) {
    console.log("notificationButtonValue: " + params.notificationButtonValue);
    const notifMails = await restoreLastNotifParams(true);
	
	// actions...
	if (params.notificationButtonValue == "markAsRead") {
		executeAction(notifMails, "markAsRead");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "delete") {
		executeAction(notifMails, "deleteEmail");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "archive") {
		executeAction(notifMails, "archive");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "spam") {
		executeAction(notifMails, "markAsSpam");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "star") {
		executeAction(notifMails, "star");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "starAndArchive") {
		executeAction(notifMails, "starAndArchive");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "open" || params.notificationButtonValue == "openInNewTab") {
		var openParams = {};
		if (params.notificationButtonValue == "openInNewTab") {
			openParams.openInNewTab = true;
		}
		
		if (notifMails.length == 1) {
			notifMails.first().open(openParams);
		} else {
			notifMails.first().account.openInbox(openParams);
		}
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "openInPopup" || params.notificationButtonValue == "replyInPopup") {
        params.previewMail = true;
		openInPopup(params);
	} else if (params.notificationButtonValue == "reply") {
		if (notifMails.length == 1) {
			notifMails.first().reply();
		} else {
			notifMails.first().account.openInbox();
		}
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "markDone") {
		executeAction(notifMails, "archive");
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "dismiss") {
		clearRichNotification(params.notificationId);
	} else if (params.notificationButtonValue == "reducedDonationAd") {
		await storage.enable("reducedDonationAdClicked");
		openUrl("donate.html?ref=reducedDonationFromNotif");
		clearRichNotification(params.notificationId);
	} else {
		logError("action not found for notificationButtonValue: " + params.notificationButtonValue);
	}
	
	//sendGA("richNotification", params.notificationButtonValue);
}

function markAllAsRead() {
	accounts.forEach(account => {
		if (account.unreadCount >= 1) {
			if (account.unreadCount > MAX_EMAILS_TO_ACTION) {
				alert(getMessage("tooManyUnread", MAX_EMAILS_TO_ACTION));
			} else {
				markAllAsX(account, "markAsRead").then(() => {
					// do nothing
				}).catch(error => {
					alert(error);
				});
			}
		}
	});
}

function createContextMenu(id, text, params = {}) {
    if (id) {
        params.id = id;
    }

	if (!params.title && text) {
		params.title = text;
	}

	if (!params.contexts) {
		params.contexts = ["browser_action"];
	}

	return chrome.contextMenus.create(params);
}

async function initWebRequest() {
    chrome.webRequest.onCompleted.addListener(
        async function(details) {
            if (await storage.get("voiceInput")) {
                console.log("oncomplete webrequest:", details);
                
                if (details.url && details.url.indexOf("https://mail.google.com/mail/mu/") != -1) {
                    // don't load speech for these
                } else {
                    // added timeout because in compose popup window it seems the inserts were not working
                    await sleep(200);
                    insertSpeechRecognition(details.tabId);
                }
            }
            
            if (await storage.get("playVideosInsideGmail")) {
                if (details.url && details.url.indexOf("https://mail.google.com/mail/mu/") != -1) {
                    // don't load for these
                } else {
                    // added timeout because in compose popup window it seems the inserts were not working
                    await sleep(200);
                    chrome.tabs.executeScript(details.tabId, {file:"/js/playVideos.js", allFrames:false});
                }
            }
        },
        {
            types:	["sub_frame"],
            urls:	["*://mail.google.com/*"]
        }
    );
}

async function restoreLastNotifParams(emailsOnly) {
    let lastShowNotifParams = await storage.get("_lastShowNotifParams");
    if (lastShowNotifParams) {
        lastShowNotifParams = convertAccountsToObjects(lastShowNotifParams);
        if (emailsOnly) {
            if (lastShowNotifParams.emails) {
                return convertMailsToObjects(lastShowNotifParams.emails);
            } else {
                return [];
            }
        } else {
            lastShowNotifParams.newEmails = convertMailsToObjects(lastShowNotifParams.newEmails);
            lastShowNotifParams.unsnoozedEmails = convertMailsToObjects(lastShowNotifParams.unsnoozedEmails);
            return lastShowNotifParams;
        }
    }
}

if (chrome.idle.onStateChanged) {
    chrome.idle.onStateChanged.addListener(async newState => {
        // returned from idle state
        console.log("onstatechange: " + newState + " " + now().toString());
        if (newState == "active") {
            ChromeTTS.stop();

            const MIN_SECONDS_BETWEEN_NOTIFICATIONS = 30;
            const lastNotificationDate = await storage.get("_lastNotificationDate");
            if (lsNumber("unreadCount") >= 1 && (Math.abs(lastNotificationDate.diffInSeconds()) > MIN_SECONDS_BETWEEN_NOTIFICATIONS || detectSleepMode.isWakingFromSleepMode()) && await storage.get("_lastNotificationDateWhileActive") < lastNotificationDate) {
                // move parsing inside condition to lessen load
                
                const lastShowNotifParams = await restoreLastNotifParams();
                if (lastShowNotifParams) {
                    lastShowNotifParams.skipSerializing = true;

                    if (lastShowNotifParams && !unreadEmailsChanged(lastShowNotifParams.newEmails) && lastShowNotifParams.newEmails.first().account.lastSuccessfulMailUpdate > lastNotificationDate) {
                        showNotification(lastShowNotifParams);
                    }
                }
            }
        }
    });
}

// for adding mailto links (note: onUpdated loads twice once with status "loading" and then "complete"
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status == "loading") {
        
        var alreadyDetectedInbox = false;
        
        if (tab.url) {
            if (tab.url.indexOf(MAIL_DOMAIN + MAIL_PATH) == 0) {
                ls["_lastCheckedEmail"] = new Date();

                if (accounts) {
                    accounts.some(account => {
                        if (tab.url.indexOf(account.getMailUrl()) == 0) {
                            console.log("Gmail webpage changed: " + tab.url);
                            alreadyDetectedInbox = true;
                            
                            // only fetch emails if user is viewing an email ie. by detecting the email message id ... https://mail.google.com/mail/u/0/?shva=1#inbox/13f577bf07878472
                            if (/\#.*\/[a-z0-9]{16}/.test(tab.url)) {
                                account.getEmails().then(() => {
                                    mailUpdate();
                                }).catch(error => {
                                    // nothing
                                });
                            }
                            
                            return true;
                        }
                    })
                }
            }
            
            if (tab.url.indexOf(MAIL_DOMAIN + MAIL_PATH) == 0 && !alreadyDetectedInbox) {
                console.log("newly signed in")
                pollAccounts({noEllipsis:true, forceResyncAccounts:true, source:Source.SIGN_IN});
            }

            /* new order...
                * 
                * https://mail.google.com/mail/u/0/?logout&hl=en&hlor
                * https://accounts.youtube.com/accounts/Logout2?hl=en&service=mail&ilo=1&ils=…s%3D1%26scc%3D1%26ltmpl%3Ddefault%26ltmplcache%3D2%26hl%3Den&zx=2053747305 
                * http://www.google.ca/accounts/Logout2?hl=en&service=mail&ilo=1&ils=s.CA&ilc…%3D1%26scc%3D1%26ltmpl%3Ddefault%26ltmplcache%3D2%26hl%3Den&zx=-1690400221
                * https://accounts.google.com/ServiceLogin?service=mail&passive=true&rm=false…=https://mail.google.com/mail/&ss=1&scc=1&ltmpl=default&ltmplcache=2&hl=en    
                */
            const PREVENT_CPU_ISSUE_MAX_URL_LENGTH = 1000; // patch to prevent cpu issue when opening a tab with a long url ie. data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...
            if (tab.url.length < PREVENT_CPU_ISSUE_MAX_URL_LENGTH && /.*google\..*\/accounts\/Logout*/i.test(tab.url)) { //if (tab.url.indexOf("://www.google.com/accounts/Logout") != -1) {
                const accountAddingMethod = await storage.get("accountAddingMethod");
                if (accountAddingMethod == "autoDetect") {
                    accounts = [];
                    setSignedOut();
                } else if (accountAddingMethod == "oauth") {
                    // reset account id
                    accounts.forEach(function(account) {
                        account.mustResync = true;
                        account.resyncAttempts = 3;
                    });
                }
            }
        }
    } else if (changeInfo.status == "complete") {

    }
});

if (chrome.webRequest) {
    initWebRequest();
}

if (chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(function(activeInfo) {
        chrome.tabs.get(activeInfo.tabId, function(tab) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
            } else {
                if (tab && tab.url) {
                    if (tab.url.indexOf(MAIL_DOMAIN) != -1) {
                        if (notification) {
                            notification.close();
                        }
                    }
                }
            }
        });
    });
}

if (chrome.storage) {
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        console.log("storage changes " + new Date() + " : ", changes, areaName);
    });
}

if (chrome.commands && DetectClient.isChrome()) {
    chrome.commands.onCommand.addListener(async command => {
        var errorFlag;
        var errorMsg;
        const richNotifId = await storage.get("_richNotifId");
        if (command == "markAsReadInNotificationWindow") {
            errorMsg = "Cannot mark email as read because there are no email notifications visible";
            if (await storage.get("desktopNotification") != "rich") {
                if (notification) {
                    if (notification.mail) {
                        // for when only one email ie. text or notify.html
                        notification.mail.markAsRead();
                        notification.close();
                        
                        if (await storage.get("accountAddingMethod") == "autoDetect") {
                            if (lsNumber("unreadCount") >= 1) {
                                updateBadge(lsNumber("unreadCount")-1);
                            }
                        }
                    }
                } else {
                    errorFlag = true;
                }
            } else {
                // rich notif
                if (richNotifId) {
                    performButtonAction({notificationButtonValue:"markAsRead", notificationId:richNotifId});
                } else {
                    errorFlag = true;
                }
            }
        } else if (command == "openEmailDisplayedInNotificationWindow") {
            errorMsg = "Cannot open email because there are no email notifications visible";
            if (await storage.get("desktopNotification") != "rich") {
                if (notification) {
                    if (notification.mail) {
                        // for when only one email ie. text or notify.html
                        notification.mail.open();
                        notification.close();
                        
                        if (await storage.get("accountAddingMethod") == "autoDetect") {
                            if (lsNumber("unreadCount") >= 1) {
                                updateBadge(lsNumber("unreadCount")-1);
                            }
                        }
                    }
                } else {
                    errorFlag = true;
                }
            } else {
                // rich notif
                if (richNotifId) {
                    performButtonAction({notificationButtonValue:"open", notificationId:richNotifId});
                } else {
                    errorFlag = true;
                }
            }
        } else if (command == "compose") {
            const firstActiveAccount = await getFirstActiveAccount(accounts);
            firstActiveAccount.openCompose();
        } else if (command == "quickComposeEmail") {
            openQuickCompose();
        } else if (command == "refresh") {
            chrome.browserAction.setBadgeText({ text: "..." });
            refreshAccounts();
        } else if (command == "markAllAsRead") {
            markAllAsRead();
        } else if (command == "dnd") {
            getDNDState().then(dndState => {
                if (dndState) {
                    setDND_off();
                } else {
                    setDND_indefinitely();
                }
            });
        }
        
        if (errorFlag) {
            shortcutNotApplicableAtThisTime(errorMsg);
        }
        
    });
}

chrome.runtime.onMessage.addListener(/* DONT USE ASYNC HERE because of return true */ (message, sender, sendResponse) => {
    (async function() {
        try {
            if (message.command == "getMailUrl" && accounts != null && accounts.length > 0) {
                sendResponse({
                    mailUrl: accounts[0].getMailUrl(),
                    openComposeReplyAction: await storage.get("openComposeReplyAction"),
                    popupWindowSpecs: await getPopupWindowSpecs()
                });
            } else if (message.command == "indexedDBSettingSaved") {
                syncOptions.storageChanged({key:message.key});
            } else if (message.command == "openTab") {
                openUrl(message.url);
            } else if (message.command == "openTabInBackground") {
                chrome.tabs.create({ url: message.url, active: false });
            } else if (message.command == "getVoiceInputSettings") {
                sendResponse({
                    voiceInputSuggestions: await storage.get("voiceInputSuggestions"),
                    voiceInputDialect: await storage.get("voiceInputDialect")
                });
            } else if (message.command == "findOrOpenGmailTab") {
                // must use this getaccountsbyemail because can't use message.account (because of onMessage transfer in json so function are lost from account object
                var account = getAccountByEmail(message.account.email);

                const params = {
                    noMatchingTabFunction: url => {
                        sendResponse({
                            noMatchingTab: true,
                            url: url
                        })
                    }
                }
            
                if (message.email) { // opening an email
                    const foundEmail = account.getMails().find(email => email.id == message.email.id);
                    if (foundEmail) {
                        email.open(params);
                    } else {
                        // then try opening inbox
                        // used only if no matching tab found
                        account.openInbox(params);
                    }
                } else { // opening an inbox
                    account.openInbox(params);
                }
            } else if (message.command == "chromeTTS") {
                if (message.stop) {
                    ChromeTTS.stop();
                } else if (message.isSpeaking) {
                    sendResponse(ChromeTTS.isSpeaking());
                } else {
                    await ChromeTTS.queue(message.text);
                    sendResponse();
                }
            } else if (typeof window[message.command] == "function") { // map fn string names directly to calling their fn
                console.log("onMessage: " + message.command);
                await window[message.command](message.params);
                sendResponse();
            }
        } catch (error) {
            console.error(error);
            sendResponse({
                error: error.message ? error.message : error
            });
        }
    })();

    return true;
});

function init() {

	try {
		if (!localStorage.detectedChromeVersion) {
			localStorage.detectedChromeVersion = true;
			DetectClient.getChromeChannel().then(result => {
				console.log("browser detection", result);
				if (result && result.channel != "stable") {
					var notification;
					var title = "You are not using the stable channel of Chrome";
					var body = "Click for more info. Bugs might occur, you can use this extension, however, for obvious reasons, these bugs and reviews will be ignored unless you can replicate them on stable channel of Chrome.";
					notification = new Notification(title, {body:body, icon:"/images/icons/icon_48.png"});
					notification.onclick = function () {
						openUrl("https://jasonsavard.com/wiki/Unstable_browser_channel");
						this.close();
					};
				}
			});
		}
	} catch (e) {
		logError("error detecting chrome version: " + e);
	}
	
	if (!chrome.runtime.onMessage || !window.Promise) {
		openUrl("https://jasonsavard.com/wiki/Old_Chrome_version");
		return;
	}

	chrome.browserAction.setBadgeBackgroundColor({color:[180, 180, 180, 255]});
	if (chrome.browserAction.setBadgeTextColor) {
		chrome.browserAction.setBadgeTextColor({color:"white"});
	}
	chrome.browserAction.setBadgeText({ text: "..." });
	chrome.browserAction.setTitle({ title: getMessage("loadingSettings") + "..." });
	buttonIcon = new ButtonIcon();

	storagePromise.then(async () => {
        setUninstallUrl();

        // START LEGACY

        // Mar 13 2019
        const buttonIconColor = await storage.getRaw("notificationButtonIconColor");
        if (buttonIconColor) {
            await storage.remove("notificationButtonIconColor");
            await storage.set("notificationButtonIcon", buttonIconColor);
        }

        // END LAGACY

        await initMisc({skipStorageInit: true});
        
        if (chrome.contextMenus) {

            createContextMenu(ContextMenu.OPEN_GMAIL, getMessage("openGmailTab"));
            createContextMenu(ContextMenu.COMPOSE, getMessage("compose"));
            createContextMenu(ContextMenu.REFRESH, getMessage("refresh"));

            initQuickContactContextMenu();

            createContextMenu(ContextMenu.DND_MENU, getMessage("doNotDisturb"));
            createContextMenu(ContextMenu.DND_OFF, getMessage("turnOff"), {parentId:ContextMenu.DND_MENU});
            createContextMenu(null, null, {parentId:ContextMenu.DND_MENU, type:"separator"});
            createContextMenu(ContextMenu.DND_30_MIN, getMessage("Xminutes", 30), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_1_HOUR, getMessage("Xhour", 1), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_2_HOURS, getMessage("Xhours", 2), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_4_HOURS, getMessage("Xhours", 4), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_8_HOURS, getMessage("Xhours", 8), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_TODAY, getMessage("today"), {parentId:ContextMenu.DND_MENU});
            createContextMenu(ContextMenu.DND_INDEFINITELY, getMessage("indefinitely"), {parentId:ContextMenu.DND_MENU});
            createContextMenu(null, null, {parentId:ContextMenu.DND_MENU, type:"separator"});
            createContextMenu(ContextMenu.DND_OPTIONS, getMessage("options") + "...", {parentId:ContextMenu.DND_MENU});

            try {
                createContextMenu(ContextMenu.MARK_ALL_AS_READ, getMessage("markAllAsRead"), {visible: false});
            } catch (error) {
                console.warn("visible property might not be supported: " + error);
            }
        }
                
        ls["unreadCount"] = 0;
        buttonIcon.setIcon({signedOut:true});
        initPopup(lsNumber("unreadCount"));

        lastNotificationAccountDates = await storage.get("_lastNotificationAccountDates");

        // call poll accounts initially then set it as interval below
        pollAccounts({showNotification:true, source:Source.STARTUP, refresh:true}).then(() => {
            // set check email interval here
            startCheckEmailTimer();
        }).catch(error => {
            showMessageNotification("Problem starting extension", "Try re-installing the extension.", error);
        });

        async function offlineOnlineChanged(e) {
            console.log("detected: " + e.type + " " + new Date());
            if (e.type == "online") {
                console.log("navigator: " + navigator.onLine + " " + new Date());
                await sleep(seconds(3));
                const accountSummaries = await getAccountsSummary(accounts);
                if (accountSummaries.signedIntoAccounts == 0) {
                    console.log("navigator: " + navigator.onLine);
                    checkEmails("wentOnline");
                }
            }
        }
    
        window.addEventListener('offline', offlineOnlineChanged);
        window.addEventListener('online', offlineOnlineChanged);

        chrome.alarms.create(Alarms.EVERY_MINUTE,           { periodInMinutes: 1 });
        chrome.alarms.create(Alarms.UPDATE_CONTACTS,        { periodInMinutes: 60 * 4 }); // 4 hours (used to be every 24 hours)
        chrome.alarms.create(Alarms.UPDATE_SKINS,           { periodInMinutes: 60 * 24 * 1}); // 1 day (used to be every 2 days)
        chrome.alarms.create(Alarms.UPDATE_UNINSTALL_URL,   { periodInMinutes: 60 * 24 * 1}); // 1 day
        chrome.alarms.create(Alarms.SYNC_SIGN_IN_ORDER,     { periodInMinutes: 60 * 24 * 5 }); // 5 days
        chrome.alarms.create(Alarms.CLEAR_SUBJECTS_SPOKEN,  { periodInMinutes: 60 * 24 * 30 }); // 30 days

        // collect stats on options
        const lastOptionStatsSent = await storage.get("lastOptionStatsSent");
        if (await daysElapsedSinceFirstInstalled() > 14 && (!lastOptionStatsSent || lastOptionStatsSent.daysInThePast() >= 7)) { // start after 2 weeks to give people time to decide and then "every" 7 days after that (to keep up with changes over time)
            console.log("collecting optstats soon...")

            // only send after a timeout make sure ga stats loaded
            chrome.alarms.create(Alarms.COLLECT_STATS, {delayInMinutes: 2});
        }
        
        //console.time("DateTimeHighlighter");
        DateTimeHighlighter();
        //console.timeEnd("DateTimeHighlighter");
	}).catch(error => {
		if (!window.settingsError) {
			logError("starting extension: " + error, error);
			showMessageNotification("Problem starting extension", "Try re-installing the extension.", error);
		}
	});
}

function hasDuplicatedAccount(account) {
	// if duplicate email found then let's stop before it repeats
	for (var a=0; a<accounts.length; a++) {
		if (account.getEmail() == accounts[a].getEmail()) {
			console.info("duplicate account " + account.getEmail() + " found so stop finding accounts, total: " + accounts.length);
			return true;
		} else {
			console.info("valid account: " + a + " [" + account.getEmail() + "] (" + account.link + ") AND [" + accounts[a].getEmail() + "] (" + accounts[a].link + ")");
		}
	}
	
	for (var a=0; a<ignoredAccounts.length; a++) {
		if (ignoredAccounts[a].getEmail() == account.getEmail()) {
			console.info("duplicate 'ignored' account " + account.getEmail() + " found so stop finding accounts, total: " + accounts.length);
			return true;
		}
	}
}

async function addAccount(account) {
	if (await account.getSetting("ignore")) {
		console.info("initMailAccount - ignored");
		ignoredAccounts.push(account);
	} else {
		// success
		console.info("Adding account: " + account.getEmail());
		accounts.push(account);
	}
}

async function initMailAccount(params) {
    const MAX_ACCOUNTS = 20;
    
    buttonIcon.stopAnimation();
    
    var tokenResponse = await oAuthForEmails.findTokenResponseByIndex(params.accountNumber);
    let email;
    if (tokenResponse && tokenResponse.userEmail) {
        email = tokenResponse.userEmail;
    }
    
    // when using auto-detect use the accountnumber and eventually the email will get populated with the fetch
    // when using oauth use the email passed in here to fetch the appropriate data
    var account = new Account();
    account.init({
        accountNumber:  params.accountNumber,
        email:          email
    });

    var safeAmountOfAccountsDetected = params.accountNumber <= MAX_ACCOUNTS && isOnline();
    var continueToNextAccount;
    var deleteAccount;
    
    try {
        await account.fetchGmailSettings(params);
    } catch (error) {
        // do nothing continue to next then below
        if (!DetectClient.isFirefox()) {
            console.error("Error fetching Gmail settings: " + error);
        }
    }

    try {
        await account.getEmails();
        console.info("Detected account: " + account.getEmail());

        // maximum accounts, if over this we might be offline and just gettings errors for each account
        if (safeAmountOfAccountsDetected) {
            if (hasDuplicatedAccount(account)) {
                deleteAccount = true;
            } else {
                await addAccount(account);
                continueToNextAccount = true;	    			
            }
        } else {
            if (isOnline()) {
                logError("jmax accounts reached");
            } else {
                console.warn("Not online so not detecting accounts");
            }
        }
    } catch (error) {
        if (safeAmountOfAccountsDetected) {
            if (hasDuplicatedAccount(account)) {
                deleteAccount = true;
            } else {
                // test for error.toLowerCase because error could be an Error object (which doesn't have a .toLowerCase)
                if (error && (new String(error).toLowerCase() == "unauthorized" || error.errorCode == ErrorCodes.UNAUTHORIZED)) { // not signed in
                    console.log("Unauthorized");
                    unauthorizedAccounts++;
                    deleteAccount = true;
                    // if offline then watch out because all accounts will return error, but not unauthorized, so must stop from looping too far
                    // if too many unauthorized results than assume they are all signed out and exit loop, else continue looping
                    var maxUnauthorizedAccount = parseInt(await storage.get("maxUnauthorizedAccount"));
                    if (unauthorizedAccounts < maxUnauthorizedAccount) {
                        continueToNextAccount = true;
                    }
                } else if (error.errorCode == JError.GOOGLE_ACCOUNT_WITHOUT_GMAIL || error.errorCode == JError.GMAIL_NOT_ENABLED || error.errorCode == JError.GOOGLE_SERVICE_ACCOUNT) {
                    console.log("Recognized error: " + error.errorCode);
                    await addAccount(account)
                    continueToNextAccount = true;
                } else if (accounts.length && accounts.last().error) {
                    // if consecutive accounts with errors let's quit - trying to avoid the locked account condition
                    console.error("Consecutive accounts with errors so not looking for anymore");
                    deleteAccount = true;
                } else if (account.hasBeenIdentified()) {
                    console.info("Adding error account: " + account.getEmail(), error);
                    account.error = error;
                    await addAccount(account)
                    continueToNextAccount = true;
                } else {
                    // timeout checking 2nd account on Chrome startup: happened on ME's Mac causing unread count issue because that 2nd account was set to be ignored
                    console.info("Error account: " + account.getEmail(), error);
                    deleteAccount = true;
                    continueToNextAccount = true;
                }
            }
        } else {
            // Error on last one most probably they were all errors ie. timeouts or no internet so reset all accounts to 0
            accounts = [];
            console.info("mailaccount - probably they were all errors");
        }
    }

    if (deleteAccount) {
        account = null;
        delete account;
    }
    
    if (continueToNextAccount) {
        params.accountNumber++;
        await initMailAccount(params);
    }
}

async function pollAccounts(params = {}) {
    if (pollingAccounts && !params.refresh) {
        console.log("currently polling: quit polling me!")
    } else {
        try {
            console.log("poll accounts...");
            
            pollingAccounts = true;
            
            if (!params.noEllipsis) { 
                chrome.browserAction.setBadgeText({ text: "..." });
            }	
            chrome.browserAction.setTitle({ title: getMessage("pollingAccounts") + "..." });

            if (await storage.get("accountAddingMethod") == "autoDetect") {
                if (accounts != null) {
                    accounts.forEach(account => {
                        account = null;
                        delete account;
                    });
                }
                
                accounts = [];
                ignoredAccounts = [];
                unauthorizedAccounts = 0; 
                
                params.accountNumber = 0;
                await initMailAccount(params);
            } else { // manual adding
                if (params.source == Source.STARTUP || params.refresh) {
                    await alwaysPromise(initOauthAccounts());
                }
                await getAllEmails({accounts:accounts, refresh:true});
            }

            var accountsSummary = await getAccountsSummary(accounts);
            
            if (accountsSummary.signedIntoAccounts == 0) {
                setSignedOut({title:accountsSummary.firstNiceError});
            } else {
                // see if i should unlock this user...
                if (!await storage.get("verifyPaymentRequestSent")) {
                    verifyPayment(accounts).then(response => {
                        if (response.unlocked) {
                            Controller.processFeatures();
                        }
                    });
                    await storage.enable("verifyPaymentRequestSent");
                }
                await mailUpdate(params);
            }
        } catch (error) {
            throw error;
        } finally {
            pollingAccounts = false;
        }
    }
}

async function getSettingValueForLabels(account, settings = {}, labels, defaultObj) {
    const accountAddingMethod = await storage.get("accountAddingMethod");
    const monitoredLabels = await account.getMonitorLabels();

	var customLabel;
	var systemLabel;

	if (labels) {
		for (var a=labels.length-1; a>=0; a--) {
			var label = labels[a];
			var labelId = getJSystemLabelId(label, accountAddingMethod);
			settingValue = settings[labelId];
			if (typeof settingValue != "undefined" && account.hasMonitoredLabel(labelId, monitoredLabels)) {
				// if system label then save it but keep looking for custom label first!
				if (isSystemLabel(label)) {
					systemLabel = settingValue;
				} else {
					customLabel = settingValue;
					break;
				}
			}
		}
	}
	
	// test for undefined because we could have "" which means Off
	if (customLabel != undefined) {
		return customLabel;
	} else if (systemLabel != undefined) {
		return systemLabel;
	} else {
		return defaultObj;
	}
}

// Called when an account has received a mail update
async function mailUpdate(params = {}) {
	buttonIcon.stopAnimation();
	
	updateNotificationTray();

	// if this mailUpdate is called from interval then let's gather newest emails ELSE we might gather later in the code
	var newEmails = [];
	if (params.allEmailsCallbackParams) {
		params.allEmailsCallbackParams.forEach(allEmailsCallback => {
			if (allEmailsCallback.newestMailArray && allEmailsCallback.newestMailArray.length) {
				console.log("allEmailsCallback.newestMailArray:", allEmailsCallback.newestMailArray);
				newEmails = newEmails.concat(allEmailsCallback.newestMailArray);
			}
		});
	}

	var totalUnread = 0;
	var lastMailUpdateAccountWithNewestMail;
	let unsnoozedEmails = [];
	
	accounts.forEach(account => {
		if (!account.error) {
			if (account.getUnreadCount() > 0) {
				totalUnread += account.getUnreadCount();
			}
			account.lastSuccessfulMailUpdate = new Date();
		}

		if (account.getNewestMail()) {
			if (!lastMailUpdateAccountWithNewestMail || !lastMailUpdateAccountWithNewestMail.getNewestMail() || account.getNewestMail().issued > lastMailUpdateAccountWithNewestMail.getNewestMail().issued) {
				lastMailUpdateAccountWithNewestMail = account;
			}

			if (!params.allEmailsCallbackParams) {
				newEmails = newEmails.concat(account.getAllNewestMail());
			}
		}

		let accountUnSnoozedEmails = account.getUnsnoozedEmails();
		if (accountUnSnoozedEmails.length) {
			unsnoozedEmails = unsnoozedEmails.concat(accountUnSnoozedEmails);
		}
	});
	
	if (!params.instantlyUpdatedCount) {
		updateBadge(totalUnread);
	}
	
	newEmails.sort(function (a, b) {
	   if (a.issued > b.issued)
		   return -1;
	   if (a.issued < b.issued)
		   return 1;
	   return 0;
	});
	
	if (newEmails.length || unsnoozedEmails.length) {
		var mostRecentNewEmail = newEmails.first();

		var passedDateCheck = false;
		if (mostRecentNewEmail) {
			accountWithNewestMail = mostRecentNewEmail.account;
		
			if (await storage.get("showNotificationsForOlderDateEmails")) {
				if (accountWithNewestMail.getMails().length < 20) {
					passedDateCheck = true;
				} else {
					console.warn("more than 20 emails so bypassing check for older dated emails");
					if (mostRecentNewEmail.issued > lastNotificationAccountDates[accountWithNewestMail.id]) {
						passedDateCheck = true;
					}
				}
			} else {
				if (mostRecentNewEmail.issued > lastNotificationAccountDates[accountWithNewestMail.id]) {
					passedDateCheck = true;
				}
			}
		} else {
			accountWithNewestMail = null;
		}
		
		if (unsnoozedEmails.length || !lastNotificationAccountDates[accountWithNewestMail.id] || passedDateCheck) {
			
			if (mostRecentNewEmail) {
                lastNotificationAccountDates[accountWithNewestMail.id] = mostRecentNewEmail.issued;
                storage.set("_lastNotificationAccountDates", lastNotificationAccountDates);
			}

			// new
			var newestMailObj = await storage.get("_newestMail");
			if (unsnoozedEmails.length || newestMailObj[accountWithNewestMail.getEmail()] != mostRecentNewEmail.id) {

				if (params.source != Source.STARTUP || (params.source == Source.STARTUP && await storage.get("showNotificationsOnStartup"))) {
					getDNDState().then(function(dndState) {
						if (!dndState) {
							buttonIcon.startAnimation();
						}
					});

                    const notificationSound = await storage.get("notificationSound");
                    let recentEmailSoundSource;
					if (mostRecentNewEmail) {
                        const sounds = await accountWithNewestMail.getSetting("sounds");
						recentEmailSoundSource = await getSettingValueForLabels(accountWithNewestMail, sounds, mostRecentNewEmail.labels, notificationSound);
					} else {
						recentEmailSoundSource = null;
                    }
                    storage.set("_recentEmailSoundSource", recentEmailSoundSource);

					// show notification, then play sound, then play voice
					if (params.showNotification) {
						// save them here for the next time i call showNotification when returning from idle
						params.totalUnread = totalUnread;
						params.newEmails = newEmails;
                        params.unsnoozedEmails = unsnoozedEmails;

						showNotification(params)
							.catch(error => {
								// do nothing but must catch it to continue to next then
								console.error("show notif error", error);
							})
							.then(() => {
								if (notificationSound) {
									playNotificationSound(recentEmailSoundSource).then(() => {
										playVoiceNotification(accountWithNewestMail);
									});
								} else {
									playVoiceNotification(accountWithNewestMail);
								}
							})
						;
					} else if (notificationSound) {
						playNotificationSound(recentEmailSoundSource).then(() => {
							playVoiceNotification(accountWithNewestMail);
						});
					} else {
						playVoiceNotification(accountWithNewestMail);
					}
				}
				
				if (mostRecentNewEmail) {
					newestMailObj[accountWithNewestMail.getEmail()] = mostRecentNewEmail.id;
					await storage.set("_newestMail", newestMailObj);
				}
			}
		}
	}
	
    ls["unreadCount"] = totalUnread;
	initPopup(lsNumber("unreadCount"));
	
	// update the uninstall url caused we detected an email
	const firstActiveEmail = await getFirstActiveEmail(accounts);
	if (await storage.get("_uninstallEmail") != firstActiveEmail) {
		setUninstallUrl(firstActiveEmail);
    }
    
    //await serializeAccounts(accounts);
}

// if any of the mails do not exist anymore than assume one has been read/deleted
function unreadEmailsChanged(mails) {
	if (mails) {
		var allUnreadMail = getAllUnreadMail(accounts);
		var mailsStillUnreadCount = 0;
		for (var a = 0; a < mails.length; a++) {
			for (var b = 0; b < allUnreadMail.length; b++) {
				if (mails[a] && allUnreadMail[b] && mails[a].id == allUnreadMail[b].id) {
					mailsStillUnreadCount++;
				}
			}
		}
		return mails.length != mailsStillUnreadCount;
	}
}

async function updateNotificationTray() {
    const notifMails = await restoreLastNotifParams(true);
	if (unreadEmailsChanged(notifMails)) {
		clearRichNotification(await storage.get("_richNotifId"));
	}
}

async function setSignedOut(params = {}) {
	console.log("setSignedOut");
	
	buttonIcon.setIcon({signedOut:true});
	chrome.browserAction.setBadgeBackgroundColor({color:[180, 180, 180, 255]});
	chrome.browserAction.setBadgeText({ text: "X" });
	if (params.title) {
		chrome.browserAction.setTitle({ title: String(params.title) });
	} else {
		chrome.browserAction.setTitle({ title: getMessage("notSignedIn") });
	}
	if (await storage.get("accountAddingMethod") == "autoDetect") {
		ls["unreadCount"] = 0;
    }
    storage.remove("_lastShowNotifParams");
}

function playNotificationSound(source) {
	return new Promise((resolve, reject) => {
		if (!notificationAudio) {
			notificationAudio = new Audio();
		}

		var audioEventTriggered = false;
		
		getDNDState().then(async dndState => {
			if (dndState || source == "") {
				resolve();
			} else {

				if (!source) {
					source = await storage.get("notificationSound");
				}

				var changedSrc = lastNotificationAudioSource != source;
				
				// patch for ogg might be crashing extension
				// patch linux refer to mykhi@mykhi.org
				if (DetectClient.isLinux() || changedSrc) {
					if (source.indexOf("custom_") == 0) {
						var sounds = await storage.get("customSounds");
						if (sounds) {
							// custom file selectd
							sounds.forEach(sound => {
								if (source.replace("custom_", "") == sound.name) {
									console.log("loadin audio src")
									notificationAudio.src = sound.data;
								}
							});
						}					
					} else {
						console.log("loadin audio src")
						notificationAudio.src = SOUNDS_FOLDER + source;
					}
               }
               lastNotificationAudioSource = source;
			   
               function audioStopped(type) {
                    // ignore the abort event when we change the .src
                    if (!(changedSrc && type == "abort") && !audioEventTriggered) {
                        audioEventTriggered = true;
                        resolve();
                    }
                }

                function addListener(type) {
                    notificationAudio.removeEventListener(type, audioStopped);
                    notificationAudio.addEventListener(type, audioStopped, true);
                }
                
                addListener("ended");
                addListener("abort");
                addListener("error");
			   
               notificationAudio.volume = await storage.get("notificationSoundVolume") / 100;
               try {
                   notificationAudio.play();
               } catch (error) {
                   console.warn("might have stopped sign via close notif before play started: " + error);
               }
			}
		}).catch(error => {
			resolve();
		});
	});
}

async function getVoiceMessageAttachment(mail) {
	var found;
	var promise;
	
	var lastMessage = mail.messages.last();
	
	var hasVoiceMessageAttachment;
	if (lastMessage.files && lastMessage.files.length && lastMessage.files[0].filename.indexOf(VOICE_MESSAGE_FILENAME_PREFIX + ".") != -1) {
		hasVoiceMessageAttachment = true;
	}
	
	if ((mail.authorMail && mail.authorMail.indexOf("vonage.") != -1) || (lastMessage.content && lastMessage.content.indexOf(VOICE_MESSAGE_FILENAME_PREFIX + ".") != -1) || hasVoiceMessageAttachment) {
		if (await storage.get("accountAddingMethod") == "autoDetect") {
			var attachmentNodes = parseHtml(lastMessage.content).querySelectorAll(".att > tbody > tr");
			if (attachmentNodes.length) {
				var soundImage = attachmentNodes[0].querySelector("imghidden[src*='sound']");
				if (soundImage) {
					fixRelativeLinks(attachmentNodes[0], mail);
					var soundSrc = soundImage.parentElement.getAttribute("href");
					// make sure it's from the google or we might be picking up random links that made it all the way to this logic
					if (soundSrc && soundSrc.indexOf("google.com") != -1) {
						found = true;
						// just returns the souce src;
						promise = Promise.resolve(soundSrc);
					}
				}
			}
		} else {
			if (lastMessage.files && lastMessage.files.length) {
				var file = lastMessage.files.first();
				if (file.mimeType && file.mimeType.indexOf("audio/") != -1) {
					found = true;
					promise = new Promise(function(resolve, reject) {
						// create sub promise to return a concatenated sound src to play in audio object ie. data: + mimetype + response.data
						mail.account.fetchAttachment({messageId:lastMessage.id, attachmentId:file.body.attachmentId, size:file.body.size}).then(function(response) {
							resolve("data:" + file.mimeType + ";base64," + response.data);
						}).catch(function(error) {
							reject(error);
						});
					});
				}
			}
		}
	}
	
	return {found:found, promise:promise}
}

async function playVoiceNotification(accountWithNewestMail) {
	console.log("playVoiceNotification");
	
	// moved this outside of timeout in queueVoice() to try avoiding returning null on newestEmail
	var newestEmail = accountWithNewestMail.getNewestMail();
	
	async function queueVoice() {

		// put a bit of time between chime and voice
		await sleep(seconds(1));
        if (newestEmail) {
            
            const voices = await accountWithNewestMail.getSetting("voices");
            var voiceHear = await getSettingValueForLabels(accountWithNewestMail, voices, newestEmail.labels, await storage.get("voiceHear"));

            if (voiceHear) {
                
                var hearFrom = voiceHear.indexOf("from") != -1;
                var hearSubject = voiceHear.indexOf("subject") != -1;
                var hearMessage = voiceHear.indexOf("message") != -1;
                
                var fromName = await generateNotificationDisplayName(newestEmail);
                
                // filter for speech
                
                if (newestEmail.authorMail && newestEmail.authorMail.indexOf("vonage.") != -1) {
                    // put vonage instead because or elee the phone number is spoken like a long number ie. 15141231212 etc...
                    fromName = "Vonage";
                }

                var subject = newestEmail.title;
                subject = cleanEmailSubject(subject);

                var introToSay = "";
                var messageToSay = "";
                
                var voiceMessageAttachmentObj = await getVoiceMessageAttachment(newestEmail);
                
                if (hearFrom) {
                    if (hearSubject || hearMessage) {
                        // from plus something else...
                        introToSay = getMessage("NAME_says", fromName);
                    } else {
                        // only from
                        introToSay = getMessage("emailFrom_NAME", fromName);
                    }
                } 
                    
                if ((hearSubject || hearMessage) && !voiceMessageAttachmentObj.found) {
                    const subjectsSpoken = await storage.get("_subjectsSpoken");
                    if (hearSubject && !subjectsSpoken[subject] && !/no subject/i.test(subject) && !/sent you a message/i.test(subject)) {
                        subjectsSpoken[subject] = "ALREADY_SAID";
                        storage.set("_subjectsSpoken", subjectsSpoken);
                        messageToSay += subject.htmlToText();
                    } else {
                        console.log("omit saying the subject line")
                    }
                    
                    if (hearMessage) {
                        var spokenWordsLimit = await storage.get("spokenWordsLimit");
                        var spokenWordsLimitLength;
                        if (spokenWordsLimit == "summary") {
                            spokenWordsLimitLength = 101;
                        } else if (spokenWordsLimit == "paragraph") {
                            spokenWordsLimitLength = 500;
                        } else {
                            spokenWordsLimitLength = 30000;
                        }
                        
                        var messageText = newestEmail.getLastMessageText({maxSummaryLetters:spokenWordsLimitLength, htmlToText:true});
                        if (messageText) {
                            messageToSay += ", " + messageText;
                        }
                    }
                }
                
                console.log("message to say: " + introToSay + " " + messageToSay);
                if (introToSay) {
                    ChromeTTS.queue(introToSay, {
                        noPause: true,
                        forceLang: await storage.get("language")
                    });
                }
                if (messageToSay) {
                    ChromeTTS.queue(messageToSay).then(() => {
                        if (hearMessage && voiceMessageAttachmentObj.found) {
                            voiceMessageAttachmentObj.promise.then(async response => {
                                voiceMessageAudio = new Audio();
                                voiceMessageAudio.src = response;
                                voiceMessageAudio.volume = await storage.get("voiceSoundVolume") / 100;
                                voiceMessageAudio.play();
                            }).catch(error => {
                                console.error("error getVoiceMessageAttachment: " + error);
                            });
                        }
                    });						
                }
            } else {
                console.log("voiceHear off for these labels");
            }
        } else {
            console.warn("in playVoiceNotification this returns null?? -> accountWithNewestMail.getNewestMail()");
        }
	}
	
	if (await storage.get("notificationVoice")) {
		getDNDState().then(async dndState => {
			if (!dndState) {
                const voiceNotificationOnlyIfIdleInterval = await storage.get("voiceNotificationOnlyIfIdleInterval");
				if (voiceNotificationOnlyIfIdleInterval) {
					chrome.idle.queryState(parseInt(voiceNotificationOnlyIfIdleInterval), state => {
						// apparently it's state can be locked or idle
						if (state != "active" && !detectSleepMode.isWakingFromSleepMode()) {
							queueVoice();
						}
					});
				} else {
					queueVoice();
				}
			}
		}).catch(response => {
			// nothing, maybe callback() if neccessary
		});
	}
}

async function preloadProfilePhotos(mails, callback) {
	var timeoutReached = false;
	if (await storage.get("showContactPhoto")) {
		
		// gather unique emails
		var userEmails = mails.uniqueAttr(mail => {
			return mail.account.getEmail();
		});
		
		var uniqueAccounts = userEmails.filter(userEmail => {
			getAccountByEmail(userEmail);
		});
		
		// let's ensure all tokens first before looping
		ensureContactsWrapper(uniqueAccounts).then(function() {
			const promises = [];
			mails.forEach(mail => {
               let promise = new Promise((resolve, reject) => {
                    var contactPhoto = new Image();
                    getContactPhoto({mail:mail}, function(params) {
                        if (params.error) {
                            console.log("contacterror: " + params.error, params);
                            resolve(params);
                        } else {
                            console.log("photoUrl: " + params.photoUrl);
                            
                            if (params.photoUrl) {
                                contactPhoto.setAttribute("src", params.photoUrl);
                                
                                loadImage(contactPhoto).then(() => {
                                    mail.contactPhoto = contactPhoto;
                                    resolve("success");
                                }).catch(e => {
                                    var error = "could not load image2: " + params.photoUrl + " " + e;
                                    console.log(error);
                                    resolve({error:error});
                                });
                                
                            } else {
                                resolve("success");
                            }
                        }
                    });
                });
                promises.push(promise);
			});
		
			// wait for https images to load because even if the deferreds completed it seem the contact images woulnd't load at extension startup
			var preloadTimeout = setTimeout(function() {
				timeoutReached = true;
				console.log("preloadphotos timeoutEND");
				callback();
			}, seconds(3));
			
			alwaysPromise(promises).then(() => {
				console.log("preloadphotos always args", arguments);
				// cancel timeout
				clearTimeout(preloadTimeout);
				// make sure timeout did not already call the callback before proceeding (don't want to call it twice)
				if (!timeoutReached) {
					console.log("preloadphotos whenEND");
					callback();
				}
			});
		}).catch(function(error) {
			callback({error:error});
		});
	} else {
		callback();
	}
}

function markAllAsX(account, action, closeWindow) {
	return new Promise((resolve, reject) => {
		var promises = [];
		var delay = 0;
		var totalUnreadMails = getAllUnreadMail(accounts).length;
		var totalMailsInThisAccount = account.getMails().length;
		
		account.getMails().forEach(function(mail, index) {
			if (index+1 <= MAX_EMAILS_TO_ACTION) {
				var promise = new Promise((resolve, reject) => {
					setTimeout(function() {
						var markAsPromise;
						if (action == "archive") {
							markAsPromise = mail.archive({instantlyUpdatedCount:true});
						} else if (action == "markAsRead") {
							markAsPromise = mail.markAsRead({instantlyUpdatedCount:true});
						}
					
						markAsPromise.then(() => {
							resolve();
						}).catch(response => {
							reject(response);
						});
						
					}, delay);
					
					if (totalMailsInThisAccount > MAX_EMAILS_TO_INSTANTLY_ACTION) {
						delay += 300;
					}
				});
				
				promises.push(promise);
				
			} else {
				return false;
			}
		});
		
		var totalMarkedAsX = promises.length;
		
		// simulate speed by quickly resetting the badge and close the window - but processing still take place below in .apply
		if (totalUnreadMails - totalMarkedAsX == 0) {
			updateBadge(0);
			if (closeWindow) {
				closeWindow({source:"markAll:" + action});
			}
		}
		
		Promise.all(promises).then(promiseAllResponse => {
			resolve();
		}).catch(error => {
			reject(error);
		});
	});
}

async function refreshAccounts(hardRefreshFlag) {
    if (hardRefreshFlag) {
        await pollAccounts({refresh:true});
    } else {
        var accountsWithErrors = 0;
        var activeAccounts = await getActiveAccounts(accounts);
        
        if (activeAccounts) {
            activeAccounts.forEach(account => {
                if (account.error) {
                    accountsWithErrors++;
                }
            });			   
        }
        
        if (activeAccounts && activeAccounts.length >= 1 && !accountsWithErrors) {
            await getAllEmails({accounts:activeAccounts, refresh:true});
            await mailUpdate();
        } else {
            await pollAccounts({refresh:true});
        }
    }
}

async function stopNotificationSound() {
	if (notificationAudio) {
		notificationAudio.pause();
		notificationAudio.currentTime = 0;
	}
}

async function stopVoiceMessageSound() {
	if (voiceMessageAudio) {
		voiceMessageAudio.pause();
		voiceMessageAudio.currentTime = 0;
	}
}

async function stopAllSounds() {
	stopNotificationSound();
	stopVoiceMessageSound();
	ChromeTTS.stop();
}

init();