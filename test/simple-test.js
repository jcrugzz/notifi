var test = require('tap').test;
var Notifi = require('../');

var domain = process.env.SLACK_DOMAIN;
var token = process.env.SLACK_TOKEN;
console.log(domain);
console.log(token);
test('do we work with notify?', function (t) {
  t.plan(1);

  var notify = new Notifi({
    type: 'slack',
    domain: domain,
    token: token
  }).dispatch({
    channel: '#test',
    username: 'npm publish',
    text: 'this is a test notification'
  });

  notify.on('error', function (err) {
    t.fail(err.message);
  });

  notify.on('done', function () {
    t.ok(true, 'we should be cool');
  });

});

test('We should retry 3 times and properly fail with a bad token hitting slack', function (t) {
  t.plan(4);
  var notify = new Notifi({
    type: 'slack',
    domain: domain,
    token: '249857293sdaksdklhj48572'
  }).dispatch({
    channel: '#test',
    username: 'whatever',
    text: 'oh hello there'
  });

  notify.on('retry', function (backoff) {
    t.ok(backoff, 'retry # ' + backoff.attempt);
  });

  notify.on('error', function (err) {
    t.ok(true, err.message);
  })

  notify.on('done', function () {
    t.fail('we should not get here');
  })
});
