'use strict';

/* global BODYPART_COST MAX_CREEP_SIZE TOUGH ATTACK RANGED_ATTACK HEAL */

module.exports = class SpawnRole {
	/**
	 * Adds spawn options for the given room.
	 *
	 * @param {Room} room
	 *   The room to add spawn options for.
	 * @param {Object[]} options
	 *   A list of spawn options to add to.
	 */
	getSpawnOptions() {}

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
		return [];
	}

	/**
	 * Gets which boosts to use on a new creep.
	 *
	 * @param {Room} room
	 *   The room to add spawn options for.
	 * @param {Object} option
	 *   The spawn option for which to generate the body.
	 * @param {string[]} body
	 *   The body generated for this creep.
	 *
	 * @return {Object}
	 *   The boost compound to use keyed by body part type.
	 */
	getCreepBoosts() {
		return null;
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
	getCreepMemory() {
		return {};
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
	onSpawn() {}

	/**
	 * Dynamically generates a creep body using body part weights and limits.
	 *
	 * @param {object} weights
	 *   Weights specifying how to distribute the different body part types.
	 * @param {number} maxCost
	 *   Maximum cost for the creep.
	 * @param {object} maxParts
	 *   Maximum number of parts of certain types to use.
	 *
	 * @return {string[]}
	 *   List of parts that make up the requested creep.
	 */
	generateCreepBodyFromWeights(weights, maxCost, maxParts) {
		const totalWeight = _.sum(weights);
		const newParts = {};
		let size = 0;
		let cost = 0;

		if (!maxCost) {
			maxCost = 300;
		}

		// Generate initial body containing at least one of each part.
		for (const part of _.keys(weights)) {
			newParts[part] = 1;
			size++;
			cost += BODYPART_COST[part];
		}

		if (cost > maxCost) {
			return null;
		}

		let done = false;
		while (!done && size < MAX_CREEP_SIZE) {
			done = true;
			_.each(weights, (weight, part) => {
				const currentWeight = newParts[part] / size;
				if (currentWeight > weight / totalWeight) return;
				if (cost + BODYPART_COST[part] > maxCost) return;

				if (maxParts && maxParts[part] && newParts[part] >= maxParts[part]) {
					// Limit for this bodypart has been reached, so stop adding.
					done = true;
					return false;
				}

				done = false;
				newParts[part]++;
				size++;
				cost += BODYPART_COST[part];

				if (size >= MAX_CREEP_SIZE) {
					// Maximum creep size reached, stop adding parts.
					return false;
				}
			});
		}

		// Chain the generated configuration into an array of body parts.
		const body = [];

		if (newParts.tough) {
			for (let i = 0; i < newParts.tough; i++) {
				body.push(TOUGH);
			}

			delete newParts.tough;
		}

		done = false;
		while (!done) {
			done = true;
			for (const part in newParts) {
				if (part === ATTACK || part === RANGED_ATTACK || part === HEAL) continue;
				if (newParts[part] > 0) {
					body.push(part);
					newParts[part]--;
					done = false;
				}
			}
		}

		// Add military parts last to keep fighting effeciency.
		const lastParts = [RANGED_ATTACK, ATTACK, HEAL];
		for (const part of lastParts) {
			for (let i = 0; i < newParts[part] || 0; i++) {
				body.push(part);
			}
		}

		return body;
	}

	/**
	 * Calculates the best available boost for a body part to use.
	 *
	 * @param {Room} room
	 *   The room to add spawn options for.
	 * @param {String[]} body
	 *   The body generated for this creep.
	 * @param {String} partType
	 *   The body part type to apply boosts to.
	 * @param {String} boostType
	 *   The type of boost to use.
	 *
	 * @return {Object}
	 *   The boost compound to use keyed by body part type.
	 */
	generateCreepBoosts(room, body, partType, boostType) {
		if (!room.canSpawnBoostedCreeps()) return;

		const availableBoosts = room.getAvailableBoosts(boostType);
		const numAffectedParts = _.countBy(body)[partType] || 0;
		let bestBoost;
		for (const resourceType in availableBoosts || []) {
			if (availableBoosts[resourceType].available < numAffectedParts) continue;

			if (!bestBoost || availableBoosts[resourceType].effect > availableBoosts[bestBoost].effect) {
				bestBoost = resourceType;
			}
		}

		if (!bestBoost) return;

		return {
			[partType]: bestBoost,
		};
	}

	/**
	 * Calculates the cost of a creep body array.
	 *
	 * @param {String[]} body
	 *   A creep body.
	 *
	 * @return {number}
	 *   The energy cost of the provided body.
	 */
	calculateBodyCost(body) {
		return _.reduce(body, (sum, part) => sum + BODYPART_COST[part], 0);
	}
};
