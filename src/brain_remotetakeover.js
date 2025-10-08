'use strict';

const {debugLog} = require('./logging');

/**
 * Brain module for taking over enemy remote mining operations
 * Part of the aggressive expansion strategy
 */

/**
 * isEnemyRemoteMining
 * Checks if a room is being remote mined by an enemy
 *
 * @param {Object} roomData - Room memory data
 * @return {boolean} - True if enemy is remote mining
 */
function isEnemyRemoteMining(roomData) {
  if (!roomData) {
    return false;
  }

  // Check for enemy reservation
  if (roomData.reservation && roomData.reservation.username !== Memory.username) {
    // Skip if it's a friend (for now)
    if (global.friends && global.friends.includes(roomData.reservation.username)) {
      return false;
    }
    return true;
  }

  // Check for enemy structures (containers/roads from remote mining)
  if (roomData.hostileStructures && roomData.hostileStructures.length > 0) {
    return true;
  }

  // Check if we've seen enemy harvesters recently
  if (roomData.lastHostileSeen && Game.time - roomData.lastHostileSeen < 1500) {
    return true;
  }

  return false;
}

/**
 * calculateRoomValue
 * Calculates the economic value of taking over a room
 *
 * @param {Object} roomData - Room memory data
 * @param {string} roomName - The room name
 * @return {number} - Value in energy units
 */
function calculateRoomValue(roomData, roomName) {
  let value = 0;

  // Energy sources (3000 energy per source per 300 ticks)
  const sources = roomData.sources || 2;
  value += sources * 3000;

  // Strategic positioning bonus
  if (blocksOurExpansion(roomName)) {
    value += 5000;  // High value if it blocks our expansion
  }

  if (isNearOurRooms(roomName)) {
    value += 3000;  // Valuable if close to our territory
  }

  // Denial value (preventing enemy from having it)
  value += 2000;

  // Mineral value if present
  if (roomData.mineral) {
    const mineralValues = config.nextRoom.mineralValues || {};
    value += (mineralValues[roomData.mineral] || 10) * 100;
  }

  return value;
}

/**
 * blocksOurExpansion
 * Checks if a room blocks our natural expansion path
 *
 * @param {string} roomName - The room name
 * @return {boolean} - True if it blocks expansion
 */
function blocksOurExpansion(roomName) {
  // Check if this room is between two of our rooms
  for (const myRoom1 of Memory.myRooms || []) {
    for (const myRoom2 of Memory.myRooms || []) {
      if (myRoom1 === myRoom2) continue;

      const distance1 = Game.map.getRoomLinearDistance(myRoom1, myRoom2);
      const distance2 = Game.map.getRoomLinearDistance(myRoom1, roomName) +
                        Game.map.getRoomLinearDistance(roomName, myRoom2);

      // If going through this room is the shortest path
      if (distance2 <= distance1 + 1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * isNearOurRooms
 * Checks if a room is adjacent or near our territory
 *
 * @param {string} roomName - The room name
 * @return {boolean} - True if near our rooms
 */
function isNearOurRooms(roomName) {
  for (const myRoom of Memory.myRooms || []) {
    if (Game.map.getRoomLinearDistance(myRoom, roomName) <= 2) {
      return true;
    }
  }
  return false;
}

/**
 * calculateTakeoverCost
 * Estimates the cost to take over a remote room
 *
 * @param {Object} roomData - Room memory data
 * @param {string} roomName - The room name
 * @return {number} - Cost in energy units
 */
function calculateTakeoverCost(roomData, roomName) {
  let cost = 0;

  // Military cost to clear defenders
  const defenders = roomData.hostileCreeps || 0;
  cost += defenders * 500;  // Rough cost per defender

  // Cost to break reservation
  if (roomData.reservation && roomData.reservation.ticksToEnd) {
    cost += Math.min(roomData.reservation.ticksToEnd * 2, 1000);
  }

  // Travel cost
  let minDistance = Infinity;
  for (const myRoom of Memory.myRooms || []) {
    const distance = Game.map.getRoomLinearDistance(myRoom, roomName);
    minDistance = Math.min(minDistance, distance);
  }
  cost += minDistance * 50;  // Energy cost per distance

  // Risk cost (potential losses)
  const riskLevel = assessRisk(roomData);
  cost += riskLevel * 100;

  return cost;
}

/**
 * assessRisk
 * Evaluates the risk level of attacking a room
 *
 * @param {Object} roomData - Room memory data
 * @return {number} - Risk level 1-10
 */
function assessRisk(roomData) {
  let risk = 3;  // Base risk

  // Higher risk if room has been defended before
  if (roomData.defendedLastTime) {
    risk += 3;
  }

  // Higher risk if owner has high RCL rooms
  if (roomData.reservation && roomData.reservation.username) {
    // TODO: Check owner's main room strength
    risk += 2;
  }

  // Lower risk if room has been undefended
  if (roomData.lastHostileSeen && Game.time - roomData.lastHostileSeen > 3000) {
    risk -= 2;
  }

  return Math.max(1, Math.min(10, risk));
}

/**
 * findTakeoverTargets
 * Finds all profitable remote mining takeover targets
 *
 * @return {Array} - Sorted array of targets by profit
 */
brain.findRemoteTakeoverTargets = function() {
  const targets = [];

  // Scan all rooms we know about
  for (const roomName in Memory.rooms) {
    const roomData = Memory.rooms[roomName];

    // Skip if not enemy remote mining
    if (!isEnemyRemoteMining(roomData)) {
      continue;
    }

    // Skip if we already control it
    if (Memory.myRooms && Memory.myRooms.includes(roomName)) {
      continue;
    }

    // Calculate profitability
    const value = calculateRoomValue(roomData, roomName);
    const cost = calculateTakeoverCost(roomData, roomName);
    const profit = value - cost;
    const roi = cost > 0 ? value / cost : 0;

    // Only include profitable targets
    if (roi >= ((config.aggression && config.aggression.profitThreshold) || 1.3)) {
      targets.push({
        room: roomName,
        owner: roomData.reservation ? roomData.reservation.username : 'unknown',
        value: value,
        cost: cost,
        profit: profit,
        roi: roi,
        risk: assessRisk(roomData),
        sources: roomData.sources || 2,
      });
    }
  }

  // Sort by profit (highest first)
  targets.sort((a, b) => b.profit - a.profit);

  debugLog('aggression', `Found ${targets.length} profitable remote takeover targets`);

  return targets;
};

/**
 * executeRemoteTakeover
 * Executes the takeover of a remote mining room
 *
 * @param {Object} target - Target information
 */
brain.executeRemoteTakeover = function(target) {
  debugLog('aggression', `Initiating takeover of ${target.room} from ${target.owner}`);

  // Find nearest owned room to launch from
  let launchRoom = null;
  let minDistance = Infinity;

  for (const myRoomName of Memory.myRooms || []) {
    const distance = Game.map.getRoomLinearDistance(myRoomName, target.room);
    if (distance < minDistance) {
      minDistance = distance;
      launchRoom = Game.rooms[myRoomName];
    }
  }

  if (!launchRoom) {
    debugLog('aggression', 'No launch room available for takeover');
    return;
  }

  // Phase 1: Send attackers to eliminate enemy miners
  eliminateMiners(launchRoom, target);

  // Phase 2: Break enemy reservation
  breakReservation(launchRoom, target);

  // Phase 3: Establish our control
  establishControl(launchRoom, target);

  // Mark as under attack
  if (!Memory.roomsUnderAttack) {
    Memory.roomsUnderAttack = {};
  }
  Memory.roomsUnderAttack[target.room] = {
    startTime: Game.time,
    target: target.owner,
    phase: 'elimination',
  };
};

/**
 * eliminateMiners
 * Spawns attackers to kill enemy miners
 *
 * @param {Room} launchRoom - Room to launch attack from
 * @param {Object} target - Target information
 */
function eliminateMiners(launchRoom, target) {
  // Check if we already have attackers heading there
  const attackers = _.filter(Object.values(Game.creeps), (creep) =>
    creep.memory.role === 'defender' &&
    creep.memory.routing && creep.memory.routing.targetRoom === target.room,
  );

  // Spawn 2 defenders if we don't have enough
  if (attackers.length < 2) {
    for (let i = attackers.length; i < 2; i++) {
      launchRoom.checkRoleToSpawn('defender', 1, undefined, target.room);
      debugLog('aggression', `Spawning defender for ${target.room} takeover`);
    }
  }
}

/**
 * breakReservation
 * Attacks the controller to break reservation
 *
 * @param {Room} launchRoom - Room to launch from
 * @param {Object} target - Target information
 */
function breakReservation(launchRoom, target) {
  // Send an attacker to attack the controller
  // This forces the reservation to break
  const roomData = Memory.rooms[target.room];
  if (roomData && roomData.reservation) {
    // Check if we have an attackunreserve creep
    const unreserver = _.find(Game.creeps, (creep) =>
      creep.memory.role === 'attackunreserve' &&
      creep.memory.routing && creep.memory.routing.targetRoom === target.room,
    );

    if (!unreserver) {
      launchRoom.checkRoleToSpawn('attackunreserve', 1, undefined, target.room);
      debugLog('aggression', `Spawning unreserver for ${target.room}`);
    }
  }
}

/**
 * establishControl
 * Sends our harvesters and reservers to control the room
 *
 * @param {Room} launchRoom - Room to launch from
 * @param {Object} target - Target information
 */
function establishControl(launchRoom, target) {
  // Wait a bit before sending our miners (let combat clear first)
  const attackData = Memory.roomsUnderAttack[target.room];
  if (attackData && Game.time - attackData.startTime < 100) {
    return;  // Wait for combat to progress
  }

  // Check if the room is clear
  const room = Game.rooms[target.room];
  if (room) {
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
      return;  // Still has hostiles, wait
    }
  }

  // Send a reserver
  const reservers = _.filter(Object.values(Game.creeps), (creep) =>
    creep.memory.role === 'reserver' &&
    creep.memory.routing && creep.memory.routing.targetRoom === target.room,
  );

  if (reservers.length === 0) {
    launchRoom.checkRoleToSpawn('reserver', 1, undefined, target.room);
    debugLog('aggression', `Spawning reserver for ${target.room} control`);
  }

  // Send harvesters for each source
  for (let i = 0; i < target.sources; i++) {
    const harvesters = _.filter(Object.values(Game.creeps), (creep) =>
      (creep.memory.role === 'sourcer' || creep.memory.role === 'earlyharvester') &&
      creep.memory.routing && creep.memory.routing.targetRoom === target.room,
    );

    if (harvesters.length < target.sources) {
      // Use early harvesters if still low RCL
      if (launchRoom.controller.level <= 4) {
        launchRoom.checkRoleToSpawn('earlyharvester', 1, undefined, target.room);
      } else {
        launchRoom.checkRoleToSpawn('sourcer', 1, undefined, target.room);
      }
    }
  }

  // Update attack phase
  if (attackData) {
    attackData.phase = 'control';
  }
}

/**
 * prepareDefense
 * Prepares defenses in case of retaliation
 *
 * @param {string} targetRoom - The room we're attacking
 */
brain.prepareDefenseForRetaliation = function(targetRoom) {
  // Find which of our rooms might be targeted for retaliation
  const roomData = Memory.rooms[targetRoom];
  if (!roomData || !roomData.reservation) {
    return;
  }

  const enemyName = roomData.reservation.username;

  // Spawn extra defenders in our rooms
  for (const myRoomName of Memory.myRooms || []) {
    const room = Game.rooms[myRoomName];
    if (!room) continue;

    // Check current defender count
    const defenders = room.find(FIND_MY_CREEPS, {
      filter: (creep) => creep.memory.role === 'defender' ||
                        creep.memory.role === 'defendranged',
    });

    // Spawn extra defenders if needed
    if (defenders.length < 3) {
      room.checkRoleToSpawn('defender', 1);
      debugLog('aggression', `Spawning retaliation defender in ${myRoomName}`);
    }
  }

  // Mark that we're prepared for retaliation
  if (!Memory.retaliationPrep) {
    Memory.retaliationPrep = {};
  }
  Memory.retaliationPrep[enemyName] = Game.time;
};

module.exports = {
  findRemoteTakeoverTargets: brain.findRemoteTakeoverTargets,
  executeRemoteTakeover: brain.executeRemoteTakeover,
  prepareDefenseForRetaliation: brain.prepareDefenseForRetaliation,
};