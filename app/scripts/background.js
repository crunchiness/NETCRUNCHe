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
var serviceList = ['youtube.com', 'facebook.com', 'tumblr.com'];
var writeEvery = 200;
/* Active Tab over time
 *
 * objects:
 *  {timeStamp, tabId}
 */
var activeTab = [];
/* Tab changes over time (which service opened in tab)
 *
 * keys:
 *  tabId
 *
 * objects:
 *  {timeStamp, website}
 */
var tabChanges = {};

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
  if (('pairs' in data) && ('statistics' in data) && ('activeTab' in data) && ('tabChanges' in data)) {
    pairs = enrichPairs(data.pairs);
    statistics = data.statistics;
    serviceList = data.serviceList;
    activeTab = data.activeTab;
    tabChanges = data.tabChanges;
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
      port.postMessage({
        data: {
          pairs: pairs.websiteList,
          activeTab: activeTab,
          tabChanges: tabChanges
        }
      });
    } else if (msg.get === 'space') {
      chrome.storage.local.getBytesInUse(function(bytes) {
        port.postMessage({spaceBytes: bytes});
      })
    } else if (msg.get === 'serviceList') {
      port.postMessage({serviceList: serviceList});
    } else if (msg.updateServiceList) {
      serviceList = msg.updateServiceList;
      writeToStorage();
    } else if (msg.delete === 'data') {
      chrome.storage.local.clear(function () {
        pairs = enrichPairs();
        statistics = {
          websites: {},
          size: 0,
          inStoreK: 0
        };
        activeTab = [];
        tabChanges = {};
      })
    }
  });
});

function simpleDomain(url) {
  var matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  try {
    var domain = matches[1];
  } catch (e) {
    return 'Other'
  }
  if (domain.substr(0,4) === 'www.') {
    domain = domain.substr(4);
  }
  if (serviceList.indexOf(domain) === -1) {
    domain = 'Other'
  }
  return domain;
}

function checkWrite() {
  if (((statistics.size - (statistics.size % writeEvery)) / writeEvery) > statistics.inStoreK) {
    writeToStorage();
    //sendToLocalhost();
  }
}

function writeToStorage() {
  statistics.inStoreK = (statistics.size - (statistics.size % writeEvery)) / writeEvery;
  chrome.storage.local.set({
    pairs: preparePairsStorage(pairs),
    statistics: statistics,
    serviceList: serviceList,
    activeTab: activeTab,
    tabChanges: tabChanges
  }, function (data) {
    console.log('Successfully written to storage.');
  });
}

function sendToLocalhost() {
  var url = 'http://localhost:8000';
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.open('POST', url);
  xmlhttp.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
  xmlhttp.send(JSON.stringify({
      pairs: preparePairsStorage(pairs),
      statistics: statistics,
      serviceList: serviceList,
      activeTab: activeTab,
      tabChanges: tabChanges
    }));
}

// updates tab address
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'loading') {
    var now = Date.now();
    var domain = simpleDomain(changeInfo.url);
    var tabUpdate = {
      website: domain,
      timeStamp: now
    };
    if (tabId in tabChanges) {
      if (tabChanges[tabId].length && tabChanges[tabId][tabChanges[tabId].length-1].website === domain) {
        return;  // domain didn't change
      }
      tabChanges[tabId].push(tabUpdate);
    } else {
      tabChanges[tabId] = [tabUpdate];
    }
  }
});

// tracks active tab
chrome.tabs.onActivated.addListener(function(activeInfo) {
  var id = activeInfo.tabId;
  var now = Date.now();
  var activeUpdate = {
    id: id,
    timeStamp: now
  };
  activeTab.push(activeUpdate);
  chrome.tabs.get(id, function (data) {
    var domain = simpleDomain(data.url);
    var tabUpdate = {
      website: domain,
      timeStamp: now
    };
    if (id in tabChanges) {
      if (tabChanges[id].length && tabChanges[id][tabChanges[id].length-1].website === domain) {
        // user opened old tab
        return
      } else {
        tabChanges[id].push(tabUpdate);
      }
    } else {
      tabChanges[id] = [tabUpdate];
    }
  });
});

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
      if (serviceList.indexOf(domain) === -1)
        return;
      statistics.size += 1;
      if (domain in statistics.websites) {
        statistics.websites[domain].size += 1;
      } else {
        statistics.websites[domain] = { domain: domain, size: 1 };
      }
      var justDetails = {
        tabId: details.tabId,
        requestId: details.requestId,
        timeStamp: details.timeStamp
      };
      pairs.addRequest(domain, justDetails);
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
    var justDetails = {
      fromCache: details.fromCache,
      ip: details.ip,
      requestId: details.requestId,
      tabId: details.tabId,
      timeStamp: details.timeStamp
    };
    pairs.addResponse(justDetails);
  },
  {urls: ['<all_urls>']},
  ['responseHeaders']);