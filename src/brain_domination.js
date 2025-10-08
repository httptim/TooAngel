'use strict';

/**
 * Brain Domination Module
 * Phase 4: Total territorial control and player elimination
 */

const {evaluateRoomStrength} = require('./brain_roomstrength');

/**
 * Regional control - eliminate all competition within range
 */
brain.establishRegionalControl = function() {
  if (!config.aggression || !config.aggression.regionalControl) {
    return;
  }

  const controlRadius = config.aggression.controlRadius || 5;
  const threats = identifyRegionalThreats(controlRadius);

  console.log(`Regional threats identified: ${threats.length} hostile rooms within ${controlRadius} range`);

  // Prioritize by distance and weakness
  threats.sort((a, b) => {
    const priorityA = a.distance - (a.strength.military / 20);
    const priorityB = b.distance - (b.strength.military / 20);
    return priorityA - priorityB;
  });

  // Systematically eliminate each threat
  for (const threat of threats) {
    if (Memory.eliminationCampaigns && Memory.eliminationCampaigns[threat.player]) {
      continue; // Already targeting this player
    }

    if (canEliminatePlayer(threat)) {
      launchEliminationCampaign(threat);
      break; // One campaign at a time initially
    }
  }
};

/**
 * Identify all hostile rooms within control radius
 */
function identifyRegionalThreats(radius) {
  const threats = [];

  for (const myRoom of Memory.myRooms || []) {
    // Scan all rooms within radius
    const nearbyRooms = getRoomsInRange(myRoom, radius);

    for (const roomName of nearbyRooms) {
      const roomData = global.data.rooms[roomName];
      if (!roomData) continue;

      if (roomData.controller && roomData.controller.owner &&
          roomData.controller.owner !== Memory.username) {

        const strength = evaluateRoomStrength(roomName);
        const distance = Game.map.getRoomLinearDistance(myRoom, roomName);

        threats.push({
          room: roomName,
          player: roomData.controller.owner,
          strength: strength,
          distance: distance,
          myBaseRoom: myRoom
        });
      }
    }
  }

  // Remove duplicates
  const uniqueThreats = [];
  const seen = new Set();
  for (const threat of threats) {
    if (!seen.has(threat.room)) {
      seen.add(threat.room);
      uniqueThreats.push(threat);
    }
  }

  return uniqueThreats;
}

/**
 * Get all room names within range
 */
function getRoomsInRange(centerRoom, range) {
  const rooms = [];
  const parsed = /^([WE])(\d+)([NS])(\d+)$/.exec(centerRoom);
  if (!parsed) return rooms;

  const [, ew, x, ns, y] = parsed;
  const centerX = parseInt(x);
  const centerY = parseInt(y);

  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const newX = centerX + dx;
      const newY = centerY + dy;

      if (newX < 0 || newY < 0) continue;

      const roomName = `${ew}${newX}${ns}${newY}`;
      rooms.push(roomName);
    }
  }

  return rooms;
}

/**
 * Check if we can eliminate a player
 */
function canEliminatePlayer(threat) {
  // Calculate our total military strength
  let ourMilitary = 0;
  for (const roomName of Memory.myRooms || []) {
    const room = Game.rooms[roomName];
    if (room && room.controller.level >= 4) {
      ourMilitary += room.controller.level * 15;
    }
  }

  // Need 2x their strength for confident elimination
  return ourMilitary > threat.strength.military * 2;
}

/**
 * Launch a campaign to eliminate a player
 */
function launchEliminationCampaign(threat) {
  console.log(`LAUNCHING ELIMINATION CAMPAIGN against ${threat.player} in ${threat.room}`);

  if (!Memory.eliminationCampaigns) {
    Memory.eliminationCampaigns = {};
  }

  Memory.eliminationCampaigns[threat.player] = {
    startTime: Game.time,
    targetRooms: [threat.room],
    primaryBase: threat.myBaseRoom,
    phase: 'SOFTENING', // SOFTENING -> ASSAULT -> OCCUPATION -> COMPLETE
    forces: {
      attackers: 0,
      healers: 0,
      dismantlers: 0,
      claimers: 0
    }
  };

  // Begin softening attacks
  beginSofteningAttacks(threat);
}

/**
 * Softening attacks to weaken defenses
 */
function beginSofteningAttacks(threat) {
  const room = Game.rooms[threat.myBaseRoom];
  if (!room) return;

  // Spawn harasser squads
  for (let i = 0; i < 2; i++) {
    room.checkRoleToSpawn('defender', 2, undefined, threat.room);
    room.checkRoleToSpawn('healer', 1, undefined, threat.room);
  }

  console.log(`Softening attacks launched against ${threat.room}`);
}

/**
 * Expansion acceleration using conquest profits
 */
brain.accelerateExpansion = function() {
  if (!config.aggression || !config.aggression.expansionAcceleration) {
    return;
  }

  // Check conquered rooms for profit extraction
  const conqueredRooms = getConqueredRooms();

  for (const roomName of conqueredRooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;

    // Extract all resources
    if (room.storage && room.storage.store.getUsedCapacity() > 0) {
      redistributeResources(room);
    }

    // Salvage structures for energy
    if (!room.controller.my) {
      salvageStructures(room);
    }

    // Use room for forward operating base
    if (room.controller.my && room.controller.level >= 3) {
      establishForwardBase(room);
    }
  }
};

/**
 * Get list of recently conquered rooms
 */
function getConqueredRooms() {
  const conquered = [];

  if (Memory.conquestHistory) {
    for (const roomName of Object.keys(Memory.conquestHistory)) {
      const conquest = Memory.conquestHistory[roomName];
      if (Game.time - conquest.conqueredAt < 10000) {
        conquered.push(roomName);
      }
    }
  }

  return conquered;
}

/**
 * Redistribute resources from conquered rooms
 */
function redistributeResources(room) {
  if (!room.terminal || !room.storage) return;

  // Find rooms that need resources
  for (const myRoom of Memory.myRooms || []) {
    const targetRoom = Game.rooms[myRoom];
    if (!targetRoom || !targetRoom.terminal) continue;

    if (targetRoom.controller.level < 8 &&
        targetRoom.storage &&
        targetRoom.storage.store.energy < 50000) {

      // Send energy to developing rooms
      const amount = Math.min(10000, room.storage.store.energy);
      room.terminal.send(RESOURCE_ENERGY, amount, myRoom, 'Conquest redistribution');

      console.log(`Redistributing ${amount} energy from ${room.name} to ${myRoom}`);
      break;
    }
  }
}

/**
 * Salvage structures in conquered rooms
 */
function salvageStructures(room) {
  // Destroy walls and ramparts for energy reclaim
  const structures = room.find(FIND_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_WALL ||
                   s.structureType === STRUCTURE_RAMPART
  });

  if (structures.length > 0 && !Memory.salvageOperations) {
    Memory.salvageOperations = {};
  }

  if (!Memory.salvageOperations[room.name]) {
    Memory.salvageOperations[room.name] = {
      structures: structures.map(s => s.id),
      assigned: false
    };

    // Spawn dismantlers to salvage
    const nearestRoom = findNearestOwnedRoom(room.name);
    if (nearestRoom) {
      const baseRoom = Game.rooms[nearestRoom];
      if (baseRoom) {
        baseRoom.checkRoleToSpawn('dismantler', 2, undefined, room.name);
      }
    }
  }
}

/**
 * Establish forward operating base
 */
function establishForwardBase(room) {
  if (!room.memory.forwardBase) {
    room.memory.forwardBase = {
      established: Game.time,
      purpose: 'EXPANSION_SUPPORT',
      targetRegion: getNextExpansionRegion(room.name)
    };

    console.log(`Forward base established in ${room.name} targeting ${room.memory.forwardBase.targetRegion}`);
  }

  // Spawn military from forward bases
  if (room.energyAvailable >= 1000) {
    const targets = identifyRegionalThreats(3);
    if (targets.length > 0) {
      room.checkRoleToSpawn('defender', 1, undefined, targets[0].room);
    }
  }
}

/**
 * Get next region for expansion
 */
function getNextExpansionRegion(fromRoom) {
  // Find the furthest direction with no presence
  const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];

  for (const dir of directions) {
    const exit = Game.map.describeExits(fromRoom)[dir];
    if (exit && !Memory.myRooms.includes(exit)) {
      return exit;
    }
  }

  return null;
}

/**
 * Find nearest owned room
 */
function findNearestOwnedRoom(targetRoom) {
  let nearest = null;
  let minDistance = Infinity;

  for (const roomName of Memory.myRooms || []) {
    const distance = Game.map.getRoomLinearDistance(roomName, targetRoom);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = roomName;
    }
  }

  return nearest;
}

/**
 * Total war capability - coordinate massive attacks
 */
brain.totalWar = function() {
  if (!config.aggression || !config.aggression.totalWar) {
    return;
  }

  // Check ongoing elimination campaigns
  if (!Memory.eliminationCampaigns) return;

  for (const player of Object.keys(Memory.eliminationCampaigns)) {
    const campaign = Memory.eliminationCampaigns[player];

    // Progress campaign phases
    switch (campaign.phase) {
      case 'SOFTENING':
        if (Game.time - campaign.startTime > 500) {
          campaign.phase = 'ASSAULT';
          launchMainAssault(player, campaign);
        }
        break;

      case 'ASSAULT':
        if (checkAssaultSuccess(player, campaign)) {
          campaign.phase = 'OCCUPATION';
          beginOccupation(player, campaign);
        }
        break;

      case 'OCCUPATION':
        if (checkOccupationComplete(player, campaign)) {
          campaign.phase = 'COMPLETE';
          console.log(`PLAYER ${player} ELIMINATED FROM REGION`);
          delete Memory.eliminationCampaigns[player];
        }
        break;
    }
  }
};

/**
 * Launch main assault phase
 */
function launchMainAssault(player, campaign) {
  console.log(`MAIN ASSAULT beginning against ${player}`);

  // Coordinate multi-room attack
  const attackRooms = [];
  for (const roomName of Memory.myRooms || []) {
    const room = Game.rooms[roomName];
    if (room && room.controller.level >= 5) {
      attackRooms.push(room);
    }
  }

  // Distribute forces across attacking rooms
  const forcesPerRoom = Math.floor(10 / attackRooms.length);

  for (const room of attackRooms) {
    // Spawn assault force
    for (let i = 0; i < forcesPerRoom; i++) {
      room.checkRoleToSpawn('squadsiege', 1, undefined, campaign.targetRooms[0]);
      room.checkRoleToSpawn('squadheal', 1, undefined, campaign.targetRooms[0]);
    }

    // Spawn dismantlers for walls
    room.checkRoleToSpawn('dismantler', 2, undefined, campaign.targetRooms[0]);
  }

  campaign.forces.attackers = forcesPerRoom * attackRooms.length;
  campaign.forces.healers = forcesPerRoom * attackRooms.length;
  campaign.forces.dismantlers = 2 * attackRooms.length;
}

/**
 * Check if assault succeeded
 */
function checkAssaultSuccess(player, campaign) {
  // Check if target room is weakened
  const targetRoom = Game.rooms[campaign.targetRooms[0]];
  if (!targetRoom) return false;

  // Success conditions
  const noSpawns = targetRoom.find(FIND_HOSTILE_SPAWNS).length === 0;
  const noTowers = targetRoom.find(FIND_HOSTILE_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER
  }).length === 0;

  return noSpawns || noTowers;
}

/**
 * Begin occupation phase
 */
function beginOccupation(player, campaign) {
  console.log(`Beginning OCCUPATION of ${player}'s territory`);

  const room = Game.rooms[campaign.primaryBase];
  if (!room) return;

  // Send claimer if room can be claimed
  const targetRoom = Game.rooms[campaign.targetRooms[0]];
  if (targetRoom && !targetRoom.controller.owner) {
    room.checkRoleToSpawn('claimer', 1, targetRoom.controller.id, targetRoom.name);
    campaign.forces.claimers = 1;
  }

  // Send occupying force
  room.checkRoleToSpawn('defender', 5, undefined, campaign.targetRooms[0]);
}

/**
 * Check if occupation is complete
 */
function checkOccupationComplete(player, campaign) {
  const targetRoom = Game.rooms[campaign.targetRooms[0]];
  if (!targetRoom) return false;

  // Room is ours or destroyed
  return targetRoom.controller.my ||
         (!targetRoom.controller.owner &&
          targetRoom.find(FIND_HOSTILE_CREEPS).length === 0);
}

/**
 * Main domination coordinator
 */
brain.handleDomination = function() {
  if (!config.aggression || !config.aggression.domination) {
    return;
  }

  // Only run periodically
  if (Game.time % 500 !== 0) {
    return;
  }

  console.log('=== DOMINATION PHASE ACTIVE ===');

  // Regional control - eliminate all nearby threats
  brain.establishRegionalControl();

  // Expansion acceleration - use conquest profits
  brain.accelerateExpansion();

  // Total war - coordinate elimination campaigns
  brain.totalWar();

  // Report domination status
  reportDominationStatus();
};

/**
 * Report domination progress
 */
function reportDominationStatus() {
  const threats = identifyRegionalThreats(5);
  const campaigns = Object.keys(Memory.eliminationCampaigns || {}).length;
  const conquered = (Memory.conquestHistory ? Object.keys(Memory.conquestHistory).length : 0);

  console.log(`DOMINATION STATUS:`);
  console.log(`- Regional Threats: ${threats.length}`);
  console.log(`- Active Campaigns: ${campaigns}`);
  console.log(`- Rooms Conquered: ${conquered}`);
  console.log(`- Territory Control: ${Memory.myRooms.length} rooms`);

  if (threats.length === 0) {
    console.log('*** REGIONAL DOMINATION ACHIEVED ***');
    Game.notify('Regional domination achieved! No hostile rooms within 5 range.');
  }
}

module.exports = {
  handleDomination: brain.handleDomination,
  establishRegionalControl: brain.establishRegionalControl,
  accelerateExpansion: brain.accelerateExpansion,
  totalWar: brain.totalWar
};