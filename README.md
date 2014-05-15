# notifi

simple little module that sends a JSON payload to an arbitary endpoint or more
specifically, the `slack`/`hipchat` notification APIs. The main purpose of
this is to be a singular dispatcher with an expected format that works
seamlessly with all of these services. Options will be smartly intuited in the
constructor.

## Example

```js
//
// Example with slack
//
var notify = require('notifi');

var options = {
  token: 'p19845osdfgsd0998',
  domain: 'myCompany'
};

var note = notify(options);

var payload = {
  channel: '#general',
  text: 'Here is my message!',
  username: 'notifier'
};

note.on('error', function (err) {
  console.error(err);
});

note.on('done', function () {
  console.log('finished');
});

note.dispatch(payload);

```

This shows the event emitter interface, you can also pass the `dispatch`
a callback as the second argument and handle the error/response that way.
