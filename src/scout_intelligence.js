'use strict';

/**
 * Scout Intelligence Module
 * Collects comprehensive room data for strategic decisions
 */

/**
 * gatherRoomIntelligence
 * Collects all strategic information about a room
 *
 * @param {Room} room - The room to analyze
 * @return {Object} - Intelligence data
 */
function gatherRoomIntelligence(room) {
  const intel = {
    timestamp: Game.time,
    name: room.name,
    // Basic room type
    type: getRoomType(room),
    // Controller info
    controller: null,
    // Resource info
    sources: [],
    mineral: null,
    // Military info
    hostiles: [],
    towers: [],
    spawns: [],
    // Economic info
    storage: null,
    terminal: null,
    // Remote harvesting info
    remoteHarvesters: [],
    // Strategic assessment
    assessment: {}
  };

  // Controller analysis
  if (room.controller) {
    intel.controller = {
      id: room.controller.id,
      level: room.controller.level,
      owner: room.controller.owner ? room.controller.owner.username : null,
      reservation: room.controller.reservation ? {
        username: room.controller.reservation.username,
        ticksToEnd: room.controller.reservation.ticksToEnd
      } : null,
      safeMode: room.controller.safeMode,
      safeModeAvailable: room.controller.safeModeAvailable,
      safeModeCooldown: room.controller.safeModeCooldown,
      upgradeBlocked: room.controller.upgradeBlocked,
      pos: room.controller.pos
    };
  }

  // Source analysis
  const sources = room.find(FIND_SOURCES);
  for (const source of sources) {
    intel.sources.push({
      id: source.id,
      pos: source.pos,
      energy: source.energy,
      energyCapacity: source.energyCapacity,
      // Check for nearby harvester
      harvester: checkForHarvester(source)
    });
  }

  // Mineral analysis
  const minerals = room.find(FIND_MINERALS);
  if (minerals.length > 0) {
    const mineral = minerals[0];
    intel.mineral = {
      id: mineral.id,
      type: mineral.mineralType,
      amount: mineral.mineralAmount,
      pos: mineral.pos,
      extractor: !!room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_EXTRACTOR
      }).length
    };
  }

  // Hostile analysis
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  for (const hostile of hostiles) {
    const combatParts = {
      attack: hostile.getActiveBodyparts(ATTACK),
      rangedAttack: hostile.getActiveBodyparts(RANGED_ATTACK),
      heal: hostile.getActiveBodyparts(HEAL),
      tough: hostile.getActiveBodyparts(TOUGH)
    };

    intel.hostiles.push({
      id: hostile.id,
      owner: hostile.owner.username,
      pos: hostile.pos,
      hits: hostile.hits,
      hitsMax: hostile.hitsMax,
      combatParts: combatParts,
      totalCombatPower: combatParts.attack * 30 + combatParts.rangedAttack * 10 + combatParts.heal * 12,
      role: guessCreepRole(hostile),
      ticksToLive: hostile.ticksToLive
    });
  }

  // Structure analysis
  const structures = room.find(FIND_STRUCTURES);
  for (const structure of structures) {
    if (structure.structureType === STRUCTURE_TOWER) {
      intel.towers.push({
        id: structure.id,
        pos: structure.pos,
        energy: structure.store[RESOURCE_ENERGY],
        my: structure.my,
        owner: structure.owner ? structure.owner.username : null
      });
    } else if (structure.structureType === STRUCTURE_SPAWN) {
      intel.spawns.push({
        id: structure.id,
        name: structure.name,
        pos: structure.pos,
        my: structure.my,
        owner: structure.owner ? structure.owner.username : null,
        spawning: structure.spawning ? true : false
      });
    } else if (structure.structureType === STRUCTURE_STORAGE) {
      intel.storage = {
        id: structure.id,
        pos: structure.pos,
        store: structure.store,
        my: structure.my,
        owner: structure.owner ? structure.owner.username : null
      };
    } else if (structure.structureType === STRUCTURE_TERMINAL) {
      intel.terminal = {
        id: structure.id,
        pos: structure.pos,
        store: structure.store,
        my: structure.my,
        owner: structure.owner ? structure.owner.username : null
      };
    }
  }

  // Remote harvester detection
  for (const hostile of hostiles) {
    if (guessCreepRole(hostile) === 'harvester') {
      const nearSource = hostile.pos.findInRange(FIND_SOURCES, 1);
      if (nearSource.length > 0) {
        intel.remoteHarvesters.push({
          creep: hostile.id,
          owner: hostile.owner.username,
          source: nearSource[0].id,
          workParts: hostile.getActiveBodyparts(WORK)
        });
      }
    }
  }

  // Strategic assessment
  intel.assessment = assessRoom(intel);

  return intel;
}

/**
 * getRoomType
 * Determines the type of room
 */
function getRoomType(room) {
  if (!room.controller) {
    // Check for source keeper
    const keepers = room.find(FIND_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR
    });
    if (keepers.length > 0) {
      return 'sourceKeeper';
    }
    // Check if highway
    const parsed = room.name.match(/^([WE])(\d+)([NS])(\d+)$/);
    if (parsed) {
      const x = parseInt(parsed[2]);
      const y = parseInt(parsed[4]);
      if (x % 10 === 0 || y % 10 === 0) {
        return 'highway';
      }
    }
    return 'empty';
  }

  if (room.controller.owner) {
    if (room.controller.my) {
      return 'owned';
    }
    return 'hostile';
  }

  if (room.controller.reservation) {
    if (room.controller.reservation.username === Memory.username) {
      return 'reserved';
    }
    return 'hostileReserved';
  }

  return 'neutral';
}

/**
 * checkForHarvester
 * Checks if a source has a harvester nearby
 */
function checkForHarvester(source) {
  const creeps = source.pos.findInRange(FIND_CREEPS, 1);
  for (const creep of creeps) {
    if (creep.getActiveBodyparts(WORK) > 0) {
      return {
        id: creep.id,
        owner: creep.owner ? creep.owner.username : Memory.username,
        my: creep.my
      };
    }
  }
  return null;
}

/**
 * guessCreepRole
 * Attempts to determine creep role from body parts
 */
function guessCreepRole(creep) {
  const parts = {
    work: creep.getActiveBodyparts(WORK),
    carry: creep.getActiveBodyparts(CARRY),
    move: creep.getActiveBodyparts(MOVE),
    attack: creep.getActiveBodyparts(ATTACK),
    rangedAttack: creep.getActiveBodyparts(RANGED_ATTACK),
    heal: creep.getActiveBodyparts(HEAL),
    claim: creep.getActiveBodyparts(CLAIM),
    tough: creep.getActiveBodyparts(TOUGH)
  };

  // Military roles
  if (parts.attack > 0 || parts.rangedAttack > 0) {
    if (parts.heal > 0) {
      return 'hybrid';
    }
    return parts.attack > parts.rangedAttack ? 'melee' : 'ranged';
  }
  if (parts.heal > 0) {
    return 'healer';
  }

  // Economic roles
  if (parts.work > 3 && parts.carry === 0) {
    return 'harvester';
  }
  if (parts.work > 0 && parts.carry > 0) {
    if (parts.work > parts.carry) {
      return 'builder';
    }
    return 'hauler';
  }
  if (parts.carry > 0 && parts.work === 0) {
    return 'courier';
  }
  if (parts.claim > 0) {
    return 'claimer';
  }

  // Scout
  if (parts.move > 0 && Object.keys(parts).filter(p => parts[p] > 0).length === 1) {
    return 'scout';
  }

  return 'unknown';
}

/**
 * assessRoom
 * Makes strategic assessment of room
 */
function assessRoom(intel) {
  const assessment = {
    // Can we harvest here?
    remoteHarvestPotential: 0,
    remoteHarvestBlocked: false,
    // Should we attack?
    attackRecommended: false,
    attackPriority: 0,
    attackStrategy: null,
    // Defense needed?
    threatLevel: 0,
    // Expansion potential
    expansionPotential: 0
  };

  // Remote harvest potential
  if (intel.type === 'neutral' || intel.type === 'hostileReserved') {
    assessment.remoteHarvestPotential = intel.sources.length * 3000; // Basic energy per source

    // Check if blocked by hostiles
    if (intel.hostiles.length > 0) {
      const combatPower = intel.hostiles.reduce((sum, h) => sum + h.totalCombatPower, 0);
      if (combatPower > 50) {
        assessment.remoteHarvestBlocked = true;
      }
    }

    // Check for enemy remote harvesters
    if (intel.remoteHarvesters.length > 0) {
      assessment.remoteHarvestBlocked = true;
      assessment.attackRecommended = true;
      assessment.attackPriority = 3; // High priority - easy target
      assessment.attackStrategy = 'ELIMINATE_HARVESTERS';
    }
  }

  // Attack assessment for hostile rooms
  if (intel.type === 'hostile') {
    // Calculate defense strength
    const towerPower = intel.towers.filter(t => !t.my).length * 600;
    const spawnCount = intel.spawns.filter(s => !s.my).length;
    const hasStorage = intel.storage && !intel.storage.my;

    // Assess based on RCL
    if (intel.controller.level <= 3) {
      assessment.attackRecommended = true;
      assessment.attackPriority = 5;
      assessment.attackStrategy = 'EARLY_RUSH';
    } else if (intel.controller.level <= 5 && towerPower < 1200) {
      assessment.attackRecommended = true;
      assessment.attackPriority = 3;
      assessment.attackStrategy = 'COORDINATED_ASSAULT';
    } else if (intel.controller.level <= 6) {
      assessment.attackPriority = 2;
      assessment.attackStrategy = 'SIEGE';
    } else {
      assessment.attackPriority = 1;
      assessment.attackStrategy = 'ECONOMIC_DRAIN';
    }
  }

  // Threat assessment
  if (intel.hostiles.length > 0) {
    const totalCombat = intel.hostiles.reduce((sum, h) => sum + h.totalCombatPower, 0);
    assessment.threatLevel = Math.min(10, Math.floor(totalCombat / 100));
  }

  // Expansion potential (for neutral rooms)
  if (intel.type === 'neutral' && intel.controller) {
    let potential = 0;
    potential += intel.sources.length * 30; // Sources value
    if (intel.mineral) {
      potential += 20; // Mineral value
    }
    // Position value (you'd want to add distance calculations here)
    assessment.expansionPotential = potential;
  }

  return assessment;
}

/**
 * updateRoomIntelligence
 * Updates global room data with intelligence
 */
function updateRoomIntelligence(room) {
  const intel = gatherRoomIntelligence(room);

  // Store in global data
  if (!global.data.rooms[room.name]) {
    global.data.rooms[room.name] = {};
  }

  // Merge with existing data
  Object.assign(global.data.rooms[room.name], {
    lastSeen: Game.time,
    intel: intel,
    type: intel.type,
    state: intel.type, // Compatibility with existing code
    sources: intel.sources.length,
    controller: intel.controller,
    hostiles: intel.hostiles.map(h => h.owner),
    assessment: intel.assessment
  });

  // Store remote harvesting opportunities
  if (intel.assessment.remoteHarvestPotential > 0 && !intel.assessment.remoteHarvestBlocked) {
    if (!Memory.remoteHarvestTargets) {
      Memory.remoteHarvestTargets = {};
    }
    Memory.remoteHarvestTargets[room.name] = {
      potential: intel.assessment.remoteHarvestPotential,
      sources: intel.sources.map(s => s.id),
      lastChecked: Game.time
    };
  }

  // Store attack targets (skip if in safe mode)
  if (intel.assessment.attackRecommended) {
    // Check for safe mode
    if (intel.controller && intel.controller.safeMode) {
      console.log(`Scout: ${room.name} is in safe mode for ${intel.controller.safeMode} ticks - not marking as attack target`);
      // Remove from attack targets if it was there
      if (Memory.attackTargets && Memory.attackTargets[room.name]) {
        delete Memory.attackTargets[room.name];
      }
    } else {
      if (!Memory.attackTargets) {
        Memory.attackTargets = {};
      }
      Memory.attackTargets[room.name] = {
        priority: intel.assessment.attackPriority,
        strategy: intel.assessment.attackStrategy,
        lastChecked: Game.time,
        controller: intel.controller,
        defenses: {
          towers: intel.towers.length,
          spawns: intel.spawns.length
        }
      };
    }
  }

  // Alert on enemy remote harvesters
  if (intel.remoteHarvesters.length > 0) {
    room.log(`Enemy remote harvesters detected: ${intel.remoteHarvesters.map(h => h.owner).join(', ')}`);
    // Trigger scout eliminator for these
    for (const harvester of intel.remoteHarvesters) {
      if (!Memory.enemyHarvesters) {
        Memory.enemyHarvesters = {};
      }
      Memory.enemyHarvesters[room.name] = {
        owner: harvester.owner,
        sourceId: harvester.source,
        lastSeen: Game.time
      };
    }
  }

  return intel;
}

module.exports = {
  gatherRoomIntelligence,
  updateRoomIntelligence,
  getRoomType,
  assessRoom
};