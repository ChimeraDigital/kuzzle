var
  RequestObject = require('../../core/models/requestObject'),
  BadRequestError = require('../../core/errors/badRequestError'),
  q = require('q');

module.exports = function cleanDb (kuzzle) {
  var
    requestObject = new RequestObject({controller: 'admin', action: 'deleteIndexes'});

  // is a reset has been asked on a worker?
  if (!kuzzle.isServer) {
    return q.reject(new BadRequestError('Only a Kuzzle Server can reset the database'));
  }

  // @todo : manage internal index properly
  return kuzzle.services.list.readEngine.listIndexes(requestObject)
    .then(response => {
      requestObject.data.body.indexes = response.indexes;
      return kuzzle.pluginsManager.trigger('cleanDb:deleteIndexes', requestObject);
    })
    .then(newRequestObject => kuzzle.workerListener.add(newRequestObject))
    .then(() => {
      kuzzle.indexCache.reset();
      kuzzle.pluginsManager.trigger('cleanDb:done', 'Reset done: Kuzzle is now like a virgin, touched for the very first time !');
      return q({databaseReset: true});
    })
    .catch(err => {
      kuzzle.pluginsManager.trigger('cleanDb:error', err);
      return q.reject(new BadRequestError(err));
    });
};