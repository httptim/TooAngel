'use strict';

const {debugLog} = require('./logging');

/**
 * Brain module for aggressive early expansion strategy
 * Implements Tigga-style early remote harvesting
 */

/**
 * isRoomSuitableForEarlyExpansion
 * Checks if a room is suitable for early remote harvesting
 * Much less restrictive than normal expansion
 *
 * @param {string} roomName - The room to check
 * @return {boolean} - If the room is suitable
 */
function isRoomSuitableForEarlyExpansion(roomName) {
  const data = global.data.rooms[roomName];
  if (!data) {
    return false;
  }

  // Don't expand to our own rooms
  if (Memory.myRooms.indexOf(roomName) >= 0) {
    return false;
  }

  // Must have a controller (so we can reserve it)
  if (!data.controllerId) {
    return false;
  }

  // At least 1 source is enough for early expansion
  if (data.sources < 1) {
    return false;
  }

  // Skip occupied rooms
  if (data.state === 'Occupied' || data.state === 'Controlled') {
    return false;
  }

  // We CAN take hostile reserved rooms in early game
  // This is more aggressive than the default behavior

  return true;
}

/**
 * findAdjacentRooms
 * Finds rooms adjacent to a given room
 *
 * @param {string} roomName - The room to find neighbors for
 * @return {Array<string>} - List of adjacent room names
 */
function findAdjacentRooms(roomName) {
  const exits = Game.map.describeExits(roomName);
  return Object.values(exits || {});
}

/**
 * getEarlyExpansionTargets
 * Prioritizes nearby rooms for early expansion
 *
 * @param {string} baseRoomName - The base room to expand from
 * @return {Array<string>} - Sorted list of target rooms
 */
function getEarlyExpansionTargets(baseRoomName) {
  const targets = [];
  const visited = new Set();
  const queue = [{room: baseRoomName, distance: 0}];

  while (queue.length > 0 && targets.length < 5) {
    const {room, distance} = queue.shift();

    if (visited.has(room)) {
      continue;
    }
    visited.add(room);

    // Skip our own room and rooms too far away
    if (room !== baseRoomName && distance <= 2) {
      if (isRoomSuitableForEarlyExpansion(room)) {
        targets.push({
          roomName: room,
          distance: distance,
          sources: (global.data.rooms[room] || {}).sources || 1,
        });
      }
    }

    // Add adjacent rooms to queue
    if (distance < 2) {
      const adjacent = findAdjacentRooms(room);
      for (const adjRoom of adjacent) {
        if (!visited.has(adjRoom)) {
          queue.push({room: adjRoom, distance: distance + 1});
        }
      }
    }
  }

  // Sort by distance first, then by number of sources
  targets.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return b.sources - a.sources;
  });

  return targets.map(t => t.roomName);
}

/**
 * spawnEarlyHarvester
 * Spawns a simple harvester for early remote mining
 *
 * @param {Room} room - The room to spawn from
 * @param {string} targetRoom - The room to harvest in
 * @param {string} sourceId - The source to harvest
 */
function spawnEarlyHarvester(room, targetRoom, sourceId) {
  // Use the standard checkRoleToSpawn method for proper integration
  room.checkRoleToSpawn('earlyharvester', 1, sourceId, targetRoom);
  debugLog('earlyexpansion', `Queuing early harvester from ${room.name} to ${targetRoom}`);
}

/**
 * shouldStartEarlyExpansion
 * Determines if a room should start early expansion
 *
 * @param {Room} room - The room to check
 * @return {boolean} - Whether to start expansion
 */
function shouldStartEarlyExpansion(room) {
  // Don't expand if we're in trouble
  if (room.isStruggling()) {
    return false;
  }

  // Start expansion based on config
  if (room.controller.level < config.earlyExpansion.startAtRCL &&
      room.find(FIND_MY_STRUCTURES, {
        filter: {structureType: STRUCTURE_EXTENSION}
      }).length === 0) {
    return false;
  }

  // Check if we already have early harvesters
  const earlyHarvesters = room.find(FIND_MY_CREEPS, {
    filter: (creep) => creep.memory.role === 'earlyharvester'
  });

  // Limit based on config
  const maxEarlyHarvesters = Math.min(
    room.controller.level * 2,
    config.earlyExpansion.maxEarlyHarvestersPerRoom
  );

  return earlyHarvesters.length < maxEarlyHarvesters;
}

/**
 * handleEarlyExpansion
 * Main function for early expansion logic
 */
brain.handleEarlyExpansion = function() {
  if (!Memory.myRooms || Memory.myRooms.length === 0) {
    return;
  }

  // Check based on config interval
  if (Game.time % config.earlyExpansion.checkInterval !== 0) {
    return;
  }

  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    if (!room) {
      continue;
    }

    // Only handle early expansion for low RCL rooms
    if (room.controller.level > 4) {
      continue;
    }

    if (!shouldStartEarlyExpansion(room)) {
      continue;
    }

    // Find nearby rooms to expand to
    const targets = getEarlyExpansionTargets(roomName);

    if (targets.length === 0) {
      debugLog('earlyexpansion', `No early expansion targets found for ${roomName}`);
      continue;
    }

    // Try to expand to the first suitable room
    for (const targetRoom of targets) {
      // Check if we can see the room
      if (!Game.rooms[targetRoom]) {
        // Send a scout if we can't see it
        room.checkRoleToSpawn('scout', 1, undefined, targetRoom);
        continue;
      }

      const target = Game.rooms[targetRoom];

      // Check if we already have harvesters there (early or normal)
      const existingHarvesters = _.filter(Game.creeps, (creep) =>
        (creep.memory.role === 'earlyharvester' || creep.memory.role === 'sourcer') &&
        creep.memory.routing.targetRoom === targetRoom
      );

      // Find sources in the target room first
      const sources = target.find(FIND_SOURCES);
      if (sources.length === 0) {
        continue;
      }

      // Skip if we already have enough harvesters for this room
      // (1 per source is usually enough for early game)
      if (existingHarvesters.length >= sources.length) {
        continue;
      }

      // Also check if the room is already reserved by normal expansion
      if (target.data && target.data.reservation) {
        continue;
      }

      // Figure out which sources need harvesters
      const sourcesNeedingHarvesters = sources.filter(source => {
        return !existingHarvesters.some(creep =>
          creep.memory.routing.targetId === source.id
        );
      });

      // Spawn harvesters for uncovered sources
      for (const source of sourcesNeedingHarvesters) {
        spawnEarlyHarvester(room, targetRoom, source.id);
      }

      debugLog('earlyexpansion', `Starting early expansion from ${roomName} to ${targetRoom} with ${sources.length} sources`);

      // Don't break - continue checking other rooms for expansion
    }
  }
};

module.exports = {
  handleEarlyExpansion: brain.handleEarlyExpansion,
};