'use strict';

const
  should = require('should'),
  /** @type {Params} */
  params = require('../../../../lib/config'),
  rewire = require('rewire'),
  sinon = require('sinon'),
  PluginsManager = rewire('../../../../lib/api/core/plugins/pluginsManager'),
  KuzzleMock = require('../../../mocks/kuzzle.mock'),
  PluginContext = rewire('../../../../lib/api/core/plugins/pluginContext'),
  PassportStrategy = require('passport-strategy');

describe('Test plugins manager listStrategies', () => {
  let
    sandbox,
    plugin,
    kuzzle,
    pm2Mock,
    context;

  before(() => {
    pm2Mock = function () {
      var universalProcess = {
        name: params.plugins.common.workerPrefix + 'testPlugin',
        pm_id: 42
      };

      var busData = {
        'initialized': {
          process: universalProcess,
          data: {
            events: [
              'foo:bar'
            ]
          }
        },
        'process:event': {
          event: 'exit',
          process: universalProcess
        },
        'ready': {
          process: universalProcess
        }
      };
      var
        busListeners,
        processList,
        uniqueness,
        sentMessages;

      return {
        connect: function (callback) {
          callback();
        },
        list: function (callback) {
          callback(null, processList.map(item => item.process));
        },
        delete: function (pmId, callback) {
          processList = processList.filter(item => {
            return item.process.pm_id !== pmId;
          });
          callback(null);
        },
        start: function (processSpec, callback) {
          var i;
          for(i = 0; i < processSpec.instances; i++) {
            processList.push({
              process: {
                name: processSpec.name,
                pm_id: uniqueness++
              }
            });
          }
          callback();
        },
        launchBus: function (callback) {
          callback(null, {
            on: function (event, cb) {
              var wrapper = function (data) {
                cb(data);
              };
              if (!busListeners[event]) {
                busListeners[event] = [];
              }
              busListeners[event].push(wrapper);
            }
          });
        },
        sendDataToProcessId: function (processId, data, callback) {
          sentMessages.push(data);
          callback(null);
        },
        /** Mock only methods */
        resetMock: () => {
          busListeners = {};
          processList = [];
          uniqueness = 0;
          sentMessages = [];
        },
        getProcessList: () => {
          return processList;
        },
        getSentMessages: function() {
          return sentMessages;
        },
        // Should be used to trigger a particular event on the bus
        triggerOnBus: function (event) {
          if (busListeners[event]) {
            busListeners[event].forEach(item => {
              item(busData[event]);
            });
          }
        },
        initializeList: () => {
          processList = [{process: universalProcess}];
        }
        /** END - Mock only methods */
      };
    }();

    PluginsManager.__set__('console', {
      log: () => {},
      error: () => {},
      warn: () => {},
    });

    PluginsManager.__set__('pm2', pm2Mock);
  });

  beforeEach(() => {
    kuzzle = new KuzzleMock();

    pm2Mock.resetMock();
    sandbox = sinon.sandbox.create();
    kuzzle.pluginsManager = new PluginsManager(kuzzle);
    context = new PluginContext(kuzzle, 'test-auth-plugin');

    plugin = {
      object: {
        init: () => {
          context.accessors.registerStrategy(PassportStrategy, 'local', context, function() {});
        }
      },
      config: {}
    };

    kuzzle.pluginsManager.plugins = {testAuthPlugin: plugin};
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should return a list of registrated authentication strategies', () => {
    return kuzzle.pluginsManager.listStrategies()
      .then(result => {
        should(result).be.an.Array().of.length(0);
      });
  });

  it('should return a strategy when a plugin registers its strategy', () => {
    plugin.object.init();

    return kuzzle.pluginsManager.listStrategies()
      .then(result => {
        should(result).be.an.Array().of.length(1);
        should(result).match(['local']);
      });
  });

  it('should return a duplicate-free strategy list in case multiple plugins register the same strategy', () => {
    let plugins = kuzzle.pluginsManager.plugins;
    plugins.otherTestAuthPlugin = plugins.testAuthPlugin;

    Object.keys(plugins).forEach(p => plugins[p].object.init());

    return kuzzle.pluginsManager.listStrategies()
      .then(result => {
        should(result).be.an.Array().of.length(1);
        should(result).match(['local']);
      });
  });
});
