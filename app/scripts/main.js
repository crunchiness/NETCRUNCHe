'use strict';

angular.module('mainApp', [])
  .controller('mainCtrl', function ($scope, $timeout) {

    var port = chrome.runtime.connect({name: 'mainToBackground'});
    (function tick() {
      port.postMessage({get: 'statistics'});
      $timeout(tick, 1000);
    })();
    port.postMessage({get: 'pairs'});
    port.onMessage.addListener(function (msg) {
      if (msg.statistics) {
        $scope.statistics = msg.statistics;
      } else if (msg.pairs) {
        $scope.pairs = JSON.stringify(msg.pairs);
      }
      $scope.$digest();
    });
    $scope.statistics = {};
  });