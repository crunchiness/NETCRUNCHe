'use strict';

var statistics = {
  websites: {},
  size: 0
};

var pairs = {
  globalList : {},
  websiteList : {},
  addRequest : function (domain, request) {
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
  },
  addResponse : function (response) {
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
};

chrome.browserAction.onClicked.addListener(function (activeTab) {
  var newURL = 'main.html';
  chrome.tabs.create({ url: newURL });
});

chrome.runtime.onConnect.addListener(function(port) {
  console.assert(port.name === 'mainToBackground');
  port.onMessage.addListener(function(msg) {
    if (msg.get === 'statistics') {
      port.postMessage({statistics: statistics});
    } else if (msg.get === 'pairs') {
      port.postMessage({pairs: pairs.websiteList});
    }
  });
});

function simpleDomain(url) {
  var matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  return matches[1];
}

chrome.webRequest.onSendHeaders.addListener(
  function (details) {
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
    });
  },
  {
    urls: ['<all_urls>']
  },
  ['requestHeaders']
);

chrome.webRequest.onCompleted.addListener(
  function (details) {
    pairs.addResponse(details);
  },
  {urls: ['<all_urls>']},
  ['responseHeaders']);