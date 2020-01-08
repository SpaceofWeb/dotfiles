// function updatePremiumStatusBar() {
//   const now = new Date();
//   const NO_FREE_DAY = new Date(now.getFullYear(), 1, 4, 23, 59, 0, 0);
//   let deltaSec = Math.floor(Math.abs(NO_FREE_DAY - now) / 1000);
//   const days = Math.floor(deltaSec / (60 * 60 * 24));
//   deltaSec -= days * 60 * 60 * 24;
//   const hours = Math.floor(deltaSec / (60 * 60));
//   deltaSec -= hours * 60 * 60;
//   const mins = Math.floor(deltaSec / 60);
//   $('#premium-status-bar').html(`<span>0d</span> <span>0h</span> <span>0m</span> before Sapling support for <strong>epicgames.helpshift.com</strong> ends. Upgrade at <a href="https://sapling.ai/plans">https://sapling.ai/plans</a> or contact <a href="mailto:sapling-support@sapling.ai">sapling-support@sapling.ai</a>.`);
// }

export default function initPremiumStatusBar() {
  if (window.location.hostname.includes('epicgames.helpshift.com')) {
    // $('body').append('<div id="premium-status-bar"></div>');
    // setInterval(updatePremiumStatusBar, 1000);
  }
}
