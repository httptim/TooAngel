'use strict';

/* global hivemind RoomPosition FIND_STRUCTURES STRUCTURE_POWER_BANK OK
POWER_BANK_DECAY FIND_MY_CREEPS HEAL_POWER RANGED_HEAL_POWER HEAL
FIND_DROPPED_RESOURCES RESOURCE_POWER */

const Role = require('./role');

const PowerHarvesterRole = function () {
	Role.call(this);

	// Power harvesters have high priority because there is a time limit.
	this.stopAt = 0;
	this.throttleAt = 2000;
};

PowerHarvesterRole.prototype = Object.create(Role.prototype);

/**
 * Makes a creep act like a power harvester.
 *
 * @param {Creep} creep
 *   The creep to run logic for.
 */
PowerHarvesterRole.prototype.run = function (creep) {
	const targetPosition = new RoomPosition(25, 25, creep.memory.targetRoom);
	const isInTargetRoom = creep.pos.roomName === targetPosition.roomName;
	if (!isInTargetRoom || (!creep.isInRoom() && creep.getNavMeshMoveTarget())) {
		if (creep.moveUsingNavMesh(targetPosition) !== OK) {
			hivemind.log('creeps').debug(creep.name, 'can\'t move from', creep.pos.roomName, 'to', targetPosition.roomName);
			// @todo This is cross-room movement and should therefore only calculate a path once.
			creep.moveToRange(targetPosition, 3);
		}

		return;
	}

	creep.stopNavMeshMove();

	const powerBanks = creep.room.find(FIND_STRUCTURES, {
		filter: structure => structure.structureType === STRUCTURE_POWER_BANK,
	});

	// Update power bank health in memory.
	if (Memory.strategy && Memory.strategy.power && Memory.strategy.power.rooms && Memory.strategy.power.rooms[creep.pos.roomName]) {
		if (powerBanks.length > 0) {
			Memory.strategy.power.rooms[creep.pos.roomName].hits = powerBanks[0].hits;
			Memory.strategy.power.rooms[creep.pos.roomName].decays = Game.time + (powerBanks[0].ticksToDecay || POWER_BANK_DECAY);
		}
		else {
			Memory.strategy.power.rooms[creep.pos.roomName].hits = 0;
		}
	}

	if (powerBanks.length > 0) {
		this.attackPowerBank(creep, powerBanks[0]);
		return;
	}

	const powerResources = creep.room.find(FIND_DROPPED_RESOURCES, {
		filter: resource => resource.resourceType === RESOURCE_POWER,
	});

	if (powerResources.length === 0) {
		// Mark operation as finished.
		if (Memory.strategy && Memory.strategy.power && Memory.strategy.power.rooms && Memory.strategy.power.rooms[creep.memory.targetRoom]) {
			Memory.strategy.power.rooms[creep.memory.targetRoom].isActive = false;
			Memory.strategy.power.rooms[creep.memory.targetRoom].amount = 0;
		}

		// @todo Once we're done harvesting power, switch to escorting the haulers.
		creep.suicide();
	}

	// @todo Move out of the way (use flee), but escort haulers back home.
	const center = new RoomPosition(25, 25, creep.pos.roomName);
	if (creep.pos.getRangeTo(center) > 5) {
		creep.moveToRange(center, 5);
	}
};

/**
 * Makes this creep attack a power bank.
 *
 * @param {Creep} creep
 *   The creep to run logic for.
 * @param {StructurePowerBank} powerBank
 *   The power bank to attack.
 */
PowerHarvesterRole.prototype.attackPowerBank = function (creep, powerBank) {
	if (creep.memory.isHealer) {
		const damagedCreep = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
			filter: otherCreep => otherCreep.memory.role === 'harvester.power' && (otherCreep.hits + (otherCreep.incHealing || 0)) < otherCreep.hitsMax,
		});
		// @todo Find most wounded in range 1, failing that, look further away.

		if (damagedCreep) {
			let healPower = HEAL_POWER;
			if (creep.pos.getRangeTo(damagedCreep) > 1) {
				creep.moveToRange(damagedCreep, 1);
				healPower = RANGED_HEAL_POWER;
			}

			if (creep.pos.getRangeTo(damagedCreep) <= 3) {
				creep.heal(damagedCreep);
				damagedCreep.incHealing = (damagedCreep.incHealing || 0) + (creep.memory.body[HEAL] * healPower);
			}
		}
		else if (creep.pos.getRangeTo(powerBank) > 5) {
			creep.moveToRange(powerBank, 5);
		}
	}
	else {
		if (creep.pos.getRangeTo(powerBank) > 1) {
			creep.moveToRange(powerBank, 1);
			return;
		}

		if (creep.hits >= creep.hitsMax * 0.7) {
			creep.attack(powerBank);
		}
	}
};

module.exports = PowerHarvesterRole;
