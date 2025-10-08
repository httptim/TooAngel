'use strict';

/*
 * Attacker role - Optimized for conquest and offensive operations
 * More aggressive than defenders, focused on damage output
 */

roles.attacker = {};
roles.attacker.boostActions = ['rangedAttack', 'attack'];

roles.attacker.settings = {
  param: ['controller.level'],
  layoutString: 'MRA',  // Move, Ranged Attack, Attack - standard layout
  amount: {
    3: [5, 4, 1],      // 5 MOVE, 4 RANGED_ATTACK, 1 ATTACK = 10 parts
    4: [7, 5, 2],      // 7 MOVE, 5 RANGED_ATTACK, 2 ATTACK = 14 parts
    5: [9, 7, 3],      // 9 MOVE, 7 RANGED_ATTACK, 3 ATTACK = 19 parts
    6: [12, 9, 4],     // 12 MOVE, 9 RANGED_ATTACK, 4 ATTACK = 25 parts
    7: [15, 12, 5],    // 15 MOVE, 12 RANGED_ATTACK, 5 ATTACK = 32 parts (exceeds 30)
    8: [15, 12, 3],    // 15 MOVE, 12 RANGED_ATTACK, 3 ATTACK = 30 parts
  },
  maxLayoutAmount: 30,  // Screeps part limit
  fillTough: true,      // TOUGH parts first for protection
};

roles.attacker.preMove = function(creep, directions) {
  // If in target room, mark as reached and let action() handle movement
  if (creep.memory.routing && creep.memory.routing.targetRoom &&
      creep.room.name === creep.memory.routing.targetRoom) {
    creep.memory.routing.reached = true;
  }

  // Attack while moving
  const enemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
  if (enemies.length > 0) {
    if (enemies.length > 2) {
      creep.rangedMassAttack();
    } else {
      creep.rangedAttack(enemies[0]);
    }
  }

  // Break walls/ramparts while moving
  const structures = creep.pos.findInRange(FIND_STRUCTURES, 3, {
    filter: s => (s.structureType === STRUCTURE_WALL ||
                  s.structureType === STRUCTURE_RAMPART) && !s.my
  });
  if (structures.length > 0 && enemies.length === 0) {
    creep.rangedAttack(structures[0]);
  }

  // IMPORTANT: Return false to not block movement
  return false;
};

roles.attacker.action = function(creep) {
  // Use squad combat system - MANDATORY for all combat units
  if (brain.handleSquadCombat) {
    return brain.handleSquadCombat(creep);
  }

  // Fallback if squad system not available
  // Heal self if has heal parts (from boosts)
  if (creep.getActiveBodyparts(HEAL) > 0) {
    creep.heal(creep);
  }

  // Enhanced combat for conquest operations
  if (creep.memory.routing && creep.memory.routing.targetRoom &&
      creep.room.name === creep.memory.routing.targetRoom) {

    // Aggressive target selection
    const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
    const hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES);

    // Share focus fire target with other attackers
    let target = null;
    const targetKey = `attackTarget_${creep.room.name}`;

    if (creep.room.memory[targetKey]) {
      target = Game.getObjectById(creep.room.memory[targetKey]);
      if (!target || (target.hits && target.hits <= 0)) {
        delete creep.room.memory[targetKey];
        target = null;
      }
    }

    // Select new target if needed - prioritize offense over defense
    if (!target) {
      // Priority: spawns > towers > extensions > labs > terminals > hostile creeps
      const spawns = hostileStructures.filter(s => s.structureType === STRUCTURE_SPAWN);
      const towers = hostileStructures.filter(s => s.structureType === STRUCTURE_TOWER);
      const extensions = hostileStructures.filter(s => s.structureType === STRUCTURE_EXTENSION);
      const labs = hostileStructures.filter(s => s.structureType === STRUCTURE_LAB);
      const terminals = hostileStructures.filter(s => s.structureType === STRUCTURE_TERMINAL);

      if (spawns.length > 0) {
        target = creep.pos.findClosestByRange(spawns);
      } else if (towers.length > 0) {
        // Find weakest tower to eliminate quickly
        target = _.min(towers, 'hits');
      } else if (extensions.length > 0) {
        target = creep.pos.findClosestByRange(extensions);
      } else if (labs.length > 0) {
        target = creep.pos.findClosestByRange(labs);
      } else if (terminals.length > 0) {
        target = creep.pos.findClosestByRange(terminals);
      } else if (hostileCreeps.length > 0) {
        // Target healers first to prevent enemy recovery
        const healers = hostileCreeps.filter(c => c.getActiveBodyparts(HEAL) > 0);
        if (healers.length > 0) {
          target = creep.pos.findClosestByRange(healers);
        } else {
          target = creep.pos.findClosestByRange(hostileCreeps);
        }
      } else {
        // Find walls/ramparts blocking important structures
        const walls = hostileStructures.filter(s =>
          s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART
        );
        if (walls.length > 0) {
          target = _.min(walls, 'hits');
        }
      }

      if (target) {
        creep.room.memory[targetKey] = target.id;
      }
    }

    if (target) {
      const range = creep.pos.getRangeTo(target);

      // Aggressive engagement - get close for maximum damage
      if (creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
        // Use ranged attacks
        if (range <= 3) {
          creep.rangedAttack(target);

          // Use mass attack if multiple targets nearby
          const nearbyTargets = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3).length +
                               creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3).length;
          if (nearbyTargets > 2) {
            creep.rangedMassAttack();
          }
        }

        // For structures, move to melee range for combined damage
        if (target.structureType && creep.getActiveBodyparts(ATTACK) > 0) {
          if (range > 1) {
            creep.moveTo(target, {range: 1, maxRooms: 1, reusePath: 3});
          } else {
            // Combined melee + ranged damage
            creep.attack(target);
          }
        } else if (!target.structureType) {
          // Against creeps, maintain optimal range (2-3)
          if (range < 2) {
            // Too close to creep, back up
            const flee = PathFinder.search(creep.pos, {
              pos: target.pos,
              range: 2
            }, {
              flee: true,
              maxRooms: 1
            });
            if (flee.path.length > 0) {
              creep.move(creep.pos.getDirectionTo(flee.path[0]));
            }
          } else if (range > 3) {
            creep.moveTo(target, {range: 2, maxRooms: 1, reusePath: 3});
          }
        } else if (range > 3) {
          // Move closer to any target out of range
          creep.moveTo(target, {range: 3, maxRooms: 1, reusePath: 3});
        }
      } else if (creep.getActiveBodyparts(ATTACK) > 0) {
        // Pure melee attacker
        if (range > 1) {
          creep.moveTo(target, {range: 1, maxRooms: 1, reusePath: 3});
        } else {
          creep.attack(target);
        }
      }

      // Battle cry based on target
      if (target.structureType === STRUCTURE_SPAWN) {
        creep.say('🎯');
      } else if (target.structureType === STRUCTURE_TOWER) {
        creep.say('🗼');
      } else if (target.my === false) {
        creep.say('⚔️');
      } else {
        creep.say('💥');
      }

      return true;
    }

    // No targets found, move to controller or center
    if (creep.room.controller) {
      creep.moveTo(creep.room.controller);
    } else {
      creep.moveTo(25, 25);
    }
  }

  // Not in target room yet, move there
  if (creep.memory.routing && creep.memory.routing.targetRoom) {
    creep.say('→');

    // Attack any hostiles encountered along the way
    const enemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (enemy && creep.pos.getRangeTo(enemy) <= 3) {
      creep.rangedAttack(enemy);
    }
  }

  return true;
};