import { makeToolbarIconActive, makeToolbarIconInactive } from './toolbar';
import { postSettings, sendEvent, getBanners, logoutUser, getUser, getUserUsage, getPopupMessage } from '../requests/index';
import { getTopFrameHostname, getTopFramePathname } from '../utils/location';
import { sendMessageHandler } from '../ui/observers';
import { isEnabledOnSite, isSubscription, isUserAnonymous, isUserEmailConfirmed, getSubscriptionTier, setUserProperties, isToggleDisabled, showPremiumOnlyTag, showToggleDisabledTag, getSubscriptionTrialDaysLeft, isSupportedHost } from '../ui/settings';


function updateSaplingEmbedded(throttled=false) {
  $('#slidecheck').attr('disabled', isToggleDisabled());
  $('#slidecheck').attr('checked', isEnabledOnSite());
  if (throttled) {
      $('#subscription-banner').html('Your team has exceeded the daily limit of Sapling queries for this website. Please contact sales@sapling.ai.');
      $('#subscription-banner').css({
        'background-color': '#ffb3b3',
        'border': '0',
      });
      $('#subscription-banner').show();
      return;
  }
  if (isEnabledOnSite()) {
    makeToolbarIconActive();
  } else {
    makeToolbarIconInactive();
  }
}


function onChangeSlideCheck() {
  // NOTE Can't put syncKey in {...} directly or doesn't work...
  const hostname = getTopFrameHostname();
  const syncKey = `crioenabled${hostname}`;
  const setting = {};
  const isChecked = $('#slidecheck').prop('checked');
  setting[syncKey] = isChecked;
  chrome.storage.sync.set(setting, () => {});
  if (isChecked) {
    makeToolbarIconActive();
    postSettings(true);
  } else {
    makeToolbarIconInactive();
    postSettings(false);
  }
  $('#refresh-warning').show(400);
}


function appendSaplingEmbedded() {
  if (getTopFrameHostname() === 'docs.google.com') {
    makeToolbarIconActive();
    $('#sapling-embed-controls').html('<p>Download the Sapling Google Docs add-on <a target="_blank" style="font-weight:bold" href="https://chrome.google.com/webstore/detail/grammar-and-style-check-b/hnlhgjcpememncopnhkcbliakmbpcjki?authuser=1">here</a>.');
  } else if (!isSupportedHost()) {
    $('#sapling-embed-controls').html('<p>Sapling does not currently support this site.  Contact us to learn more.</p>');
  } else {
    $('#sapling-embed-controls').html(`<table style="margin: 0px auto;"><tr id="toggle-row">
      <td style="color: #444; font-weight: bold;"><a id="premium-link" href="https://sapling.ai/plans"><span id="premium-tag" style="display:none; color:#ffa31a;"><strong>[Premium only]</strong> </span></a><span id="toggle-disabled-tag" style="display:none; color:#ffa31a;"><strong>[Admin Controlled]</strong> </span>Enable Sapling on <span id="current-domain"></span></p></td>
      <td style="vertical-align: top;">
      <div>
      <input type="checkbox" value="None" id="slidecheck" class="tgl tgl-light" name="check" checked><label for="slidecheck" class="tgl-btn"></label>
      </div></td>
      </tr>
      </table>`);
    $('#current-domain').text(getTopFrameHostname());
    $('#premium-link').click((e) => {
      e.preventDefault();
      chrome.tabs.create({ url: e.currentTarget.getAttribute('href') });
    });
    $('#slidecheck').attr('disabled', isToggleDisabled());
    $('#slidecheck').attr('checked', isEnabledOnSite());
    if (isEnabledOnSite()) {
      makeToolbarIconActive();
    } else {
      makeToolbarIconInactive();
    }
    if (showPremiumOnlyTag()) {
      $('#premium-tag').show();
    } else {
      $('#premium-tag').hide();
    }
    if (showToggleDisabledTag()) {
      $('#toggle-disabled-tag').show();
    } else {
      $('#toggle-disabled-tag').hide();
    }
  }
  $('#slidecheck').on('change', onChangeSlideCheck);

  $('#sign-up-button').click((e) => {
    e.preventDefault();
    chrome.tabs.create({ url: e.currentTarget.getAttribute('href') });
  });
}


function fetchSavedHtml() {
  sendMessageHandler('popup/GET_HTML', {}, (response) => {
    const { popupHtml } = response;
    if (popupHtml) {
      const text = $(`<span>${popupHtml}</span>`).text();
      if (text) {
        const block = document.getElementById('sapling-embedded-editable');
        block.innerHTML = popupHtml;
        $(block).focus();
      }
    }
  });
}

function updateUserProperties() {
  if (isUserAnonymous()) {
    $('#sapling-status-message').css('visibility','hidden');
    $('#login-signup-block').show();
    $('#sapling-embedded-editable').hide();
    $('#user-manager-form').show();
    $('#logout-span').hide();
    $('#confirm-message').hide();
  } else if (!isUserEmailConfirmed()) {
    $('#confirm-message').show();
    $('#login-signup-block').hide();
    $('#sapling-status-message').css('visibility','hidden');
    $('#sapling-embedded-editable').hide();
    $('#user-manager-form').show();
    $('#logout-span').show();
  } else {
    $('#confirm-message').hide();
    $('#login-signup-block').hide();
    $('#sapling-status-message').css('visibility','visible');
    $('#sapling-embedded-editable').show();
    $('#user-manager-form').hide();
    $('#logout-span').show();
  }
  if (!isSubscription()) {
    if (isUserEmailConfirmed()) {
      $('#subscription-banner').html('You are on the <strong>free</strong> plan. <a target="_blank" href="https://sapling.ai/plans">Upgrade to Pro</a> to see premium edits.');
      $('#subscription-banner').css({
        'background-color': '#fff3cd',
        'border': '0',
        'color': '#856404'
      });
    }
    else if (!isUserAnonymous() && !isUserEmailConfirmed()) {
      $('#subscription-banner').html('<strong>Please confirm your email using the link we sent you.</strong>');
      $('#subscription-banner').css({
        'background-color': '#fff3cd',
        'border': '0',
        'color': '#856404'
      });
    }
    else {
      $('#subscription-banner').html('<strong><a target="_blank" href="https://sapling.ai/user/register">Sign up for Free</a></strong> to receive additional features.');
      $('#subscription-banner').css({
        'background-color': '#fff3cd',
        'border': '0',
        'color': '#856404'
      });
    }
    $('#subscription-banner').show();
    updateSaplingEmbedded();
  } else {
    const trialDaysLeft = getSubscriptionTrialDaysLeft();
    if (trialDaysLeft === null) {
      $('#subscription-banner').html(`Thank you for subscribing to our <strong>${getSubscriptionTier()}</strong> plan.`);
      $('#subscription-banner').css({
        'background-color': '#deefde',
        'border': '0',
      });
      $('#team-premium-banner').hide();
    } else {
      if (trialDaysLeft <= 1) {
        $('#subscription-banner').html(`Your <a target="_blank" href="https://sapling.ai/plans">Sapling Pro Trial</a> expires in <strong>${trialDaysLeft} day</strong>.`);
      } else {
        $('#subscription-banner').html(`Your <a target="_blank" href="https://sapling.ai/plans">Sapling Pro Trial</a> expires in <strong>${trialDaysLeft} days</strong>.`);
      }
      $('#subscription-banner').css({
        'background-color': '#fff3cd',
        'color': '#856404',
        'border': '1px solid #ffeeba'
      });
    }

    $('#subscription-banner').show();
    updateSaplingEmbedded();
  }
}

function setUserUsage(usage) {
  if (usage.is_anonymous) {
    $('#user-usage').hide();
    return;
  }
  $('#user-usage-accepts').html(usage.accepts);
  $('#user-usage-ignores').html(usage.rejects);
  $('#user-usage-since').html(usage.since.substring(0, usage.since.length - 13));
  $('#user-usage').show();
}

export function getUserProperties() {
  getUser(true, (user) => {
    setUserProperties(user);
    updateUserProperties();
  });
  $('#user-usage').hide();
  getUserUsage((usage) => {
    setUserUsage(usage);
  }, (usage) => { $('#user-usage').hide(); });
}

function initUserLogin() {
  $('#logout-button').click(() => {
    logoutUser(() => {
      getUserProperties();
    }, () => {
      getUserProperties();
    });
  });

  getUserProperties();
}

function initPopupMessage() {
  getPopupMessage((msg) => {
    $('#popup-message').html(msg.msg);
  }, (msg) => { $('#popup-message').hide(); });
}


function initPremiumBanners() {
  const hostname = getTopFrameHostname();
  getBanners(hostname, getTopFramePathname(), (banners) => {
    for (let idx = 0; idx < banners.length; idx += 1) {
      const banner = banners[idx];
      const {
        name,
      } = banner;
      if (name === 'team_premium') {
        const {
          num_users: numUsers,
        } = banner;
        $('#team-premium-banner').html(`
          Your team has <strong>${numUsers} users</strong>
          actively using Sapling on <strong>${hostname}</strong>.
          <br>
          With this many users, you'll need to sign up for the <strong><a class="sapling-premium" href="https://sapling.ai/plans">Enterprise Plan</a></strong> or your team's usage will be limited.
          <br><br>
          <strong>Enter email or phone # and we will contact you shortly:</strong>
          <form id="team_premium_form_email">
            <input id="premium_signup_email" type="email" placeholder="Enter Email">
            <button class="signup_button">Submit</button>
            <span id="team_premium_feedback_submit" style="display:none;"></span>
          </form>
          <form id="team_premium_form_phone">
            <input id="premium_signup_phone" type="tel" pattern="^[0-9-+s()]*$" placeholder="Enter Phone #">
            <button class="signup_button">Submit</button>
            <span id="team_premium_feedback_phone_submit" style="display:none;"></span>
          </form>
          `);
        sendEvent('popup_banner', { name: 'signup_premium_team' });
        $('.sapling-premium').click((e) => {
          e.preventDefault();
          chrome.tabs.create({ url: e.target.getAttribute('href') });
        });
        $('#team_premium_form_email').submit((e) => {
          e.preventDefault();
          const userEmail = $('#premium_signup_email').val();
          if (userEmail) {
            const properties = {
              name: 'signup_premium_team',
              user_email: userEmail,
            };
            sendEvent('signup_banner', properties);
            $('#team_premium_feedback_submit').html(`We'll email <strong>${userEmail}</strong> shortly.`);
            $('#team_premium_feedback_submit').show();
          }
        });
        $('#team_premium_form_phone').submit((e) => {
          e.preventDefault();
          const phoneNumber = $('#premium_signup_phone').val();
          if (phoneNumber) {
            const properties = {
              name: 'signup_premium_team',
              phone_number: phoneNumber,
            };
            sendEvent('signup_banner', properties);
            $('#team_premium_feedback_phone_submit').html(`We'll call <strong>${phoneNumber}</strong> shortly.`);
            $('#team_premium_feedback_phone_submit').show();
          }
        });
        $('#team-premium-banner').show(400);
      }
      if (name === 'team_share') {
        let inputFormat = `
          <input id="signup_email" type="email" placeholder="Enter Email">
          <button class="signup_button">Submit</button>
        `;
        if (isUserEmailConfirmed()) {
          inputFormat = '<button class="signup_button">Request Access</button>';
        }
        $('#team-share-banner').html(`
          Want to bring Sapling to your team?
          <br><br>
          <strong>Sapling Enterprise</strong> will help you and your team write better.
          <br>
          <form id="share_form">
            ${inputFormat}
          </form>
          <span id="share_feedback_submit" style="display:none;"></span>
          `);
        sendEvent('popup_banner', { name: 'share_team' });
        $('#share_form').submit((e) => {
          e.preventDefault();
          const userEmail = $('#signup_email').val();
          const properties = {
            name: 'share_team',
            user_email: userEmail,
          };
          sendEvent('signup_banner', properties);
          $('#share_feedback_submit').html(`
            <strong>Thank you. We will contact you shortly.</strong>
          `);
          $('#share_feedback_submit').show();
        });
        $('#team-share-banner').show(400);
      }
    }
  });
}


export function disableSlideCheck() {
  $('#slidecheck').off('change', onChangeSlideCheck);
}


export default function initializeSaplingEmbedded() {
  appendSaplingEmbedded();
  fetchSavedHtml();
  initPremiumBanners();
  initUserLogin();
  initPopupMessage();
}
