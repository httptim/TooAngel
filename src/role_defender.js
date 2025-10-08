'use strict';

/*
 * Defender role - Combat unit for offensive and defensive operations
 * MUST operate in squads, no solo combat
 */

roles.defender = {};
roles.defender.boostActions = ['rangedAttack', 'heal'];

roles.defender.settings = {
  param: ['controller.level'],
  layoutString: 'MRH',  // Move, Ranged Attack, Heal - standard layout
  amount: {
    1: [2, 1, 1],      // 2 MOVE, 1 RANGED_ATTACK, 1 HEAL = 4 parts
    3: [4, 2, 2],      // 4 MOVE, 2 RANGED_ATTACK, 2 HEAL = 8 parts
    4: [5, 3, 2],      // 5 MOVE, 3 RANGED_ATTACK, 2 HEAL = 10 parts
    5: [6, 4, 3],      // 6 MOVE, 4 RANGED_ATTACK, 3 HEAL = 13 parts
    6: [8, 5, 4],      // 8 MOVE, 5 RANGED_ATTACK, 4 HEAL = 17 parts
    7: [10, 7, 5],     // 10 MOVE, 7 RANGED_ATTACK, 5 HEAL = 22 parts
    8: [13, 10, 7],    // 13 MOVE, 10 RANGED_ATTACK, 7 HEAL = 30 parts
  },
  fillTough: true,     // TOUGH parts first for protection (standard Screeps design)
};

roles.defender.preMove = function(creep, directions) {
  // Always heal self first
  if (creep.hits < creep.hitsMax && creep.getActiveBodyparts(HEAL) > 0) {
    creep.heal(creep);
  }

  // Mark as reached when in target room
  if (creep.memory.routing && creep.memory.routing.targetRoom &&
      creep.room.name === creep.memory.routing.targetRoom) {
    creep.memory.routing.reached = true;
  }

  // Attack enemies while moving (but don't block movement)
  const enemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
  if (enemies.length > 0 && creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
    if (enemies.length > 2) {
      creep.rangedMassAttack();
    } else {
      creep.rangedAttack(enemies[0]);
    }
  }

  // IMPORTANT: Return false to not block movement
  return false;
};

roles.defender.action = function(creep) {
  // Check for recycling
  if (creep.inBase() && creep.memory.reverse) {
    return Creep.recycleCreep(creep);
  }

  // Use squad combat system for all combat operations
  if (brain.handleSquadCombat) {
    // This handles everything: formation, movement, combat, healing
    return brain.handleSquadCombat(creep);
  }

  // Fallback to basic combat if squad system not available
  return basicCombatFallback(creep);
};

/**
 * Basic combat fallback - simplified working combat
 */
function basicCombatFallback(creep) {
  // Heal self
  if (creep.hits < creep.hitsMax && creep.getActiveBodyparts(HEAL) > 0) {
    creep.heal(creep);
  }

  // Check if we're fleeing from a safe mode room
  if (creep.memory.fleeingFromSafeMode) {
    const safeModeRoom = creep.memory.fleeingFromSafeMode;

    // If we're still in the safe mode room, continue fleeing
    if (creep.room.name === safeModeRoom) {
      const exit = creep.pos.findClosestByRange(FIND_EXIT);
      if (exit) {
        creep.moveTo(exit, {reusePath: 0, maxRooms: 1});
        creep.say('EXIT!');
      }
      return true;
    }

    // We've escaped! Clear the fleeing state AND the target room
    delete creep.memory.fleeingFromSafeMode;

    // Clear the target room so we don't go back
    if (creep.memory.routing && creep.memory.routing.targetRoom === safeModeRoom) {
      console.log(`${creep.name} clearing target room ${safeModeRoom} due to safe mode`);
      delete creep.memory.routing.targetRoom;
      // Mark to recycle or find new target
      creep.memory.routing.reached = true;
    }

    // Move away from the room edges to prevent oscillation
    if (creep.pos.x <= 1 || creep.pos.x >= 48 || creep.pos.y <= 1 || creep.pos.y >= 48) {
      // Move to center of current room
      creep.moveTo(25, 25, {range: 15});
      creep.say('REGROUP');
      return true;
    }

    // Head back home to recycle or get new orders
    if (creep.memory.routing && creep.memory.routing.startRoom) {
      creep.moveTo(new RoomPosition(25, 25, creep.memory.routing.startRoom), {range: 20});
      creep.say('HOME');
      return true;
    }
  }

  // Find targets
  const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
  const hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES);

  let target = null;

  // Target priority
  if (hostileCreeps.length > 0) {
    // Prioritize healers
    const healers = hostileCreeps.filter(c => c.getActiveBodyparts(HEAL) > 0);
    if (healers.length > 0) {
      target = creep.pos.findClosestByRange(healers);
    } else {
      target = creep.pos.findClosestByRange(hostileCreeps);
    }
  } else if (hostileStructures.length > 0) {
    // Prioritize spawns and towers
    const importantStructures = hostileStructures.filter(s =>
      s.structureType === STRUCTURE_SPAWN ||
      s.structureType === STRUCTURE_TOWER
    );

    if (importantStructures.length > 0) {
      target = creep.pos.findClosestByRange(importantStructures);
    } else {
      target = creep.pos.findClosestByRange(hostileStructures);
    }
  }

  if (target) {
    const range = creep.pos.getRangeTo(target);

    // SIMPLE COMBAT LOGIC THAT WORKS

    // Validate target is attackable (some structures can't be attacked)
    const unattackableStructures = [
      STRUCTURE_CONTROLLER,
      STRUCTURE_KEEPER_LAIR,
      STRUCTURE_POWER_BANK,
      STRUCTURE_POWER_SPAWN,
      STRUCTURE_PORTAL,
      STRUCTURE_INVADER_CORE
    ];

    const isValidTarget = !target.structureType ||
      (target.structureType && !unattackableStructures.includes(target.structureType));

    // Check for safe mode FIRST - if so, flee immediately
    if (creep.room.controller && creep.room.controller.safeMode) {
      console.log(`${creep.name} WARNING: Room ${creep.room.name} is in SAFE MODE - fleeing`);
      creep.say('FLEE!');

      // Remember we're fleeing from this room
      creep.memory.fleeingFromSafeMode = creep.room.name;

      // Track safe mode rooms globally
      if (!Memory.safeModeRooms) {
        Memory.safeModeRooms = {};
      }
      Memory.safeModeRooms[creep.room.name] = Game.time + creep.room.controller.safeMode;

      // Find closest exit and run
      const exit = creep.pos.findClosestByRange(FIND_EXIT);
      if (exit) {
        creep.moveTo(exit, {reusePath: 0, maxRooms: 1});
      }
      return true;
    }

    // Always attack if in range
    if (creep.getActiveBodyparts(RANGED_ATTACK) > 0 && range <= 3 && isValidTarget) {
      const result = creep.rangedAttack(target);
      if (result !== OK) {
        console.log(`${creep.name} rangedAttack failed: ${result}, range: ${range}, target: ${target.id}, type: ${target.structureType || 'creep'}`);
        // Check for safe mode bug
        if (result === ERR_NO_BODYPART && creep.room.controller) {
          console.log(`Target room safe mode: ${creep.room.controller.safeMode || 'none'}`);
          if (creep.room.controller.safeMode) {
            console.log(`KNOWN BUG: Safe mode causes false ERR_NO_BODYPART`);
          }
        }
      }
    }

    // Melee attack if adjacent
    if (creep.getActiveBodyparts(ATTACK) > 0 && range <= 1 && isValidTarget) {
      creep.attack(target);
    }

    // Movement logic
    if (target.structureType) {
      // It's a structure - get close
      if (range > 1) {
        creep.moveTo(target);
      }
    } else {
      // It's a creep - maintain distance
      if (creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
        if (range < 2 && creep.hits < creep.hitsMax * 0.5) {
          // Low health, flee
          creep.move(creep.pos.getDirectionTo(target) + 4); // Opposite direction
        } else if (range > 3) {
          // Too far, move closer
          creep.moveTo(target, {range: 3});
        } else if (range < 3) {
          // Too close, back up
          creep.move((creep.pos.getDirectionTo(target) + 4) % 8); // Opposite direction
        }
      } else {
        // Melee only
        if (range > 1) {
          creep.moveTo(target);
        }
      }
    }

    creep.say('⚔️');
  } else {
    // No targets, move to center of room
    creep.moveTo(25, 25);
  }

  return true;
}