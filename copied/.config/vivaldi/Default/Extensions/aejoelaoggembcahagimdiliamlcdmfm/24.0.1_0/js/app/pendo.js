/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

import { decodeJWTStringToJWTObject } from './jwtUtils';

/* eslint-disable */

const loadPendo = (PENDO_API_KEY) => {

  //
  // Ref: https://talend365.sharepoint.com/:w:/g/departments/productmanagement/Ee78lXrTVJJPjPrLWYfyG50BHmD-01OWelyGkqAOXsY5Fw?e=lmUrun
  //

  (function (p, e, n, d, o) {
    var v,
      w,
      x,
      y,
      z;
    o = p[ d ] = p[ d ] || {};
    o._q = [];

    v = [ 'initialize', 'identify', 'updateOptions', 'pageLoad' ];
    for (w = 0, x = v.length; w < x; ++w) {
      (function (m) {
        o[ m ] = o[ m ] || function () {
          o._q[ m === v[ 0 ] ? 'unshift' : 'push' ]([ m ].concat([].slice.call(arguments, 0)));
        };
      })(v[ w ]);
    }

    y = e.createElement(n);
    y.async = !0;
    y.src = `https://cdn.pendo.io/agent/static/${PENDO_API_KEY}/pendo.js`;

    z = e.getElementsByTagName(n)[ 0 ];
    z.parentNode.insertBefore(y, z);
  })(window, document, 'script', 'pendo');

};

/* eslint-enable */

const initPendo = (idTokenAsString, PENDO_API_KEY, dataCenter) => {

  if (!idTokenAsString || !window.pendo) {
    return;
  }

  const decodedIdToken = decodeJWTStringToJWTObject(idTokenAsString);

  // eslint-disable-next-line camelcase
  const { preferred_username = '', tenant_name = '', subscription_type = '' } = decodedIdToken || {};

  window.pendo.initialize({
    apiKey: PENDO_API_KEY,
    visitor: {
      id: preferred_username,
    },
    account: {
      id: tenant_name,
      license: subscription_type,
    },
    datacenter: {
      region: dataCenter,
    },
    product: {
      name: 'API Tester', // see JIRA https://restlet.atlassian.net/browse/DHC-3498
    },
    customer: {
      type: 'Beta',
    },
  });
};

window.APP.pendoService = {
  loadPendo,
  initPendo,
};
