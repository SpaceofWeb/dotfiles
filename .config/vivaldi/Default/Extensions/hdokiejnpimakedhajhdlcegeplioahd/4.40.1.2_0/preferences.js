PreferencesAsync={set:function(e,o){Preferences.set(e,o)},get:function(e,o,t){var r;t(Preferences.get(e,o))}},Preferences=function(){var r={},n=function(e,o){var t=LPPlatform.getPreference(e);if(o=void 0===o?i[e]:o,void 0===t)return o;if(typeof t!=typeof i[e])switch(typeof i[e]){case"boolean":return"true"===t||1===parseInt(t);case"number":return t=-1===t.indexOf(".")?parseInt(t):parseFloat(t),isNaN(t)?o:t;case"object":return JSON.parse(t)}return t},a=function(e){switch(typeof e){case"object":return JSON.stringify(e);case"boolean":return e?1:0;default:return e.toString()}},s={logoffWhenCloseBrowser:!0,logoffWhenCloseBrowserVal:!0,showvault:!0,hideContextMenus:!0,notificationsBottom:!0,usepopupfill:!0,openloginstart:!0,storeLostOTP:!0,enablenamedpipes:!0,enablenewlogin:!0,htmlindialog:!0,Icon:!0,generateHkKeyCode:!0,generateHkMods:!0,recheckHkKeyCode:!0,recheckHkMods:!0,searchHkKeyCode:!0,searchHkMods:!0,nextHkKeyCode:!0,nextHkMods:!0,prevHkKeyCode:!0,prevHkMods:!0,homeHkKeyCode:!0,homeHkMods:!0,openpopoverHkKeyCode:!0,openpopoverHkMods:!0,rememberpassword:!0,dialogSizePrefs:!0},i={logoffWhenCloseBrowser:!1,logoffWhenCloseBrowserVal:0,idleLogoffEnabled:!1,idleLogoffVal:"",openpref:"tabs",htmlindialog:!1,automaticallyFill:!0,showvault:!1,showAcctsInGroups:!0,hideContextMenus:!1,defaultffid:"0",donotoverwritefilledfields:!1,showNotifications:!0,showGenerateNotifications:!1,showFormFillNotifications:!1,showSaveSiteNotifications:!1,notificationsBottom:!1,showNotificationsAfterClick:!1,showSaveNotificationBar:!0,showChangeNotificationBar:!0,usepopupfill:!0,showmatchingbadge:!0,autoautoVal:25,warninsecureforms:!1,infieldPopupEnabled:!1,dontfillautocompleteoff:!1,pollServerVal:15,clearClipboardSecsVal:60,recentUsedCount:10,searchNotes:!0,openloginstart:!1,storeLostOTP:!0,enablenamedpipes:!0,enablenewlogin:!1,clearfilledfieldsonlogoff:!1,toplevelmatchingsites:!1,language:"en_US",Icon:1,generate_length:12,generate_upper:!0,generate_lower:!0,generate_digits:!0,generate_special:!1,generate_mindigits:1,generate_ambig:!1,generate_reqevery:!0,generate_pronounceable:!1,generate_allcombos:!0,generate_advanced:!1,gridView:!0,compactView:!1,"seenVault4.0":!1,leftMenuMaximize:!0,disablepasswordmanagerasked:!0,rememberemail:!0,rememberpassword:!1,dialogSizePrefs:{},tempID:0,lastreprompttime:0,identity:"",alwayschooseprofilecc:!1,showIntroTutorial:!0};LPPlatform.adjustPreferenceDefaults(i),LPPlatform.isMac()?(i.generateHkKeyCode=0,i.generateHkMods="",i.recheckHkKeyCode=0,i.recheckHkMods="",i.searchHkKeyCode=76,i.searchHkMods="shift meta",i.nextHkKeyCode=33,i.nextHkMods="meta",i.prevHkKeyCode=34,i.prevHkMods="meta",i.homeHkKeyCode=0,i.homeHkMods="",i.openpopoverHkKeyCode=220,i.openpopoverHkMods="meta"):(i.generateHkKeyCode=71,i.generateHkMods="alt",i.recheckHkKeyCode=73,i.recheckHkMods="alt",i.searchHkKeyCode=87,i.searchHkMods="alt",i.nextHkKeyCode=33,i.nextHkMods="alt",i.prevHkKeyCode=34,i.prevHkMods="alt",i.homeHkKeyCode=72,i.homeHkMods="control alt",i.openpopoverHkKeyCode=220,i.openpopoverHkMods="alt");var l=function(e,o){var t;LPPlatform.setUserPreference(e,o),s[e]&&LPPlatform.setGlobalPreference(e,o),(r[e]||[]).forEach(function(e){e(o)})};return{getDefault:function(e){switch(typeof e){case"object":var o={};for(var t in e)o[t]=i[t];return o;case"string":return i[e];default:return null}},get:function(e,o){switch(typeof e){case"object":var t={};for(var r in e)t[r]=n(r,o?o[r]:void 0);return t;case"string":return n(e,o);default:return null}},set:function(e,o){switch(typeof e){case"object":for(var t in e)l(t,a(e[t]));break;default:l(e,a(o))}LPPlatform.writePreferences()},addListener:function(e,o){var t=r[e]||[];t.push(o),r[e]=t},removeListener:function(e,o){var t=r[e]||[];r[e]=t.filter(function(e){return e!==o})}}}();
//# sourceMappingURL=sourcemaps/preferences.js.map
