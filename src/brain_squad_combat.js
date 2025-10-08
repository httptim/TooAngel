'use strict';

/**
 * Squad Combat System - Enforces formation-based combat
 * All combat units must be in squads, no solo attacks
 */

/**
 * Squad states
 */
const SQUAD_STATES = {
  FORMING: 'forming',      // Gathering at rally point
  READY: 'ready',          // Squad formed, ready to attack
  MOVING: 'moving',        // Moving to target in formation
  COMBAT: 'combat',        // Engaged in combat
  RETREATING: 'retreating' // Falling back
};

/**
 * Helper function to translate error codes
 */
function getErrorString(code) {
  const errors = {
    0: 'OK',
    '-1': 'ERR_NOT_OWNER',
    '-2': 'ERR_NO_PATH',
    '-3': 'ERR_NAME_EXISTS',
    '-4': 'ERR_BUSY',
    '-5': 'ERR_NOT_FOUND',
    '-6': 'ERR_NOT_ENOUGH_RESOURCES',
    '-7': 'ERR_INVALID_TARGET',
    '-8': 'ERR_FULL',
    '-9': 'ERR_NOT_IN_RANGE',
    '-10': 'ERR_INVALID_ARGS',
    '-11': 'ERR_TIRED',
    '-12': 'ERR_NO_BODYPART',
    '-13': 'ERR_NOT_ENOUGH_EXTENSIONS',
    '-14': 'ERR_RCL_NOT_ENOUGH',
    '-15': 'ERR_GCL_NOT_ENOUGH'
  };
  return errors[code] || `UNKNOWN_ERROR_${code}`;
}

/**
 * Get or create a squad for a creep
 */
brain.assignToSquad = function(creep) {
  if (!Memory.combatSquads) {
    Memory.combatSquads = {};
  }

  // Check if already in a squad
  if (creep.memory.squadId && Memory.combatSquads[creep.memory.squadId]) {
    return creep.memory.squadId;
  }

  // Get target room
  const targetRoom = creep.memory.routing ? creep.memory.routing.targetRoom : null;
  if (!targetRoom) {
    console.log(`${creep.name} has no target room, cannot assign to squad`);
    return null;
  }

  // Find an incomplete squad heading to the same target
  for (const squadId in Memory.combatSquads) {
    const squad = Memory.combatSquads[squadId];
    if (squad.targetRoom === targetRoom &&
        squad.members.length < 4 &&
        squad.state === SQUAD_STATES.FORMING) {

      // Add to this squad
      squad.members.push(creep.id);
      creep.memory.squadId = squadId;
      creep.memory.squadPosition = squad.members.length - 1;
      console.log(`${creep.name} joined squad ${squadId} as position ${creep.memory.squadPosition}`);
      return squadId;
    }
  }

  // Create new squad
  const squadId = `squad_${Game.time}_${Math.random().toString(36).substr(2, 5)}`;
  const startRoom = creep.memory.routing ? creep.memory.routing.startRoom : creep.room.name;
  const rallyPoint = brain.getRallyPoint ? brain.getRallyPoint(targetRoom) : startRoom;

  Memory.combatSquads[squadId] = {
    id: squadId,
    targetRoom: targetRoom,
    rallyPoint: rallyPoint,
    members: [creep.id],
    state: SQUAD_STATES.FORMING,
    formation: 'quad', // Always use quad formation
    createdAt: Game.time,
    launchRoom: startRoom  // Track where squad was launched from
  };

  console.log(`Created squad ${squadId} targeting ${targetRoom}, rally at ${rallyPoint}`);

  creep.memory.squadId = squadId;
  creep.memory.squadPosition = 0; // First member
  console.log(`${creep.name} created new squad ${squadId}`);
  return squadId;
};

/**
 * Squad combat handler - ensures all combat happens in formation
 */
brain.handleSquadCombat = function(creep) {
  // Assign to squad if not already
  if (!creep.memory.squadId) {
    const squadId = brain.assignToSquad(creep);
    if (!squadId) {
      console.log(`${creep.name} could not be assigned to squad`);
      return false;
    }
  }

  const squad = Memory.combatSquads[creep.memory.squadId];
  if (!squad) {
    // Squad was destroyed, create new one
    console.log(`${creep.name} squad ${creep.memory.squadId} not found, reassigning`);
    delete creep.memory.squadId;
    brain.assignToSquad(creep);
    return false;
  }

  // Clean up dead members
  squad.members = squad.members.filter(id => Game.getObjectById(id));

  // Get all living squad members
  const members = squad.members.map(id => Game.getObjectById(id)).filter(c => c);

  // Update squad state
  updateSquadState(squad, members);

  // Handle based on state
  switch (squad.state) {
    case SQUAD_STATES.FORMING:
      return handleSquadForming(creep, squad, members);

    case SQUAD_STATES.READY:
      return handleSquadReady(creep, squad, members);

    case SQUAD_STATES.MOVING:
      return handleSquadMoving(creep, squad, members);

    case SQUAD_STATES.COMBAT:
      return handleSquadCombat(creep, squad, members);

    case SQUAD_STATES.RETREATING:
      return handleSquadRetreating(creep, squad, members);

    default:
      return false;
  }
};

/**
 * Try to merge incomplete squads that are near each other
 */
function tryMergeSquads(squad, members) {
  // Don't merge if we have no members
  if (members.length === 0 || members.length >= 4) return;

  const leader = members[0];

  // Look for other incomplete squads
  for (const otherSquadId in Memory.combatSquads) {
    if (otherSquadId === squad.id) continue;

    const otherSquad = Memory.combatSquads[otherSquadId];
    const otherMembers = otherSquad.members
      .map(id => Game.getObjectById(id))
      .filter(c => c);

    // Check if squads can merge
    if (otherMembers.length > 0 &&
        otherMembers.length < 4 &&
        members.length + otherMembers.length <= 4) {

      // Check proximity (same or adjacent rooms)
      const closeEnough = members.some(m1 =>
        otherMembers.some(m2 => {
          if (m1.room.name === m2.room.name) return true;
          const distance = Game.map.getRoomLinearDistance(m1.room.name, m2.room.name);
          return distance <= 1;
        })
      );

      // Check compatible targets (both idle or same target)
      const compatibleTargets = !squad.targetRoom || !otherSquad.targetRoom ||
                                squad.targetRoom === otherSquad.targetRoom;

      if (closeEnough && compatibleTargets) {
        console.log(`Merging squad ${otherSquadId} (${otherMembers.length} members) into ${squad.id} (${members.length} members)`);

        // Merge members
        for (const member of otherMembers) {
          squad.members.push(member.id);
          member.memory.squadId = squad.id;
        }

        // Reassign positions for proper 2x2 formation
        const allMembers = squad.members
          .map(id => Game.getObjectById(id))
          .filter(c => c);

        allMembers.forEach((member, index) => {
          member.memory.squadPosition = index;
        });

        // Adopt target if we didn't have one
        if (!squad.targetRoom && otherSquad.targetRoom) {
          squad.targetRoom = otherSquad.targetRoom;
        }

        // Delete the merged squad
        delete Memory.combatSquads[otherSquadId];

        console.log(`Squad ${squad.id} now has ${squad.members.length} members after merge with proper positions`);
        break;
      }
    }
  }
}

/**
 * Update squad state based on conditions
 */
function updateSquadState(squad, members) {
  // Check if we have minimum members
  const minSquadSize = 4;

  // Try to merge incomplete squads regardless of state
  if (members.length > 0 && members.length < minSquadSize) {
    tryMergeSquads(squad, members);
  }

  if (squad.state === SQUAD_STATES.FORMING) {
    // Check if ALL members are at rally point
    const membersAtRally = members.filter(c => c.room.name === squad.rallyPoint);
    const allAtRally = membersAtRally.length === members.length;

    // Only transition to READY when we have enough members AND they're all at rally point
    if (members.length >= minSquadSize && allAtRally) {
      squad.state = SQUAD_STATES.READY;
      console.log(`Squad ${squad.id} is READY with ${members.length} members at rally point ${squad.rallyPoint}`);
    } else if (Game.time - squad.createdAt > 200 && members.length >= 2 && allAtRally) {
      // Timeout fallback for smaller squads, but still require all at rally
      squad.state = SQUAD_STATES.READY;
      console.log(`Squad ${squad.id} timing out - proceeding with ${members.length} members`);
    } else if (members.length > 0) {
      // Log waiting status
      if (Game.time % 10 === 0) {
        console.log(`Squad ${squad.id} forming: ${membersAtRally.length}/${members.length} at rally, need ${minSquadSize} total`);
      }
    }
  }

  // Check for combat - ENGAGE ANY HOSTILES IMMEDIATELY
  if (members.length > 0) {
    // Check for ANY hostile creeps in ANY room we're in
    const enemiesNearby = members.some(c => {
      const hostiles = c.room.find(FIND_HOSTILE_CREEPS);
      // Filter out unimportant creeps like scouts with no attack parts
      const threats = hostiles.filter(h =>
        h.getActiveBodyparts(ATTACK) > 0 ||
        h.getActiveBodyparts(RANGED_ATTACK) > 0 ||
        h.getActiveBodyparts(HEAL) > 0 ||
        h.getActiveBodyparts(WORK) > 0  // Could be dismantlers
      );
      return threats.length > 0;
    });

    if (enemiesNearby) {
      if (squad.state !== SQUAD_STATES.COMBAT && squad.state !== SQUAD_STATES.RETREATING) {
        squad.state = SQUAD_STATES.COMBAT;
        console.log(`Squad ${squad.id} entering COMBAT - hostiles detected!`);
      }
    }

    // Check for retreat conditions (squad too damaged)
    const avgHealth = members.reduce((sum, c) => sum + (c.hits / c.hitsMax), 0) / members.length;
    if (avgHealth < 0.3 && squad.state === SQUAD_STATES.COMBAT) {
      squad.state = SQUAD_STATES.RETREATING;
      console.log(`Squad ${squad.id} RETREATING (avg health: ${(avgHealth * 100).toFixed(0)}%)`);
    }
  }
}

/**
 * Handle squad forming at rally point
 */
function handleSquadForming(creep, squad, members) {
  const rallyPoint = squad.rallyPoint;

  // Move to rally point
  if (creep.room.name !== rallyPoint) {
    creep.moveTo(new RoomPosition(25, 25, rallyPoint), {reusePath: 5});
    creep.say('→RALLY');
    return true;
  }

  // At rally point, form up near the spawn or controller
  const rallyTarget = creep.pos.findClosestByRange(FIND_MY_SPAWNS) ||
                      creep.room.controller;

  if (rallyTarget) {
    // Rally near the spawn/controller, but not too close
    if (!creep.pos.inRangeTo(rallyTarget, 5)) {
      creep.moveTo(rallyTarget, {range: 4});
      creep.say('GROUP');
    } else {
      // Wait in formation
      const formationPos = getQuadFormationPosition(creep, members);
      if (formationPos && !creep.pos.isEqualTo(formationPos)) {
        creep.moveTo(formationPos);
        creep.say('FORM');
      } else {
        // In position, heal while waiting
        healSquadmates(creep, members);
        creep.say('⏳' + members.length);
      }
    }
  }

  return true;
}

/**
 * Handle ready squad - move to target or protect miners
 */
function handleSquadReady(creep, squad, members) {
  // Check if target room is still valid (not in safe mode)
  if (squad.targetRoom && Memory.safeModeRooms && Memory.safeModeRooms[squad.targetRoom]) {
    if (Memory.safeModeRooms[squad.targetRoom] > Game.time) {
      console.log(`Squad ${squad.id} target ${squad.targetRoom} is in safe mode - finding new objective`);
      delete squad.targetRoom;
    }
  }

  // Check if we should protect remote miners
  if (squad.protectingMiners || !squad.targetRoom) {
    // Find remote miners that need protection
    const remoteCreeps = _.filter(Game.creeps, c =>
      (c.memory.role === 'remoteharvester' ||
       c.memory.role === 'remotecarry' ||
       c.memory.role === 'remotereserver') &&
      c.room && c.room.find(FIND_HOSTILE_CREEPS).length > 0
    );

    if (remoteCreeps.length > 0) {
      // Go to the miner's room
      const targetCreep = remoteCreeps[0];
      squad.targetRoom = targetCreep.room.name;
      squad.protectingMiners = true;
      console.log(`Squad ${squad.id} protecting miners in ${squad.targetRoom}`);
    } else {
      // Patrol near remote mining rooms
      const remoteMiningRooms = Object.keys(Memory.rooms || {}).filter(roomName => {
        const roomData = Memory.rooms[roomName];
        return roomData && roomData.remoteHarvest;
      });

      if (remoteMiningRooms.length > 0) {
        // Pick a random remote room to patrol
        squad.targetRoom = remoteMiningRooms[Math.floor(Math.random() * remoteMiningRooms.length)];
        squad.protectingMiners = true;
        console.log(`Squad ${squad.id} patrolling remote room ${squad.targetRoom}`);
      } else {
        // No remote rooms, return to base
        console.log(`Squad ${squad.id} no objectives found, returning to base`);
        const homeBase = squad.rallyPoint || creep.memory.base || (creep.memory.routing && creep.memory.routing.startRoom);

        // Don't set current room as target
        if (homeBase && homeBase !== creep.room.name) {
          squad.targetRoom = homeBase;
          squad.returningHome = true;
        } else {
          // Find the nearest owned room that isn't the current room
          const nearestHome = Memory.myRooms && Memory.myRooms.find(roomName =>
            roomName !== creep.room.name &&
            Game.map.getRoomLinearDistance(creep.room.name, roomName) <= 5
          );

          if (nearestHome) {
            console.log(`Squad ${squad.id} found home base: ${nearestHome}`);
            squad.targetRoom = nearestHome;
            squad.rallyPoint = nearestHome;
            squad.returningHome = true;
          } else {
            console.log(`Squad ${squad.id} has no valid home base, staying in ${creep.room.name}`);
          }
        }
      }
    }
  }

  if (squad.targetRoom) {
    if (squad.state !== SQUAD_STATES.MOVING) {
      console.log(`Squad ${squad.id} transitioning to MOVING state, target: ${squad.targetRoom}`);
    }
    squad.state = SQUAD_STATES.MOVING;
    return handleSquadMoving(creep, squad, members);
  }

  // No target and no rally point, find home base
  if (!squad.rallyPoint || squad.rallyPoint === creep.room.name) {
    // Find the nearest owned room that isn't the current room
    const homeRoom = (creep.memory.base && creep.memory.base !== creep.room.name ? creep.memory.base : null) ||
                     (creep.memory.routing && creep.memory.routing.startRoom && creep.memory.routing.startRoom !== creep.room.name ? creep.memory.routing.startRoom : null) ||
                     (Memory.myRooms && Memory.myRooms.find(roomName =>
                       roomName !== creep.room.name &&
                       Game.map.getRoomLinearDistance(creep.room.name, roomName) <= 5
                     ));

    if (homeRoom) {
      console.log(`Squad ${squad.id} setting rally point to ${homeRoom} (was ${squad.rallyPoint})`);
      squad.rallyPoint = homeRoom;
      squad.targetRoom = homeRoom;
      squad.state = SQUAD_STATES.MOVING;
      return handleSquadMoving(creep, squad, members);
    }
  }

  // Move to rally point in formation
  if (squad.rallyPoint) {
    const rallyPoint = new RoomPosition(25, 25, squad.rallyPoint);

    // Check if we're in the rally room
    if (creep.room.name !== squad.rallyPoint) {
      // Move to rally room
      creep.moveTo(rallyPoint, {range: 20});
      creep.say('→HOME');
    } else {
      // In rally room, maintain quad formation
      const formationPos = getQuadFormationPosition(creep, members);
      if (formationPos && !creep.pos.isEqualTo(formationPos)) {
        creep.moveTo(formationPos);
        creep.say('FORM');
      } else {
        // In position, heal while waiting
        healSquadmates(creep, members);
        creep.say('READY');
      }
    }
  } else {
    creep.say('LOST');
  }

  return true;
}

/**
 * Handle squad moving to target
 */
function handleSquadMoving(creep, squad, members) {
  const targetRoom = squad.targetRoom;

  // IMMEDIATE THREAT CHECK - engage any hostiles in current room
  const currentRoomHostiles = creep.room.find(FIND_HOSTILE_CREEPS);
  const threats = currentRoomHostiles.filter(h =>
    h.getActiveBodyparts(ATTACK) > 0 ||
    h.getActiveBodyparts(RANGED_ATTACK) > 0 ||
    h.getActiveBodyparts(HEAL) > 0 ||
    h.getActiveBodyparts(WORK) > 0
  );

  if (threats.length > 0) {
    console.log(`Squad ${squad.id} encountering ${threats.length} threats in ${creep.room.name} - ENGAGING!`);
    squad.state = SQUAD_STATES.COMBAT;
    return handleSquadCombat(creep, squad, members);
  }

  // Check if target room is in safe mode (from memory)
  if (Memory.safeModeRooms && Memory.safeModeRooms[targetRoom]) {
    if (Memory.safeModeRooms[targetRoom] > Game.time) {
      console.log(`Squad ${squad.id} aborting move to ${targetRoom} - still in safe mode for ${Memory.safeModeRooms[targetRoom] - Game.time} ticks`);
      delete squad.targetRoom;
      squad.state = SQUAD_STATES.READY;
      return handleSquadReady(creep, squad, members);
    } else {
      // Safe mode expired
      delete Memory.safeModeRooms[targetRoom];
    }
  }

  // Check if we're in target room
  if (creep.room.name === targetRoom) {
    // In target room, check for enemies
    const enemies = creep.room.find(FIND_HOSTILE_CREEPS);
    if (enemies.length > 0) {
      squad.state = SQUAD_STATES.COMBAT;
      return handleSquadCombat(creep, squad, members);
    }

    // Check if this is actually our home base
    if (squad.returningHome || targetRoom === squad.rallyPoint) {
      // We're home, clear target and go back to READY
      console.log(`Squad ${squad.id} reached home base ${targetRoom}`);
      delete squad.targetRoom;
      squad.returningHome = false;
      squad.state = SQUAD_STATES.READY;
      creep.say('HOME');
      return handleSquadReady(creep, squad, members);
    }

    // Patrolling a room, move around
    if (!creep.pos.inRangeTo(25, 25, 10)) {
      creep.moveTo(new RoomPosition(25, 25, targetRoom));
    }
    creep.say('PATROL');
  } else {
    // Not in target room, move there
    const leader = members.find(c => c.memory.squadPosition === 0) || members[0];

    // Check if squad is together
    const allInSameRoom = members.every(m => m.room.name === creep.room.name);
    const membersClose = members.every(m =>
      m.room.name !== creep.room.name ||
      members.some(other => other.id !== m.id && m.pos.getRangeTo(other) <= 3)
    );

    // If squad is split up, wait for regroup
    if (!allInSameRoom || !membersClose) {
      // Move to leader if we're not the leader
      if (creep.id !== leader.id && leader.room.name !== creep.room.name) {
        creep.moveTo(new RoomPosition(25, 25, leader.room.name));
        creep.say('REGROUP');
        return true;
      } else if (creep.id === leader.id) {
        // Leader waits for squad to regroup
        const centerPos = new RoomPosition(25, 25, creep.room.name);
        if (!creep.pos.inRangeTo(centerPos, 10)) {
          creep.moveTo(centerPos);
        }
        creep.say('WAIT');
        return true;
      }
    }

    // Squad is together, move as a unit
    if (creep.id === leader.id) {
      // Leader pathfinds
      const route = Game.map.findRoute(creep.room.name, targetRoom);
      if (route && route.length > 0) {
        const exit = creep.pos.findClosestByPath(route[0].exit);
        if (exit) {
          // Move carefully, avoiding edges
          const moveOpts = {
            reusePath: 5,
            costCallback: function(roomName, costMatrix) {
              // Avoid edges to prevent getting stuck
              for (let x = 0; x < 50; x++) {
                for (let y = 0; y < 50; y++) {
                  if (x <= 1 || x >= 48 || y <= 1 || y >= 48) {
                    costMatrix.set(x, y, 10);
                  }
                }
              }
              return costMatrix;
            }
          };
          creep.moveTo(exit, moveOpts);
          creep.say('LEAD→');
        }
      }
    } else {
      // Others maintain formation with leader
      const formationPos = getQuadFormationPosition(creep, members);
      if (formationPos && !creep.pos.isEqualTo(formationPos)) {
        creep.moveTo(formationPos);
        creep.say('FORM');
      } else if (!creep.pos.isNearTo(leader)) {
        creep.moveTo(leader);
        creep.say('FOLLOW');
      }
    }
  }

  // Attack enemies encountered while moving
  const enemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
  if (enemy && creep.pos.getRangeTo(enemy) <= 3) {
    creep.rangedAttack(enemy);
  }

  healSquadmates(creep, members);
  creep.say('→');
  return true;
}

/**
 * Handle squad in combat - THIS IS THE CRITICAL FUNCTION
 */
function handleSquadCombat(creep, squad, members) {
  // CHECK FOR SAFE MODE FIRST
  if (creep.room.controller && creep.room.controller.safeMode) {
    console.log(`Squad combat: Room ${creep.room.name} is in SAFE MODE - retreating immediately`);

    // Track safe mode rooms globally
    if (!Memory.safeModeRooms) {
      Memory.safeModeRooms = {};
    }
    Memory.safeModeRooms[creep.room.name] = Game.time + creep.room.controller.safeMode;

    squad.state = SQUAD_STATES.RETREATING;
    squad.retreatReason = 'SAFE_MODE';
    return handleSquadRetreating(creep, squad, members);
  }

  // Find targets
  const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
  const hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES);

  // Squad-wide target selection
  let target = null;

  // Try to use existing squad target
  if (squad.currentTarget) {
    target = Game.getObjectById(squad.currentTarget);
    if (!target || (target.hits !== undefined && target.hits <= 0)) {
      squad.currentTarget = null;
      target = null;
    }
  }

  // Select new target if needed
  if (!target) {
    // Priority: Healers > Attack creeps > Spawns > Towers > Other
    const healers = hostileCreeps.filter(c => c.getActiveBodyparts(HEAL) > 0);
    const attackers = hostileCreeps.filter(c =>
      c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0
    );
    const spawns = hostileStructures.filter(s => s.structureType === STRUCTURE_SPAWN);
    const towers = hostileStructures.filter(s => s.structureType === STRUCTURE_TOWER);

    if (healers.length > 0) {
      target = creep.pos.findClosestByRange(healers);
    } else if (attackers.length > 0) {
      target = creep.pos.findClosestByRange(attackers);
    } else if (spawns.length > 0) {
      target = spawns[0];
    } else if (towers.length > 0) {
      target = towers[0];
    } else if (hostileCreeps.length > 0) {
      target = creep.pos.findClosestByRange(hostileCreeps);
    } else if (hostileStructures.length > 0) {
      target = creep.pos.findClosestByRange(hostileStructures);
    }

    if (target) {
      squad.currentTarget = target.id;
    }
  }

  // POSITION SWAPPING - Critical for survival
  handlePositionSwapping(creep, members);

  // ATTACK THE TARGET
  if (target) {
    const range = creep.pos.getRangeTo(target);

    // Validate target is attackable
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

    // Ranged attack
    if (creep.getActiveBodyparts(RANGED_ATTACK) > 0 && isValidTarget) {
      if (range <= 3) {
        // Check if we actually have active ranged attack parts
        const rangedParts = creep.getActiveBodyparts(RANGED_ATTACK);

        if (rangedParts > 0) {
          // Check if room is in safe mode (causes ERR_NO_BODYPART bug)
          const targetRoom = target.room || creep.room;
          if (targetRoom && targetRoom.controller && targetRoom.controller.safeMode) {
            console.log(`${creep.name} WARNING: Target room ${targetRoom.name} is in SAFE MODE - retreating`);
            creep.say('RETREAT');
            // Trigger squad retreat
            squad.state = SQUAD_STATES.RETREATING;
            squad.retreatReason = 'SAFE_MODE';
            return handleSquadRetreating(creep, squad, members);
          }

          const result = creep.rangedAttack(target);
          if (result !== OK) {
            // Special handling for safe mode bug
            if (result === -12 && targetRoom && targetRoom.controller) {
              console.log(`${creep.name} rangedAttack returned ERR_NO_BODYPART - checking for safe mode bug`);
              console.log(`Target room ${targetRoom.name} safe mode: ${targetRoom.controller.safeMode || 'none'}`);
              console.log(`${creep.name} has ${rangedParts} active RANGED_ATTACK parts`);

              if (targetRoom.controller.safeMode) {
                console.log(`KNOWN BUG: Safe mode causes false ERR_NO_BODYPART`);
                creep.say('SAFE');
                return false;
              }
            }
            console.log(`${creep.name} rangedAttack failed: ${result} (${getErrorString(result)})`);
          } else {
            creep.say('🎯');
          }
        } else {
          console.log(`${creep.name} has damaged RANGED_ATTACK parts! HP: ${creep.hits}/${creep.hitsMax}`);
        }
      }

      // Use mass attack if beneficial
      const nearbyEnemies = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
      const nearbyStructures = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3, {
        filter: s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER
      });

      if (nearbyEnemies.length + nearbyStructures.length > 2) {
        const result = creep.rangedMassAttack();
        if (result === OK) {
          creep.say('💥');
        }
      }
    }

    // Melee attack if in range
    if (creep.getActiveBodyparts(ATTACK) > 0 && isValidTarget && range <= 1) {
      const result = creep.attack(target);
      if (result !== OK) {
        console.log(`${creep.name} attack failed: ${result} (${getErrorString(result)})`);
      }
    }

    // Movement based on target type and our capabilities
    if (target.structureType) {
      // It's a structure, get close for melee or stay at range 3
      if (creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(WORK) > 0) {
        // Has melee, move to contact
        if (range > 1) {
          creep.moveTo(target);
        }
      } else if (range > 3) {
        // Ranged only, maintain distance
        creep.moveTo(target, {range: 3});
      }
    } else {
      // It's a creep - maintain optimal range
      if (creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
        if (range < 3) {
          // Too close, back up
          const flee = PathFinder.search(creep.pos, [{pos: target.pos, range: 3}], {
            flee: true,
            maxRooms: 1
          });
          if (flee.path && flee.path.length > 0) {
            creep.move(creep.pos.getDirectionTo(flee.path[0]));
          }
        } else if (range > 3) {
          // Too far, move closer
          creep.moveTo(target, {range: 3});
        }
      } else {
        // Melee only
        if (range > 1) {
          creep.moveTo(target);
        }
      }
    }
  } else {
    // No targets, hold formation
    const formationPos = getQuadFormationPosition(creep, members);
    if (formationPos && !creep.pos.isEqualTo(formationPos)) {
      creep.moveTo(formationPos);
    }
  }

  // ALWAYS heal squadmates in combat
  healSquadmates(creep, members);

  creep.say('⚔️');
  return true;
}

/**
 * Handle position swapping when front units are damaged
 */
function handlePositionSwapping(creep, members) {
  // Only swap if we have 4 members in quad
  if (members.length !== 4) return;

  // Get health percentages
  const healthData = members.map(c => ({
    creep: c,
    healthPercent: c.hits / c.hitsMax,
    position: c.memory.squadPosition
  }));

  // Check if front units (positions 0, 1) need swapping
  const frontUnits = healthData.filter(d => d.position === 0 || d.position === 1);
  const backUnits = healthData.filter(d => d.position === 2 || d.position === 3);

  // Swap if any front unit is below 50% and back units are healthier
  for (const front of frontUnits) {
    if (front.healthPercent < 0.5) {
      // Find healthiest back unit
      const healthyBack = backUnits.reduce((best, current) =>
        current.healthPercent > best.healthPercent ? current : best
      );

      if (healthyBack.healthPercent > front.healthPercent + 0.2) {
        // Swap positions
        const tempPos = front.creep.memory.squadPosition;
        front.creep.memory.squadPosition = healthyBack.creep.memory.squadPosition;
        healthyBack.creep.memory.squadPosition = tempPos;

        console.log(`Squad position swap: ${front.creep.name}(${(front.healthPercent*100).toFixed(0)}%) <-> ${healthyBack.creep.name}(${(healthyBack.healthPercent*100).toFixed(0)}%)`);
        break; // Only one swap per tick
      }
    }
  }
}

/**
 * Handle squad retreating
 */
function handleSquadRetreating(creep, squad, members) {
  // Special handling for safe mode retreat
  if (squad.retreatReason === 'SAFE_MODE') {
    // Remember which room we're fleeing from
    if (!squad.fleeingFromRoom && creep.room.controller && creep.room.controller.safeMode) {
      squad.fleeingFromRoom = creep.room.name;
    }

    // If still in safe mode room, keep fleeing
    if (squad.fleeingFromRoom && creep.room.name === squad.fleeingFromRoom) {
      // Immediately exit the room - find closest exit
      const exit = creep.pos.findClosestByRange(FIND_EXIT);
      if (exit) {
        const result = creep.moveTo(exit, {
          reusePath: 0,  // Don't cache paths when fleeing
          maxRooms: 1
        });
        if (result === ERR_NO_PATH) {
          // Try to move away from walls if stuck
          creep.move(Math.floor(Math.random() * 8) + 1);
        }
      }
      creep.say('EXIT!');
      return true;
    }

    // Once out of the hostile room, move away from edges
    if (creep.pos.x <= 1 || creep.pos.x >= 48 || creep.pos.y <= 1 || creep.pos.y >= 48) {
      creep.moveTo(25, 25, {range: 15});
      creep.say('REGROUP');
      return true;
    }

    // We've successfully escaped
    const safeModeRoom = squad.fleeingFromRoom;
    delete squad.fleeingFromRoom;
    squad.retreatReason = null;
    squad.state = SQUAD_STATES.READY;

    // Clear the target room if it was the safe mode room
    if (squad.targetRoom === safeModeRoom) {
      console.log(`Squad ${squad.id} clearing target ${safeModeRoom} due to safe mode`);
      delete squad.targetRoom;

      // Update all squad members' routing
      for (const memberId of squad.members) {
        const member = Game.getObjectById(memberId);
        if (member && member.memory.routing && member.memory.routing.targetRoom === safeModeRoom) {
          delete member.memory.routing.targetRoom;
          member.memory.routing.reached = true;
        }
      }
    }

    // Find remote miners to protect instead
    const remoteMiners = Object.keys(Game.creeps).filter(name => {
      const c = Game.creeps[name];
      return c.memory.role === 'remoteharvester' ||
             c.memory.role === 'remotecarry' ||
             c.memory.role === 'remotereserver';
    });

    if (remoteMiners.length > 0) {
      console.log(`Squad ${squad.id} moving to protect remote miners`);
      squad.protectingMiners = true;
    } else {
      // Return to rally point
      if (squad.rallyPoint && creep.room.name !== squad.rallyPoint) {
        creep.moveTo(new RoomPosition(25, 25, squad.rallyPoint), {range: 20});
        creep.say('RALLY');
      } else {
        creep.say('IDLE');
      }
    }

    return true;
  }

  // Normal retreat logic
  const rallyPoint = squad.rallyPoint;

  // Move to rally point
  if (creep.room.name !== rallyPoint) {
    const route = Game.map.findRoute(creep.room.name, rallyPoint);
    if (route && route.length > 0) {
      const exit = creep.pos.findClosestByPath(route[0].exit);
      if (exit) {
        creep.moveTo(exit, {reusePath: 3});
      }
    }
  } else {
    // At rally point, move to center
    creep.moveTo(25, 25, {range: 5});
  }

  // Don't try to shoot in safe mode rooms
  if (!creep.room.controller || !creep.room.controller.safeMode) {
    // Shoot while retreating
    const enemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (enemy && creep.pos.getRangeTo(enemy) <= 3) {
      creep.rangedAttack(enemy);
    }
  }

  // Heal while retreating
  healSquadmates(creep, members);

  // Check if recovered
  const avgHealth = members.reduce((sum, c) => sum + (c.hits / c.hitsMax), 0) / members.length;
  if (avgHealth > 0.8 && squad.retreatReason !== 'SAFE_MODE') {
    squad.state = SQUAD_STATES.READY;
    console.log(`Squad ${squad.id} recovered and READY`);
  }

  creep.say('🏃');
  return true;
}

/**
 * Get quad formation position for a creep
 */
function getQuadFormationPosition(creep, members) {
  // Sort members by ID for consistent positioning
  members.sort((a, b) => a.memory.squadPosition - b.memory.squadPosition);

  const leader = members[0];
  if (!leader) return null;

  const position = creep.memory.squadPosition || 0;

  // Quad formation offsets
  const offsets = [
    {x: 0, y: 0},  // Position 0: Leader (top-left)
    {x: 1, y: 0},  // Position 1: Top-right
    {x: 0, y: 1},  // Position 2: Bottom-left
    {x: 1, y: 1}   // Position 3: Bottom-right
  ];

  const offset = offsets[position % 4];

  // Calculate desired position
  let desiredX = leader.pos.x + offset.x;
  let desiredY = leader.pos.y + offset.y;

  // Keep formation away from edges to avoid getting stuck on walls
  desiredX = Math.min(47, Math.max(2, desiredX));
  desiredY = Math.min(47, Math.max(2, desiredY));

  const desiredPos = new RoomPosition(desiredX, desiredY, leader.pos.roomName);

  // Check if the desired position is walkable
  const terrain = Game.map.getRoomTerrain(leader.pos.roomName);
  if (terrain.get(desiredX, desiredY) === TERRAIN_MASK_WALL) {
    // If it's a wall, find the nearest walkable position
    const room = Game.rooms[leader.pos.roomName];
    if (room) {
      const nearbyPositions = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = desiredX + dx;
          const y = desiredY + dy;
          if (x >= 1 && x <= 48 && y >= 1 && y <= 48) {
            if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
              nearbyPositions.push(new RoomPosition(x, y, leader.pos.roomName));
            }
          }
        }
      }
      if (nearbyPositions.length > 0) {
        // Return the closest walkable position
        return creep.pos.findClosestByRange(nearbyPositions);
      }
    }
  }

  return desiredPos;
}

/**
 * Heal squadmates - prioritize most damaged
 */
function healSquadmates(creep, members) {
  if (creep.getActiveBodyparts(HEAL) === 0) return;

  // Find most damaged squadmate
  const damaged = members
    .filter(c => c.hits < c.hitsMax)
    .sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));

  if (damaged.length > 0) {
    const target = damaged[0];
    const range = creep.pos.getRangeTo(target);

    if (range <= 1) {
      creep.heal(target);
      if (target.id !== creep.id) {
        creep.say('💚');
      }
    } else if (range <= 3) {
      creep.rangedHeal(target);
      creep.say('💉');
    }
  } else {
    // No damaged allies, heal self
    if (creep.hits < creep.hitsMax) {
      creep.heal(creep);
    }
  }
}

/**
 * Main squad system handler
 */
brain.handleSquadSystem = function() {
  // Clean up old squads
  if (Game.time % 50 === 0) {
    cleanupOldSquads();
  }

  // Report squad status
  if (Game.time % 10 === 0) {
    reportSquadStatus();
  }
};

/**
 * Clean up old/empty squads
 */
function cleanupOldSquads() {
  if (!Memory.combatSquads) return;

  for (const squadId in Memory.combatSquads) {
    const squad = Memory.combatSquads[squadId];

    // Remove dead members
    squad.members = squad.members.filter(id => Game.getObjectById(id));

    // Delete empty or old forming squads
    if (squad.members.length === 0 ||
        (squad.state === SQUAD_STATES.FORMING && Game.time - squad.createdAt > 500)) {
      delete Memory.combatSquads[squadId];
      console.log(`Cleaned up squad ${squadId}`);
    }
  }
}

/**
 * Report squad status
 */
function reportSquadStatus() {
  if (!Memory.combatSquads) return;

  const squadCount = Object.keys(Memory.combatSquads).length;
  if (squadCount === 0) return;

  console.log(`=== SQUAD STATUS ===`);
  for (const squadId in Memory.combatSquads) {
    const squad = Memory.combatSquads[squadId];
    const members = squad.members.map(id => Game.getObjectById(id)).filter(c => c);
    const avgHealth = members.length > 0 ?
      (members.reduce((sum, c) => sum + (c.hits / c.hitsMax), 0) / members.length * 100).toFixed(0) :
      0;

    console.log(`${squadId}: ${squad.state} | ${members.length} members | ${avgHealth}% health | Target: ${squad.targetRoom}`);
  }
}

module.exports = {
  handleSquadCombat: brain.handleSquadCombat,
  handleSquadSystem: brain.handleSquadSystem,
  assignToSquad: brain.assignToSquad
};