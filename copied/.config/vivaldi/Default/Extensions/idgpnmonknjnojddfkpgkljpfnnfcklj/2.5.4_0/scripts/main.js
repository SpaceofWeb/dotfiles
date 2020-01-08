const SPECIAL_CHARS = '^$&+?.()|{}[]/'.split('');
const browser = chrome;
const modHeader = angular
  .module('modheader-popup', ['ngMaterial', 'ngMessages'])
  .config(function($compileProvider) {
    $compileProvider.debugInfoEnabled(false);
  })
  .config(function($mdAriaProvider) {
    $mdAriaProvider.disableWarnings();
  });

function fixProfile(profile) {
  if (profile.filters) {
    for (let filter of profile.filters) {
      if (filter.urlPattern) {
        const urlPattern = filter.urlPattern;
        const joiner = [];
        for (let i = 0; i < urlPattern.length; ++i) {
          let c = urlPattern.charAt(i);
          if (SPECIAL_CHARS.indexOf(c) >= 0) {
            c = '\\' + c;
          } else if (c == '\\') {
            c = '\\\\';
          } else if (c == '*') {
            c = '.*';
          }
          joiner.push(c);
        }
        delete filter.urlPattern;
        filter.urlRegex = joiner.join('');
      }
    }
  }
}

modHeader.factory('dataSource', function($mdToast) {
  var dataSource = {};

  var isExistingProfileTitle_ = function(title) {
    for (var i = 0; i < dataSource.profiles.length; ++i) {
      if (dataSource.profiles[i].title == title) {
        return true;
      }
    }
    return false;
  };

  dataSource.addFilter = function(filters) {
    let urlRegex = '';
    if (localStorage.currentTabUrl) {
      const parser = document.createElement('a');
      parser.href = localStorage.currentTabUrl;
      urlRegex = parser.origin + '/.*';
    }
    filters.push({
      enabled: true,
      type: 'urls',
      urlRegex: urlRegex
    });
  };

  dataSource.addHeader = function(headers) {
    headers.push({
      enabled: true,
      name: '',
      value: '',
      comment: ''
    });
  };

  dataSource.addUrlReplacement = function(replacements) {
    let domain = '';
    if (localStorage.currentTabUrl) {
      const parser = document.createElement('a');
      parser.href = localStorage.currentTabUrl;
      domain = parser.origin;
    }
    replacements.push({
      enabled: true,
      name: domain,
      value: domain,
      comment: ''
    });
  };

  dataSource.removeFilter = function(filters, filter) {
    filters.splice(filters.indexOf(filter), 1);
  };

  dataSource.removeHeader = function(headers, header) {
    headers.splice(headers.indexOf(header), 1);
  };

  dataSource.removeUrlReplacement = function(urlReplacements, replacement) {
    urlReplacements.splice(urlReplacements.indexOf(replacement), 1);
  };

  dataSource.removeHeaderEnsureNonEmpty = function(headers, header) {
    dataSource.removeHeader(headers, header);
    if (!headers.length) {
      dataSource.addHeader(headers);
    }
  };

  dataSource.pause = function() {
    dataSource.isPaused = true;
    localStorage.isPaused = true;
    $mdToast.show(
      $mdToast
        .simple()
        .content('ModHeader paused')
        .position('bottom')
        .hideDelay(1000)
    );
  };

  dataSource.play = function() {
    dataSource.isPaused = false;
    localStorage.removeItem('isPaused');
    $mdToast.show(
      $mdToast
        .simple()
        .content('ModHeader unpaused')
        .position('bottom')
        .hideDelay(1000)
    );
  };

  dataSource.lockToTab = function() {
    dataSource.lockedTabId = localStorage.activeTabId;
    localStorage.lockedTabId = dataSource.lockedTabId;
    $mdToast.show(
      $mdToast
        .simple()
        .content('Restricted ModHeader to the current tab')
        .position('bottom')
        .hideDelay(1000)
    );
  };

  dataSource.unlockAllTab = function() {
    dataSource.lockedTabId = null;
    localStorage.removeItem('lockedTabId');
    $mdToast.show(
      $mdToast
        .simple()
        .content('Applying ModHeader to all tabs')
        .position('bottom')
        .hideDelay(1000)
    );
  };

  dataSource.hasDuplicateHeaderName = function(headers, name) {
    for (var i = 0; i < headers.length; ++i) {
      var header = headers[i];
      if (header.enabled && header.name == name) {
        return true;
      }
    }
    return false;
  };

  dataSource.createProfile = function() {
    let index = 1;
    while (isExistingProfileTitle_('Profile ' + index)) {
      ++index;
    }
    const profile = {
      title: 'Profile ' + index,
      hideComment: true,
      headers: [],
      respHeaders: [],
      filters: [],
      urlReplacements: [],
      appendMode: false
    };
    dataSource.addHeader(profile.headers);
    return profile;
  };
  dataSource.predicate = '';
  dataSource.reverse = false;

  if (localStorage.profiles) {
    dataSource.profiles = angular.fromJson(localStorage.profiles);
    for (let profile of dataSource.profiles) {
      fixProfile(profile);
    }
  } else {
    dataSource.profiles = [];
  }
  if (dataSource.profiles.length == 0) {
    dataSource.profiles.push(dataSource.createProfile());
  }
  for (let index in dataSource.profiles) {
    const profile = dataSource.profiles[index];
    if (!profile.title) {
      profile.title = 'Profile ' + (index + 1);
    }
    if (!profile.headers) {
      profile.headers = [];
      dataSource.addHeader(profile.headers);
    }
    if (!profile.respHeaders) {
      profile.respHeaders = [];
      dataSource.addHeader(profile.respHeaders);
    }
    if (!profile.urlReplacements) {
      profile.urlReplacements = [];
      dataSource.addUrlReplacement(profile.urlReplacements);
    }
    if (!profile.filters) {
      profile.filters = [];
    }
  }
  if (localStorage.selectedProfile) {
    dataSource.selectedProfile =
      dataSource.profiles[Number(localStorage.selectedProfile)];
  }
  if (!dataSource.selectedProfile) {
    dataSource.selectedProfile = dataSource.profiles[0];
  }
  if (localStorage.isPaused) {
    dataSource.isPaused = localStorage.isPaused;
  }
  if (localStorage.lockedTabId) {
    dataSource.lockedTabId = localStorage.lockedTabId;
  }
  dataSource.save = function() {
    var serializedProfiles = angular.toJson(dataSource.profiles);
    var selectedProfileIndex = dataSource.profiles.indexOf(
      dataSource.selectedProfile
    );
    localStorage.profiles = serializedProfiles;
    localStorage.selectedProfile = selectedProfileIndex;
  };
  return dataSource;
});

modHeader.factory('profileService', function(
  $timeout,
  $mdSidenav,
  $mdDialog,
  $mdToast,
  dataSource
) {
  var profileService = {};

  var closeOptionsPanel_ = function() {
    $mdSidenav('left').close();
  };

  var updateSelectedProfile_ = function() {
    $timeout(function() {
      dataSource.selectedProfile =
        dataSource.profiles[dataSource.profiles.length - 1];
    }, 1);
  };

  profileService.selectProfile = function(profile) {
    dataSource.selectedProfile = profile;
    closeOptionsPanel_();
  };

  profileService.addProfile = function() {
    dataSource.profiles.push(dataSource.createProfile());
    updateSelectedProfile_();
    closeOptionsPanel_();
  };

  profileService.cloneProfile = function(profile) {
    var newProfile = angular.copy(profile);
    newProfile.title = 'Copy of ' + newProfile.title;
    dataSource.profiles.push(newProfile);
    updateSelectedProfile_();
  };

  profileService.deleteProfile = function(profile) {
    dataSource.profiles.splice(dataSource.profiles.indexOf(profile), 1);
    if (dataSource.profiles.length == 0) {
      profileService.addProfile();
    } else {
      updateSelectedProfile_();
    }
  };

  profileService.toggleComment = function(profile) {
    profile.hideComment = !profile.hideComment;
  };

  profileService.setAppendMode = function(profile, appendMode) {
    profile.appendMode = appendMode;
  };

  profileService.exportProfile = function(event, profile) {
    var parentEl = angular.element(document.body);
    $mdDialog.show({
      parent: parentEl,
      targetEvent: event,
      focusOnOpen: false,
      templateUrl: 'exportdialog.tmpl.html',
      locals: {
        title: profile.title,
        profile: angular.toJson(profile)
      },
      controller: DialogController_
    });
    function DialogController_($scope, $mdDialog, $mdToast, title, profile) {
      $scope.title = title;
      $scope.profile = profile;

      $scope.copy = function() {
        document.getElementById('exportedProfile').select();
        document.execCommand('copy');
        $mdToast.show(
          $mdToast
            .simple()
            .content('Copied to clipboard!')
            .position('top')
            .hideDelay(1000)
        );
      };

      $scope.closeDialog = function() {
        $mdDialog.hide();
      };
    }
  };

  profileService.importProfile = function(event, profile) {
    var parentEl = angular.element(document.body);
    $mdDialog
      .show({
        parent: parentEl,
        targetEvent: event,
        focusOnOpen: false,
        templateUrl: 'importdialog.tmpl.html',
        locals: {
          profile: profile
        },
        controller: DialogController_
      })
      .then(function(importProfile) {
        try {
          angular.copy(angular.fromJson(importProfile), profile);
          fixProfile(profile);
          $mdToast.show(
            $mdToast
              .simple()
              .content('Profile successfully import')
              .position('top')
              .hideDelay(1000)
          );
        } catch (e) {
          $mdToast.show(
            $mdToast
              .simple()
              .content('Failed to import profile')
              .position('top')
              .hideDelay(1000)
          );
        }
      });
    function DialogController_($scope, $mdDialog, profile) {
      $scope.importProfile = '';

      $scope.closeDialog = function() {
        $mdDialog.hide($scope.importProfile);
      };
    }
  };

  profileService.sortProfiles = function() {
    function compare(a, b) {
      if (a.title.toLowerCase() < b.title.toLowerCase()) {
        return -1;
      }
      if (a.title.toLowerCase() > b.title.toLowerCase()) {
        return 1;
      }
      return 0;
    }
    try {
      dataSource.profiles = dataSource.profiles.sort(compare);
      $mdToast.show(
        $mdToast
          .simple()
          .content('Profiles sorted successfully')
          .position('top')
      );
    } catch (e) {
      $mdToast.show(
        $mdToast
          .simple()
          .content('Failed to sort profiles')
          .position('top')
          .hideDelay(1000)
      );
    }
  };

  profileService.importProfiles = function(event, profile) {
    var parentEl = angular.element(document.body);
    $mdDialog
      .show({
        parent: parentEl,
        targetEvent: event,
        focusOnOpen: false,
        templateUrl: 'importdialog.tmpl.html',
        locals: {
          profile: profile
        },
        controller: DialogController_
      })
      .then(function(importProfile) {
        try {
          var profileArray = angular.fromJson(importProfile);
          for (let p of profileArray) {
            fixProfile(p);
            dataSource.profiles.push(p);
          }

          $mdToast.show(
            $mdToast
              .simple()
              .content('Profiles successfully import')
              .position('top')
              .hideDelay(1000)
          );
        } catch (e) {
          $mdToast.show(
            $mdToast
              .simple()
              .content('Failed to import profiles')
              .position('top')
              .hideDelay(1000)
          );
        }
      });
    function DialogController_($scope, $mdDialog, profile) {
      $scope.importProfile = '';

      $scope.closeDialog = function() {
        $mdDialog.hide($scope.importProfile);
      };
    }
  };

  profileService.expandEditor = function(
    event,
    profile,
    content,
    title,
    nameLabel,
    valueLabel
  ) {
    const parentEl = angular.element(document.body);
    $mdDialog.show({
      parent: parentEl,
      targetEvent: event,
      focusOnOpen: true,
      templateUrl: 'editor.tmpl.html',
      locals: {
        showComment: !profile.hideComment,
        content
      },
      controller: DialogController_
    });
    function DialogController_($scope, $mdDialog, showComment, content) {
      $scope.showComment = showComment;
      $scope.content = content;
      $scope.title = title;
      $scope.nameLabel = nameLabel;
      $scope.valueLabel = valueLabel;

      $scope.closeDialog = function() {
        $mdDialog.hide();
      };
    }
  };

  profileService.exportProfiles = function(event) {
    const parentEl = angular.element(document.body);
    $mdDialog.show({
      parent: parentEl,
      targetEvent: event,
      focusOnOpen: false,
      templateUrl: 'exportdialog.tmpl.html',
      locals: {
        title: 'All',
        profile: dataSource.profiles
      },
      controller: DialogController_
    });
    function DialogController_($scope, $mdDialog, $mdToast, title, profile) {
      $scope.title = title;
      $scope.profile = profile;

      $scope.copy = function() {
        document.getElementById('exportedProfile').select();
        document.execCommand('copy');
        $mdToast.show(
          $mdToast
            .simple()
            .content('Copied to clipboard!')
            .position('top')
            .hideDelay(1000)
        );
      };

      $scope.closeDialog = function() {
        $mdDialog.hide();
      };
    }
  };

  profileService.openCloudBackup = event => {
    const parentEl = angular.element(document.body);
    $mdDialog
      .show({
        parent: parentEl,
        targetEvent: event,
        focusOnOpen: false,
        templateUrl: 'cloudbackupdialog.tmpl.html',
        controller: DialogController_
      })
      .then(profiles => {
        if (!profiles) {
          return;
        }
        try {
          dataSource.profiles = profiles;
          dataSource.selectedProfile = dataSource.profiles[0];
          dataSource.save();

          $mdToast.show(
            $mdToast
              .simple()
              .content('Profiles successfully import')
              .position('top')
              .hideDelay(1000)
          );
        } catch (e) {
          $mdToast.show(
            $mdToast
              .simple()
              .content('Failed to import profiles')
              .position('top')
              .hideDelay(1000)
          );
        }
      });
    function DialogController_($scope, $mdDialog) {
      browser.storage.sync.get(null, items => {
        let savedData = [];
        if (!items) {
          items = [];
        }
        for (const key in items) {
          try {
            const serializedProfiles = items[key];
            const profiles = angular.fromJson(serializedProfiles);
            for (let profile of profiles) {
              fixProfile(profile);
            }
            savedData.push({
              timeInMs: key,
              profiles: profiles
            });
          } catch (e) {
            // skip invalid profile.
          }
        }
        $scope.savedData = savedData;
      });

      $scope.selectProfiles = function(profiles) {
        $mdDialog.hide(profiles);
      };

      $scope.closeDialog = function() {
        $mdDialog.hide();
      };
    }
  };
  return profileService;
});

modHeader.factory('autocompleteService', function(dataSource) {
  var autocompleteService = {};

  autocompleteService.requestHeaderNames = [
    'Authorization',
    'Cache-Control',
    'Connection',
    'Content-Length',
    'Host',
    'If-Modified-Since',
    'If-None-Match',
    'If-Range',
    'Partial-Data',
    'Pragma',
    'Proxy-Authorization',
    'Proxy-Connection',
    'Transfer-Encoding',
    'Accept',
    'Accept-Charset',
    'Accept-Encoding',
    'Accept-Language',
    'Accept-Datetime',
    'Cookie',
    'Content-MD5',
    'Content-Type',
    'Date',
    'Expect',
    'From',
    'If-Match',
    'If-Unmodified-Since',
    'Max-Forwards',
    'Origin',
    'Range',
    'Referer',
    'TE',
    'User-Agent',
    'Upgrade',
    'Via',
    'Warning',
    'X-Forwarded-For',
    'X-Forwarded-Host',
    'X-Forwarded-Proto',
    'Front-End-Https',
    'X-Http-Method-Override',
    'X-ATT-DeviceId',
    'X-Wap-Profile',
    'X-UIDH',
    'X-Csrf-Token'
  ];
  autocompleteService.requestHeaderValues = [];
  autocompleteService.responseHeaderNames = [
    'Access-Control-Allow-Origin',
    'Accept-Patch',
    'Accept-Ranges',
    'Age',
    'Allow',
    'Connection',
    'Content-Disposition',
    'Content-Encoding',
    'Content-Language',
    'Content-Length',
    'Content-Location',
    'Content-MD5',
    'Content-Range',
    'Content-Type',
    'Date',
    'ETag',
    'Expires',
    'Last-Modified',
    'Link',
    'Location',
    'P3P',
    'Pragma',
    'Proxy-Authenticate',
    'Public-Key-Pins',
    'Refresh',
    'Retry-After',
    'Server',
    'Set-Cookie',
    'Strict-Transport-Security',
    'Trailer',
    'Transfer-Encoding',
    'Upgrade',
    'Vary',
    'Via',
    'Warning',
    'WWW-Authenticate',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Powered-By',
    'X-UA-Compatible',
    'X-Content-Duration',
    'X-Content-Security-Policy',
    'X-WebKit-CSP'
  ];
  autocompleteService.responseHeaderValues = [];
  autocompleteService.commentValues = [];

  function createFilterFor_(query) {
    const lowercaseQuery = query.toLowerCase();
    return function filterFn(item) {
      return item.toLowerCase().indexOf(lowercaseQuery) == 0;
    };
  }

  autocompleteService.query = function(cache, sourceHeaderList, field, query) {
    if (!query || query.length < 2) {
      return [];
    }
    for (let header of sourceHeaderList) {
      if (header[field] != query && cache.indexOf(header[field]) < 0) {
        cache.push(header[field]);
      }
    }
    return cache.filter(createFilterFor_(query));
  };
  return autocompleteService;
});

modHeader.controller('SortingController', function($filter, dataSource) {
  this.order = function(profile, predicate) {
    dataSource.reverse =
      dataSource.predicate === predicate ? !dataSource.reverse : false;
    dataSource.predicate = predicate;
    const orderBy = $filter('orderBy');
    profile.headers = orderBy(
      profile.headers,
      dataSource.predicate,
      dataSource.reverse
    );
    profile.respHeaders = orderBy(
      profile.respHeaders,
      dataSource.predicate,
      dataSource.reverse
    );
    profile.urlReplacements = orderBy(
      profile.urlReplacements,
      dataSource.predicate,
      dataSource.reverse
    );
  };
});

modHeader.controller('AppController', function(
  $scope,
  $mdSidenav,
  $mdUtil,
  $window,
  dataSource,
  profileService,
  autocompleteService
) {
  $scope.toggleSidenav = $mdUtil.debounce(function() {
    $mdSidenav('left').toggle();
  }, 300);

  $window.onunload = function(e) {
    dataSource.save();
  };

  $scope.openLink = function(link) {
    browser.tabs.create({ url: link });
  };

  $scope.autocompleteService = autocompleteService;
  $scope.dataSource = dataSource;
  $scope.profileService = profileService;
});
