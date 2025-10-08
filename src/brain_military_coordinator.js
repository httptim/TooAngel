'use strict';

/**
 * Military Coordinator Module
 * Handles wave attacks, retreats, and regrouping
 */

/**
 * Rally point management for coordinated attacks
 */
brain.getRallyPoint = function(targetRoom) {
  if (!Memory.rallyPoints) {
    Memory.rallyPoints = {};
  }

  if (!Memory.rallyPoints[targetRoom]) {
    // Find the best launch room first
    const launchRoom = findBestLaunchRoom(targetRoom);
    if (!launchRoom) {
      // Fallback to first owned room
      Memory.rallyPoints[targetRoom] = Memory.myRooms ? Memory.myRooms[0] : null;
      return Memory.rallyPoints[targetRoom];
    }

    // ALWAYS rally in the launch room first to ensure proper squad formation
    // Units should group up BEFORE leaving our territory
    Memory.rallyPoints[targetRoom] = launchRoom;
    console.log(`Rally point for attack on ${targetRoom} set to home room ${launchRoom}`);
  }

  return Memory.rallyPoints[targetRoom];
};

/**
 * Check if attack wave is ready
 */
brain.isWaveReady = function(targetRoom, minSize = 4) {
  const rallyRoom = brain.getRallyPoint(targetRoom);

  // Count combat creeps at rally point or heading to target
  const attackers = _.filter(Object.values(Game.creeps), (creep) => {
    if (!creep.memory.routing || creep.memory.routing.targetRoom !== targetRoom) {
      return false;
    }

    const combatRoles = ['attacker', 'defender', 'squadsiege', 'squadheal', 'autoattackmelee', 'dismantler'];
    if (!combatRoles.includes(creep.memory.role)) {
      return false;
    }

    // Check if at rally point or already attacking
    return creep.room.name === rallyRoom || creep.room.name === targetRoom;
  });

  console.log(`Wave status for ${targetRoom}: ${attackers.length}/${minSize} units ready at rally point ${rallyRoom}`);

  return attackers.length >= minSize;
};

/**
 * Coordinate attack wave
 */
brain.coordinateAttackWave = function(targetRoom) {
  if (!Memory.attackWaves) {
    Memory.attackWaves = {};
  }

  const waveData = Memory.attackWaves[targetRoom] || {
    status: 'GATHERING',
    waveNumber: 0,
    lastWaveTime: 0,
    minWaveSize: 4,
    maxWaveSize: 8
  };

  const rallyRoom = brain.getRallyPoint(targetRoom);

  // Get all attackers assigned to this target
  const attackers = _.filter(Object.values(Game.creeps), (creep) => {
    if (!creep.memory.routing || creep.memory.routing.targetRoom !== targetRoom) {
      return false;
    }
    const combatRoles = ['attacker', 'defender', 'squadsiege', 'squadheal', 'autoattackmelee', 'dismantler'];
    return combatRoles.includes(creep.memory.role);
  });

  // Separate by location
  const atRally = attackers.filter(c => c.room.name === rallyRoom);
  const inCombat = attackers.filter(c => c.room.name === targetRoom);
  const enRoute = attackers.filter(c => c.room.name !== rallyRoom && c.room.name !== targetRoom);

  switch (waveData.status) {
    case 'GATHERING':
      // Hold units at rally point
      atRally.forEach(creep => {
        creep.memory.rallyHold = true;
        creep.say('⏳');

        // Move to center of rally room while waiting
        const centerPos = new RoomPosition(25, 25, rallyRoom);
        if (creep.pos.getRangeTo(centerPos) > 5) {
          creep.moveTo(centerPos);
        } else {
          creep.moveRandom();
        }
      });

      // Check if wave is ready
      if (atRally.length >= waveData.minWaveSize) {
        console.log(`WAVE READY! Launching wave ${waveData.waveNumber + 1} with ${atRally.length} units to ${targetRoom}`);
        waveData.status = 'ATTACKING';
        waveData.waveNumber++;
        waveData.lastWaveTime = Game.time;

        // Release the wave
        atRally.forEach(creep => {
          delete creep.memory.rallyHold;
          creep.memory.waveNumber = waveData.waveNumber;
          creep.say('⚔️');
        });
      }
      break;

    case 'ATTACKING':
      // Monitor active wave
      if (inCombat.length === 0 && enRoute.length === 0) {
        // Wave destroyed or completed
        console.log(`Wave ${waveData.waveNumber} completed/destroyed. Gathering next wave.`);
        waveData.status = 'GATHERING';

        // Increase wave size if last wave failed quickly
        if (Game.time - waveData.lastWaveTime < 300) {
          waveData.minWaveSize = Math.min(waveData.maxWaveSize, waveData.minWaveSize + 2);
          console.log(`Increasing wave size to ${waveData.minWaveSize} for ${targetRoom}`);
        }
      }

      // Don't hold new arrivals if wave is active
      atRally.forEach(creep => {
        if (!creep.memory.waveNumber) {
          creep.memory.waveNumber = waveData.waveNumber;
          delete creep.memory.rallyHold;
          creep.say('➕');
        }
      });
      break;
  }

  Memory.attackWaves[targetRoom] = waveData;
};

/**
 * Handle retreat for damaged units
 */
brain.handleCombatRetreat = function(creep) {
  const retreatThreshold = creep.memory.role === 'squadheal' ? 0.5 : 0.3;

  if (creep.hits < creep.hitsMax * retreatThreshold) {
    // Mark for retreat
    if (!creep.memory.retreating) {
      creep.memory.retreating = true;
      creep.memory.retreatFrom = creep.room.name;
      creep.say('🏃');
      console.log(`${creep.name} retreating from ${creep.room.name} (${creep.hits}/${creep.hitsMax})`);
    }

    // Find path back to base or rally point
    let retreatTarget = creep.memory.base || creep.memory.routing.startRoom;

    // If in enemy room, first get to rally point
    if (creep.room.name === creep.memory.routing.targetRoom) {
      retreatTarget = brain.getRallyPoint(creep.memory.routing.targetRoom);
    }

    if (creep.room.name === retreatTarget) {
      // Reached safety, find healer or spawn
      const healers = creep.room.find(FIND_MY_CREEPS, {
        filter: c => c.memory.role === 'squadheal' && c.getActiveBodyparts(HEAL) > 0
      });

      if (healers.length > 0) {
        creep.moveTo(healers[0]);
      } else {
        const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
          creep.moveTo(spawn);
        }
      }

      // Check if healed enough to return
      if (creep.hits >= creep.hitsMax * 0.8) {
        delete creep.memory.retreating;
        delete creep.memory.retreatFrom;
        creep.say('💪');
        console.log(`${creep.name} recovered and returning to combat`);
      }
    } else {
      // Still retreating
      const route = Game.map.findRoute(creep.room.name, retreatTarget);
      if (route && route.length > 0) {
        const exit = creep.pos.findClosestByRange(route[0].exit);
        creep.moveTo(exit);

        // Emergency heal while retreating
        if (creep.getActiveBodyparts(HEAL) > 0) {
          creep.heal(creep);
        }
      }
    }

    return true; // Retreating, skip normal actions
  } else if (creep.memory.retreating && creep.hits >= creep.hitsMax * 0.8) {
    // Recovered
    delete creep.memory.retreating;
    delete creep.memory.retreatFrom;
    creep.say('💪');
  }

  return false; // Not retreating
};

/**
 * Spawn attack waves with proper coordination
 */
brain.spawnAttackWave = function(targetRoom, baseRoom) {
  const room = Game.rooms[baseRoom];
  if (!room) return;

  // Check current wave status
  const waveData = Memory.attackWaves && Memory.attackWaves[targetRoom];
  const currentWaveSize = waveData ? waveData.minWaveSize : 4;

  // Count existing attackers
  const attackers = _.filter(Object.values(Game.creeps), (creep) => {
    if (!creep.memory.routing || creep.memory.routing.targetRoom !== targetRoom) {
      return false;
    }
    const combatRoles = ['attacker', 'defender', 'squadsiege', 'squadheal', 'autoattackmelee', 'dismantler'];
    return combatRoles.includes(creep.memory.role);
  });

  // Don't spawn more if we have enough for next wave
  if (attackers.length >= currentWaveSize) {
    return;
  }

  // Spawn balanced composition for squads (groups of 4)
  const defenders = attackers.filter(c => c.memory.role === 'defender').length;
  const attackerUnits = attackers.filter(c => c.memory.role === 'attacker').length;
  const healers = attackers.filter(c => c.memory.role === 'squadheal').length;
  const siegers = attackers.filter(c => c.memory.role === 'squadsiege').length;

  // Squad composition: 1 attacker, 1 defender, 1 healer, 1 sieger per squad
  // This ensures balanced squads
  const totalUnits = defenders + attackerUnits + healers + siegers;
  const squadsNeeded = Math.ceil(currentWaveSize / 4);

  // Calculate what we need for balanced squads
  const targetCount = squadsNeeded;  // One of each role per squad

  let roleToSpawn = null;

  if (attackerUnits < targetCount) {
    roleToSpawn = 'attacker';
  } else if (defenders < targetCount) {
    roleToSpawn = 'defender';
  } else if (healers < targetCount) {
    roleToSpawn = 'squadheal';
  } else if (siegers < targetCount) {
    roleToSpawn = 'squadsiege';
  } else if (totalUnits < currentWaveSize) {
    // If we need more units, spawn based on what's lacking
    const roles = [
      {role: 'attacker', count: attackerUnits},
      {role: 'defender', count: defenders},
      {role: 'squadheal', count: healers},
      {role: 'squadsiege', count: siegers}
    ];
    roles.sort((a, b) => a.count - b.count);
    roleToSpawn = roles[0].role;
  }

  if (roleToSpawn) {
    console.log(`Spawning ${roleToSpawn} for wave to ${targetRoom} (A:${attackerUnits} D:${defenders} H:${healers} S:${siegers})`);
    room.checkRoleToSpawn(roleToSpawn, 1, undefined, targetRoom);
  }
};

/**
 * Main military coordination handler
 */
brain.handleMilitaryCoordination = function() {
  // Only run periodically
  if (Game.time % 5 !== 0) return;

  // Check all conquest targets
  if (!Memory.conquestTargets) return;

  for (const targetRoom in Memory.conquestTargets) {
    // Coordinate waves for each target
    brain.coordinateAttackWave(targetRoom);

    // Spawn units as needed
    const launchRoom = findBestLaunchRoom(targetRoom);
    if (launchRoom) {
      brain.spawnAttackWave(targetRoom, launchRoom);
    }
  }
};

/**
 * Helper to find best launch room
 */
function findBestLaunchRoom(targetRoom) {
  let bestRoom = null;
  let minDistance = Infinity;

  for (const myRoomName of Memory.myRooms || []) {
    const room = Game.rooms[myRoomName];
    if (!room || room.controller.level < 4) continue;

    const distance = Game.map.getRoomLinearDistance(myRoomName, targetRoom);
    if (distance < minDistance) {
      minDistance = distance;
      bestRoom = myRoomName;
    }
  }

  return bestRoom;
}

module.exports = {
  handleMilitaryCoordination: brain.handleMilitaryCoordination,
  coordinateAttackWave: brain.coordinateAttackWave,
  handleCombatRetreat: brain.handleCombatRetreat,
  isWaveReady: brain.isWaveReady,
  getRallyPoint: brain.getRallyPoint,
  spawnAttackWave: brain.spawnAttackWave
};