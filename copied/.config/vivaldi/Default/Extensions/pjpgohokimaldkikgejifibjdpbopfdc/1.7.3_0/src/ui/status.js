import { isInLoadingState } from '../requests/cache';

export default function updateStatusIndicator(error = false) {
  const block = document.getElementById('sapling-status-message');

  if (block) {
    if (error) {
      block.setAttribute('status', 'server_error');
    } else if (isInLoadingState()) {
      block.setAttribute('status', 'loading');
    } else {
      block.setAttribute('status', 'server_success');
    }
  }
}
