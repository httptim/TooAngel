'use strict';

const {debugLog} = require('./logging');

/**
 * Brain module for detecting and eliminating enemy scouts
 * Part of the aggressive expansion strategy
 */

/**
 * isScout
 * Determines if a creep is likely a scout
 *
 * @param {Creep} creep - The creep to check
 * @return {boolean} - True if the creep appears to be a scout
 */
function isScout(creep) {
  // Scout indicators:
  // - Small body (1-3 parts)
  // - Only MOVE parts or MOVE + minimal other parts
  // - No significant combat parts
  // - Not a stationary miner (no multiple WORK parts)

  const bodyCount = creep.body.length;
  if (bodyCount > 3) {
    return false;  // Too large to be a scout
  }

  const partCounts = {};
  for (const part of creep.body) {
    partCounts[part.type] = (partCounts[part.type] || 0) + 1;
  }

  // Check if it's primarily MOVE parts
  const moveCount = partCounts[MOVE] || 0;
  const workCount = partCounts[WORK] || 0;
  const attackCount = (partCounts[ATTACK] || 0) + (partCounts[RANGED_ATTACK] || 0);

  // Scout if: mostly MOVE parts, no significant work/attack capability
  return moveCount >= bodyCount / 2 && workCount <= 1 && attackCount === 0;
}

/**
 * isOurTerritory
 * Checks if a room belongs to us or is under our control
 *
 * @param {string} roomName - The room name to check
 * @return {boolean} - True if it's our territory
 */
function isOurTerritory(roomName) {
  // Our territory includes:
  // 1. Owned rooms
  if (Memory.myRooms && Memory.myRooms.includes(roomName)) {
    return true;
  }

  // 2. Reserved rooms
  const room = Game.rooms[roomName];
  if (room && room.controller && room.controller.reservation &&
      room.controller.reservation.username === Memory.username) {
    return true;
  }

  // 3. External/remote harvesting rooms
  for (const myRoom of Memory.myRooms || []) {
    const roomMemory = Memory.rooms[myRoom];
    if (roomMemory && roomMemory.external && roomMemory.external[roomName]) {
      return true;
    }
  }

  return false;
}

/**
 * detectScouts
 * Finds all enemy scouts in our territory
 *
 * @return {Array} - Array of scout objects with details
 */
function detectScouts() {
  const scouts = [];

  // Check all rooms we can see
  for (const roomName in Game.rooms) {
    if (!isOurTerritory(roomName)) {
      continue;
    }

    const room = Game.rooms[roomName];
    const hostiles = room.find(FIND_HOSTILE_CREEPS);

    for (const hostile of hostiles) {
      // Skip allies if we still respect them
      if (global.friends && global.friends.includes(hostile.owner.username)) {
        continue;  // For now, don't attack friends' scouts
      }

      if (isScout(hostile)) {
        scouts.push({
          id: hostile.id,
          room: roomName,
          owner: hostile.owner.username,
          pos: hostile.pos,
          ttl: hostile.ticksToLive,
          threat: assessThreat(hostile),
        });

        debugLog('aggression', `Scout detected: ${hostile.owner.username} in ${roomName}`);
      }
    }
  }

  return scouts;
}

/**
 * assessThreat
 * Evaluates the threat level of a scout
 *
 * @param {Creep} scout - The scout creep
 * @return {number} - Threat level 1-10
 */
function assessThreat(scout) {
  let threat = 5;  // Base threat

  // Higher threat if near our spawns/controller
  const room = Game.rooms[scout.room.name];
  if (room && room.controller && room.controller.my) {
    const spawns = room.find(FIND_MY_SPAWNS);
    for (const spawn of spawns) {
      if (scout.pos.getRangeTo(spawn) < 10) {
        threat += 3;
        break;
      }
    }

    if (scout.pos.getRangeTo(room.controller) < 10) {
      threat += 2;
    }
  }

  // Lower threat if scout is dying soon
  if (scout.ticksToLive < 100) {
    threat -= 2;
  }

  return Math.max(1, Math.min(10, threat));
}

/**
 * findNearestDefender
 * Finds the closest combat creep to intercept a scout
 *
 * @param {string} roomName - The room where the scout is
 * @param {RoomPosition} scoutPos - The scout's position
 * @return {Creep|null} - The nearest defender or null
 */
function findNearestDefender(roomName, scoutPos) {
  const room = Game.rooms[roomName];
  if (!room) {
    return null;
  }

  // Look for defenders, ranged defenders, or any combat-capable creeps
  const combatCreeps = room.find(FIND_MY_CREEPS, {
    filter: (creep) => {
      const role = creep.memory.role;
      return role === 'defender' || role === 'defendranged' ||
             role === 'defendmelee' || role === 'autoattackmelee' ||
             (creep.getActiveBodyparts(ATTACK) > 0 ||
              creep.getActiveBodyparts(RANGED_ATTACK) > 0);
    },
  });

  if (combatCreeps.length === 0) {
    return null;
  }

  // Find closest one
  let nearest = null;
  let minDistance = Infinity;

  for (const creep of combatCreeps) {
    const distance = creep.pos.getRangeTo(scoutPos);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = creep;
    }
  }

  return nearest;
}

/**
 * eliminateScout
 * Coordinates the elimination of a detected scout
 *
 * @param {Object} scout - Scout information object
 */
function eliminateScout(scout) {
  const room = Game.rooms[scout.room];
  if (!room) {
    return;
  }

  // First, try to use existing defenders
  const defender = findNearestDefender(scout.room, scout.pos);

  if (defender) {
    // Set the scout as the defender's target
    defender.memory.scoutTarget = scout.id;
    defender.memory.targetRoom = scout.room;
    debugLog('aggression', `Defender ${defender.name} assigned to eliminate scout ${scout.id}`);
  } else {
    // No defender available, queue emergency spawn if it's an owned room
    if (room.controller && room.controller.my && room.energyAvailable >= 260) {
      // Queue a basic defender spawn
      room.checkRoleToSpawn('defender', 1, scout.id, scout.room);
      debugLog('aggression', `Emergency defender queued in ${scout.room} for scout elimination`);
    }
  }

  // Mark the player as potentially hostile
  if (!Memory.hostilePlayers) {
    Memory.hostilePlayers = {};
  }

  if (!Memory.hostilePlayers[scout.owner]) {
    Memory.hostilePlayers[scout.owner] = {
      lastScoutSeen: Game.time,
      scoutsSeen: 1,
      lastRoom: scout.room,
    };
  } else {
    Memory.hostilePlayers[scout.owner].lastScoutSeen = Game.time;
    Memory.hostilePlayers[scout.owner].scoutsSeen++;
    Memory.hostilePlayers[scout.owner].lastRoom = scout.room;
  }
}

/**
 * handleScoutElimination
 * Main function for scout detection and elimination
 */
brain.handleScoutElimination = function() {
  if (!config.aggression || !config.aggression.enabled || !config.aggression.scoutElimination) {
    return;
  }

  // Only check periodically to save CPU
  if (Game.time % 10 !== 0) {
    return;
  }

  const scouts = detectScouts();

  if (scouts.length === 0) {
    return;
  }

  debugLog('aggression', `Detected ${scouts.length} enemy scouts in our territory`);

  // Sort by threat level
  scouts.sort((a, b) => b.threat - a.threat);

  // Eliminate high-threat scouts
  for (const scout of scouts) {
    if (scout.threat >= 5) {  // Only act on meaningful threats
      eliminateScout(scout);
    }
  }

  // Update memory for tracking
  Memory.lastScoutCheck = Game.time;
  Memory.activeScouts = scouts.length;
};

/**
 * getScoutTargetForDefender
 * Helper function for defenders to get their scout target
 *
 * @param {Creep} creep - The defender creep
 * @return {Creep|null} - The scout to attack or null
 */
brain.getScoutTarget = function(creep) {
  if (!creep.memory.scoutTarget) {
    return null;
  }

  const target = Game.getObjectById(creep.memory.scoutTarget);

  // Clear invalid targets
  if (!target || target.room.name !== creep.room.name) {
    delete creep.memory.scoutTarget;
    return null;
  }

  return target;
};

module.exports = {
  handleScoutElimination: brain.handleScoutElimination,
  getScoutTarget: brain.getScoutTarget,
  detectScouts,
  isScout,
  isOurTerritory,
};