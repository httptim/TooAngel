'use strict';

module.exports = class Operation {
	constructor(name) {
		if (!Memory.operations) Memory.operations = {};
		if (!Memory.operations[name]) Memory.operations[name] = {};

		this.name = name;
		this.memory = Memory.operations[name];
		this.memory.type = 'default';
		this.memory.lastActive = Game.time;

		if (this.memory.roomName) {
			this.roomName = this.memory.roomName;
		}
	}

	setRoom(roomName) {
		this.memory.roomName = roomName;
		this.roomName = roomName;
	}

	getRoom() {
		return this.roomName;
	}

	terminate() {
		this.memory.shouldTerminate = true;
	}

	addCpuCost() {}

	addResourceCost() {}

	addResourceGain() {}
};
