'use strict';

var app = angular.module('mainApp', [])
  .config([
    '$compileProvider',
    function ($compileProvider) {
      $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|blob|chrome-extension):/);
    }
  ])
  .controller('mainCtrl', ['$scope', '$timeout', '$window', function ($scope, $timeout, $window) {
    $scope.url = '';
    $scope.serviceList = [];
    var port = chrome.runtime.connect({name: 'mainToBackground'});
    (function tick() {
      port.postMessage({get: 'statistics'});
      $timeout(tick, 1000);
    })();
    port.postMessage({get: 'pairs'});
    port.postMessage({get: 'space'});
    port.postMessage({get: 'serviceList'});
    port.onMessage.addListener(function (msg) {
      if (msg.statistics) {
        $scope.statistics = msg.statistics;
      } else if (msg.data) {
        var data = JSON.stringify(msg.data);
        var blob = new Blob([data] , {type: 'application/json'});
        $scope.url = $window.URL.createObjectURL(blob);
      } else if (msg.spaceBytes) {
        $scope.space = msg.spaceBytes;
      } else if (msg.serviceList) {
        $scope.serviceListString = msg.serviceList.join('\n');
      }
      $scope.$digest();
    });
    $scope.statistics = {};
    $scope.updateServiceList = function () {
      port.postMessage({updateServiceList: $scope.serviceListString.split('\n')});
    };
    $scope.resetServiceList = function () {
      port.postMessage({get: 'serviceList'});
    };
    $scope.deleteData = function () {
      port.postMessage({delete: 'data'});
      port.postMessage({get: 'space'});
    }
  }]);

app.filter('bytes', function () {
  return function (bytes, precision) {
    if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
    if (typeof precision === 'undefined') precision = 1;
    var units = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'],
      number = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) + ' ' + units[number];
  };
});