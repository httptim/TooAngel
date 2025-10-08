'use strict';

/*
 * squadsiege is part of a squad to attack a room
 *
 * Attacks structures, runs away if I will be destroyed (hopefully)
 */

roles.squadsiege = {};

roles.squadsiege.settings = {
  layoutString: 'MRA',  // Move, Ranged Attack, Attack - standard layout
  maxLayoutAmount: 21,
  fillTough: true,      // TOUGH parts first for protection
};

roles.squadsiege.dismantleSurroundingStructures = function(creep, directions) {
  if (!directions || !directions.forwardDirection) {
    return false;
  }
  const posForward = creep.pos.getAdjacentPosition(directions.forwardDirection);
  const structures = posForward.lookFor(LOOK_STRUCTURES);
  const ramparts = [];
  const walls = [];
  for (const structure of structures) {
    if (structure.my) {
      continue;
    }
    switch (structure.structureType) {
    case STRUCTURE_ROAD:
    case STRUCTURE_CONTROLLER:
    case STRUCTURE_KEEPER_LAIR:
      continue;
    case STRUCTURE_RAMPART:
      ramparts.push(structure);
      continue;
    case STRUCTURE_WALL:
      walls.push(structure);
      continue;
    default:
      // do nothing
    }
    creep.dismantle(structure);
    creep.say('dismantle : ' + structure.id);
    return true;
  }
  // if no any other better structures to dismantle, we can only go for rampart and wall...
  if (ramparts.length) {
    creep.dismantle(ramparts[0]);
    creep.say('dismantle : ' + ramparts[0].id);
    return true;
  }
  if (walls.length) {
    creep.dismantle(walls[0]);
    creep.say('dismantle : ' + walls[0].id);
    return true;
  }
  return false;
};

roles.squadsiege.preMove = function(creep, directions) {
  // If in target room, let action() handle combat with proper movement
  if (creep.memory.routing && creep.memory.routing.targetRoom &&
      creep.room.name === creep.memory.routing.targetRoom) {
    creep.memory.routing.reached = true;

    // Quick attacks while moving but don't block
    const enemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
    if (enemies.length > 0) {
      creep.rangedAttack(enemies[0]);
    }

    // Don't block movement - let action() handle it
    return false;
  }

  // Original squad movement logic for traveling
  if (!directions) {
    return false;
  }

  roles.squadsiege.dismantleSurroundingStructures(creep, directions);

  if (creep.memory.squad) {
    if (!creep.memory.initialized) {
      if (!Memory.squads) {
        Memory.squads = {};
      }
      if (!Memory.squads[creep.memory.squad]) {
        Memory.squads[creep.memory.squad] = {};
      }
      if (!Memory.squads[creep.memory.squad.siege]) {
        Memory.squads[creep.memory.squad].siege = {};
      }
      Memory.squads[creep.memory.squad].siege[creep.id] = {};
      creep.memory.initialized = true;
    }
    const squad = Memory.squads[creep.memory.squad];
    if (squad && squad.action === 'move') {
      if (creep.squadMove(squad, 2, true, 'siege')) {
        return true;
      }
    }
  }
  return false;
};

// TODO need to check if it works
roles.squadsiege.action = function(creep) {
  // Use squad combat system - ALL combat must be in squads
  if (brain.handleSquadCombat) {
    return brain.handleSquadCombat(creep);
  }

  creep.say('action');
  if (creep.room.name !== creep.memory.routing.targetRoom) {
    if (creep.hits < creep.hitsMax) {
      creep.moveRandom();
    } else {
      delete creep.memory.routing.reached;
    }
    return true;
  }

  // Enhanced siege behavior with ranged attacks
  const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
  const hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES);

  // Coordinate with squad for focus fire
  let target = null;
  if (creep.room.memory.siegeTarget) {
    target = Game.getObjectById(creep.room.memory.siegeTarget);
    if (!target || (target.hits && target.hits <= 0)) {
      delete creep.room.memory.siegeTarget;
      target = null;
    }
  }

  // Target priority: spawns > towers > extensions > hostile creeps > walls
  if (!target) {
    const spawns = hostileStructures.filter(s => s.structureType === STRUCTURE_SPAWN);
    const towers = hostileStructures.filter(s => s.structureType === STRUCTURE_TOWER);
    const extensions = hostileStructures.filter(s => s.structureType === STRUCTURE_EXTENSION);
    const walls = hostileStructures.filter(s =>
      s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART
    );

    if (spawns.length > 0) {
      target = creep.pos.findClosestByRange(spawns);
    } else if (towers.length > 0) {
      target = creep.pos.findClosestByRange(towers);
    } else if (extensions.length > 0) {
      target = creep.pos.findClosestByRange(extensions);
    } else if (hostileCreeps.length > 0) {
      target = creep.pos.findClosestByRange(hostileCreeps);
    } else if (walls.length > 0) {
      // Find weakest wall
      target = _.min(walls, 'hits');
    }

    if (target) {
      creep.room.memory.siegeTarget = target.id;
    }
  }

  if (target) {
    const range = creep.pos.getRangeTo(target);

    // Use ranged attacks when available
    if (creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
      if (range <= 3) {
        creep.rangedAttack(target);
        // Use mass attack if multiple targets nearby
        const nearbyTargets = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3).length +
                             creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3).length;
        if (nearbyTargets > 2) {
          creep.rangedMassAttack();
        }
      }
    }

    // Move closer for dismantling if it's a structure
    if (target.structureType) {
      if (range > 1) {
        creep.moveTo(target, {range: 1, maxRooms: 1});
      } else {
        // Dismantle structures at melee range
        creep.dismantle(target);
        if (creep.getActiveBodyparts(ATTACK) > 0) {
          creep.attack(target);
        }
      }
    } else {
      // It's a creep - maintain range 3 if we have ranged attack
      if (creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
        if (range < 3) {
          const flee = PathFinder.search(creep.pos, {
            pos: target.pos,
            range: 3
          }, {
            flee: true,
            maxRooms: 1
          });
          if (flee.path.length > 0) {
            creep.move(creep.pos.getDirectionTo(flee.path[0]));
          }
        } else if (range > 3) {
          creep.moveTo(target, {range: 3, maxRooms: 1});
        }
      } else {
        // Melee only
        if (range > 1) {
          creep.moveTo(target, {range: 1, maxRooms: 1});
        } else {
          creep.attack(target);
        }
      }
    }

    creep.say('💥');
    return true;
  }

  // Fallback to original siege behavior if no targets
  return creep.siege();
};
