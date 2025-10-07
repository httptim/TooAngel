'use strict';

const Operation = require('./operation');

module.exports = class RemoteMiningOperation extends Operation {
	constructor(name) {
		super(name);
		this.memory.type = 'mining';
	}
};
