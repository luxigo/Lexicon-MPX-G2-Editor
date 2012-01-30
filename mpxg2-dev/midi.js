var midi=process.binding('midi');
var EventEmitter = require('events').EventEmitter;
midi.input.prototype.__proto__ = EventEmitter.prototype;
module.exports = midi;
