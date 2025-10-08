'use strict';

/*
 * Dismantler role - Specialized for destroying structures
 * Used in conquest operations to breach walls and destroy infrastructure
 */

roles.dismantler = {};
roles.dismantler.boostActions = ['dismantle'];

roles.dismantler.settings = {
  param: ['controller.level'],
  layoutString: 'MW',  // Move-Work heavy for dismantling
  amount: {
    4: [5, 5],   // 5 MOVE, 5 WORK
    5: [7, 7],   // 7 MOVE, 7 WORK
    6: [10, 10], // 10 MOVE, 10 WORK
    7: [12, 12], // 12 MOVE, 12 WORK
    8: [15, 15], // 15 MOVE, 15 WORK - max 30 parts
  },
  fillTough: true, // Add TOUGH parts for survivability
};

/**
 * findDismantleTarget
 * Finds the best structure to dismantle
 *
 * @param {Creep} creep - The dismantler creep
 * @return {Structure|null} - Target structure
 */
function findDismantleTarget(creep) {
  const room = creep.room;

  // Priority 1: Enemy spawns
  const spawns = room.find(FIND_HOSTILE_SPAWNS);
  if (spawns.length > 0) {
    return creep.pos.findClosestByPath(spawns);
  }

  // Priority 2: Towers
  const towers = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER,
  });
  if (towers.length > 0) {
    return creep.pos.findClosestByPath(towers);
  }

  // Priority 3: Storage and terminal
  const storage = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_STORAGE ||
                   s.structureType === STRUCTURE_TERMINAL,
  });
  if (storage.length > 0) {
    return creep.pos.findClosestByPath(storage);
  }

  // Priority 4: Extensions
  const extensions = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_EXTENSION,
  });
  if (extensions.length > 0) {
    return creep.pos.findClosestByPath(extensions);
  }

  // Priority 5: Labs
  const labs = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LAB,
  });
  if (labs.length > 0) {
    return creep.pos.findClosestByPath(labs);
  }

  // Priority 6: Walls blocking path to important structures
  const walls = room.find(FIND_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_WALL ||
                    s.structureType === STRUCTURE_RAMPART) &&
                   !s.my,
  });

  if (walls.length > 0) {
    // Find weakest wall
    let weakestWall = null;
    let minHits = Infinity;

    for (const wall of walls) {
      if (wall.hits < minHits) {
        minHits = wall.hits;
        weakestWall = wall;
      }
    }

    return weakestWall;
  }

  // Priority 7: Any other hostile structures
  const otherStructures = room.find(FIND_HOSTILE_STRUCTURES);
  if (otherStructures.length > 0) {
    return creep.pos.findClosestByPath(otherStructures);
  }

  return null;
}

/**
 * dismantleStructure
 * Moves to and dismantles target structure
 *
 * @param {Creep} creep - The dismantler creep
 * @param {Structure} target - Target to dismantle
 * @return {boolean} - True if action taken
 */
function dismantleStructure(creep, target) {
  if (!target) return false;

  // Move to target
  const range = creep.pos.getRangeTo(target);

  if (range > 1) {
    creep.moveTo(target, {
      visualizePathStyle: {stroke: '#ff0000'},
      reusePath: 5,
      maxRooms: 1,
    });
    return true;
  }

  // Dismantle the structure
  const result = creep.dismantle(target);

  if (result === OK) {
    creep.say('💥');

    // Report progress on important structures
    if (target.structureType === STRUCTURE_SPAWN ||
        target.structureType === STRUCTURE_TOWER ||
        target.structureType === STRUCTURE_STORAGE) {
      if (Game.time % 10 === 0) {
        creep.log(`Dismantling ${target.structureType}: ${target.hits}/${target.hitsMax}`);
      }
    }
  }

  return true;
}

/**
 * retreatIfHurt
 * Retreats to safety if taking damage
 *
 * @param {Creep} creep - The dismantler creep
 * @return {boolean} - True if retreating
 */
function retreatIfHurt(creep) {
  // Check if we're damaged
  if (creep.hits < creep.hitsMax * 0.7) {
    creep.say('💔');

    // Find nearest healer
    const healer = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (c) => c.memory.role === 'squadheal' &&
                     c.getActiveBodyparts(HEAL) > 0,
    });

    if (healer) {
      creep.moveTo(healer);
      return true;
    }

    // Or retreat to spawn room
    if (!creep.memory.base) {
      creep.memory.base = creep.memory.base;
    }

    const exits = creep.room.find(creep.room.findExitTo(creep.memory.base));
    if (exits.length > 0) {
      creep.moveTo(exits[0]);
      return true;
    }
  }

  return false;
}

roles.dismantler.preMove = function(creep) {
  // Check for nearby enemies
  const enemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3, {
    filter: (c) => c.getActiveBodyparts(ATTACK) > 0 ||
                   c.getActiveBodyparts(RANGED_ATTACK) > 0,
  });

  // Retreat if enemies nearby and we're vulnerable
  if (enemies.length > 0 && creep.hits < creep.hitsMax) {
    const fleePath = PathFinder.search(creep.pos, enemies.map(e => ({
      pos: e.pos,
      range: 5,
    })), {flee: true});

    if (fleePath.path.length > 0) {
      creep.move(creep.pos.getDirectionTo(fleePath.path[0]));
      creep.say('⚠️');
      return true;
    }
  }

  return false;
};

roles.dismantler.action = function(creep) {
  // Set base room if not set
  if (!creep.memory.base) {
    creep.memory.base = (creep.memory.routing && creep.memory.routing.startRoom) ||
                        (creep.memory.routing && creep.memory.routing.targetRoom) ||
                        creep.room.name;
  }

  // Check if we should retreat
  if (retreatIfHurt(creep)) {
    return true;
  }

  // Check if room is in safe mode
  if (creep.room.controller && creep.room.controller.safeMode) {
    creep.say('🛡️');
    creep.log('Room in safe mode, waiting...');
    creep.moveRandom();
    return true;
  }

  // Find dismantle target
  let target = null;

  // Use memory target if valid
  if (creep.memory.dismantleTarget) {
    target = Game.getObjectById(creep.memory.dismantleTarget);
    if (!target) {
      delete creep.memory.dismantleTarget;
    }
  }

  // Find new target if needed
  if (!target) {
    target = findDismantleTarget(creep);
    if (target) {
      creep.memory.dismantleTarget = target.id;
    }
  }

  // Dismantle the target
  if (target) {
    dismantleStructure(creep, target);
  } else {
    // No targets left, room might be cleared
    creep.say('✅');

    // Check if we should help in another room
    if (Memory.conquestTargets) {
      for (const roomName in Memory.conquestTargets) {
        if (roomName !== creep.room.name) {
          creep.memory.routing.targetRoom = roomName;
          return false; // Let routing handle movement
        }
      }
    }

    // Or return to base
    if (creep.room.name !== creep.memory.base) {
      creep.memory.routing.targetRoom = creep.memory.base;
      return false;
    }

    // Nothing to do, recycle
    return Creep.recycleCreep(creep);
  }

  return true;
};