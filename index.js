var EE = require('events').EventEmitter;
var url = require('url');
var util = require('util');
var debug = require('debug');
var http = require('http-https');
var back = require('back');

var extend = util._extend;

var TYPES = ['hipchat', 'slack'];

module.exports = Notifi;

util.inherits(Notifi, EE);

function Notifi (options) {
  if (!(this instanceof Notifi)) { return new Notifi(options) }
  options = options || {};

  this.type = options.type && options.type.toLowerCase();

  if (!options.url && !~TYPES.indexOf(this.type)) {
    throw new Error('Must be of type hipchat/slack or you must provide a URL with optional auth');
  }

  if(this.type === 'hipchat' && (!options.token || (!options.room && !options.room_id))) {
    throw new Error('Hipchat requires a token and a room to be given');
  }

  if (this.type === 'slack' && (!options.token || !options.domain)) {
    throw new Error('Slack requires a token and a domain to be given');
  }

  // fucking domains on event emitters
  this._domain = options.domain;
  this.room = options.room || options.room_id || options.channel;

  // Handle auth for arbitrary endpoints
  // either expect a user/pass in the object or a user:auth string
  this.auth = options.auth && typeof options.auth !== 'string'
    ? [(options.auth.user || options.auth.username), (options.auth.pass || options.auth.password)].join(':')
    : options.auth;

  this.token = options.token;
  this.reconnect = options.reconnect || { minDelay: 200, maxDelay: 10000, retries: 3 };

  this.url = options.url;

  //
  // If we have to make a terrible x-www-form-urlencoded request, this is true
  //
  this.terrible = this.type === 'hipchat' || (this.token && !this._domain);
  //
  // We either get a URL for an arbitrary endpoint or the correct parameters
  // for sending to either slack or hipchat. That covers the basis of what we
  // care about
  //
  if (!this.url) {
    this.url = this.type === 'slack' || this._domain && this.token
      ? 'https://' + this._domain + '.slack.com/services/hooks/incoming-webhook?token=' + this.token
      : 'https://api.hipchat.com/v2/room/' + encodeURIComponent(this.room) +'/notification?auth_token=' + this.token;
  }

}

Notifi.prototype.dispatch = function (message, callback) {
  if (callback && typeof callback === 'function') {
    this._callback = callback;
  }

  if (this.room && this.type === 'slack') {
    message.channel = this.room || message.channel;
  }

  var payload = !Buffer.isBuffer(message)
    ? new Buffer(this.createPayload(message), 'utf8')
    : message;

  if (!payload) {
    return this.error(new Error('Malformed payload'));
  }

  // Remark: Do i technically need to make a copy for retry?
  var copy = new Buffer(payload.length);
  payload.copy(copy);

  var opts = url.parse(this.url);
  opts.method = 'POST';
  opts.agent = false;
  opts.headers = {
    'content-type': 'application/json',
    'content-length': payload.length,
    'connection': 'close'
  };

  // Handle basic auth if provided
  if (this.auth) {
    opts.headers['Authorization'] = 'Basic ' +
      new Buffer(this.auth, 'utf8').toString('base64');
  }

  var req = http.request(opts);
  req.on('error', this._onError.bind(this, copy));
  req.on('response', this._onResponse.bind(this, copy));
  req.write(payload);
  req.end();

  return this;
};

//
// Create a terrible non JSON payload if we detect we are trying to send to
// hipchat. TODO: Maybe do some key checking in here?
//
// HipChat mappings:
// 1. username -> from
// 2. text -> message
//
// #3 is just in case
//
Notifi.prototype.createPayload = function (message) {
  if (!this.terrible) {
    return JSON.stringify(message);
  }

  var hipchat = Object.keys(message)
    .filter(function (key) {
      return ~['message_format', 'color', 'message', 'notify', 'text'].indexOf(key);
    }).reduce(function (acc, key) {
      switch(key) {
        case 'text':
          acc['message'] = message[key];
          break;
        default:
          acc[key] = message[key];
          break;
      }
      return acc;
    }, {});

    hipchat['message_format'] = hipchat['message_format'] || 'text';

    return JSON.stringify(hipchat);
};

Notifi.prototype._onError = function (payload, err) {
  // Extend this so we can possibly reuse the values on a backoff
  // in the future
  this.attempt = this.attempt || extend({}, this.reconnect);
  return back(function (fail, backoff) {
    if (fail) {
      this.attempt = null;
      debug('backoff failed, endpoint down')
      return this.error(new Error('Failed with ' + err.message
                                  + ' after ' + this.reconnect.retries
                                  + ' retries'));
    }
    debug('retrying request #%d', backoff.attempt);
    this.emit('retry', backoff);
    this.dispatch(payload);

  }.bind(this), this.attempt);
};

Notifi.prototype._onResponse = function (payload, res) {
  if (res.statusCode !== 200 && res.statusCode !== 204) {
    res.destroy();
    return this._onError(payload, new Error('Endpoint returned with statusCode ' + res.statusCode));
  }
  res.destroy();
  return this._callback
    ? this._callback()
    : this.emit('done');
};

Notifi.prototype.error = function (err) {
  return this._callback
    ? this._callback(err)
    : this.emit('error', err);
};
