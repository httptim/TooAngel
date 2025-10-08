'use strict';

const {debugLog} = require('./logging');

/**
 * Brain module for conquering enemy main rooms
 * Part of Phase 3: Conquest implementation
 */

/**
 * identifyMainRooms
 * Identifies which rooms are likely main rooms for a player
 *
 * @param {string} playerName - The player to analyze
 * @return {Array} - Array of main room names
 */
function identifyMainRooms(playerName) {
  const mainRooms = [];

  for (const roomName in Memory.rooms) {
    const roomData = Memory.rooms[roomName];
    if (!roomData) continue;

    // Check if it's owned by target player
    if (roomData.player === playerName || roomData.owner === playerName) {
      // Main room indicators:
      // - Has spawns
      // - RCL >= 3
      // - Has storage or terminal
      if (roomData.level >= 3 && roomData.spawns && roomData.spawns.length > 0) {
        mainRooms.push({
          name: roomName,
          level: roomData.level || 0,
          lastSeen: roomData.lastSeen || 0,
          hasStorage: roomData.storage || false,
          hasTerminal: roomData.terminal || false,
          spawns: roomData.spawns ? roomData.spawns.length : 0,
        });
      }
    }
  }

  // Sort by RCL (lowest first for easier targets)
  mainRooms.sort((a, b) => a.level - b.level);

  return mainRooms;
}

/**
 * selectConquestStrategy
 * Chooses the best strategy based on target strength
 *
 * @param {Object} targetRoom - Target room data
 * @param {Object} strength - Room strength assessment
 * @return {string} - Strategy type
 */
function selectConquestStrategy(targetRoom, strength) {
  // BLITZ - Quick overwhelming force for weak targets
  if (strength.militaryScore < 30 && targetRoom.level <= 4) {
    return 'BLITZ';
  }

  // DEMOLITION - Destroy infrastructure when no towers
  if (strength.vulnerabilityScore < -30 && !strength.military.towers) {
    return 'DEMOLITION';
  }

  // DRAIN - Drain tower energy first
  if (strength.military.towers > 30 && targetRoom.level <= 6) {
    return 'DRAIN';
  }

  // SIEGE - Long-term siege for strong rooms
  if (strength.economicScore > 70 || targetRoom.level >= 6) {
    return 'SIEGE';
  }

  // ATTRITION - Default strategy
  return 'ATTRITION';
}

/**
 * calculateConquestForce
 * Determines the force needed for conquest
 *
 * @param {string} strategy - The strategy type
 * @param {Object} strength - Target room strength
 * @return {Object} - Required forces
 */
function calculateConquestForce(strategy, strength) {
  const force = {
    attackers: 0,
    healers: 0,
    dismantlers: 0,
    drainers: 0,
    totalCost: 0,
  };

  switch (strategy) {
    case 'BLITZ':
      // Fast attack with minimal healing
      force.attackers = 4;
      force.healers = 1;
      force.totalCost = 3000;
      break;

    case 'DEMOLITION':
      // Focus on destroying structures
      force.attackers = 2;
      force.dismantlers = 3;
      force.healers = 2;
      force.totalCost = 5000;
      break;

    case 'DRAIN':
      // Tower drainers with support
      force.drainers = 4;
      force.healers = 4;
      force.attackers = 1;
      force.totalCost = 8000;
      break;

    case 'SIEGE':
      // Full assault force
      force.attackers = 4;
      force.dismantlers = 2;
      force.healers = 3;
      force.drainers = 2;
      force.totalCost = 10000;
      break;

    case 'ATTRITION':
      // Sustained pressure
      force.attackers = 3;
      force.healers = 2;
      force.dismantlers = 1;
      force.totalCost = 4000;
      break;
  }

  // Adjust for tower presence
  if (strength.military.towers > 30) {
    force.healers = Math.max(force.healers, 3);
    force.drainers = Math.max(force.drainers, 2);
  }

  return force;
}

/**
 * calculateConquestROI
 * Calculates return on investment for conquering a room
 *
 * @param {Object} targetRoom - Target room data
 * @param {Object} strength - Room strength assessment
 * @param {Object} force - Required force
 * @return {Object} - ROI calculation
 */
function calculateConquestROI(targetRoom, strength, force) {
  const costs = {
    military: force.totalCost,
    respawn: force.totalCost * 0.3, // Expected losses
    opportunity: 5000, // CPU and spawn time
    risk: strength.retaliation.canRetaliate ? 3000 : 1000,
  };

  const gains = {
    immediate: 0,
    resources: 0,
    strategic: 0,
    elimination: 0,
  };

  // Immediate gains from razing
  if (targetRoom.hasStorage) {
    gains.immediate += 20000; // Estimated storage contents
  }
  if (targetRoom.hasTerminal) {
    gains.immediate += 10000; // Terminal resources
  }

  // Resource gains from controlling the room
  gains.resources = 10000 * targetRoom.level; // Based on RCL

  // Strategic value
  if (targetRoom.level >= 6) {
    gains.strategic = 30000; // High-level room elimination
  } else {
    gains.strategic = 10000 + (targetRoom.level * 2000);
  }

  // Elimination value (removing competition)
  gains.elimination = 20000;

  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const totalGain = Object.values(gains).reduce((a, b) => a + b, 0);

  return {
    costs: costs,
    gains: gains,
    totalCost: totalCost,
    totalGain: totalGain,
    roi: totalCost > 0 ? totalGain / totalCost : 0,
    profitable: totalCost > 0 && totalGain / totalCost >= (config.aggression?.profitThreshold || 1.3),
  };
}

/**
 * assessConquest
 * Main assessment function for room conquest
 *
 * @param {string} playerName - Target player
 * @return {Object|null} - Conquest plan or null
 */
brain.assessConquest = function(playerName) {
  // Don't attack friends (yet)
  if (global.friends && global.friends.includes(playerName)) {
    return null;
  }

  const mainRooms = identifyMainRooms(playerName);
  if (mainRooms.length === 0) {
    return null;
  }

  // Evaluate each main room
  for (const room of mainRooms) {
    const strength = brain.evaluateRoomStrength(room.name);

    // Skip if too strong
    if (strength.militaryScore > 80 || strength.military.safeMode > 0) {
      continue;
    }

    const strategy = selectConquestStrategy(room, strength);
    const force = calculateConquestForce(strategy, strength);
    const roi = calculateConquestROI(room, strength, force);

    if (roi.profitable) {
      // Check if we have the capability
      let ourMilitaryStrength = 0;
      let availableEnergy = 0;

      for (const myRoom of Memory.myRooms || []) {
        const myRoomStrength = brain.evaluateRoomStrength(myRoom);
        ourMilitaryStrength = Math.max(ourMilitaryStrength, myRoomStrength.militaryScore);

        const room = Game.rooms[myRoom];
        if (room && room.storage) {
          availableEnergy += room.storage.store.getUsedCapacity(RESOURCE_ENERGY);
        }
      }

      // Need superiority and resources
      const canConquer = ourMilitaryStrength > strength.militaryScore * 1.2 &&
                        availableEnergy > force.totalCost * 2;

      if (canConquer) {
        return {
          target: room.name,
          player: playerName,
          strategy: strategy,
          force: force,
          roi: roi,
          strength: strength,
          distance: getDistanceToNearestBase(room.name),
        };
      }
    }
  }

  return null;
};

/**
 * getDistanceToNearestBase
 * Finds distance to our nearest room
 *
 * @param {string} targetRoom - Target room name
 * @return {number} - Distance
 */
function getDistanceToNearestBase(targetRoom) {
  let minDistance = Infinity;

  for (const myRoom of Memory.myRooms || []) {
    const distance = Game.map.getRoomLinearDistance(myRoom, targetRoom);
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
}

/**
 * executeBlitzkrieg
 * Fast overwhelming attack
 *
 * @param {Object} plan - Conquest plan
 */
function executeBlitzkrieg(plan) {
  debugLog('conquest', `Launching BLITZ attack on ${plan.target}`);

  const launchRoom = findBestLaunchRoom(plan.target);
  if (!launchRoom) return;

  // Spawn attack force quickly
  for (let i = 0; i < plan.force.attackers; i++) {
    launchRoom.checkRoleToSpawn('autoattackmelee', 1, undefined, plan.target);
  }

  for (let i = 0; i < plan.force.healers; i++) {
    launchRoom.checkRoleToSpawn('squadheal', 1, undefined, plan.target);
  }

  markRoomUnderAttack(plan.target, 'BLITZ', plan.player);
}

/**
 * executeDemolition
 * Destroy all infrastructure
 *
 * @param {Object} plan - Conquest plan
 */
function executeDemolition(plan) {
  debugLog('conquest', `Launching DEMOLITION attack on ${plan.target}`);

  const launchRoom = findBestLaunchRoom(plan.target);
  if (!launchRoom) return;

  // Spawn dismantlers and support
  for (let i = 0; i < plan.force.dismantlers; i++) {
    launchRoom.checkRoleToSpawn('dismantler', 1, undefined, plan.target);
  }

  for (let i = 0; i < plan.force.attackers; i++) {
    launchRoom.checkRoleToSpawn('autoattackmelee', 1, undefined, plan.target);
  }

  for (let i = 0; i < plan.force.healers; i++) {
    launchRoom.checkRoleToSpawn('squadheal', 1, undefined, plan.target);
  }

  markRoomUnderAttack(plan.target, 'DEMOLITION', plan.player);
}

/**
 * executeDrain
 * Drain tower energy before main attack
 *
 * @param {Object} plan - Conquest plan
 */
function executeDrain(plan) {
  debugLog('conquest', `Launching DRAIN attack on ${plan.target}`);

  const launchRoom = findBestLaunchRoom(plan.target);
  if (!launchRoom) return;

  // Spawn tower drainers
  for (let i = 0; i < plan.force.drainers; i++) {
    launchRoom.checkRoleToSpawn('towerdrainer', 1, undefined, plan.target);
  }

  // Support healers
  for (let i = 0; i < plan.force.healers; i++) {
    launchRoom.checkRoleToSpawn('squadheal', 1, undefined, plan.target);
  }

  markRoomUnderAttack(plan.target, 'DRAIN', plan.player);
}

/**
 * executeSiege
 * Long-term siege operations
 *
 * @param {Object} plan - Conquest plan
 */
function executeSiege(plan) {
  debugLog('conquest', `Launching SIEGE attack on ${plan.target}`);

  const launchRoom = findBestLaunchRoom(plan.target);
  if (!launchRoom) return;

  // Full combined arms assault
  for (let i = 0; i < plan.force.attackers; i++) {
    launchRoom.checkRoleToSpawn('squadsiege', 1, undefined, plan.target);
  }

  for (let i = 0; i < plan.force.dismantlers; i++) {
    launchRoom.checkRoleToSpawn('dismantler', 1, undefined, plan.target);
  }

  for (let i = 0; i < plan.force.healers; i++) {
    launchRoom.checkRoleToSpawn('squadheal', 1, undefined, plan.target);
  }

  for (let i = 0; i < plan.force.drainers; i++) {
    launchRoom.checkRoleToSpawn('towerdrainer', 1, undefined, plan.target);
  }

  markRoomUnderAttack(plan.target, 'SIEGE', plan.player);
}

/**
 * executeAttrition
 * Wear down the target over time
 *
 * @param {Object} plan - Conquest plan
 */
function executeAttrition(plan) {
  debugLog('conquest', `Launching ATTRITION campaign on ${plan.target}`);

  const launchRoom = findBestLaunchRoom(plan.target);
  if (!launchRoom) return;

  // Sustained pressure forces
  for (let i = 0; i < plan.force.attackers; i++) {
    launchRoom.checkRoleToSpawn('defender', 1, undefined, plan.target);
  }

  for (let i = 0; i < plan.force.healers; i++) {
    launchRoom.checkRoleToSpawn('squadheal', 1, undefined, plan.target);
  }

  if (plan.force.dismantlers > 0) {
    launchRoom.checkRoleToSpawn('dismantler', 1, undefined, plan.target);
  }

  markRoomUnderAttack(plan.target, 'ATTRITION', plan.player);
}

/**
 * findBestLaunchRoom
 * Finds the best room to launch attack from
 *
 * @param {string} targetRoom - Target room name
 * @return {Room|null} - Best launch room
 */
function findBestLaunchRoom(targetRoom) {
  let bestRoom = null;
  let minDistance = Infinity;

  for (const myRoomName of Memory.myRooms || []) {
    const room = Game.rooms[myRoomName];
    if (!room || room.controller.level < 4) continue;

    const distance = Game.map.getRoomLinearDistance(myRoomName, targetRoom);

    // Prefer closer rooms with energy
    if (distance < minDistance && room.energyCapacityAvailable >= 1000) {
      minDistance = distance;
      bestRoom = room;
    }
  }

  return bestRoom;
}

/**
 * markRoomUnderAttack
 * Records that we're attacking a room
 *
 * @param {string} roomName - Room being attacked
 * @param {string} strategy - Attack strategy
 * @param {string} player - Target player
 */
function markRoomUnderAttack(roomName, strategy, player) {
  if (!Memory.conquestTargets) {
    Memory.conquestTargets = {};
  }

  Memory.conquestTargets[roomName] = {
    startTime: Game.time,
    strategy: strategy,
    player: player,
    phase: 'initial',
  };
}

/**
 * executeConquest
 * Main execution function for conquest
 *
 * @param {Object} plan - Conquest plan
 */
brain.executeConquest = function(plan) {
  debugLog('conquest', `Initiating conquest of ${plan.target} owned by ${plan.player}`);
  debugLog('conquest', `Strategy: ${plan.strategy}, ROI: ${plan.roi.roi.toFixed(2)}`);

  // Execute based on strategy
  switch (plan.strategy) {
    case 'BLITZ':
      executeBlitzkrieg(plan);
      break;

    case 'DEMOLITION':
      executeDemolition(plan);
      break;

    case 'DRAIN':
      executeDrain(plan);
      break;

    case 'SIEGE':
      executeSiege(plan);
      break;

    case 'ATTRITION':
      executeAttrition(plan);
      break;

    default:
      debugLog('conquest', `Unknown strategy: ${plan.strategy}`);
  }

  // Prepare for retaliation
  brain.prepareDefenseForRetaliation(plan.target);
};

/**
 * monitorConquest
 * Monitors ongoing conquest operations
 */
brain.monitorConquest = function() {
  if (!Memory.conquestTargets) return;

  for (const roomName in Memory.conquestTargets) {
    const conquest = Memory.conquestTargets[roomName];

    // Check if we can see the room
    const room = Game.rooms[roomName];
    if (!room) continue;

    // Check victory conditions
    if (room.controller && room.controller.my) {
      debugLog('conquest', `VICTORY! Conquered ${roomName}`);
      delete Memory.conquestTargets[roomName];
      continue;
    }

    // Check if all spawns are destroyed
    const spawns = room.find(FIND_HOSTILE_SPAWNS);
    if (spawns.length === 0 && conquest.phase !== 'razing') {
      conquest.phase = 'razing';
      debugLog('conquest', `All spawns destroyed in ${roomName}, beginning razing phase`);

      // Send claimers if we want to keep it
      if (room.controller && !room.controller.my && room.controller.level >= 3) {
        const launchRoom = findBestLaunchRoom(roomName);
        if (launchRoom) {
          launchRoom.checkRoleToSpawn('claimer', 1, room.controller.id, roomName);
        }
      }
    }

    // Maintain pressure
    const attackers = _.filter(Object.values(Game.creeps), (creep) =>
      creep.memory.routing && creep.memory.routing.targetRoom === roomName &&
      (creep.memory.role === 'squadsiege' || creep.memory.role === 'defender' ||
       creep.memory.role === 'autoattackmelee' || creep.memory.role === 'dismantler')
    );

    // Reinforce if needed
    if (attackers.length < 3 && conquest.phase !== 'complete') {
      const launchRoom = findBestLaunchRoom(roomName);
      if (launchRoom && launchRoom.energyAvailable >= 1000) {
        launchRoom.checkRoleToSpawn('defender', 1, undefined, roomName);
      }
    }

    // Check timeout
    if (Game.time - conquest.startTime > 5000) {
      debugLog('conquest', `Conquest of ${roomName} timed out`);
      delete Memory.conquestTargets[roomName];
    }
  }
};

module.exports = {
  assessConquest: brain.assessConquest,
  executeConquest: brain.executeConquest,
  monitorConquest: brain.monitorConquest,
};