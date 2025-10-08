'use strict';

const {debugLog} = require('./logging');

/**
 * Main aggression coordinator module
 * Orchestrates all aggressive expansion activities
 */

/**
 * calculateProfitability
 * Calculates the ROI of an attack
 *
 * @param {Object} target - Target information
 * @param {string} attackType - Type of attack
 * @return {Object} - Profitability assessment
 */
function calculateProfitability(target, attackType) {
  const costs = {
    military: 0,
    opportunity: 0,
    risk: 0,
  };

  const gains = {
    immediate: 0,
    strategic: 0,
    future: 0,
    denial: 0,
  };

  // Calculate costs based on attack type
  switch (attackType) {
    case 'REMOTE_TAKEOVER':
      costs.military = 2000;  // 2 defenders
      costs.opportunity = target.distance * 50;
      costs.risk = target.risk * 100;
      gains.immediate = target.sources * 3000;
      gains.strategic = 3000;
      gains.future = target.sources * 3000 * 10;  // Long-term harvest
      gains.denial = 2000;
      break;

    case 'HARASSMENT':
      costs.military = 1000;  // 1-2 defenders
      costs.opportunity = 500;
      costs.risk = 200;
      gains.immediate = 500;  // Disruption value
      gains.strategic = 1000;
      gains.denial = 1500;
      break;

    case 'ROOM_CONQUEST':
      costs.military = 10000;  // Full assault force
      costs.opportunity = 5000;
      costs.risk = target.risk * 500;
      gains.immediate = 10000;
      gains.strategic = 20000;
      gains.future = 50000;
      gains.denial = 10000;
      break;

    default:
      break;
  }

  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const totalGain = Object.values(gains).reduce((a, b) => a + b, 0);

  return {
    costs: costs,
    gains: gains,
    totalCost: totalCost,
    totalGain: totalGain,
    netProfit: totalGain - totalCost,
    roi: totalGain / totalCost,
    decision: (totalGain / totalCost) >= config.aggression.profitThreshold ? 'ATTACK' : 'SKIP',
  };
}

/**
 * assessRetaliation
 * Evaluates likely retaliation for an attack
 *
 * @param {Object} target - Target information
 * @param {string} attackType - Type of attack
 * @return {Object} - Retaliation assessment
 */
function assessRetaliation(target, attackType) {
  const assessment = {
    willRetaliate: false,
    retaliationStrength: 0,
    ourDefenseReady: false,
    recommendation: 'ATTACK_IMMEDIATELY',
  };

  // Get target owner's strength
  let ownerStrength = 0;
  if (target.owner && target.owner !== 'unknown') {
    // Try to find their main room
    for (const roomName in Memory.rooms) {
      const roomData = Memory.rooms[roomName];
      if (roomData && roomData.owner === target.owner && roomData.level >= 4) {
        const strength = brain.evaluateRoomStrength(roomName);
        ownerStrength = Math.max(ownerStrength, strength.militaryScore);
      }
    }
  }

  // Assess retaliation likelihood
  if (ownerStrength > 30) {
    assessment.willRetaliate = true;
    assessment.retaliationStrength = ownerStrength;

    // Check our defense capability
    let ourDefenseStrength = 0;
    for (const myRoomName of Memory.myRooms || []) {
      const strength = brain.evaluateRoomStrength(myRoomName);
      ourDefenseStrength = Math.max(ourDefenseStrength, strength.militaryScore);
    }

    assessment.ourDefenseReady = ourDefenseStrength > 20;

    // Make recommendation
    if (assessment.retaliationStrength > ourDefenseStrength * 1.5) {
      assessment.recommendation = 'ABORT';
    } else if (assessment.retaliationStrength > ourDefenseStrength) {
      assessment.recommendation = 'FORTIFY_THEN_ATTACK';
    } else {
      assessment.recommendation = 'ATTACK_WITH_DEFENSE';
    }
  }

  return assessment;
}

/**
 * getOurMilitaryCapability
 * Calculates our current military capability
 *
 * @return {Object} - Military capability assessment
 */
function getOurMilitaryCapability() {
  const capability = {
    availableDefenders: 0,
    maxDefenders: 0,
    energyAvailable: 0,
    spawnsAvailable: 0,
    canAttack: false,
  };

  for (const roomName of Memory.myRooms || []) {
    const room = Game.rooms[roomName];
    if (!room) continue;

    // Count defenders
    const defenders = room.find(FIND_MY_CREEPS, {
      filter: (creep) => creep.memory.role === 'defender' ||
                        creep.memory.role === 'defendranged',
    });
    capability.availableDefenders += defenders.length;

    // Check spawn availability
    const spawns = room.find(FIND_MY_SPAWNS, {
      filter: (spawn) => !spawn.spawning,
    });
    capability.spawnsAvailable += spawns.length;

    // Check energy
    capability.energyAvailable += room.energyAvailable;

    // Max defenders we could spawn
    if (room.controller.level >= 3) {
      capability.maxDefenders += 3;
    }
  }

  capability.canAttack = capability.availableDefenders >= 2 ||
                        (capability.spawnsAvailable > 0 && capability.energyAvailable >= 1000);

  return capability;
}

/**
 * maintainPressure
 * Maintains continuous pressure on all fronts
 */
function maintainPressure() {
  // Check all rooms under attack
  if (!Memory.roomsUnderAttack) {
    return;
  }

  for (const roomName in Memory.roomsUnderAttack) {
    const attackData = Memory.roomsUnderAttack[roomName];

    // Clean up completed attacks
    if (Game.time - attackData.startTime > 1500) {
      const room = Game.rooms[roomName];
      if (room && room.controller && room.controller.reservation &&
          room.controller.reservation.username === Memory.username) {
        // We won!
        debugLog('aggression', `Successfully took over ${roomName}`);
        delete Memory.roomsUnderAttack[roomName];
        continue;
      }

      // Check if we should continue or abort
      if (attackData.abortTime && Game.time > attackData.abortTime) {
        debugLog('aggression', `Aborting attack on ${roomName}`);
        delete Memory.roomsUnderAttack[roomName];
        continue;
      }
    }

    // Maintain pressure by ensuring we have attackers
    const attackers = _.filter(Game.creeps, (creep) =>
      creep.memory.routing && creep.memory.routing.targetRoom === roomName &&
      (creep.memory.role === 'defender' || creep.memory.role === 'defendranged'),
    );

    if (attackers.length < 2 && !attackData.abortTime) {
      // Find room to reinforce from
      for (const myRoomName of Memory.myRooms || []) {
        const room = Game.rooms[myRoomName];
        if (room && room.energyAvailable >= 500) {
          room.checkRoleToSpawn('defender', 1, undefined, roomName);
          break;
        }
      }
    }
  }
}

/**
 * findWeakNeighbors
 * Finds weak neighboring rooms to attack
 *
 * @return {Array} - Array of weak targets
 */
function findWeakNeighbors() {
  const targets = [];

  // Check all known rooms
  for (const roomName in Memory.rooms) {
    const roomData = Memory.rooms[roomName];
    if (!roomData) continue;

    // Skip our own rooms
    if (Memory.myRooms && Memory.myRooms.includes(roomName)) {
      continue;
    }

    // Skip friends (for now)
    if (roomData.owner && global.friends && global.friends.includes(roomData.owner)) {
      continue;
    }

    // Check if it's weak
    if (brain.isRoomWeak && brain.isRoomWeak(roomName)) {
      // Calculate distance to our nearest room
      let minDistance = Infinity;
      for (const myRoom of Memory.myRooms || []) {
        const distance = Game.map.getRoomLinearDistance(myRoom, roomName);
        minDistance = Math.min(minDistance, distance);
      }

      // Only consider nearby rooms
      if (minDistance <= 3) {
        targets.push({
          room: roomName,
          owner: roomData.owner || 'unknown',
          distance: minDistance,
          level: roomData.level || 0,
          risk: 3,  // Default risk
        });
      }
    }
  }

  return targets;
}

/**
 * Main aggression tick function
 * Coordinates all aggressive activities
 */
brain.handleAggression = function() {
  if (!config.aggression || !config.aggression.enabled) {
    return;
  }

  // Check based on config interval
  if (Game.time % config.aggression.checkInterval !== 0) {
    return;
  }

  // Check if we have minimum RCL
  let maxRCL = 0;
  for (const roomName of Memory.myRooms || []) {
    const room = Game.rooms[roomName];
    if (room && room.controller) {
      maxRCL = Math.max(maxRCL, room.controller.level);
    }
  }

  if (maxRCL < config.aggression.minRCL) {
    return;  // Not ready for aggression yet
  }

  debugLog('aggression', 'Running aggression check');

  // Step 1: Eliminate scouts (runs every 10 ticks via its own module)
  // Handled by brain_scouteliminator

  // Step 2: Check military capability
  const capability = getOurMilitaryCapability();
  if (!capability.canAttack) {
    debugLog('aggression', 'Insufficient military capability for attacks');
    return;
  }

  // Step 3: Find remote mining takeover opportunities
  if (config.aggression.remoteRoomTakeover) {
    const remoteTargets = brain.findRemoteTakeoverTargets();

    if (remoteTargets.length > 0) {
      const target = remoteTargets[0];  // Best target

      // Assess profitability
      const profit = calculateProfitability(target, 'REMOTE_TAKEOVER');

      if (profit.decision === 'ATTACK') {
        // Assess retaliation risk
        const retaliation = assessRetaliation(target, 'REMOTE_TAKEOVER');

        debugLog('aggression', `Remote takeover assessment for ${target.room}: ` +
                 `ROI=${profit.roi.toFixed(2)}, Recommendation=${retaliation.recommendation}`);

        switch (retaliation.recommendation) {
          case 'ATTACK_IMMEDIATELY':
            brain.executeRemoteTakeover(target);
            break;

          case 'ATTACK_WITH_DEFENSE':
            brain.prepareDefenseForRetaliation(target.room);
            brain.executeRemoteTakeover(target);
            break;

          case 'FORTIFY_THEN_ATTACK':
            brain.prepareDefenseForRetaliation(target.room);
            // Delay attack by 100 ticks to prepare
            if (!Memory.delayedAttacks) {
              Memory.delayedAttacks = {};
            }
            Memory.delayedAttacks[target.room] = {
              time: Game.time + 100,
              target: target,
              type: 'REMOTE_TAKEOVER',
            };
            break;

          case 'ABORT':
            debugLog('aggression', `Aborting attack on ${target.room} - too risky`);
            break;
        }
      }
    }
  }

  // Step 4: Execute delayed attacks
  if (Memory.delayedAttacks) {
    for (const roomName in Memory.delayedAttacks) {
      const attack = Memory.delayedAttacks[roomName];
      if (Game.time >= attack.time) {
        if (attack.type === 'REMOTE_TAKEOVER') {
          brain.executeRemoteTakeover(attack.target);
        }
        delete Memory.delayedAttacks[roomName];
      }
    }
  }

  // Step 5: Look for weak neighbors to harass
  const weakNeighbors = findWeakNeighbors();
  if (weakNeighbors.length > 0 && capability.availableDefenders >= 3) {
    const target = weakNeighbors[0];
    const profit = calculateProfitability(target, 'HARASSMENT');

    if (profit.decision === 'ATTACK') {
      // Simple harassment - send a defender
      for (const myRoomName of Memory.myRooms || []) {
        const room = Game.rooms[myRoomName];
        if (room) {
          room.checkRoleToSpawn('defender', 1, undefined, target.room);
          debugLog('aggression', `Initiating harassment of weak neighbor ${target.room}`);
          break;
        }
      }
    }
  }

  // Step 6: Maintain pressure on all fronts
  if (config.aggression.continuousPressure) {
    maintainPressure();
  }
};

/**
 * Emergency defense coordination
 * Called when under attack
 */
brain.coordinateEmergencyDefense = function(roomName) {
  debugLog('aggression', `Emergency defense triggered for ${roomName}`);

  const room = Game.rooms[roomName];
  if (!room) return;

  // Spawn emergency defenders
  const defenders = room.find(FIND_MY_CREEPS, {
    filter: (creep) => creep.memory.role === 'defender' ||
                      creep.memory.role === 'defendranged',
  });

  if (defenders.length < 4) {
    // Emergency spawn with whatever energy we have
    const body = [];
    let cost = 0;
    const energy = room.energyAvailable;

    // Build best defender we can afford
    while (cost < energy && body.length < 50) {
      if (cost + 130 <= energy) {
        body.push(TOUGH, MOVE, ATTACK);
        cost += 130;
      } else if (cost + 50 <= energy) {
        body.push(MOVE);
        cost += 50;
      } else {
        break;
      }
    }

    if (body.length >= 3) {
      const spawns = room.find(FIND_MY_SPAWNS, {
        filter: (spawn) => !spawn.spawning,
      });

      if (spawns.length > 0) {
        const result = spawns[0].spawnCreep(body, 'emergency_' + Game.time, {
          memory: {
            role: 'defender',
            routing: {targetRoom: roomName},
          },
        });

        if (result === OK) {
          debugLog('aggression', `Spawned emergency defender in ${roomName}`);
        }
      }
    }
  }

  // Request help from nearby rooms
  for (const otherRoom of Memory.myRooms || []) {
    if (otherRoom === roomName) continue;

    const distance = Game.map.getRoomLinearDistance(otherRoom, roomName);
    if (distance <= 2) {
      const helper = Game.rooms[otherRoom];
      if (helper) {
        helper.checkRoleToSpawn('defender', 2, undefined, roomName);
      }
    }
  }
};

module.exports = {
  handleAggression: brain.handleAggression,
  coordinateEmergencyDefense: brain.coordinateEmergencyDefense,
};