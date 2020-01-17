/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

import _ from 'lodash';
import JSZip from 'jszip';
import saveAs from 'file-saver';

window.APP = {
  // The object commons is added on window by commons.bundle.js for
  // usage in both the extension and the maven plugin.
  commons: window.commons,
  _,
  JSZip,
  saveAs,
};
