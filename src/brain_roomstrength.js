'use strict';

const {debugLog} = require('./logging');

/**
 * Brain module for evaluating room strength
 * Used to assess attack feasibility and profitability
 */

/**
 * countTowers
 * Counts active towers in a room
 *
 * @param {Room} room - The room to check
 * @return {number} - Number of towers
 */
function countTowers(room) {
  if (!room) {
    return 0;
  }

  const towers = room.find(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER &&
                   s.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
  });

  return towers.length;
}

/**
 * countDefenders
 * Counts combat-capable creeps in a room
 *
 * @param {Room} room - The room to check
 * @return {number} - Number of defenders
 */
function countDefenders(room) {
  if (!room) {
    return 0;
  }

  const defenders = room.find(FIND_HOSTILE_CREEPS, {
    filter: (creep) => {
      return creep.getActiveBodyparts(ATTACK) > 0 ||
             creep.getActiveBodyparts(RANGED_ATTACK) > 0 ||
             creep.getActiveBodyparts(HEAL) > 0;
    },
  });

  return defenders.length;
}

/**
 * countSpawns
 * Counts spawns in a room
 *
 * @param {Room} room - The room to check
 * @return {number} - Number of spawns
 */
function countSpawns(room) {
  if (!room) {
    return 0;
  }

  return room.find(FIND_HOSTILE_SPAWNS).length;
}

/**
 * averageWallStrength
 * Calculates average wall hit points
 *
 * @param {Room} room - The room to check
 * @return {number} - Average wall strength
 */
function averageWallStrength(room) {
  if (!room) {
    return 0;
  }

  const walls = room.find(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_WALL,
  });

  if (walls.length === 0) {
    return 0;
  }

  const totalHits = walls.reduce((sum, wall) => sum + wall.hits, 0);
  return totalHits / walls.length;
}

/**
 * averageRampartStrength
 * Calculates average rampart hit points
 *
 * @param {Room} room - The room to check
 * @return {number} - Average rampart strength
 */
function averageRampartStrength(room) {
  if (!room) {
    return 0;
  }

  const ramparts = room.find(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_RAMPART,
  });

  if (ramparts.length === 0) {
    return 0;
  }

  const totalHits = ramparts.reduce((sum, rampart) => sum + rampart.hits, 0);
  return totalHits / ramparts.length;
}

/**
 * hasBoostCapability
 * Checks if room has labs and can boost creeps
 *
 * @param {Room} room - The room to check
 * @return {boolean} - True if room can boost
 */
function hasBoostCapability(room) {
  if (!room) {
    return false;
  }

  const labs = room.find(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LAB,
  });

  // Need at least 3 labs for meaningful boosts
  return labs.length >= 3;
}

/**
 * mineralValue
 * Calculates the value of the room's mineral
 *
 * @param {Room} room - The room to check
 * @return {number} - Mineral value score
 */
function mineralValue(room) {
  if (!room) {
    return 0;
  }

  const mineral = room.find(FIND_MINERALS)[0];
  if (!mineral) {
    return 0;
  }

  // Use config mineral values if available
  const mineralValues = config.nextRoom.mineralValues || {};
  return mineralValues[mineral.mineralType] || 10;
}

/**
 * countRemoteRooms
 * Estimates number of remote rooms being harvested
 *
 * @param {Room} room - The room to check
 * @return {number} - Number of remote rooms
 */
function countRemoteRooms(room) {
  if (!room || !room.memory || !room.memory.external) {
    return 0;
  }

  return Object.keys(room.memory.external).length;
}

/**
 * hasWalls
 * Checks if room has defensive walls
 *
 * @param {Room} room - The room to check
 * @return {boolean} - True if room has walls
 */
function hasWalls(room) {
  if (!room) {
    return false;
  }

  const walls = room.find(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_WALL ||
                   s.structureType === STRUCTURE_RAMPART,
  });

  return walls.length > 0;
}

/**
 * distanceToAllies
 * Estimates distance to allied rooms (currently returns a default)
 *
 * @param {Room} room - The room to check
 * @return {number} - Distance to allies
 */
function distanceToAllies(room) {
  // TODO: Implement actual ally distance calculation
  // For now, return a default value
  return 10;
}

/**
 * estimateMobilizationTime
 * Estimates how quickly room can spawn defenders
 *
 * @param {Room} room - The room to check
 * @return {number} - Ticks to mobilize
 */
function estimateMobilizationTime(room) {
  if (!room) {
    return Infinity;
  }

  const spawns = countSpawns(room);
  if (spawns === 0) {
    return Infinity;
  }

  // Rough estimate: 30 ticks per defender body part * 10 parts / spawns
  return Math.floor(300 / spawns);
}

/**
 * checkAllyProximity
 * Checks if room has nearby allied support
 *
 * @param {Room} room - The room to check
 * @return {boolean} - True if allies nearby
 */
function checkAllyProximity(room) {
  // TODO: Implement actual ally checking
  return false;
}

/**
 * estimateFromMemory
 * Estimates room strength from memory when room not visible
 *
 * @param {string} roomName - The room name
 * @return {Object} - Estimated strength
 */
function estimateFromMemory(roomName) {
  const memory = Memory.rooms[roomName] || {};

  return {
    military: {
      towers: 0,
      defenders: 0,
      walls: 0,
      ramparts: 0,
      safeMode: 0,
      spawns: 0,
      boosts: 0,
    },
    economic: {
      rcl: memory.level || 0,
      storage: 0,
      sources: memory.sources || 2,
      mineral: 0,
      remoteRooms: 0,
    },
    vulnerabilities: {
      noTowers: -50,
      lowEnergy: -30,
      noWalls: -40,
      isolated: -20,
      overextended: 0,
    },
    retaliation: {
      canRetaliate: false,
      retaliationStrength: 0,
      timeToMobilize: Infinity,
      allySupport: false,
    },
    lastUpdate: memory.lastSeen || 0,
  };
}

/**
 * evaluateRoom
 * Comprehensive assessment of enemy room capabilities
 *
 * @param {string} roomName - The room to evaluate
 * @return {Object} - Room strength assessment
 */
brain.evaluateRoomStrength = function(roomName) {
  const room = Game.rooms[roomName];

  // If we can't see the room, estimate from memory
  if (!room) {
    return estimateFromMemory(roomName);
  }

  // Calculate military strength (0-100)
  const towerCount = countTowers(room);
  const defenderCount = countDefenders(room);
  const wallStrength = averageWallStrength(room);
  const rampartStrength = averageRampartStrength(room);
  const spawnCount = countSpawns(room);
  const hasBoosts = hasBoostCapability(room);

  const military = {
    towers: Math.min(45, towerCount * 15),              // Max 45 for 3 towers
    defenders: Math.min(30, defenderCount * 5),
    walls: Math.min(20, wallStrength / 100000),
    ramparts: Math.min(20, rampartStrength / 100000),
    safeMode: room.controller && room.controller.safeMode ? 100 : 0,
    spawns: Math.min(30, spawnCount * 10),
    boosts: hasBoosts ? 20 : 0,
  };

  const militaryScore = Object.values(military).reduce((sum, val) => sum + val, 0);

  // Calculate economic strength (0-100)
  const rcl = room.controller ? room.controller.level : 0;
  const storageEnergy = room.storage ? room.storage.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
  const sources = room.find(FIND_SOURCES).length;
  const mineral = mineralValue(room);
  const remoteRooms = countRemoteRooms(room);

  const economic = {
    rcl: rcl * 12.5,                                     // Max 100 at RCL 8
    storage: Math.min(100, storageEnergy / 10000),
    sources: sources * 25,                               // 50 for 2 sources
    mineral: mineral,
    remoteRooms: Math.min(30, remoteRooms * 10),
  };

  const economicScore = Object.values(economic).reduce((sum, val) => sum + val, 0);

  // Calculate vulnerabilities (negative scores)
  const vulnerabilities = {
    noTowers: towerCount === 0 ? -50 : 0,
    lowEnergy: storageEnergy < 10000 ? -30 : 0,
    noWalls: !hasWalls(room) ? -40 : 0,
    isolated: distanceToAllies(room) > 5 ? -20 : 0,
    overextended: remoteRooms > 3 ? -15 : 0,
  };

  const vulnerabilityScore = Object.values(vulnerabilities).reduce((sum, val) => sum + val, 0);

  // Calculate retaliation capability
  const canRetaliate = militaryScore > 40;
  const retaliationStrength = militaryScore + economicScore / 2;

  const retaliation = {
    canRetaliate: canRetaliate,
    retaliationStrength: retaliationStrength,
    timeToMobilize: estimateMobilizationTime(room),
    allySupport: checkAllyProximity(room),
  };

  const assessment = {
    military: military,
    militaryScore: militaryScore,
    economic: economic,
    economicScore: economicScore,
    vulnerabilities: vulnerabilities,
    vulnerabilityScore: vulnerabilityScore,
    retaliation: retaliation,
    totalScore: militaryScore + economicScore + vulnerabilityScore,
    lastUpdate: Game.time,
  };

  // Cache in memory
  if (!Memory.roomStrength) {
    Memory.roomStrength = {};
  }
  Memory.roomStrength[roomName] = assessment;

  debugLog('aggression', `Room ${roomName} strength: Military=${militaryScore}, ` +
           `Economic=${economicScore}, Vulnerabilities=${vulnerabilityScore}`);

  return assessment;
};

/**
 * isRoomWeak
 * Quick check if a room is weak enough to attack
 *
 * @param {string} roomName - The room to check
 * @return {boolean} - True if room is weak
 */
brain.isRoomWeak = function(roomName) {
  const strength = brain.evaluateRoomStrength(roomName);

  // Room is weak if:
  // - Low military score
  // - High vulnerabilities
  // - Can't retaliate effectively
  return strength.militaryScore < 30 &&
         strength.vulnerabilityScore < -30 &&
         !strength.retaliation.canRetaliate;
};

/**
 * compareRoomStrength
 * Compares our strength to target room
 *
 * @param {string} ourRoom - Our room name
 * @param {string} theirRoom - Their room name
 * @return {number} - Ratio of our strength to theirs
 */
brain.compareRoomStrength = function(ourRoom, theirRoom) {
  const ourStrength = brain.evaluateRoomStrength(ourRoom);
  const theirStrength = brain.evaluateRoomStrength(theirRoom);

  const ourTotal = ourStrength.militaryScore + ourStrength.economicScore;
  const theirTotal = theirStrength.militaryScore + theirStrength.economicScore;

  if (theirTotal === 0) {
    return Infinity;  // They have no strength
  }

  return ourTotal / theirTotal;
};

module.exports = {
  evaluateRoomStrength: brain.evaluateRoomStrength,
  isRoomWeak: brain.isRoomWeak,
  compareRoomStrength: brain.compareRoomStrength,
};