'use strict';

/* Request-Response pairs
 *
 * objects:
 *   globalList: {},
 *   websiteList: {},
 *
 * functions:
 *   addRequest: addRequest,
 *   addResponse: addResponse
 */
var pairs;
/* Statistics
 *
 * objects:
 *   websites: {}
 *
 * vars:
 *   size
 *   inStoreK
 */
var statistics;

var writeEvery = 200;

function addRequest(domain, request) {
  var id = request.requestId;
  if (id in pairs.globalList) {
    pairs.globalList[id]['request'] = request;
  } else {
    pairs.globalList[id] = {
      response: null,
      request: request
    };
  }
  if (!(domain in pairs.websiteList)) {
    pairs.websiteList[domain] = {domain: domain, pairs: [pairs.globalList[id]]};
  } else {
    pairs.websiteList[domain].pairs.push(pairs.globalList[id]);
  }
}

function addResponse(response) {
  var id = response.requestId;
  if (id in pairs.globalList) {
    pairs.globalList[id]['response'] = response;
  } else {
    pairs.globalList[id] = {
      response: response,
      request: null
    };
  }
}

function enrichPairs(pairs) {
  if (pairs === undefined) pairs = {};
  return {
    globalList: {},
    websiteList: ('websiteList' in pairs) ? pairs.websiteList : {},
    addRequest: addRequest,
    addResponse: addResponse
  };
}

function preparePairsStorage(pairs) {
  return {
    websiteList: pairs.websiteList
  }
}

chrome.storage.local.get(null, function (data) {
  if (('pairs' in data) && ('statistics' in data)) {
    pairs = enrichPairs(data.pairs);
    statistics = data.statistics;
  } else {
    pairs = enrichPairs();
    statistics = {
      websites: {},
      size: 0,
      inStoreK: 0
    }
  }
});

chrome.browserAction.onClicked.addListener(function (activeTab) {
  var newURL = 'main.html';
  chrome.tabs.create({url: newURL});
});

chrome.runtime.onConnect.addListener(function (port) {
  console.assert(port.name === 'mainToBackground');
  port.onMessage.addListener(function (msg) {
    if (msg.get === 'statistics') {
      port.postMessage({statistics: statistics});
    } else if (msg.get === 'pairs') {
      port.postMessage({pairs: pairs.websiteList});
    } else if (msg.get === 'space') {
      chrome.storage.local.getBytesInUse(function(bytes) {
        port.postMessage({spaceBytes: bytes});
      })
    }
  });
});

function simpleDomain(url) {
  var matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  return matches[1];
}

function checkWrite() {
  if (((statistics.size - (statistics.size % writeEvery)) / writeEvery) > statistics.inStoreK) {
    writeToStorage();
  }
}

function writeToStorage() {
  statistics.inStoreK = (statistics.size - (statistics.size % writeEvery)) / writeEvery;
  chrome.storage.local.set({
    pairs: preparePairsStorage(pairs),
    statistics: statistics
  }, function (data) {
    console.log('Successfully written to storage.');
  });
}

chrome.webRequest.onSendHeaders.addListener(
  function (details) {
    if (details.url.substr(0, 6) === 'chrome') return;
    var id = details.tabId;
    if (id === -1) {
      // Chrome system tabs usually have this id
      return
    }
    //https://code.google.com/p/chromium/issues/detail?id=410868
    chrome.tabs.get(id, function (data) {
      var domain = simpleDomain(data.url);
      statistics.size += 1;
      if (domain in statistics.websites) {
        statistics.websites[domain].size += 1;
      } else {
        statistics.websites[domain] = { domain: domain, size: 1 };
      }
      pairs.addRequest(domain, details);
      checkWrite()
    });
  },
  {
    urls: ['<all_urls>']
  },
  ['requestHeaders']
);

chrome.webRequest.onCompleted.addListener(
  function (details) {
    if (details.url.substr(0, 6) === 'chrome') return;
    pairs.addResponse(details);
    statistics.size += 1;
  },
  {urls: ['<all_urls>']},
  ['responseHeaders']);