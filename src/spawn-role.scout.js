'use strict';

/* global MOVE */

const interShard = require('./intershard');
const utilities = require('./utilities');
const SpawnRole = require('./spawn-role');

module.exports = class ScoutSpawnRole extends SpawnRole {
	/**
	 * Adds scout spawn options for the given room.
	 *
	 * @param {Room} room
	 *   The room to add spawn options for.
	 * @param {Object[]} options
	 *   A list of spawn options to add to.
	 */
	getSpawnOptions(room, options) {
		this.addIntershardSpawnOptions(room, options);

		// Don't spawn scouts in quick succession.
		// If they die immediately, the might be running into enemies right outside
		// of the room.
		if (room.memory.recentScout && Game.time - (room.memory.recentScout || -500) < 500) return;

		const roomScouts = _.filter(Game.creepsByRole.scout, creep => creep.memory.origin === room.name);
		if (_.size(roomScouts) > 0 || !room.needsScout()) return;

		options.push({
			priority: 1,
			weight: 0,
		});
	}

	/**
	 * Adds scout spawn options for intershard scouting.
	 *
	 * @param {Room} room
	 *   The room to add spawn options for.
	 * @param {Object[]} options
	 *   A list of spawn options to add to.
	 */
	addIntershardSpawnOptions(room, options) {
		// Check if a portal requires a scout and has this room as origin.
		const memory = interShard.getLocalMemory();

		_.each(memory.scouting, (isActive, shardName) => {
			_.each(memory.portals[shardName], (info, portalPos) => {
				if (info.scouted && Game.time - info.scouted < 2000) return;

				// Only spawn scout if we're repsonsible for the portal room.
				const pos = utilities.decodePosition(portalPos);
				if (!Memory.strategy || !Memory.strategy.roomList[pos.roomName]) return;
				if (Memory.strategy.roomList[pos.roomName].origin !== room.name) return;

				options.push({
					priority: 1,
					weight: 0,
					shard: shardName,
					portalTarget: portalPos,
				});
			});
		});
	}

	/**
	 * Gets the body of a creep to be spawned.
	 *
	 * @param {Room} room
	 *   The room to add spawn options for.
	 * @param {Object} option
	 *   The spawn option for which to generate the body.
	 *
	 * @return {string[]}
	 *   A list of body parts the new creep should consist of.
	 */
	getCreepBody() {
		return [MOVE];
	}

	/**
	 * Gets memory for a new creep.
	 *
	 * @param {Room} room
	 *   The room to add spawn options for.
	 * @param {Object} option
	 *   The spawn option for which to generate the body.
	 *
	 * @return {Object}
	 *   The boost compound to use keyed by body part type.
	 */
	getCreepMemory(room, option) {
		const memory = {origin: room.name};

		if (option.portalTarget) {
			memory.portalTarget = option.portalTarget;
		}

		return memory;
	}

	/**
	 * Act when a creep belonging to this spawn role is successfully spawning.
	 *
	 * @param {Room} room
	 *   The room the creep is spawned in.
	 * @param {Object} option
	 *   The spawn option which caused the spawning.
	 * @param {string[]} body
	 *   The body generated for this creep.
	 * @param {string} name
	 *   The name of the new creep.
	 */
	onSpawn(room, option) {
		if (!option.portalTarget) {
			room.memory.recentScout = Game.time;
			return;
		}

		// Store scout spawn time in intershard memory.
		const memory = interShard.getLocalMemory();
		memory.portals[option.shard][option.portalTarget].scouted = Game.time;
		interShard.writeLocalMemory();
	}
};
