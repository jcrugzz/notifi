var EE = require('events').EventEmitter;
var url = require('url');
var util = require('util');
var debug = require('debug');
var http = require('http-https');
var back = require('back');

var extend = util._extend;

module.exports = Notifi;

util.inherits(Notifi, EE);

function Notifi (options) {
  if (!(this instanceof Notifi)) { return new Notifi(options) }
  if (!options.type) {
    throw new Error('You must define a type for proper detection');
  }
  this.type = options.type;
  // fucking domains on event emitters
  this._domain = options.domain;
  // Handle auth for arbitrary endpoints
  this.auth = options.auth;
  this.token = options.token;
  this.reconnect = options.reconnect || { minDelay: 100, maxDelay: 10000, retries: 3 };

  this.url = options.url;

  // If url is provided, use it otherwise default to slack
  // TODO: integrate hipchat in a nice way as well

  if (!this.url && (!this._domain || !this.token )) {
    throw new Error('Must have a url or a domain and token');
  }

  this.url = this.url || 'https://' + this._domain + '.slack.com/services/hooks/incoming-webhook?token=' + this.token;

}

Notifi.prototype.dispatch = function (message, callback) {
  if (callback && typeof callback === 'function') {
    this._callback = callback;
  }

  var payload = !Buffer.isBuffer(message)
    ? new Buffer(JSON.stringify(message), 'utf8')
    : message;

  // Do i technically need to make a copy for rety?
  var copy = new Buffer(payload.length);
  payload.copy(copy);

  var opts = url.parse(this.url);
  opts.method = 'POST';
  opts.headers = {
    'content-type': 'application/json'
  };

  var req = http.request(opts);
  req.on('error', this._onError.bind(this, copy));
  req.on('response', this._onResponse.bind(this, copy));
  req.write(payload);
  req.end();

  return this;
};

Notifi.prototype._onError = function (payload, err) {
  // Extend this so we can possibly reuse the values on a backoff
  // in the future
  this.attempt = this.attempt || extend({}, this.reconnect);
  return back(function (fail, backoff) {
    if (fail) {
      this.attempt = null;
      debug('backoff failed, endpoint down')
      return this._callback
        ? this._callback(err)
        : this.emit('error', err);
    }
    debug('retrying request #%d', backoff.attempt);
    this.emit('retry', backoff);
    this.dispatch(payload);

  }.bind(this), this.attempt);
};

Notifi.prototype._onResponse = function (payload, res) {
  if (res.statusCode !== 200) {
    res.destroy();
    return this._onError(payload, new Error('Endpoint returned with statusCode ' + res.statusCode));
  }

  res.destroy();
  return this._callback
    ? this._callback()
    : this.emit('done');
};

