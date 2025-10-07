'use strict';

const {debugLog} = require('./logging');

/**
 * Economic Health Monitoring System
 * Tracks per-room economic metrics and adjusts spawning priorities
 */

const ECONOMY_THRESHOLDS = {
  CRITICAL: 10000,      // Emergency - spawn only essential roles
  LOW: 30000,           // Conservative - focus on economy
  HEALTHY: 50000,       // Normal operations
  WEALTHY: 100000,      // Aggressive expansion enabled
  ABUNDANT: 200000,     // Maximum aggression, boost production
};

const INCOME_TARGETS = {
  RCL_1: 5,    // energy/tick
  RCL_2: 10,
  RCL_3: 15,
  RCL_4: 20,
  RCL_5: 30,
  RCL_6: 40,
  RCL_7: 50,
  RCL_8: 60,
};

/**
 * Calculate room's economic health status
 * @param {object} room - The room to evaluate
 * @return {string} - Economic status
 */
function getEconomicStatus(room) {
  if (!room.storage) {
    return 'DEVELOPING';
  }

  const energy = room.storage.store[RESOURCE_ENERGY];

  if (energy >= ECONOMY_THRESHOLDS.ABUNDANT) {
    return 'ABUNDANT';
  }
  if (energy >= ECONOMY_THRESHOLDS.WEALTHY) {
    return 'WEALTHY';
  }
  if (energy >= ECONOMY_THRESHOLDS.HEALTHY) {
    return 'HEALTHY';
  }
  if (energy >= ECONOMY_THRESHOLDS.LOW) {
    return 'LOW';
  }
  if (energy >= ECONOMY_THRESHOLDS.CRITICAL) {
    return 'CRITICAL';
  }
  return 'EMERGENCY';
}

/**
 * Calculate energy income rate (energy/tick)
 * @param {object} room - The room to calculate for
 * @return {number} - Energy per tick
 */
function calculateIncomeRate(room) {
  if (!room.data.economyStats) {
    room.data.economyStats = {
      lastEnergy: room.storage ? room.storage.store[RESOURCE_ENERGY] : 0,
      lastTick: Game.time,
      incomeRate: 0,
    };
  }

  const stats = room.data.economyStats;
  const currentEnergy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
  const ticksPassed = Game.time - stats.lastTick;

  if (ticksPassed >= 100) {
    const energyGained = currentEnergy - stats.lastEnergy;
    stats.incomeRate = energyGained / ticksPassed;
    stats.lastEnergy = currentEnergy;
    stats.lastTick = Game.time;
  }

  return stats.incomeRate;
}

/**
 * Determine if room can support expansion
 * @param {object} room - The room to check
 * @return {boolean} - Can support expansion
 */
function canSupportExpansion(room) {
  const status = getEconomicStatus(room);
  const incomeRate = calculateIncomeRate(room);
  const targetIncome = INCOME_TARGETS[`RCL_${room.controller.level}`] || 5;

  // Must be HEALTHY or better AND meeting income targets
  return (status === 'HEALTHY' || status === 'WEALTHY' || status === 'ABUNDANT') &&
    incomeRate >= targetIncome * 0.8; // 80% of target is acceptable
}

/**
 * Determine if room can support military operations
 * @param {object} room - The room to check
 * @return {boolean} - Can support military
 */
function canSupportMilitary(room) {
  const status = getEconomicStatus(room);
  return status === 'WEALTHY' || status === 'ABUNDANT';
}

/**
 * Get recommended upgrader count based on economy
 * @param {object} room - The room to calculate for
 * @return {number} - Number of upgrader work parts needed
 */
function getUpgraderTarget(room) {
  if (!room.storage) {
    return 1;
  }

  const status = getEconomicStatus(room);
  const energy = room.storage.store[RESOURCE_ENERGY];

  // Don't upgrade if economy is struggling
  if (status === 'CRITICAL' || status === 'EMERGENCY') {
    return room.controller.ticksToDowngrade < 5000 ? 1 : 0;
  }

  // RCL 8 special handling
  if (room.controller.level === 8) {
    return status === 'ABUNDANT' ? 1 : 0;
  }

  // Calculate based on excess energy
  const excessEnergy = energy - ECONOMY_THRESHOLDS.HEALTHY;
  if (excessEnergy <= 0) {
    return 1;
  }

  // 1 WORK part per 3000 energy excess (to prevent over-upgrading)
  return Math.min(15, Math.floor(excessEnergy / 3000));
}

/**
 * Main economy brain function - called from brain_main
 *
 * @return {void}
 */
brain.evaluateEconomy = function() {
  if (!Memory.economyStats) {
    Memory.economyStats = {};
  }

  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    if (!room) {
      continue;
    }

    const status = getEconomicStatus(room);
    const income = calculateIncomeRate(room);
    const canExpand = canSupportExpansion(room);
    const canFight = canSupportMilitary(room);

    // Store in heap for fast access
    room.data.economy = {
      status: status,
      income: income,
      canExpand: canExpand,
      canFight: canFight,
      upgraderTarget: getUpgraderTarget(room),
    };

    // Store in Memory for historical tracking
    Memory.economyStats[roomName] = {
      status: status,
      income: Math.round(income * 10) / 10,
      energy: room.storage ? room.storage.store[RESOURCE_ENERGY] : 0,
      timestamp: Game.time,
    };

    debugLog('economy', `${roomName}: ${status} | Income: ${income.toFixed(1)}/tick | Expand: ${canExpand} | Military: ${canFight}`);
  }
};

module.exports = {
  getEconomicStatus,
  calculateIncomeRate,
  canSupportExpansion,
  canSupportMilitary,
  getUpgraderTarget,
  ECONOMY_THRESHOLDS,
  INCOME_TARGETS,
};
