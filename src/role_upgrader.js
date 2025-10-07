'use strict';

/*
 * upgrader upgrades the controller
 *
 * Gets the energy from the storage
 */

roles.upgrader = {};
roles.upgrader.settings = {
  param: ['controller.level'],
  prefixString: {
    1: 'MCW',
  },
  layoutString: {
    1: 'W',
  },
  maxLayoutAmount: {
    1: 50,
  },
};

/**
 * updateSettings
 *
 * Uses the economy brain to determine optimal upgrader count based on
 * room economic status and energy reserves
 *
 * @param {object} room
 * @return {boolean|{maxLayoutAmount: number}}
 */
roles.upgrader.updateSettings = function(room) {
  if (!room.storage) {
    return false;
  }

  // Use economy brain's calculation if available and enabled
  if (config.economy.enabled && room.data.economy) {
    const targetUpgraders = room.data.economy.upgraderTarget;

    if (config.debug.upgrader) {
      room.log(`upgrader updateSettings - status: ${room.data.economy.status} income: ${room.data.economy.income.toFixed(1)}/tick targetUpgraders: ${targetUpgraders}`);
    }

    return {
      maxLayoutAmount: Math.max(0, targetUpgraders - 1),
    };
  }

  // Fallback to original logic if economy brain not available
  let workParts = Math.floor((room.storage.store.energy + 1) / (CREEP_LIFE_TIME * config.room.upgraderStorageFactor));
  if (room.controller.level === 8) {
    workParts = Math.min(workParts, CONTROLLER_MAX_UPGRADE_PER_TICK);
  }
  const maxLayoutAmount = Math.max(0, workParts - 1);
  if (config.debug.upgrader) {
    room.log(`upgrader updateSettings - storage.energy: ${room.storage.store.energy} upgraderStorageFactor: ${config.room.upgraderStorageFactor} workParts: ${workParts} maxLayoutAmount: ${maxLayoutAmount}`);
  }
  return {
    maxLayoutAmount: maxLayoutAmount,
  };
};

roles.upgrader.killPrevious = true;
roles.upgrader.boostActions = ['upgradeController'];

roles.upgrader.action = function(creep) {
  creep.mySignController();
  creep.spawnReplacement(1);
  if (!creep.room.controller.isAboutToDowngrade()) {
    if (creep.room.isUnderAttack()) {
      return true;
    }
    if (creep.room.storage && creep.room.storage.isLow()) {
      return true;
    }
  }

  creep.upgradeController(creep.room.controller);
  creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
  return true;
};
