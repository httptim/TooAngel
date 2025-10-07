'use strict';

const {debugLog} = require('./logging');

/**
 * Remote Mining Brain Module
 * Manages SK rooms and neutral rooms for resource extraction
 */

/**
 * Find potential remote mining targets
 * @param {string} baseRoom - Room to mine from
 * @param {number} maxDistance - Maximum distance
 * @return {array} - Array of room targets with scores
 */
function findRemoteMiningTargets(baseRoom, maxDistance = 3) {
  const targets = [];

  for (const roomName in global.data.rooms) {
    const data = global.data.rooms[roomName];

    // Skip claimed rooms
    if (data.state === 'Controlled' || data.state === 'Occupied') {
      continue;
    }

    // Skip rooms we own
    if (Memory.myRooms.includes(roomName)) {
      continue;
    }

    // Must have sources
    if (!data.sources || data.sources === 0) {
      continue;
    }

    // Check distance
    const distance = Game.map.getRoomLinearDistance(baseRoom, roomName);
    if (distance > maxDistance) {
      continue;
    }

    // Score based on sources and distance
    const score = (data.sources * 1000) - (distance * 100);

    targets.push({
      roomName: roomName,
      distance: distance,
      sources: data.sources,
      mineral: data.mineral,
      score: score,
      isSourceKeeper: data.sourceKeeperRoom || false,
    });
  }

  return targets.sort((a, b) => b.score - a.score);
}

/**
 * Assign remote mining rooms to bases
 *
 * @return {void}
 */
brain.manageRemoteMining = function() {
  if (!Memory.remoteMining) {
    Memory.remoteMining = {};
  }

  // Run every 500 ticks (more aggressive)
  if (Game.time % 500 !== 0) {
    return;
  }

  debugLog('remoteMining', 'Managing remote mining assignments');

  for (const baseRoom of Memory.myRooms) {
    const room = Game.rooms[baseRoom];
    if (!room) {
      continue;
    }

    // Start remote mining EARLY! Even at RCL 1
    const rcl = room.controller.level;

    // Early game logic (RCL 1-3): Very aggressive, essential for growth
    if (rcl < 4) {
      // Only need basic check - has at least 300 energy available
      if (room.energyAvailable < 300) {
        debugLog('remoteMining', `${baseRoom}: RCL ${rcl} but not enough energy (${room.energyAvailable})`);
        continue;
      }

      // Find targets
      const targets = findRemoteMiningTargets(baseRoom, 2); // Shorter distance for early game

      if (!Memory.remoteMining[baseRoom]) {
        Memory.remoteMining[baseRoom] = [];
      }

      // RCL 1-3: Only assign 1 remote room (focus on one extra source)
      Memory.remoteMining[baseRoom] = targets
        .slice(0, 1)
        .map((t) => t.roomName);

      debugLog('remoteMining', `${baseRoom}: RCL ${rcl} - Assigned ${Memory.remoteMining[baseRoom].length} remote rooms: ${Memory.remoteMining[baseRoom].join(', ')}`);
      continue;
    }

    // Mid-late game logic (RCL 4+): Use economy brain if available
    if (config.economy.enabled && room.data.economy) {
      const status = room.data.economy.status;
      // More lenient: Allow LOW status (30k+ energy)
      if (status === 'EMERGENCY' || status === 'CRITICAL') {
        debugLog('remoteMining', `${baseRoom}: Economy not ready (${status})`);
        continue;
      }
    } else {
      // Fallback: just need some energy
      if (room.storage && room.storage.store[RESOURCE_ENERGY] < 10000) {
        continue;
      }
    }

    // Find targets
    const targets = findRemoteMiningTargets(baseRoom, 3);

    if (!Memory.remoteMining[baseRoom]) {
      Memory.remoteMining[baseRoom] = [];
    }

    // Assign based on RCL: more rooms at higher levels
    let maxRemotes = 1;
    if (rcl >= 7) {
      maxRemotes = 4;
    } else if (rcl >= 5) {
      maxRemotes = 3;
    } else if (rcl >= 4) {
      maxRemotes = 2;
    }

    Memory.remoteMining[baseRoom] = targets
      .slice(0, maxRemotes)
      .map((t) => t.roomName);

    debugLog('remoteMining', `${baseRoom}: RCL ${rcl} - Assigned ${Memory.remoteMining[baseRoom].length} remote rooms: ${Memory.remoteMining[baseRoom].join(', ')}`);
  }
};

module.exports = {
  findRemoteMiningTargets,
};
