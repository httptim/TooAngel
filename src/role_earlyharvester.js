'use strict';

/**
 * Early harvester role - Implements Tigga-style aggressive early expansion
 *
 * This creep:
 * 1. Harvests from adjacent rooms very early in the game
 * 2. Brings energy back to base to fuel growth
 * 3. Operates with minimal body parts for maximum efficiency
 */

roles.earlyharvester = {};

// Simple body configuration for early game
roles.earlyharvester.settings = {
  param: ['energyCapacityAvailable'],
  layoutString: 'WCM',
  amount: {
    300: [1, 1, 1],   // Minimum: W1 C1 M1
    400: [2, 1, 1],   // Better: W2 C1 M1
    550: [2, 2, 2],   // Good: W2 C2 M2
    800: [3, 3, 3],   // Great: W3 C3 M3
  },
  maxLayoutAmount: 3,
};

roles.earlyharvester.buildRoad = false; // Don't build roads early
roles.earlyharvester.killPrevious = false; // Keep all early harvesters alive
roles.earlyharvester.flee = true; // Run from danger

/**
 * getSource - Gets the source for this harvester
 */
function getSource(creep) {
  if (!creep.memory.routing.targetId) {
    // Find closest source if no specific target
    const sources = creep.room.find(FIND_SOURCES);
    if (sources.length > 0) {
      creep.memory.routing.targetId = creep.pos.findClosestByPath(sources).id;
    }
  }
  return Game.getObjectById(creep.memory.routing.targetId);
}

/**
 * shouldReturnToBase - Determines if the creep should go back to base
 */
function shouldReturnToBase(creep) {
  // Return if full
  if (_.sum(creep.carry) >= creep.carryCapacity * 0.9) {
    return true;
  }

  // Return if the source is empty and we have some energy
  const source = getSource(creep);
  if (source && source.energy === 0 && creep.carry.energy > 0) {
    return true;
  }

  // Return if low on TTL and carrying energy
  if (creep.ticksToLive < 150 && creep.carry.energy > 0) {
    return true;
  }

  return false;
}

/**
 * findDroppedEnergy - Picks up dropped energy in range
 */
function findDroppedEnergy(creep) {
  const droppedEnergy = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {
    filter: (resource) => resource.resourceType === RESOURCE_ENERGY
  });

  if (droppedEnergy.length > 0) {
    const closest = creep.pos.findClosestByPath(droppedEnergy);
    if (closest) {
      if (creep.pickup(closest) === ERR_NOT_IN_RANGE) {
        creep.moveTo(closest);
        return true;
      }
    }
  }
  return false;
}

/**
 * harvestSource - Harvest from the target source
 */
function harvestSource(creep) {
  const source = getSource(creep);
  if (!source) {
    creep.log('No source found!');
    return false;
  }

  // Check for container near source
  const containers = source.pos.findInRange(FIND_STRUCTURES, 2, {
    filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
  });

  // Prefer taking from container if available
  if (containers.length > 0 && _.sum(creep.carry) < creep.carryCapacity) {
    const container = containers[0];
    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(container);
    }
    return true;
  }

  // Otherwise harvest directly
  const result = creep.harvest(source);
  if (result === ERR_NOT_IN_RANGE) {
    creep.moveTo(source);
  } else if (result !== OK && result !== ERR_NOT_ENOUGH_RESOURCES) {
    creep.log('Harvest error: ' + result);
  }
  return true;
}

/**
 * deliverToBase - Deliver energy to base structures
 */
function deliverToBase(creep) {
  // Priority order for delivery in early game
  const targets = [];

  // 1. Spawns that need energy
  const spawns = creep.room.find(FIND_MY_SPAWNS, {
    filter: (spawn) => spawn.energy < spawn.energyCapacity
  });
  targets.push(...spawns);

  // 2. Extensions that need energy
  const extensions = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (structure) => {
      return structure.structureType === STRUCTURE_EXTENSION &&
             structure.energy < structure.energyCapacity;
    }
  });
  targets.push(...extensions);

  // 3. Towers (if any)
  const towers = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (structure) => {
      return structure.structureType === STRUCTURE_TOWER &&
             structure.energy < structure.energyCapacity * 0.8;
    }
  });
  targets.push(...towers);

  // 4. Storage (if we have one)
  if (creep.room.storage && creep.room.storage.my) {
    targets.push(creep.room.storage);
  }

  // 5. Containers near spawn/controller
  const containers = creep.room.find(FIND_STRUCTURES, {
    filter: (s) => {
      if (s.structureType !== STRUCTURE_CONTAINER) {
        return false;
      }
      // Check if near spawn or controller
      const nearSpawn = s.pos.findInRange(FIND_MY_SPAWNS, 3).length > 0;
      const nearController = s.pos.inRangeTo(creep.room.controller, 3);
      return (nearSpawn || nearController) && _.sum(s.store) < s.storeCapacity;
    }
  });
  targets.push(...containers);

  if (targets.length > 0) {
    const target = creep.pos.findClosestByPath(targets);
    if (target) {
      if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
      }
      return true;
    }
  }

  // If no targets, drop energy near spawn for others to use
  const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
  if (spawn) {
    if (creep.pos.getRangeTo(spawn) > 2) {
      creep.moveTo(spawn);
    } else {
      creep.drop(RESOURCE_ENERGY);
    }
  }

  return false;
}

/**
 * Main action for early harvester
 */
roles.earlyharvester.action = function(creep) {
  // State machine for early harvester behavior
  if (!creep.memory.harvesting && _.sum(creep.carry) === 0) {
    creep.memory.harvesting = true;
  }
  if (creep.memory.harvesting && shouldReturnToBase(creep)) {
    creep.memory.harvesting = false;
  }

  if (creep.memory.harvesting) {
    // We're harvesting - go to target room if not there
    if (creep.room.name !== creep.memory.routing.targetRoom) {
      creep.moveTo(new RoomPosition(25, 25, creep.memory.routing.targetRoom));
      return true;
    }

    // In target room - harvest
    // First check for dropped energy
    if (!findDroppedEnergy(creep)) {
      harvestSource(creep);
    }
  } else {
    // We're delivering - go to base room if not there
    if (creep.room.name !== creep.memory.base) {
      creep.moveTo(new RoomPosition(25, 25, creep.memory.base));
      return true;
    }

    // In base room - deliver
    deliverToBase(creep);
  }

  // Spawn replacement when getting old
  if (creep.ticksToLive < 200 && !creep.memory.replacementSpawned) {
    const room = Game.rooms[creep.memory.base];
    if (room) {
      room.checkRoleToSpawn('earlyharvester', 1,
        creep.memory.routing.targetId,
        creep.memory.routing.targetRoom);
      creep.memory.replacementSpawned = true;
    }
  }

  return true;
};

/**
 * Called while creep is still spawning
 */
roles.earlyharvester.preMove = function(creep) {
  // Pick up any energy near us while moving
  const resources = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY
  });
  if (resources.length > 0) {
    creep.pickup(resources[0]);
  }
};