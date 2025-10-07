'use strict';

const {debugLog} = require('./logging');

/**
 * Hostile Response Brain Module
 * Intelligently responds to threats discovered by scouts or reported by creeps
 */

/**
 * Threat levels for different hostile scenarios
 */
const THREAT_LEVELS = {
  NONE: 0,
  MINIMAL: 1,      // 1-2 weak creeps, no towers
  LOW: 2,          // 3-5 creeps or 1 tower
  MODERATE: 3,     // Multiple towers or strong creeps
  HIGH: 4,         // Fortified room with multiple towers
  EXTREME: 5,      // Source Keeper or heavily fortified
};

/**
 * Assess threat level of a hostile room
 * @param {string} roomName - Room to assess
 * @return {object} - Threat assessment
 */
function assessThreat(roomName) {
  const room = Game.rooms[roomName];
  if (!room) {
    return {level: THREAT_LEVELS.NONE, details: 'No visibility'};
  }

  const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
  const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER ||
                   s.structureType === STRUCTURE_SPAWN
  });

  // Check for Source Keepers
  const keeperLairs = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR
  });

  if (keeperLairs.length > 0) {
    return {
      level: THREAT_LEVELS.EXTREME,
      type: 'SOURCE_KEEPER',
      details: `SK room with ${keeperLairs.length} lairs`,
      creeps: 0,
      towers: 0,
      spawns: 0,
    };
  }

  const towers = hostileStructures.filter((s) => s.structureType === STRUCTURE_TOWER);
  const spawns = hostileStructures.filter((s) => s.structureType === STRUCTURE_SPAWN);

  // Calculate threat level
  let level = THREAT_LEVELS.NONE;

  if (hostileCreeps.length === 0 && towers.length === 0) {
    level = THREAT_LEVELS.NONE;
  } else if (hostileCreeps.length <= 2 && towers.length === 0) {
    level = THREAT_LEVELS.MINIMAL;
  } else if (hostileCreeps.length <= 5 || towers.length === 1) {
    level = THREAT_LEVELS.LOW;
  } else if (towers.length >= 2 && towers.length <= 3) {
    level = THREAT_LEVELS.MODERATE;
  } else if (towers.length > 3) {
    level = THREAT_LEVELS.HIGH;
  }

  // Check for player ownership
  let owner = null;
  if (room.controller && room.controller.owner) {
    owner = room.controller.owner.username;
    // Increase threat if owned by player
    if (level < THREAT_LEVELS.MODERATE) {
      level = THREAT_LEVELS.MODERATE;
    }
  }

  return {
    level: level,
    type: owner ? 'PLAYER' : 'NPC',
    owner: owner,
    details: `${hostileCreeps.length} creeps, ${towers.length} towers, ${spawns.length} spawns`,
    creeps: hostileCreeps.length,
    towers: towers.length,
    spawns: spawns.length,
    hostileCreeps: hostileCreeps,
  };
}

/**
 * Determine response strategy based on threat and our capabilities
 * @param {object} threat - Threat assessment
 * @param {string} baseRoom - Our base room responding
 * @return {string} - Response strategy
 */
function determineResponse(threat, baseRoom) {
  const room = Game.rooms[baseRoom];
  if (!room) {
    return 'IGNORE';
  }

  const rcl = room.controller.level;
  const energy = room.energyAvailable;

  // Early game (RCL 1-2): Always avoid confrontation
  if (rcl <= 2) {
    debugLog('hostile', `${baseRoom}: RCL ${rcl} - Avoiding all conflicts`);
    return 'AVOID';
  }

  // RCL 3-4: Only engage minimal threats
  if (rcl <= 4) {
    if (threat.level <= THREAT_LEVELS.MINIMAL) {
      return energy > 800 ? 'DEFEND' : 'AVOID';
    }
    return 'AVOID';
  }

  // RCL 5-6: Can handle low-moderate threats
  if (rcl <= 6) {
    if (threat.level <= THREAT_LEVELS.LOW) {
      return 'DEFEND';
    }
    if (threat.level === THREAT_LEVELS.MODERATE) {
      return 'BLOCKADE';  // Block entrances, don't engage
    }
    return 'AVOID';
  }

  // RCL 7-8: Can handle most threats
  if (threat.level <= THREAT_LEVELS.MODERATE) {
    return 'ATTACK';
  }
  if (threat.level === THREAT_LEVELS.HIGH) {
    return 'SIEGE';  // Long-term siege tactics
  }

  // Source Keepers or extreme threats
  if (threat.type === 'SOURCE_KEEPER') {
    return config.keepers.enabled ? 'KEEPER_TEAM' : 'AVOID';
  }

  return 'AVOID';
}

/**
 * Execute response strategy
 * @param {string} hostileRoom - Room with hostiles
 * @param {string} baseRoom - Our responding base
 * @param {string} strategy - Strategy to execute
 * @param {object} threat - Threat assessment
 * @return {boolean} - Success
 */
function executeResponse(hostileRoom, baseRoom, strategy, threat) {
  const room = Game.rooms[baseRoom];
  if (!room) {
    return false;
  }

  debugLog('hostile', `${baseRoom} -> ${hostileRoom}: Executing ${strategy} strategy (threat: ${threat.level})`);

  switch (strategy) {
    case 'AVOID':
      // Remove from remote mining targets
      if (Memory.remoteMining && Memory.remoteMining[baseRoom]) {
        Memory.remoteMining[baseRoom] = Memory.remoteMining[baseRoom].filter((r) => r !== hostileRoom);
        debugLog('hostile', `${baseRoom}: Removed ${hostileRoom} from remote mining targets`);
      }
      // Mark room to avoid
      if (!Memory.avoidRooms) Memory.avoidRooms = {};
      Memory.avoidRooms[hostileRoom] = Game.time + 5000; // Avoid for 5000 ticks
      break;

    case 'DEFEND':
      // Spawn small defender squad (1-2 defenders)
      room.checkRoleToSpawn('defender', Math.min(2, threat.creeps), undefined, hostileRoom);
      debugLog('hostile', `${baseRoom}: Spawning defenders for ${hostileRoom}`);
      break;

    case 'BLOCKADE':
      // Find entrances and spawn blockers
      const exits = Game.map.describeExits(hostileRoom);
      for (const dir in exits) {
        if (exits[dir] === baseRoom || Game.map.getRoomLinearDistance(baseRoom, exits[dir]) <= 2) {
          // This is an entrance we should block
          room.checkRoleToSpawn('defender', 1, undefined, exits[dir]);
          debugLog('hostile', `${baseRoom}: Blockading ${exits[dir]} to prevent access from ${hostileRoom}`);
        }
      }
      break;

    case 'ATTACK':
      // Spawn attack squad
      room.checkRoleToSpawn('attackranged', 2, undefined, hostileRoom);
      room.checkRoleToSpawn('heal', 1, undefined, hostileRoom);
      debugLog('hostile', `${baseRoom}: Launching attack on ${hostileRoom}`);
      break;

    case 'SIEGE':
      // Long-term siege with drain attackers
      room.checkRoleToSpawn('drainer', 2, undefined, hostileRoom);
      room.checkRoleToSpawn('heal', 2, undefined, hostileRoom);
      debugLog('hostile', `${baseRoom}: Beginning siege of ${hostileRoom}`);
      break;

    case 'KEEPER_TEAM':
      // Specialized Source Keeper squad
      room.checkRoleToSpawn('atkeeper', 2, undefined, hostileRoom);
      room.checkRoleToSpawn('atkeepermelee', 1, undefined, hostileRoom);
      debugLog('hostile', `${baseRoom}: Deploying keeper team to ${hostileRoom}`);
      break;

    default:
      return false;
  }

  return true;
}

/**
 * Main hostile response brain function
 * Processes hostile room reports and coordinates responses
 * @return {void}
 */
brain.handleHostileRooms = function() {
  // Only run every 50 ticks
  if (Game.time % 50 !== 0) {
    return;
  }

  if (!Memory.hostileRooms) {
    Memory.hostileRooms = {};
  }

  if (!Memory.threatAssessments) {
    Memory.threatAssessments = {};
  }

  // Clean up old hostile room entries (older than 5000 ticks)
  for (const roomName in Memory.hostileRooms) {
    if (Game.time - Memory.hostileRooms[roomName] > 5000) {
      delete Memory.hostileRooms[roomName];
      delete Memory.threatAssessments[roomName];
    }
  }

  // Process each hostile room
  for (const hostileRoom in Memory.hostileRooms) {
    // Skip if recently processed
    if (Memory.threatAssessments[hostileRoom] &&
        Game.time - Memory.threatAssessments[hostileRoom].assessed < 500) {
      continue;
    }

    // Assess current threat
    const threat = assessThreat(hostileRoom);
    Memory.threatAssessments[hostileRoom] = {
      ...threat,
      assessed: Game.time,
    };

    // Find closest base that can respond
    let closestBase = null;
    let closestDistance = 999;

    for (const baseRoom of Memory.myRooms) {
      const distance = Game.map.getRoomLinearDistance(baseRoom, hostileRoom);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestBase = baseRoom;
      }
    }

    if (!closestBase) {
      continue;
    }

    // Determine and execute response
    const response = determineResponse(threat, closestBase);
    executeResponse(hostileRoom, closestBase, response, threat);
  }
};

/**
 * Report hostile room from scout or other creep
 * @param {string} roomName - Room with hostiles
 * @param {string} reporterRole - Role of reporting creep
 * @return {void}
 */
brain.reportHostileRoom = function(roomName, reporterRole = 'scout') {
  if (!Memory.hostileRooms) {
    Memory.hostileRooms = {};
  }

  // Update last seen time
  Memory.hostileRooms[roomName] = Game.time;

  // If scout, do immediate assessment
  if (reporterRole === 'scout') {
    const threat = assessThreat(roomName);
    if (!Memory.threatAssessments) {
      Memory.threatAssessments = {};
    }
    Memory.threatAssessments[roomName] = {
      ...threat,
      assessed: Game.time,
    };

    debugLog('hostile', `Scout report from ${roomName}: Threat level ${threat.level} - ${threat.details}`);
  }
};

module.exports = {
  assessThreat,
  determineResponse,
  THREAT_LEVELS,
};