/*
 * Copyright 2010-2017 Restlet S.A.S. All rights reserved.
 * Restlet is registered trademark of Restlet S.A.S.
 */

/* eslint-disable no-use-before-define */ // TODO: remove and fix file

import _ from 'lodash';

const SCHEME_SEPARATOR = '://';
const getUrlAfterScheme = getUrlAfterSeparatorFn(SCHEME_SEPARATOR);

window.APP.importPostmanCollectionV2 = (postmanJson) => {
  const project = {
    updateType: 'Create',
    entity: {
      type: 'Project',
      name: postmanJson.info.name,
      description: postmanJson.info.description,
    },
    children: createChildren(postmanJson.item, []),
  };
  return project;
};

function createChildren (items, children) {
  _(items)
    .forEach((item) => {
      if (item.request) {
        children.push(createRequest(item));
      } else {
        createService(item, children);
      }
    });
  return children;
}

function createService (item, children) {
  const service = {
    updateType: 'Create',
    entity: {
      type: 'Service',
      name: item.name,
      description: item.description,
    },
    children: [],
  };
  children.push(service);

  const serviceChildren = createChildren(item.item, []);

  _.forEach(serviceChildren, (child) => {
    if (child.entity.type === 'Service') {
      children.push(child);
    } else {
      service.children.push(child);
    }
  });
}

function createRequest (item) {
  return {
    updateType: 'Create',
    entity: {
      type: 'Request',
      name: item.name,
      description: item.request.description,
      method: getMethod(item.request.method),
      uri: {
        scheme: getScheme(item.request.url),
        path: getPath(item.request.url),
      },
      headers: getHeaders(item.request.header),
      body: getBody(item.request.body),
      headersType: 'Form',
      assertions: extractAssertions(item.event),
    },
    children: [],
  };
}

function extractAssertions (eventList) {
  return _(eventList)
    .filter(event => event.listen === 'test')
    .filter(testCase => testCase.script && testCase.script.type === 'text/javascript')
    .map(testCase => testCase.script.exec)
    .flatten()
    .uniq()
    .reduce((assertions, postmanAssertion) => {
      // Search for status code test
      const statusCodeRegex1 = /tests\[.*?\]\s*=\s*responseCode.code\s*===\s*([0-9]+)/i;
      const statusCodeRegex2 = /tests\[.*?\]\s*=\s*([0-9]+)\s*===\s*responseCode.code/i;

      let statusCode = statusCodeRegex1.exec(postmanAssertion);
      if (_.size(statusCode) > 1) {
        assertions.push({
          comparison: 'Equals',
          subject: 'ResponseStatus',
          path: 'code',
          enabled: true,
          value: statusCode[ 1 ],
        });
      } else {
        statusCode = statusCodeRegex2.exec(postmanAssertion);
        if (_.size(statusCode) > 1) {
          assertions.push({
            comparison: 'Equals',
            subject: 'ResponseStatus',
            path: 'code',
            enabled: true,
            value: statusCode[ 1 ],
          });
        }
      }

      // Search for body assertions
      const bodyContent = /tests\[.*?\]\s*=\s*responseBody.has\((?:"|')(.*)(?:"|')\)/i;
      const bodyAssertion = bodyContent.exec(postmanAssertion);
      if (_.size(bodyAssertion) > 1) {
        assertions.push({
          comparison: 'Contains',
          subject: 'ResponseBody',
          path: 'content',
          enabled: true,
          value: bodyAssertion[ 1 ],
        });
      }

      return assertions;
    }, []);

}

function getMethod (methodName) {
  return {
    requestBody: _.includes([ 'POST', 'PUT', 'PATCH', 'DELETE' ], methodName),
    link: 'https://tools.ietf.org/html/rfc7231#section-4.3',
    name: methodName,
  };
}

function getScheme (url) {
  const safeUrl = url && typeof (url) === 'object' ? url.raw : url;
  if (!safeUrl || safeUrl.indexOf('https') === 0) {
    return {
      secure: true,
      name: 'https',
      version: 'V11',
    };
  }
  return {
    secure: false,
    name: 'http',
    version: 'V11',
  };

}

function getPath (url) {
  const safeUrl = url && typeof (url) === 'object' ? url.raw : url;
  return safeUrl ? getUrlAfterScheme(safeUrl) : '';
}

function getUrlAfterSeparatorFn (sep) {
  const regex = new RegExp(sep);

  return (url) => {

    if (regex.test(url)) {
      return url.substring(url.indexOf(sep) + sep.length);

    }
    return url;

  };
}

function getHeaders (headers) {
  return _.map(headers, header => ({
    enabled: true,
    name: header.key,
    value: header.value,
  }));
}

function getBody (body) {
  if (body && body.mode === 'raw') {
    return {
      bodyType: 'Text',
      autoSetLength: true,
      textBody: body.raw,
    };
  } else if (body && body.mode === 'urlencoded') {
    return getFormBody(body.urlencoded, 'application/x-www-form-urlencoded');
  } else if (body && body.mode === 'formdata') {
    return getFormBody(body.formdata, 'multipart/form-data');
  } else if (body && body.mode === 'binary') {
    return {
      bodyType: 'File',
      autoSetLength: true,
    };
  }
  return {
    bodyType: 'Text',
    autoSetLength: true,
    textBody: '',
  };

}

function getFormBody (bodyItems, encoding) {
  return {
    formBody: {
      overrideContentType: true,
      encoding,
      items: _.map(bodyItems, parameter => ({
        enabled: true,
        name: parameter.key,
        value: parameter.value,
        type: parameter.type === 'file' ? 'File' : 'Text',
      })),
    },
    bodyType: 'Form',
    autoSetLength: true,
  };
}
