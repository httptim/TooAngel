'use strict';

/**
 * Brain module for emergency spawn rebuilding
 * Redirects all available workers when spawn is destroyed
 */

/**
 * checkForSpawnEmergency
 * Checks if a room has no spawns and needs emergency rebuild
 *
 * @param {Room} room - The room to check
 * @return {boolean} - True if emergency
 */
function checkForSpawnEmergency(room) {
  if (!room || !room.controller || !room.controller.my) {
    return false;
  }

  // Check if we have any spawns
  const spawns = room.find(FIND_MY_SPAWNS);
  if (spawns.length > 0) {
    // Clear emergency flag if spawns exist
    if (room.memory.spawnEmergency) {
      room.log('Spawn emergency resolved - spawn exists');
      delete room.memory.spawnEmergency;
    }
    return false;
  }

  // Check for spawn construction sites
  const spawnSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: (site) => site.structureType === STRUCTURE_SPAWN,
  });

  if (spawnSites.length === 0) {
    // No spawns and no construction sites - this is bad!
    // Try to place a spawn construction site
    if (room.controller.level >= 1) {
      placeEmergencySpawn(room);
    }
    return true;
  }

  // We have a construction site but no spawn - this is an emergency
  room.memory.spawnEmergency = {
    startTime: room.memory.spawnEmergency ? room.memory.spawnEmergency.startTime : Game.time,
    siteId: spawnSites[0].id,
    progress: spawnSites[0].progress,
    progressTotal: spawnSites[0].progressTotal,
  };

  return true;
}

/**
 * placeEmergencySpawn
 * Tries to place a spawn construction site
 *
 * @param {Room} room - The room needing a spawn
 */
function placeEmergencySpawn(room) {
  // Try to place at the original spawn location if known
  if (room.memory.position && room.memory.position.structure &&
      room.memory.position.structure.spawn) {
    const spawnPositions = room.memory.position.structure.spawn;
    for (const pos of spawnPositions) {
      const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_SPAWN);
      if (result === OK) {
        room.log(`Emergency spawn construction site placed at ${pos.x},${pos.y}`);
        return;
      }
    }
  }

  // Fallback - try to place near controller
  const controller = room.controller;
  for (let x = controller.pos.x - 3; x <= controller.pos.x + 3; x++) {
    for (let y = controller.pos.y - 3; y <= controller.pos.y + 3; y++) {
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      const result = room.createConstructionSite(x, y, STRUCTURE_SPAWN);
      if (result === OK) {
        room.log(`Emergency spawn construction site placed at ${x},${y}`);
        return;
      }
    }
  }

  room.log('ERROR: Could not place emergency spawn construction site!');
}

/**
 * redirectAllWorkers
 * Redirects all creeps with WORK parts to build the spawn
 *
 * @param {Room} room - The room in emergency
 * @param {string} siteId - The spawn construction site ID
 */
function redirectAllWorkers(room, siteId) {
  // First, get all workers except sourcers
  const workers = room.find(FIND_MY_CREEPS, {
    filter: (creep) => creep.getActiveBodyparts(WORK) > 0 &&
                       creep.memory.role !== 'sourcer',
  });

  // Check if we have non-sourcer workers available
  const nonSourcerWorkersAvailable = workers.length > 0;

  // If no other workers available, we need to use sourcers
  if (!nonSourcerWorkersAvailable) {
    room.log('WARNING: No non-sourcer workers available, redirecting sourcers to emergency spawn build');
    const sourcers = room.find(FIND_MY_CREEPS, {
      filter: (creep) => creep.memory.role === 'sourcer',
    });
    workers.push(...sourcers);
  }

  let redirected = 0;
  let skippedSourcers = 0;

  for (const creep of workers) {
    // Skip if already building the spawn
    if (creep.memory.emergencySpawnBuilder &&
        creep.memory.emergencyTarget === siteId) {
      continue;
    }

    // Count skipped sourcers for logging
    if (creep.memory.role === 'sourcer' && nonSourcerWorkersAvailable) {
      skippedSourcers++;
      continue;
    }

    // Override current task
    creep.memory.emergencySpawnBuilder = true;
    creep.memory.emergencyTarget = siteId;
    creep.memory.originalRole = creep.memory.role;

    // Save routing/target for restoration later
    if (creep.memory.routing) {
      creep.memory.originalRouting = creep.memory.routing;
      delete creep.memory.routing;
    }
    if (creep.memory.target) {
      creep.memory.originalTarget = creep.memory.target;
      delete creep.memory.target;
    }

    creep.say('🚨SPAWN');
    redirected++;
  }

  if (redirected > 0) {
    room.log(`Redirected ${redirected} workers to emergency spawn construction`);
  }

  if (skippedSourcers > 0) {
    room.log(`Kept ${skippedSourcers} sourcers mining for energy supply`);
  }
}

/**
 * handleEmergencyBuilder
 * Handles creep behavior during spawn emergency
 *
 * @param {Creep} creep - The creep to handle
 * @return {boolean} - True if handled
 */
brain.handleEmergencyBuilder = function(creep) {
  if (!creep.memory.emergencySpawnBuilder) {
    return false;
  }

  const site = Game.getObjectById(creep.memory.emergencyTarget);

  // Check if construction is complete or site gone
  if (!site) {
    // Check if spawn actually exists now
    const spawns = creep.room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) {
      // Spawn still doesn't exist, something went wrong
      creep.log('ERROR: Emergency spawn builder cleanup but no spawn exists!');
      return true; // Keep handling as emergency
    }

    // Restore original role
    creep.memory.role = creep.memory.originalRole || 'universal';

    // Restore routing if it was saved
    if (creep.memory.originalRouting) {
      creep.memory.routing = creep.memory.originalRouting;
      delete creep.memory.originalRouting;
    }

    // Restore target if it was saved
    if (creep.memory.originalTarget) {
      creep.memory.target = creep.memory.originalTarget;
      delete creep.memory.originalTarget;
    }

    // For creeps that had no routing or target (like builders working in base)
    // They will naturally pick up new tasks through their role's action function

    // Clean up emergency flags
    delete creep.memory.emergencySpawnBuilder;
    delete creep.memory.emergencyTarget;
    delete creep.memory.originalRole;

    creep.say('✅');

    // Clear the room's emergency flag if it exists
    if (creep.room.memory.spawnEmergency) {
      delete creep.room.memory.spawnEmergency;
      creep.room.log('Spawn emergency resolved - all creeps released');
    }

    return false;
  }

  // Get energy if needed
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    // PRIORITY 1: Storage (fastest and most reliable)
    if (creep.room.storage && creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.storage, {visualizePathStyle: {stroke: '#ffffff'}});
      }
      return true;
    }

    // PRIORITY 2: Terminal
    if (creep.room.terminal && creep.room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(creep.room.terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.terminal, {visualizePathStyle: {stroke: '#ffffff'}});
      }
      return true;
    }

    // PRIORITY 3: Other containers/links
    const source = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: (s) => {
        return (s.structureType === STRUCTURE_CONTAINER ||
                s.structureType === STRUCTURE_LINK) &&
               s.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
      },
    });

    if (source) {
      if (creep.withdraw(source, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, {visualizePathStyle: {stroke: '#ffffff'}});
      }
      return true;
    }

    // PRIORITY 4: Dropped energy
    const droppedEnergy = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
      filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount > 50,
    });

    if (droppedEnergy) {
      if (creep.pickup(droppedEnergy) === ERR_NOT_IN_RANGE) {
        creep.moveTo(droppedEnergy, {visualizePathStyle: {stroke: '#ff0000'}});
      }
      return true;
    }

    // LAST RESORT: Harvest (only if no stored energy available)
    const energySource = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (energySource) {
      if (creep.harvest(energySource) === ERR_NOT_IN_RANGE) {
        creep.moveTo(energySource, {visualizePathStyle: {stroke: '#ffaa00'}});
      }
    }
    return true;
  }

  // Build the spawn
  const result = creep.build(site);
  if (result === ERR_NOT_IN_RANGE) {
    creep.moveTo(site, {
      visualizePathStyle: {stroke: '#ff0000', lineStyle: 'solid', strokeWidth: .15},
      reusePath: 5,
    });
  } else if (result === OK) {
    // Report progress periodically
    if (Game.time % 10 === 0) {
      const progress = Math.floor((site.progress / site.progressTotal) * 100);
      creep.room.log(`EMERGENCY: Spawn construction ${progress}% complete`);
    }
  }

  return true;
};

/**
 * handleSpawnEmergency
 * Main function to handle spawn emergencies
 */
brain.handleSpawnEmergency = function() {
  try {
    for (const roomName of Memory.myRooms || []) {
      const room = Game.rooms[roomName];
      if (!room) continue;

      if (checkForSpawnEmergency(room)) {
      room.log('🚨 SPAWN EMERGENCY DETECTED 🚨');

      if (room.memory.spawnEmergency && room.memory.spawnEmergency.siteId) {
        // Redirect all workers to build spawn
        redirectAllWorkers(room, room.memory.spawnEmergency.siteId);

        // Visual warning
        if (Game.time % 10 === 0) {
          const emergency = room.memory.spawnEmergency;
          const elapsed = Game.time - emergency.startTime;
          room.log(`EMERGENCY: No spawn for ${elapsed} ticks! Construction: ${emergency.progress}/${emergency.progressTotal}`);

          // Alert if taking too long
          if (elapsed > 500 && elapsed % 100 === 0) {
            Game.notify(`CRITICAL: Room ${roomName} has been without spawn for ${elapsed} ticks!`, 10);
          }
        }
      }
    }
  }
  } catch (error) {
    console.log(`ERROR in brain.handleSpawnEmergency: ${error}`);
    console.log(error.stack);
  }
};

module.exports = {
  handleSpawnEmergency: brain.handleSpawnEmergency,
  handleEmergencyBuilder: brain.handleEmergencyBuilder,
  checkForSpawnEmergency,
};