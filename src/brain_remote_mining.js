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

  // Run every 1000 ticks
  if (Game.time % 1000 !== 0) {
    return;
  }

  debugLog('remoteMining', 'Managing remote mining assignments');

  for (const baseRoom of Memory.myRooms) {
    const room = Game.rooms[baseRoom];
    if (!room) {
      continue;
    }

    // Only assign remote mining if economy is healthy
    if (config.economy.enabled && room.data.economy) {
      const status = room.data.economy.status;
      if (status !== 'HEALTHY' && status !== 'WEALTHY' && status !== 'ABUNDANT') {
        debugLog('remoteMining', `${baseRoom}: Economy not ready (${status})`);
        continue;
      }
    } else {
      // Fallback: check storage
      if (!room.storage || room.storage.store[RESOURCE_ENERGY] < 50000) {
        continue;
      }
    }

    // Find targets
    const targets = findRemoteMiningTargets(baseRoom, 3);

    if (!Memory.remoteMining[baseRoom]) {
      Memory.remoteMining[baseRoom] = [];
    }

    // Assign up to 2-3 remote rooms per base (based on RCL)
    const maxRemotes = room.controller.level >= 6 ? 3 : 2;
    Memory.remoteMining[baseRoom] = targets
      .slice(0, maxRemotes)
      .map((t) => t.roomName);

    debugLog('remoteMining', `${baseRoom}: Assigned ${Memory.remoteMining[baseRoom].length} remote rooms: ${Memory.remoteMining[baseRoom].join(', ')}`);
  }
};

module.exports = {
  findRemoteMiningTargets,
};
