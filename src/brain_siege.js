'use strict';

const {debugLog} = require('./logging');

/**
 * Brain module for siege warfare tactics
 * Advanced combat coordination for room conquest
 */

/**
 * Formation types for coordinated attacks
 */
const FORMATIONS = {
  LINE: 'LINE',           // Single line formation
  QUAD: 'QUAD',          // 2x2 quad formation
  SPREAD: 'SPREAD',      // Spread out to avoid AoE
  FOCUS: 'FOCUS',        // Focus fire on single target
  DRAIN: 'DRAIN',        // Tower drain formation
};

/**
 * coordinateSiegeUnits
 * Coordinates all siege units in a room
 *
 * @param {string} roomName - The room under siege
 */
brain.coordinateSiege = function(roomName) {
  const room = Game.rooms[roomName];
  if (!room) return;

  // Find all siege units
  const siegeUnits = room.find(FIND_MY_CREEPS, {
    filter: (creep) => {
      const role = creep.memory.role;
      return role === 'squadsiege' || role === 'dismantler' ||
             role === 'towerdrainer' || role === 'squadheal' ||
             role === 'autoattackmelee' || role === 'defender';
    },
  });

  if (siegeUnits.length === 0) return;

  // Categorize units
  const attackers = [];
  const healers = [];
  const dismantlers = [];
  const drainers = [];

  for (const unit of siegeUnits) {
    switch (unit.memory.role) {
      case 'squadsiege':
      case 'autoattackmelee':
      case 'defender':
        attackers.push(unit);
        break;
      case 'squadheal':
        healers.push(unit);
        break;
      case 'dismantler':
        dismantlers.push(unit);
        break;
      case 'towerdrainer':
        drainers.push(unit);
        break;
    }
  }

  // Determine siege phase
  const phase = determineSiegePhase(room);

  // Coordinate based on phase
  switch (phase) {
    case 'BREACH':
      coordinateBreach(attackers, healers, dismantlers);
      break;

    case 'DRAIN':
      coordinateDrain(drainers, healers);
      break;

    case 'ASSAULT':
      coordinateAssault(attackers, healers, dismantlers);
      break;

    case 'ELIMINATION':
      coordinateElimination(attackers, healers);
      break;

    case 'RAZING':
      coordinateRazing(dismantlers, attackers);
      break;
  }

  // Visual feedback
  if (config.visualizer && config.visualizer.enabled) {
    drawSiegeStatus(room, phase, siegeUnits.length);
  }
};

/**
 * determineSiegePhase
 * Determines current phase of siege
 *
 * @param {Room} room - The room under siege
 * @return {string} - Current phase
 */
function determineSiegePhase(room) {
  // Check for active towers with energy
  const activeTowers = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER &&
                   s.store.getUsedCapacity(RESOURCE_ENERGY) > 100,
  });

  if (activeTowers.length > 0) {
    return 'DRAIN';  // Need to drain towers first
  }

  // Check for walls/ramparts blocking access
  const walls = room.find(FIND_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_WALL ||
                    s.structureType === STRUCTURE_RAMPART) &&
                   !s.my,
  });

  if (walls.length > 10) {
    return 'BREACH';  // Need to breach walls
  }

  // Check for spawns
  const spawns = room.find(FIND_HOSTILE_SPAWNS);
  if (spawns.length > 0) {
    return 'ASSAULT';  // Main assault phase
  }

  // Check for remaining hostile creeps
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  if (hostiles.length > 0) {
    return 'ELIMINATION';  // Clean up defenders
  }

  // Only structures left
  return 'RAZING';  // Destroy everything
}

/**
 * coordinateBreach
 * Coordinates wall/rampart breaching
 *
 * @param {Array} attackers - Attack units
 * @param {Array} healers - Healing units
 * @param {Array} dismantlers - Dismantler units
 */
function coordinateBreach(attackers, healers, dismantlers) {
  // Get room from first unit
  if (attackers.length === 0 && dismantlers.length === 0) return;
  const room = (attackers[0] || dismantlers[0]).room;
  if (!room) return;

  // Find weakest wall section
  const walls = room.find(FIND_STRUCTURES, {
    filter: (s) => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && !s.my
  });

  if (walls.length === 0) return;

  const weakestWall = _.min(walls, 'hits');

  // Focus all dismantlers on weakest point
  for (const dismantler of dismantlers) {
    dismantler.memory.dismantleTarget = weakestWall.id;
    dismantler.memory.siegeOrder = 'BREACH';
  }

  // Position healers behind dismantlers
  assignHealersToUnits(healers, dismantlers);

  // Attackers defend the breach team
  for (const attacker of attackers) {
    attacker.memory.siegeOrder = 'DEFEND_BREACH';
  }
}

/**
 * coordinateDrain
 * Coordinates tower draining
 *
 * @param {Array} drainers - Drainer units
 * @param {Array} healers - Healing units
 */
function coordinateDrain(drainers, healers) {
  if (drainers.length === 0) return;
  const room = drainers[0].room;
  if (!room) return;

  // Find towers to drain
  const towers = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_TOWER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
  });

  if (towers.length === 0) return;

  // Calculate optimal drain positions
  const drainPositions = calculateDrainPositions(towers);

  // Assign drainers to positions
  for (let i = 0; i < drainers.length; i++) {
    const drainer = drainers[i];
    const position = drainPositions[i % drainPositions.length];

    drainer.memory.drainPosition = position;
    drainer.memory.siegeOrder = 'DRAIN_TOWERS';
  }

  // Healers stay with drainers
  assignHealersToUnits(healers, drainers);
}

/**
 * coordinateAssault
 * Main assault coordination
 *
 * @param {Array} attackers - Attack units
 * @param {Array} healers - Healing units
 * @param {Array} dismantlers - Dismantler units
 */
function coordinateAssault(attackers, healers, dismantlers) {
  // Get room from first unit
  if (attackers.length === 0 && dismantlers.length === 0) return;
  const room = (attackers[0] || dismantlers[0]).room;
  if (!room) return;

  // Priority targets
  const spawns = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_SPAWN
  });
  const towers = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER
  });

  // Assign dismantlers to spawns
  for (let i = 0; i < dismantlers.length && i < spawns.length; i++) {
    dismantlers[i].memory.dismantleTarget = spawns[i].id;
    dismantlers[i].memory.siegeOrder = 'DESTROY_SPAWN';
  }

  // Attackers clear defenders
  for (const attacker of attackers) {
    attacker.memory.siegeOrder = 'CLEAR_HOSTILES';
  }

  // Distribute healers
  const allCombatants = [...attackers, ...dismantlers];
  assignHealersToUnits(healers, allCombatants);
}

/**
 * coordinateElimination
 * Eliminate remaining defenders
 *
 * @param {Array} attackers - Attack units
 * @param {Array} healers - Healing units
 */
function coordinateElimination(attackers, healers) {
  const hostiles = _.filter(Game.creeps, c => c.hostile);

  if (hostiles.length === 0) return;

  // Focus fire on most dangerous target
  const primaryTarget = selectPrimaryTarget(hostiles);

  for (const attacker of attackers) {
    attacker.memory.focusTarget = primaryTarget.id;
    attacker.memory.siegeOrder = 'FOCUS_FIRE';
  }

  // Keep healers with attackers
  assignHealersToUnits(healers, attackers);
}

/**
 * coordinateRazing
 * Destroy all remaining structures
 *
 * @param {Array} dismantlers - Dismantler units
 * @param {Array} attackers - Attack units
 */
function coordinateRazing(dismantlers, attackers) {
  // Get room from first unit
  if (dismantlers.length === 0 && attackers.length === 0) return;
  const room = (dismantlers[0] || attackers[0]).room;
  if (!room) return;

  const structures = room.find(FIND_HOSTILE_STRUCTURES);

  // Distribute targets among dismantlers
  for (let i = 0; i < dismantlers.length; i++) {
    if (i < structures.length) {
      dismantlers[i].memory.dismantleTarget = structures[i].id;
      dismantlers[i].memory.siegeOrder = 'RAZE';
    }
  }

  // Attackers help with destruction
  for (const attacker of attackers) {
    attacker.memory.siegeOrder = 'RAZE_ASSIST';
  }
}

/**
 * assignHealersToUnits
 * Assigns healers to combat units
 *
 * @param {Array} healers - Healer units
 * @param {Array} combatants - Units needing healing
 */
function assignHealersToUnits(healers, combatants) {
  if (healers.length === 0 || combatants.length === 0) return;

  const healersPerCombatant = Math.ceil(healers.length / combatants.length);

  for (let i = 0; i < healers.length; i++) {
    const targetIndex = Math.floor(i / healersPerCombatant);
    if (targetIndex < combatants.length) {
      healers[i].memory.healTarget = combatants[targetIndex].id;
      healers[i].memory.siegeOrder = 'SUPPORT';
    }
  }
}

/**
 * calculateDrainPositions
 * Calculates optimal positions for tower draining
 *
 * @param {Array} towers - Tower structures
 * @return {Array} - Array of positions
 */
function calculateDrainPositions(towers) {
  if (towers.length === 0) return [];
  const positions = [];

  // Find positions in range of all towers but far from walls
  const room = towers[0].room;
  if (!room) return [];
  const terrain = room.getTerrain();

  for (let x = 2; x < 48; x += 3) {
    for (let y = 2; y < 48; y += 3) {
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

      const pos = room.getPositionAt(x, y);
      let inRangeCount = 0;

      for (const tower of towers) {
        if (pos.getRangeTo(tower) <= 20) {
          inRangeCount++;
        }
      }

      if (inRangeCount === towers.length) {
        positions.push({x, y});
      }
    }
  }

  return positions.slice(0, 4);  // Return up to 4 positions
}

/**
 * selectPrimaryTarget
 * Selects the most dangerous hostile as primary target
 *
 * @param {Array} hostiles - Hostile creeps
 * @return {Creep} - Primary target
 */
function selectPrimaryTarget(hostiles) {
  // Priority: healers > ranged > melee > others
  const priorities = {
    'healer': 4,
    'ranged': 3,
    'melee': 2,
    'other': 1,
  };

  const categorized = hostiles.map(h => {
    let type = 'other';
    if (h.getActiveBodyparts(HEAL) > 0) type = 'healer';
    else if (h.getActiveBodyparts(RANGED_ATTACK) > 0) type = 'ranged';
    else if (h.getActiveBodyparts(ATTACK) > 0) type = 'melee';

    return {
      creep: h,
      priority: priorities[type],
      threat: h.getActiveBodyparts(ATTACK) + h.getActiveBodyparts(RANGED_ATTACK) * 2 + h.getActiveBodyparts(HEAL) * 3,
    };
  });

  return _.max(categorized, c => c.priority * 10 + c.threat).creep;
}

/**
 * drawSiegeStatus
 * Visual representation of siege status
 *
 * @param {Room} room - The room
 * @param {string} phase - Current phase
 * @param {number} units - Number of siege units
 */
function drawSiegeStatus(room, phase, units) {
  room.visual.text(
    `SIEGE: ${phase}`,
    25, 2,
    {align: 'center', opacity: 0.8, color: '#ff0000', font: 'bold'}
  );

  room.visual.text(
    `Units: ${units}`,
    25, 3,
    {align: 'center', opacity: 0.8, color: '#ffaa00'}
  );
}

/**
 * Formation movement for quad attacks
 * Advanced combat formation
 */
brain.formQuad = function(units) {
  if (units.length !== 4) return false;

  // Sort units into 2x2 formation
  const formation = [
    [units[0], units[1]],
    [units[2], units[3]],
  ];

  // Calculate center position
  let centerX = 0;
  let centerY = 0;

  for (const unit of units) {
    centerX += unit.pos.x;
    centerY += unit.pos.y;
  }

  centerX = Math.floor(centerX / 4);
  centerY = Math.floor(centerY / 4);

  // Move units to maintain formation
  const offsets = [
    {x: -1, y: -1}, {x: 0, y: -1},
    {x: -1, y: 0}, {x: 0, y: 0},
  ];

  for (let i = 0; i < units.length; i++) {
    const targetX = centerX + offsets[i].x;
    const targetY = centerY + offsets[i].y;

    if (units[i].pos.x !== targetX || units[i].pos.y !== targetY) {
      units[i].moveTo(targetX, targetY);
    }
  }

  return true;
};

module.exports = {
  coordinateSiege: brain.coordinateSiege,
  formQuad: brain.formQuad,
};