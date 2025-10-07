# Aggressive Territorial Domination Bot - Development Roadmap

## Executive Summary

This roadmap transforms the TooAngel bot from a cautious, reactive player into an aggressive territorial dominator like "Tigga". The development is structured in 6 testable phases, with each phase building on the previous one. The focus starts with economic optimization and expansion, then progressively adds sophisticated combat capabilities.

**Total Timeline**: 8-12 weeks
**Philosophy**: "Expand or Die" - Territory = Resources = Power

---

## Current State Analysis

### Existing Strengths
✅ Mature role-based architecture with 30+ specialized roles
✅ Sophisticated base building via `prototype_room_basebuilder.js`
✅ Automated resource management (sourcers, carriers, upgraders)
✅ Basic squad system (squadsiege, squadheal) exists but underutilized
✅ Diplomacy system tracks player reputation
✅ Room claiming logic in `brain_nextroom.js`
✅ Link-based energy distribution for RCL 5+
✅ Market and terminal integration
✅ Observer scanning system

### Critical Gaps
❌ **Economy**: No optimization for rapid expansion (storage targets, link efficiency, upgrader scaling)
❌ **Expansion**: Conservative thresholds prevent aggressive claiming
❌ **Combat**: Basic defenders with no kiting, focus fire, or tactical AI
❌ **Intelligence**: No scout detection/elimination system
❌ **Squad AI**: Exists but primitive - no quad formations, no kiting
❌ **CPU Management**: No dynamic allocation based on peace/war state
❌ **Territorial Control**: No buffer zone management or reservation strategy

---

## Phase 1: Foundation - Economic Engine (Weeks 1-2)

**Goal**: Optimize base economy to support 50k+ energy reserves and enable rapid expansion

### 1.1 Storage & Energy Management System
**Files to Modify**:
- `src/config.js`
- `src/prototype_room_my.js`
- `src/role_upgrader.js`
- `src/role_carry.js`

**New File**: `src/brain_economy.js`

**Implementation**:

```javascript
// src/brain_economy.js - New file for economy coordination
'use strict';

/**
 * Economic Health Monitoring System
 * Tracks per-room economic metrics and adjusts spawning priorities
 */

const ECONOMY_THRESHOLDS = {
  CRITICAL: 10000,      // Emergency - spawn only essential roles
  LOW: 30000,           // Conservative - focus on economy
  HEALTHY: 50000,       // Normal operations
  WEALTHY: 100000,      // Aggressive expansion enabled
  ABUNDANT: 200000      // Maximum aggression, boost production
};

const INCOME_TARGETS = {
  RCL_1: 5,    // energy/tick
  RCL_2: 10,
  RCL_3: 15,
  RCL_4: 20,
  RCL_5: 30,
  RCL_6: 40,
  RCL_7: 50,
  RCL_8: 60
};

/**
 * Calculate room's economic health status
 * @param {Room} room
 * @return {string} - Economic status
 */
function getEconomicStatus(room) {
  if (!room.storage) {
    return 'DEVELOPING';
  }

  const energy = room.storage.store[RESOURCE_ENERGY];

  if (energy >= ECONOMY_THRESHOLDS.ABUNDANT) return 'ABUNDANT';
  if (energy >= ECONOMY_THRESHOLDS.WEALTHY) return 'WEALTHY';
  if (energy >= ECONOMY_THRESHOLDS.HEALTHY) return 'HEALTHY';
  if (energy >= ECONOMY_THRESHOLDS.LOW) return 'LOW';
  if (energy >= ECONOMY_THRESHOLDS.CRITICAL) return 'CRITICAL';
  return 'EMERGENCY';
}

/**
 * Calculate energy income rate (energy/tick)
 * @param {Room} room
 * @return {number}
 */
function calculateIncomeRate(room) {
  if (!room.data.economyStats) {
    room.data.economyStats = {
      lastEnergy: room.storage ? room.storage.store[RESOURCE_ENERGY] : 0,
      lastTick: Game.time,
      incomeRate: 0
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
 * @param {Room} room
 * @return {boolean}
 */
function canSupportExpansion(room) {
  const status = getEconomicStatus(room);
  const incomeRate = calculateIncomeRate(room);
  const targetIncome = INCOME_TARGETS[`RCL_${room.controller.level}`];

  // Must be HEALTHY or better AND meeting income targets
  return (status === 'HEALTHY' || status === 'WEALTHY' || status === 'ABUNDANT')
    && incomeRate >= targetIncome * 0.8; // 80% of target is acceptable
}

/**
 * Determine if room can support military operations
 * @param {Room} room
 * @return {boolean}
 */
function canSupportMilitary(room) {
  const status = getEconomicStatus(room);
  return status === 'WEALTHY' || status === 'ABUNDANT';
}

/**
 * Get recommended upgrader count based on economy
 * @param {Room} room
 * @return {number}
 */
function getUpgraderTarget(room) {
  if (!room.storage) return 1;

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
  if (excessEnergy <= 0) return 1;

  // 1 WORK part per 1500 energy excess (to prevent over-upgrading)
  return Math.min(15, Math.floor(excessEnergy / 3000));
}

/**
 * Main economy brain function - called from brain_main
 */
brain.evaluateEconomy = function() {
  if (!Memory.economyStats) {
    Memory.economyStats = {};
  }

  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;

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
      upgraderTarget: getUpgraderTarget(room)
    };

    // Store in Memory for historical tracking
    Memory.economyStats[roomName] = {
      status: status,
      income: Math.round(income * 10) / 10,
      energy: room.storage ? room.storage.store[RESOURCE_ENERGY] : 0,
      timestamp: Game.time
    };

    if (config.debug.economy) {
      console.log(`[Economy] ${roomName}: ${status} | Income: ${income.toFixed(1)}/tick | Expand: ${canExpand} | Military: ${canFight}`);
    }
  }
};

module.exports = {
  getEconomicStatus,
  calculateIncomeRate,
  canSupportExpansion,
  canSupportMilitary,
  getUpgraderTarget,
  ECONOMY_THRESHOLDS,
  INCOME_TARGETS
};
```

**Config Changes** (`src/config.js`):
```javascript
// Add to config.js
economy: {
  enabled: true,
  targetReserves: 50000,      // Target storage level before expansion
  wealthyThreshold: 100000,   // Enable aggressive actions
  emergencyThreshold: 10000,  // Survival mode
  upgraderFactor: 2,          // Energy per WORK part per lifetime
  maxUpgraders: 15,           // Cap upgraders to prevent over-allocation
},

debug: {
  // Add to existing debug section
  economy: true,  // Log economic status
}
```

**Integration** (`src/brain_main.js`):
```javascript
// Add to brain_main.js execute() function after prepareMemory()
require('./brain_economy'); // Add at top

// In execute() function:
brain.evaluateEconomy();  // Add after prepareMemory()
```

### 1.2 Upgrader Optimization
**Modify**: `src/role_upgrader.js`

```javascript
// Replace updateSettings function
roles.upgrader.updateSettings = function(room) {
  if (!room.storage || !room.data.economy) {
    return false;
  }

  // Use economy brain's calculation
  const targetUpgraders = room.data.economy.upgraderTarget;

  if (config.debug.upgrader) {
    room.log(`upgrader updateSettings - status: ${room.data.economy.status} income: ${room.data.economy.income} targetUpgraders: ${targetUpgraders}`);
  }

  return {
    maxLayoutAmount: Math.max(0, targetUpgraders - 1)
  };
};
```

### 1.3 Link Efficiency Improvements
**Modify**: `src/prototype_room_my.js`

```javascript
// Improve handleLinks function for better energy distribution
Room.prototype.handleLinks = function() {
  const linkStorage = this.getLinkStorage();
  if (!linkStorage) return;

  // Only transfer if storage link needs energy AND we have energy to spare
  const storageEnergy = this.storage ? this.storage.store[RESOURCE_ENERGY] : 0;
  const freeCapacity = linkStorage.store.getFreeCapacity(RESOURCE_ENERGY);

  // Don't fill storage link if room economy is struggling
  if (this.data.economy && this.data.economy.status === 'CRITICAL') {
    return;
  }

  if (freeCapacity < 400) {
    return;
  }

  const links = this.findPropertyFilter(FIND_MY_STRUCTURES, 'structureType', [STRUCTURE_LINK], {
    filter: (link) => link.id !== linkStorage.id && link.store[RESOURCE_ENERGY] > 400
  });

  if (links.length > 0) {
    // Prioritize source links (positions 1 and 2 in memory)
    const sourceLinks = links.filter(link => {
      const linkPos1 = this.memory.position.structure.link[1];
      const linkPos2 = this.memory.position.structure.link[2];
      return (link.pos.x === linkPos1.x && link.pos.y === linkPos1.y) ||
             (link.pos.x === linkPos2.x && link.pos.y === linkPos2.y);
    });

    const linksToUse = sourceLinks.length > 0 ? sourceLinks : links;
    const time = Game.time % (linksToUse.length * 12);
    const linkIndex = Math.floor(time / 12);

    if (time % 12 === 0 && linksToUse.length > linkIndex) {
      this.handleLinksTransferEnergy(linksToUse, linkIndex, linkStorage);
    }
  }
};
```

### 1.4 Testing Criteria for Phase 1
✅ Storage maintains 50k+ energy for 500+ ticks in RCL 5+ rooms
✅ Income rate meets or exceeds target for room's RCL
✅ Upgraders scale down when storage is low (<30k)
✅ Links transfer energy efficiently (>80% uptime on source links)
✅ Economy brain correctly identifies room status (CRITICAL/LOW/HEALTHY/WEALTHY/ABUNDANT)
✅ CPU usage for economy brain <0.5 CPU per room per tick

**Success Metrics**:
- Room reaches RCL 5 within 40k ticks (manual test on private server)
- Storage energy stabilizes at 50k+ after RCL 5
- No energy waste (carriers not dropping energy, upgraders not starving)

---

## Phase 2: Expansion Automation (Weeks 2-3)

**Goal**: Aggressively claim new rooms when economy supports it

### 2.1 Enhanced Room Claiming Logic
**Modify**: `src/brain_nextroom.js`

Create new intelligent room evaluation system:

```javascript
// Add to brain_nextroom.js after existing functions

/**
 * Advanced room scoring system
 * @param {string} roomName
 * @param {string} originRoom
 * @return {number} - Higher is better
 */
function scoreClaimableRoom(roomName, originRoom) {
  const data = global.data.rooms[roomName];
  if (!data) return 0;

  let score = 0;

  // Source count (most important)
  score += data.sources * 5000;

  // Mineral value
  const mineralValue = config.nextRoom.mineralValues[data.mineral] || 0;
  score += mineralValue * 100;

  // Distance penalty (closer is better)
  const distance = Game.map.getRoomLinearDistance(roomName, originRoom);
  score -= distance * 500;

  // Highway rooms are valuable (easier to defend)
  const parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName);
  if (parsed) {
    const x = parseInt(parsed[2]);
    const y = parseInt(parsed[4]);
    if (x % 10 === 0 || y % 10 === 0) {
      score += 1000; // Highway bonus
    }
    if (x % 10 === 5 && y % 10 === 5) {
      score -= 2000; // Center room penalty (SK rooms nearby)
    }
  }

  // Corner positions are easier to defend
  if (data.controller && data.controller.pos) {
    const controllerX = data.controller.pos.x;
    const controllerY = data.controller.pos.y;
    if (controllerX < 10 || controllerX > 40 || controllerY < 10 || controllerY > 40) {
      score += 500; // Corner bonus
    }
  }

  // Prefer rooms adjacent to existing territory (easier to defend)
  let adjacentToMine = false;
  for (const myRoom of Memory.myRooms) {
    if (Game.map.getRoomLinearDistance(roomName, myRoom) === 1) {
      adjacentToMine = true;
      break;
    }
  }
  if (adjacentToMine) {
    score += 2000;
  }

  return score;
}

/**
 * Check if ANY room can support expansion (not just total CPU)
 * @return {object|false} - {roomName, canSupport} or false
 */
function findRoomToSupportClaiming() {
  const {canSupportExpansion} = require('./brain_economy');

  const supportingRooms = Memory.myRooms.filter(roomName => {
    const room = Game.rooms[roomName];
    if (!room || !room.data.economy) return false;
    return canSupportExpansion(room);
  });

  if (supportingRooms.length === 0) {
    debugLog('nextroomer', 'No rooms have healthy economy to support expansion');
    return false;
  }

  // Choose room with best economy
  supportingRooms.sort((a, b) => {
    const roomA = Game.rooms[a];
    const roomB = Game.rooms[b];
    return (roomB.storage ? roomB.storage.store[RESOURCE_ENERGY] : 0) -
           (roomA.storage ? roomA.storage.store[RESOURCE_ENERGY] : 0);
  });

  return {roomName: supportingRooms[0], canSupport: true};
}

// Replace existing claimRoom function
function claimRoom(possibleRooms) {
  const supportingRoom = findRoomToSupportClaiming();
  if (!supportingRoom) {
    debugLog('nextroomer', 'No room can support expansion economically');
    return;
  }

  const baseRoom = supportingRoom.roomName;

  // Score all possible rooms from this base
  const scoredRooms = possibleRooms.map(roomName => ({
    roomName: roomName,
    score: scoreClaimableRoom(roomName, baseRoom)
  })).filter(r => r.score > 0);

  scoredRooms.sort((a, b) => b.score - a.score);

  if (scoredRooms.length === 0) {
    debugLog('nextroomer', 'No viable rooms to claim');
    return;
  }

  const targetRoom = scoredRooms[0].roomName;
  const room = Game.rooms[baseRoom];
  const targetData = global.data.rooms[targetRoom];

  debugLog('nextroomer', `Claiming ${targetRoom} from ${baseRoom} (score: ${scoredRooms[0].score})`);

  // Spawn claimer
  room.checkRoleToSpawn('claimer', 1, targetData.controllerId, targetRoom);

  // Spawn nextroomer
  room.checkRoleToSpawn('nextroomer', 2, targetData.controllerId, targetRoom);

  // Mark in memory
  if (!Memory.expansionHistory) Memory.expansionHistory = [];
  Memory.expansionHistory.push({
    targetRoom: targetRoom,
    fromRoom: baseRoom,
    tick: Game.time,
    score: scoredRooms[0].score
  });
}

// Modify handleNextroomer to be more aggressive
brain.handleNextroomer = function() {
  if (!Memory.myRooms || Memory.myRooms.length >= Game.gcl.level) {
    return;
  }

  // Check every 500 ticks instead of CREEP_CLAIM_LIFE_TIME
  if (Game.time % 500 !== 0) {
    return;
  }

  debugLog('nextroomer', 'Checking for expansion opportunity');

  // Check system resources (CPU, Memory, Heap)
  if (config.nextRoom.resourceStats) {
    if (!haveEnoughSystemResources()) {
      debugLog('nextroomer', 'Insufficient system resources');
      return;
    }
  }

  const possibleRooms = Object.keys(global.data.rooms).filter(isClaimableRoom);
  if (possibleRooms.length > 0) {
    claimRoom(possibleRooms);
    return;
  }

  // Spawn scouts to find new rooms
  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    if (room && room.data.economy && room.data.economy.status === 'HEALTHY') {
      room.debugLog('nextroomer', `Spawning scout to find claimable rooms`);
      room.checkRoleToSpawn('scout');
    }
  }
};
```

### 2.2 Config Adjustments for Aggressive Expansion

**Modify**: `src/config.js`

```javascript
nextRoom: {
  scoutMinControllerLevel: 3,  // Start scouting earlier (was 4)
  intervalToCheck: 500,         // Check every 500 ticks (was CREEP_CLAIM_LIFE_TIME ~600)
  maxRooms: 20,                 // Increase room cap (was 8)
  cpuPerRoom: 12,               // Slightly optimize (was 13)
  maxDistance: 15,              // Allow further expansion (was 10)
  minNewRoomDistance: 1,        // Allow adjacent rooms (was 2)
  minEnergyForActive: 500,      // Lower threshold (was 1000)
  notify: true,                 // Get notified of expansions (was false)

  // Increase value of needed minerals
  mineralValues: {
    [RESOURCE_HYDROGEN]: 20,    // was 15
    [RESOURCE_OXYGEN]: 15,      // was 10
    [RESOURCE_UTRIUM]: 20,      // was 15
    [RESOURCE_KEANIUM]: 20,     // was 15
    [RESOURCE_LEMERGIUM]: 20,   // was 15
    [RESOURCE_ZYNTHIUM]: 20,    // was 15
    [RESOURCE_CATALYST]: 15,    // was 10
  },

  resourceStats: true,
  resourceStatsDivider: 10000,
  distanceFactor: 1.5,          // Reduce distance penalty (was 2)
},
```

### 2.3 Remote Mining Enhancement

Create new file for remote mining management:

**New File**: `src/brain_remote_mining.js`

```javascript
'use strict';

/**
 * Remote Mining Brain Module
 * Manages SK rooms and neutral rooms for resource extraction
 */

/**
 * Find potential remote mining targets
 * @param {string} baseRoom - Room to mine from
 * @param {number} maxDistance - Maximum distance
 * @return {array} - Array of room names
 */
function findRemoteMiningTargets(baseRoom, maxDistance = 3) {
  const targets = [];

  for (const roomName in global.data.rooms) {
    const data = global.data.rooms[roomName];

    // Skip claimed rooms
    if (data.state === 'Controlled' || data.state === 'Occupied') {
      continue;
    }

    // Skip rooms we own
    if (Memory.myRooms.includes(roomName)) {
      continue;
    }

    // Must have sources
    if (!data.sources || data.sources === 0) {
      continue;
    }

    // Check distance
    const distance = Game.map.getRoomLinearDistance(baseRoom, roomName);
    if (distance > maxDistance) {
      continue;
    }

    // Score based on sources and distance
    const score = (data.sources * 1000) - (distance * 100);

    targets.push({
      roomName: roomName,
      distance: distance,
      sources: data.sources,
      mineral: data.mineral,
      score: score,
      isSourceKeeper: data.sourceKeeperRoom || false
    });
  }

  return targets.sort((a, b) => b.score - a.score);
}

/**
 * Assign remote mining rooms to bases
 */
brain.manageRemoteMining = function() {
  if (!Memory.remoteMining) {
    Memory.remoteMining = {};
  }

  // Run every 1000 ticks
  if (Game.time % 1000 !== 0) {
    return;
  }

  for (const baseRoom of Memory.myRooms) {
    const room = Game.rooms[baseRoom];
    if (!room || !room.data.economy) continue;

    // Only assign remote mining if economy is healthy
    if (room.data.economy.status !== 'HEALTHY' &&
        room.data.economy.status !== 'WEALTHY' &&
        room.data.economy.status !== 'ABUNDANT') {
      continue;
    }

    // Find targets
    const targets = findRemoteMiningTargets(baseRoom, 3);

    if (!Memory.remoteMining[baseRoom]) {
      Memory.remoteMining[baseRoom] = [];
    }

    // Assign up to 2 remote rooms per base
    const maxRemotes = room.controller.level >= 6 ? 3 : 2;
    Memory.remoteMining[baseRoom] = targets
      .slice(0, maxRemotes)
      .map(t => t.roomName);

    if (config.debug.economy) {
      console.log(`[RemoteMining] ${baseRoom}: ${Memory.remoteMining[baseRoom].join(', ')}`);
    }
  }
};

module.exports = {
  findRemoteMiningTargets
};
```

**Integration**: Add to `brain_main.js` execute():
```javascript
require('./brain_remote_mining');
// In execute():
brain.manageRemoteMining();
```

### 2.4 Testing Criteria for Phase 2
✅ Bot claims a new room within 10k ticks when economy is HEALTHY
✅ Room selection prioritizes high-value targets (3 sources, close distance, good minerals)
✅ Claimer + 2 Nextroomers spawn successfully
✅ Remote mining assignments work for RCL 4+ rooms
✅ Expansion history tracked in Memory
✅ No expansion when economy is struggling

**Success Metrics**:
- Claim 2nd room by tick 50k
- Claim 3rd room by tick 80k
- Remote mining active in at least 1 room by tick 60k

---

## Phase 3: Scout Detection & Elimination (Weeks 3-4)

**Goal**: Detect and kill enemy scouts to maintain intelligence advantage

### 3.1 Hostiles Detection System

**New File**: `src/brain_intelligence.js`

```javascript
'use strict';

const {isFriend} = require('./brain_squadmanager');
const {addToReputation} = require('./diplomacy');

/**
 * Categorize hostile creep threats
 * @param {Creep} creep
 * @return {string} - Threat category
 */
function categorizeHostile(creep) {
  const body = creep.body;

  let attackParts = 0;
  let rangedParts = 0;
  let healParts = 0;
  let workParts = 0;
  let claimParts = 0;
  let carryParts = 0;

  for (const part of body) {
    switch(part.type) {
      case ATTACK: attackParts++; break;
      case RANGED_ATTACK: rangedParts++; break;
      case HEAL: healParts++; break;
      case WORK: workParts++; break;
      case CLAIM: claimParts++; break;
      case CARRY: carryParts++; break;
    }
  }

  // Categorize
  if (claimParts > 0) return 'CLAIMER';
  if (attackParts >= 5 || rangedParts >= 5) return 'ATTACKER';
  if (healParts >= 5) return 'HEALER';
  if (workParts >= 5 && attackParts === 0) return 'DISMANTLER';
  if (carryParts > 0 && attackParts === 0 && rangedParts === 0) return 'SCOUT';
  if (attackParts > 0 || rangedParts > 0) return 'FIGHTER';

  return 'UNKNOWN';
}

/**
 * Calculate threat level 0-100
 * @param {Creep} creep
 * @param {Room} room
 * @return {number}
 */
function calculateThreatLevel(creep, room) {
  let threat = 0;

  const category = categorizeHostile(creep);

  // Base threat by category
  switch(category) {
    case 'CLAIMER': threat = 100; break; // Highest threat - trying to claim!
    case 'ATTACKER': threat = 80; break;
    case 'DISMANTLER': threat = 70; break;
    case 'HEALER': threat = 60; break;
    case 'FIGHTER': threat = 50; break;
    case 'SCOUT': threat = 30; break;
    case 'UNKNOWN': threat = 20; break;
  }

  // Increase threat if near critical structures
  if (room.controller && creep.pos.getRangeTo(room.controller) < 5) {
    threat += 20;
  }

  const spawns = room.findMySpawns();
  if (spawns.length > 0 && creep.pos.getRangeTo(spawns[0]) < 10) {
    threat += 15;
  }

  if (room.storage && creep.pos.getRangeTo(room.storage) < 10) {
    threat += 10;
  }

  return Math.min(100, threat);
}

/**
 * Detect scouts in owned and adjacent rooms
 */
brain.detectScouts = function() {
  if (!Memory.detectedScouts) {
    Memory.detectedScouts = {};
  }

  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;

    const hostiles = room.find(FIND_HOSTILE_CREEPS, {
      filter: (c) => !isFriend(c.owner.username) &&
                     !config.maliciousNpcUsernames.includes(c.owner.username)
    });

    for (const hostile of hostiles) {
      const category = categorizeHostile(hostile);
      const threat = calculateThreatLevel(hostile, room);

      // Track scout
      if (!Memory.detectedScouts[hostile.id]) {
        Memory.detectedScouts[hostile.id] = {
          id: hostile.id,
          owner: hostile.owner.username,
          category: category,
          threat: threat,
          firstSeen: Game.time,
          room: roomName,
          lastSeen: Game.time
        };

        // Reputation penalty for scouting
        if (category === 'SCOUT') {
          addToReputation(hostile.owner.username, -5);

          if (config.debug.attack) {
            console.log(`[Intelligence] Scout detected: ${hostile.owner.username} in ${roomName}`);
          }
        } else if (category === 'CLAIMER') {
          addToReputation(hostile.owner.username, -50);
          Game.notify(`CLAIMER detected in ${roomName} from ${hostile.owner.username}!`);
        } else {
          addToReputation(hostile.owner.username, -10);
        }
      } else {
        Memory.detectedScouts[hostile.id].lastSeen = Game.time;
        Memory.detectedScouts[hostile.id].threat = threat;
      }
    }
  }

  // Clean up old scouts
  for (const scoutId in Memory.detectedScouts) {
    const scout = Memory.detectedScouts[scoutId];
    if (Game.time - scout.lastSeen > 50) {
      delete Memory.detectedScouts[scoutId];
    }
  }
};

module.exports = {
  categorizeHostile,
  calculateThreatLevel
};
```

### 3.2 Defender Enhancement with Scout Killing

**Modify**: `src/role_defender.js`

```javascript
'use strict';

/*
 * defender - Enhanced with scout detection and elimination
 */

roles.defender = {};
roles.defender.boostActions = ['rangedAttack', 'heal'];

roles.defender.settings = {
  param: ['controller.level'],
  layoutString: 'MRH',
  amount: {
    1: [3, 2, 1],  // More mobile
    8: [5, 2, 1],
  },
  fillTough: true,  // Add TOUGH parts for survivability
};

/**
 * Find best target to attack
 * @param {Creep} creep
 * @return {Creep|null}
 */
function findBestTarget(creep) {
  const {calculateThreatLevel} = require('./brain_intelligence');

  const hostiles = creep.room.find(FIND_HOSTILE_CREEPS, {
    filter: (c) => !isFriend(c.owner.username)
  });

  if (hostiles.length === 0) return null;

  // Sort by threat level
  const scoredHostiles = hostiles.map(h => ({
    creep: h,
    threat: calculateThreatLevel(h, creep.room),
    distance: creep.pos.getRangeTo(h)
  }));

  scoredHostiles.sort((a, b) => {
    // Prioritize threat, then distance
    if (Math.abs(a.threat - b.threat) > 10) {
      return b.threat - a.threat;
    }
    return a.distance - b.distance;
  });

  return scoredHostiles[0].creep;
}

roles.defender.preMove = function(creep) {
  creep.selfHeal();

  const target = findBestTarget(creep);
  if (target !== null) {
    creep.creepLog(`preMove attacking ${target.owner.username}`);

    const range = creep.pos.getRangeTo(target);

    // Ranged attack if in range
    if (range <= 3) {
      creep.rangedAttack(target);
    }

    // Move towards if far, away if too close (basic kiting)
    if (range > 3) {
      creep.moveTo(target);
    } else if (range < 2) {
      const direction = creep.pos.getDirectionTo(target);
      const oppositeDirection = (direction + 3) % 8 + 1;
      creep.move(oppositeDirection);
    }

    return true;
  }

  if (!creep.inMyRoom()) {
    let targets = creep.pos.findInRangeStructures(FIND_HOSTILE_STRUCTURES);
    if (targets.length === 0) {
      targets = creep.pos.findInRangeStructures(FIND_STRUCTURES, 1, [STRUCTURE_WALL, STRUCTURE_RAMPART]);
    }
    creep.rangeAttackOutsideOfMyRooms(targets);
  }
};

roles.defender.action = function(creep) {
  if (creep.inBase() && creep.memory.reverse) {
    return Creep.recycleCreep(creep);
  }

  creep.selfHeal();

  const target = findBestTarget(creep);
  if (target) {
    const range = creep.pos.getRangeTo(target);

    // Ranged attack
    if (range <= 3) {
      creep.rangedAttack(target);
    }

    // Movement (basic kiting)
    if (range > 3) {
      creep.moveTo(target);
    } else if (range < 2 && target.getActiveBodyparts(ATTACK) > 0) {
      // Kite away from melee
      const direction = creep.pos.getDirectionTo(target);
      const oppositeDirection = (direction + 3) % 8 + 1;
      creep.move(oppositeDirection);
    }
  }

  return true;
};
```

### 3.3 Auto-Spawn Defenders

**Modify**: `src/prototype_room_my.js` - enhance `spawnDefender`

```javascript
Room.prototype.spawnDefender = function() {
  const {categorizeHostile} = require('./brain_intelligence');

  const hostiles = this.find(FIND_HOSTILE_CREEPS, {
    filter: (c) => !isFriend(c.owner.username) &&
                   !config.maliciousNpcUsernames.includes(c.owner.username)
  });

  if (hostiles.length === 0) {
    return;
  }

  // Categorize threats
  let hasScouts = false;
  let hasAttackers = false;
  let hasClaimers = false;

  for (const hostile of hostiles) {
    const category = categorizeHostile(hostile);
    if (category === 'SCOUT') hasScouts = true;
    if (category === 'ATTACKER' || category === 'FIGHTER') hasAttackers = true;
    if (category === 'CLAIMER') hasClaimers = true;
  }

  // Immediate response to claimers
  if (hasClaimers) {
    this.checkRoleToSpawn('defendranged', 3, undefined, this.name, 1, this.name);
    if (this.controller.safeModeAvailable > 0 && this.controller.level >= 3) {
      this.controller.activateSafeMode();
    }
    return;
  }

  // Spawn defenders based on threat
  if (this.memory.attackTimer > 15 || hasScouts) {
    if (this.executeEveryTicks(150)) {
      const role = hasAttackers ? 'defendmelee' : 'defendranged';
      const amount = hasAttackers ? 2 : 1;
      this.checkRoleToSpawn(role, amount, undefined, this.name, 1, this.name);
    }
  }
};
```

### 3.4 Testing Criteria for Phase 3
✅ Scouts are detected within 1 tick of entering owned rooms
✅ Reputation penalty applied to scout owners (-5 per scout)
✅ Defenders spawn automatically when scouts detected
✅ Defenders prioritize high-threat targets (claimers > attackers > scouts)
✅ Basic kiting works (defenders maintain 2-3 range from melee)
✅ Memory cleaned up for dead scouts

**Success Metrics**:
- Kill rate >80% on scouts entering owned territory
- Defender spawns within 150 ticks of scout detection
- No false positives (friendly creeps not attacked)

---

## Phase 4: Advanced Combat - Kiting & Focus Fire (Weeks 4-6)

**Goal**: Implement sophisticated combat tactics for defenders

### 4.1 Kiting Mechanics Module

**New File**: `src/combat_kiting.js`

```javascript
'use strict';

/**
 * Combat Kiting Module
 * Implements ranged kiting mechanics
 */

/**
 * Calculate ideal kiting position
 * @param {Creep} creep
 * @param {Creep} enemy
 * @param {number} idealRange - Ideal distance to maintain
 * @return {RoomPosition|null}
 */
function calculateKitePosition(creep, enemy, idealRange = 3) {
  const currentRange = creep.pos.getRangeTo(enemy);

  // Perfect range, don't move
  if (currentRange === idealRange) {
    return null;
  }

  // Too close, move away
  if (currentRange < idealRange) {
    const direction = creep.pos.getDirectionTo(enemy);
    const oppositeDirection = (direction + 3) % 8 + 1;
    return creep.pos.getAdjacentPosition(oppositeDirection);
  }

  // Too far, move closer
  if (currentRange > idealRange) {
    return enemy.pos;
  }

  return null;
}

/**
 * Predict enemy next position
 * @param {Creep} enemy
 * @return {RoomPosition}
 */
function predictEnemyPosition(enemy) {
  if (!Memory.enemyTracking) {
    Memory.enemyTracking = {};
  }

  const tracking = Memory.enemyTracking[enemy.id];

  if (!tracking || !tracking.lastPos) {
    // First time seeing this enemy, save position
    Memory.enemyTracking[enemy.id] = {
      lastPos: {x: enemy.pos.x, y: enemy.pos.y, roomName: enemy.pos.roomName},
      lastTick: Game.time
    };
    return enemy.pos;
  }

  // Calculate movement vector
  const dx = enemy.pos.x - tracking.lastPos.x;
  const dy = enemy.pos.y - tracking.lastPos.y;

  // Update tracking
  Memory.enemyTracking[enemy.id] = {
    lastPos: {x: enemy.pos.x, y: enemy.pos.y, roomName: enemy.pos.roomName},
    lastTick: Game.time
  };

  // Predict next position
  const predictedX = Math.max(0, Math.min(49, enemy.pos.x + dx));
  const predictedY = Math.max(0, Math.min(49, enemy.pos.y + dy));

  return new RoomPosition(predictedX, predictedY, enemy.pos.roomName);
}

/**
 * Execute kiting behavior
 * @param {Creep} creep
 * @param {Creep} enemy
 * @return {boolean} - True if kiting was executed
 */
function executeKiting(creep, enemy) {
  const predictedPos = predictEnemyPosition(enemy);
  const currentRange = creep.pos.getRangeTo(enemy);

  // Determine if enemy is melee threat
  const isMeleeThreat = enemy.getActiveBodyparts(ATTACK) > 0 &&
                       enemy.getActiveBodyparts(RANGED_ATTACK) === 0;

  const idealRange = isMeleeThreat ? 3 : 2;

  // Attack
  if (currentRange <= 3) {
    creep.rangedAttack(enemy);
  } else {
    creep.rangedMassAttack();
  }

  // Movement
  if (currentRange < idealRange) {
    // Too close, flee
    const direction = creep.pos.getDirectionTo(enemy);
    const oppositeDirection = (direction + 3) % 8 + 1;
    creep.move(oppositeDirection);
    return true;
  } else if (currentRange > idealRange + 1) {
    // Too far, chase (but not too aggressively)
    if (currentRange <= 5) {
      creep.moveTo(enemy);
    }
    return true;
  }

  // At ideal range, hold position or adjust slightly
  return true;
}

/**
 * Clean up old enemy tracking
 */
function cleanupEnemyTracking() {
  if (!Memory.enemyTracking) return;

  for (const enemyId in Memory.enemyTracking) {
    const tracking = Memory.enemyTracking[enemyId];
    if (Game.time - tracking.lastTick > 20) {
      delete Memory.enemyTracking[enemyId];
    }
  }
}

module.exports = {
  calculateKitePosition,
  predictEnemyPosition,
  executeKiting,
  cleanupEnemyTracking
};
```

### 4.2 Focus Fire Coordination

**New File**: `src/combat_focus_fire.js`

```javascript
'use strict';

const {calculateThreatLevel} = require('./brain_intelligence');

/**
 * Focus Fire Coordinator
 * Ensures multiple defenders attack same target
 */

/**
 * Select optimal focus fire target for a room
 * @param {Room} room
 * @param {array} attackers - Friendly attacking creeps
 * @param {array} enemies - Hostile creeps
 * @return {Creep|null}
 */
function selectFocusTarget(room, attackers, enemies) {
  if (!room.data.focusFire) {
    room.data.focusFire = {
      target: null,
      assignedTick: 0
    };
  }

  const ff = room.data.focusFire;

  // Check if current target still valid
  if (ff.target && Game.getObjectById(ff.target)) {
    const target = Game.getObjectById(ff.target);
    if (target && target.hits > 0 && Game.time - ff.assignedTick < 5) {
      return target;
    }
  }

  // Select new target
  if (enemies.length === 0) {
    ff.target = null;
    return null;
  }

  // Calculate combined DPS of attackers
  const totalDPS = attackers.reduce((dps, attacker) => {
    const rangedParts = attacker.getActiveBodyparts(RANGED_ATTACK);
    const attackParts = attacker.getActiveBodyparts(ATTACK);
    return dps + (rangedParts * 10) + (attackParts * 30);
  }, 0);

  // Score enemies
  const scoredEnemies = enemies.map(enemy => {
    const threat = calculateThreatLevel(enemy, room);
    const timeToKill = enemy.hits / totalDPS;

    // Prefer: High threat, Low time-to-kill
    const score = threat / (timeToKill + 0.1);

    return {
      enemy: enemy,
      threat: threat,
      timeToKill: timeToKill,
      score: score
    };
  });

  scoredEnemies.sort((a, b) => b.score - a.score);

  ff.target = scoredEnemies[0].enemy.id;
  ff.assignedTick = Game.time;

  return scoredEnemies[0].enemy;
}

/**
 * Get room's current focus target
 * @param {Room} room
 * @return {Creep|null}
 */
function getFocusTarget(room) {
  if (!room.data.focusFire || !room.data.focusFire.target) {
    return null;
  }

  const target = Game.getObjectById(room.data.focusFire.target);
  if (!target || target.hits <= 0) {
    return null;
  }

  return target;
}

module.exports = {
  selectFocusTarget,
  getFocusTarget
};
```

### 4.3 Enhanced Ranged Defender with Kiting & Focus Fire

**Modify**: `src/role_defendranged.js`

```javascript
'use strict';

const {executeKiting} = require('./combat_kiting');
const {selectFocusTarget, getFocusTarget} = require('./combat_focus_fire');
const {isFriend} = require('./brain_squadmanager');

roles.defendranged = {};

roles.defendranged.settings = {
  layoutString: 'RM',
  amount: [1, 1],
  maxLayoutAmount: 25,
  fillTough: true,
};

/**
 * Enhanced action with kiting and focus fire
 */
const action = function(creep) {
  creep.memory.countdown = creep.memory.countdown || 100;

  // Self-heal
  if (creep.hits < creep.hitsMax) {
    creep.heal(creep);
  }

  const recycleCreep = function(creep) {
    creep.say('recycle');
    if (creep.room.isMy()) {
      if (creep.memory.countdown > 0) {
        creep.memory.countdown -= 1;
        creep.say('rnd');
        creep.moveRandom();
        return false;
      }
    }
    return Creep.recycleCreep(creep);
  };

  let hostiles = creep.room.find(FIND_HOSTILE_CREEPS, {
    filter: (c) => !isFriend(c.owner.username)
  });

  if (hostiles.length === 0) {
    if (recycleCreep(creep)) {
      return true;
    }
    creep.waitRampart();
    return true;
  }

  creep.memory.countdown = 100;

  // Find all friendly defenders
  const defenders = creep.room.find(FIND_MY_CREEPS, {
    filter: (c) => c.memory.role === 'defendranged' || c.memory.role === 'defender'
  });

  // Select focus target
  const target = selectFocusTarget(creep.room, defenders, hostiles) || hostiles[0];

  creep.memory.target = target.pos;

  // Try rampart combat first
  if (creep.fightRampart(target)) {
    creep.say('rampart');
    return true;
  }

  // Execute kiting behavior
  creep.say('kite');
  executeKiting(creep, target);

  return true;
};

roles.defendranged.action = action;
```

### 4.4 Testing Criteria for Phase 4
✅ Kiting maintains 3-tile distance from melee enemies
✅ Focus fire coordinates 2+ defenders on same target
✅ Defenders kill enemies 30%+ faster with focus fire vs without
✅ Kiting creeps survive 50%+ longer than non-kiting
✅ Enemy position prediction works (checked via debug logs)
✅ Focus target switches when current dies

**Success Metrics**:
- Win rate >90% against equal-sized melee forces
- Win rate >70% against equal-sized ranged forces
- <20% defender casualties in successful defenses

---

## Phase 5: Quad Formations & Squad Coordination (Weeks 6-8)

**Goal**: Implement advanced squad tactics with quad formations

### 5.1 Quad Formation System

**New File**: `src/combat_quad_formation.js`

```javascript
'use strict';

/**
 * Quad Formation Module
 * Manages 4-creep coordinated movement and combat
 */

/**
 * Check if quad is intact (all within 1 tile)
 * @param {array} creeps - Array of 4 creeps
 * @return {boolean}
 */
function isQuadIntact(creeps) {
  if (creeps.length !== 4) return false;

  for (let i = 0; i < creeps.length; i++) {
    for (let j = i + 1; j < creeps.length; j++) {
      if (creeps[i].pos.getRangeTo(creeps[j]) > 1) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Get quad leader (top-left creep)
 * @param {array} creeps
 * @return {Creep}
 */
function getQuadLeader(creeps) {
  return creeps.reduce((leader, creep) => {
    if (creep.pos.y < leader.pos.y) return creep;
    if (creep.pos.y === leader.pos.y && creep.pos.x < leader.pos.x) return creep;
    return leader;
  });
}

/**
 * Calculate move order to prevent blocking
 * @param {array} creeps
 * @param {number} direction
 * @return {array} - Ordered creeps
 */
function calculateMoveOrder(creeps, direction) {
  switch(direction) {
    case RIGHT:
    case BOTTOM_RIGHT:
    case TOP_RIGHT:
      return creeps.sort((a, b) => b.pos.x - a.pos.x);
    case LEFT:
    case BOTTOM_LEFT:
    case TOP_LEFT:
      return creeps.sort((a, b) => a.pos.x - b.pos.x);
    case BOTTOM:
      return creeps.sort((a, b) => b.pos.y - a.pos.y);
    case TOP:
      return creeps.sort((a, b) => a.pos.y - b.pos.y);
    default:
      return creeps;
  }
}

/**
 * Move quad formation
 * @param {array} creeps
 * @param {RoomPosition} target
 * @return {boolean} - Success
 */
function moveQuad(creeps, target) {
  if (!isQuadIntact(creeps)) {
    // Reform - all move to leader
    const leader = getQuadLeader(creeps);
    for (const creep of creeps) {
      if (creep.id !== leader.id) {
        creep.moveTo(leader);
      }
    }
    return false;
  }

  const leader = getQuadLeader(creeps);
  const direction = leader.pos.getDirectionTo(target);

  // Calculate move order
  const orderedCreeps = calculateMoveOrder(creeps, direction);

  // Move in order
  for (const creep of orderedCreeps) {
    creep.move(direction);
  }

  return true;
}

/**
 * Quad combat - focus fire
 * @param {array} creeps
 * @param {Creep} target
 */
function quadCombat(creeps, target) {
  const rangedCreeps = creeps.filter(c => c.getActiveBodyparts(RANGED_ATTACK) > 0);
  const healers = creeps.filter(c => c.getActiveBodyparts(HEAL) > 0);

  // All ranged attack same target
  for (const creep of rangedCreeps) {
    const range = creep.pos.getRangeTo(target);
    if (range <= 3) {
      creep.rangedAttack(target);
    } else {
      creep.rangedMassAttack();
    }
  }

  // Healers heal most wounded
  if (healers.length > 0) {
    const wounded = creeps.reduce((most, creep) => {
      const hpPercent = creep.hits / creep.hitsMax;
      const mostPercent = most.hits / most.hitsMax;
      return hpPercent < mostPercent ? creep : most;
    });

    for (const healer of healers) {
      if (healer.pos.isNearTo(wounded)) {
        healer.heal(wounded);
      } else {
        healer.rangedHeal(wounded);
      }
    }
  }
}

/**
 * Check if quad should retreat
 * @param {array} creeps
 * @return {boolean}
 */
function shouldQuadRetreat(creeps) {
  const avgHP = creeps.reduce((sum, c) => sum + (c.hits / c.hitsMax), 0) / creeps.length;
  return avgHP < 0.4;
}

module.exports = {
  isQuadIntact,
  getQuadLeader,
  moveQuad,
  quadCombat,
  shouldQuadRetreat
};
```

### 5.2 Enhanced Squad Manager

**Modify**: `src/brain_squadmanager.js` - Add quad formation support

```javascript
// Add after existing code

const {moveQuad, quadCombat, shouldQuadRetreat, isQuadIntact} = require('./combat_quad_formation');

/**
 * Start a quad formation squad
 * @param {string} roomFrom
 * @param {string} roomTarget
 */
function startQuadSquad(roomFrom, roomTarget) {
  const name = 'quadsquad-' + Math.random();
  const route = Game.map.findRoute(roomFrom, roomTarget);
  let target = roomFrom;
  if (route.length > 1) {
    target = route[route.length - 2].room;
  }

  Memory.squads = Memory.squads || {};

  // Spawn 2 ranged + 2 healers
  const quadSpawns = [
    {creeps: 2, role: 'defendranged'},
    {creeps: 2, role: 'squadheal'}
  ];

  addToQueue(quadSpawns, roomFrom, roomTarget, name);

  Memory.squads[name] = {
    born: Game.time,
    type: 'quad',
    target: roomTarget,
    from: roomFrom,
    ranged: {},
    heal: {},
    route: route,
    action: 'move',
    moveTarget: target
  };
}
module.exports.startQuadSquad = startQuadSquad;

/**
 * Manage quad squads
 */
function handleQuadSquads() {
  for (const squadName in Memory.squads) {
    const squad = Memory.squads[squadName];
    if (squad.type !== 'quad') continue;

    // Get all squad creeps
    const creeps = [];
    for (const creepId in squad.ranged) {
      const creep = Game.getObjectById(creepId);
      if (creep) creeps.push(creep);
    }
    for (const creepId in squad.heal) {
      const creep = Game.getObjectById(creepId);
      if (creep) creeps.push(creep);
    }

    if (creeps.length === 0) {
      delete Memory.squads[squadName];
      continue;
    }

    // Check if all 4 creeps present
    if (creeps.length < 4) {
      // Wait for full squad
      continue;
    }

    // Check if should retreat
    if (shouldQuadRetreat(creeps)) {
      squad.action = 'retreat';
    }

    // Execute based on action
    if (squad.action === 'move') {
      const target = new RoomPosition(25, 25, squad.moveTarget);
      moveQuad(creeps, target);

      // Check if reached target room
      if (creeps[0].room.name === squad.target) {
        squad.action = 'attack';
      }
    } else if (squad.action === 'attack') {
      const room = creeps[0].room;
      const hostiles = room.find(FIND_HOSTILE_CREEPS);

      if (hostiles.length > 0) {
        quadCombat(creeps, hostiles[0]);
        moveQuad(creeps, hostiles[0].pos);
      } else {
        // Attack structures
        const structures = room.find(FIND_HOSTILE_STRUCTURES, {
          filter: (s) => s.structureType !== STRUCTURE_CONTROLLER &&
                        s.structureType !== STRUCTURE_KEEPER_LAIR
        });
        if (structures.length > 0) {
          moveQuad(creeps, structures[0].pos);
        }
      }
    } else if (squad.action === 'retreat') {
      const safeRoom = squad.from;
      const target = new RoomPosition(25, 25, safeRoom);
      moveQuad(creeps, target);

      // Heal while retreating
      for (const creep of creeps) {
        if (creep.getActiveBodyparts(HEAL) > 0) {
          const wounded = creeps.reduce((most, c) => {
            return (c.hits / c.hitsMax) < (most.hits / most.hitsMax) ? c : most;
          });
          if (creep.pos.isNearTo(wounded)) {
            creep.heal(wounded);
          } else {
            creep.rangedHeal(wounded);
          }
        }
      }
    }
  }
}

// Add to existing handleSquadManager export
const originalHandleSquadManager = module.exports.handleSquadManager;
module.exports.handleSquadManager = function() {
  originalHandleSquadManager();
  handleQuadSquads();
};
```

### 5.3 Testing Criteria for Phase 5
✅ Quad maintains formation (all within 1 tile) while moving
✅ Quad reforms when broken (creeps converge on leader)
✅ Quad attacks single target with all ranged creeps
✅ Healers prioritize most wounded squad member
✅ Quad retreats when average HP <40%
✅ Quad successfully navigates to target room

**Success Metrics**:
- Quad formation maintained >90% of time while moving
- Quad kills equivalent force with <30% casualties
- Quad successfully completes room siege against weak defense (no towers)

---

## Phase 6: Integration & Polish (Weeks 8-10)

**Goal**: Integrate all systems and add finishing touches

### 6.1 Dynamic CPU Allocation

**New File**: `src/brain_cpu_manager.js`

```javascript
'use strict';

/**
 * CPU Management Brain
 * Dynamically allocates CPU based on peace/war state
 */

const CPU_MODES = {
  PEACE: 'PEACE',       // 60-80% CPU usage, bank the rest
  DEFENSE: 'DEFENSE',   // 90-95% CPU usage
  WAR: 'WAR',           // 100% CPU usage + bucket
  CRITICAL: 'CRITICAL'  // <20% CPU, emergency mode
};

/**
 * Determine current CPU mode
 * @return {string}
 */
function getCPUMode() {
  const bucket = Game.cpu.bucket;

  // Critical mode if bucket too low
  if (bucket < 2000) {
    return CPU_MODES.CRITICAL;
  }

  // Check for active combat
  let underAttack = false;
  let attackingOthers = false;

  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    if (!room) continue;

    if (room.memory.attackTimer && room.memory.attackTimer > 10) {
      underAttack = true;
    }
  }

  if (Memory.squads && Object.keys(Memory.squads).length > 0) {
    attackingOthers = true;
  }

  if (underAttack) return CPU_MODES.DEFENSE;
  if (attackingOthers) return CPU_MODES.WAR;
  return CPU_MODES.PEACE;
}

/**
 * Get CPU budget for this tick
 * @return {number}
 */
function getCPUBudget() {
  const mode = getCPUMode();
  const limit = Game.cpu.limit;

  switch(mode) {
    case CPU_MODES.CRITICAL:
      return limit * 0.5;  // Conserve CPU
    case CPU_MODES.PEACE:
      return limit * 0.75; // Bank CPU
    case CPU_MODES.DEFENSE:
      return limit * 0.95;
    case CPU_MODES.WAR:
      return Math.min(500, limit * 1.5); // Use bucket
    default:
      return limit;
  }
}

/**
 * Check if operation should be skipped to save CPU
 * @param {string} operation - Operation name
 * @return {boolean}
 */
function shouldSkipOperation(operation) {
  const mode = getCPUMode();
  const cpuUsed = Game.cpu.getUsed();
  const budget = getCPUBudget();

  // Always skip if over budget
  if (cpuUsed > budget * 0.95) {
    return true;
  }

  // Skip non-critical operations in CRITICAL mode
  if (mode === CPU_MODES.CRITICAL) {
    const criticalOps = ['spawning', 'defense', 'harvesting'];
    return !criticalOps.includes(operation);
  }

  // Skip optimization tasks during combat
  if (mode === CPU_MODES.DEFENSE || mode === CPU_MODES.WAR) {
    const combatSkipOps = ['market', 'visualization', 'stats'];
    return combatSkipOps.includes(operation);
  }

  return false;
}

/**
 * Log CPU status
 */
function logCPUStatus() {
  const mode = getCPUMode();
  const used = Game.cpu.getUsed();
  const budget = getCPUBudget();
  const bucket = Game.cpu.bucket;

  if (config.debug.cpu) {
    console.log(`[CPU] Mode: ${mode} | Used: ${used.toFixed(1)}/${budget.toFixed(1)} | Bucket: ${bucket}`);
  }
}

module.exports = {
  getCPUMode,
  getCPUBudget,
  shouldSkipOperation,
  logCPUStatus,
  CPU_MODES
};
```

### 6.2 Aggressive Diplomacy Settings

**Modify**: `src/diplomacy.js`

```javascript
// Modify getAttackAction to be more aggressive

function getAttackAction(player) {
  const actions = [
    {
      name: 'simpleAttack',
      value: -1 * 500,  // Attack sooner (was -1500)
      level: 0,
      execute: (roomPair) => {
        const origin = Game.rooms[roomPair.myRoomName];
        origin.checkRoleToSpawn('autoattackmelee', 1, undefined, roomPair.theirRoomName);
      },
    },
    {
      name: 'squad',
      value: -2 * 500,  // Send squads earlier (was -4*1500)
      level: 1,
      execute: (roomPair) => {
        startSquad(roomPair.myRoomName, roomPair.theirRoomName);
      },
    },
    {
      name: 'quadSquad',
      value: -4 * 500,  // NEW: Quad squads
      level: 2,
      execute: (roomPair) => {
        const {startQuadSquad} = require('./brain_squadmanager');
        startQuadSquad(roomPair.myRoomName, roomPair.theirRoomName);
      },
    },
    {
      name: 'attack42',
      value: -6 * 500,  // Full assault (was -6*1500)
      level: 3,
      execute: (roomPair) => {
        startMeleeSquad(roomPair.myRoomName, roomPair.theirRoomName);
      },
    },
  ];
  // ... rest of function
}
```

### 6.3 Final Config Tweaks

**Modify**: `src/config.js` - Final aggressive settings

```javascript
config = {
  // ... existing config ...

  autoAttack: {
    notify: true,
    minAttackRCL: 4,           // Attack earlier (was 6)
    timeBetweenAttacks: 500,   // Attack more frequently (was 2000)
    noReservedRoomMinMyRCL: 4, // (was 5)
    noReservedRoomInRange: 2,  // (was 1)
    noReservedRoomInterval: 800, // More frequent (was 1600)
  },

  // Add new sections
  combat: {
    kitingEnabled: true,
    focusFireEnabled: true,
    quadFormationsEnabled: true,
    scoutKillingEnabled: true,
    autoDefendEnabled: true,
  },

  expansion: {
    aggressive: true,
    minEconomyStatus: 'HEALTHY',  // From brain_economy
    maxSimultaneousClaims: 2,
    prioritizeAdjacent: true,
  },
};
```

### 6.4 Master Integration in brain_main.js

**Modify**: `src/brain_main.js`

```javascript
// Add requires at top
const {cleanupEnemyTracking} = require('./combat_kiting');
const {logCPUStatus, shouldSkipOperation} = require('./brain_cpu_manager');

// Modify execute function
module.exports.execute = function() {
  // ... existing CPU bucket check ...

  Memory.time = Game.time;

  try {
    prepareMemory();
    brain.evaluateEconomy();        // Phase 1
    brain.detectScouts();           // Phase 3
    brain.manageRemoteMining();     // Phase 2
    brain.buyPower();
    brain.handleNextroomer();       // Enhanced Phase 2
    handleSquadManager();           // Enhanced Phase 5
    brain.handleIncomingTransactions();

    // Skip quests if under CPU pressure
    if (!shouldSkipOperation('quests')) {
      handleQuests();
    }

    checkPlayers();
    cleanupEnemyTracking();         // Phase 4
    logCPUStatus();                 // Phase 6
  } catch (e) {
    console.log('Brain Exception', e.stack);
  }

  brain.stats.addRoot();
  executeRooms();

  // Skip visualization if CPU constrained
  if (!shouldSkipOperation('visualization')) {
    visualizeRooms();
  }

  updateSkippedRoomsLog();
  brain.stats.add(['cpu'], {
    used: Game.cpu.getUsed(),
  });

  // ... existing GCL/bucket logging ...
};
```

### 6.5 Testing Criteria for Phase 6
✅ CPU mode switches correctly (PEACE/DEFENSE/WAR/CRITICAL)
✅ CPU budget respected (not consistently over limit)
✅ Diplomacy triggers quad squads at correct reputation threshold
✅ All systems work together without conflicts
✅ No critical bugs during 10k tick run
✅ Bucket maintains >5000 during peace, >3000 during war

**Success Metrics**:
- Claim 5+ rooms by tick 150k
- Win rate >80% in defensive battles
- Successfully conduct offensive room siege
- CPU bucket stays >3000 consistently
- No script errors during 20k tick run

---

## Testing Strategy

### Unit Testing (Per Phase)
1. Create test functions in `src/test/`
2. Test each module independently
3. Verify edge cases
4. Use private server for rapid iteration

### Integration Testing
1. Run full bot on private server
2. Simulate attacks with secondary bot
3. Monitor for 20k+ ticks
4. Check Memory usage, CPU usage, bucket levels

### Performance Testing
1. Measure CPU per module
2. Profile with screeps-profiler if needed
3. Optimize hotspots (reduce lookups, cache more)

---

## Rollback Plan

Each phase is independent. If a phase fails:
1. Comment out new code
2. Revert config changes
3. Test previous phase
4. Debug and retry

Store backups in git branches: `phase-1`, `phase-2`, etc.

---

## Success Criteria - Final

After Phase 6 completion, the bot should:

✅ **Economy**: Maintain 100k+ energy in storage across 5+ rooms
✅ **Expansion**: Control 8+ rooms by Week 10
✅ **Combat**: Win >85% of defensive engagements
✅ **Intelligence**: Kill >90% of scouts entering territory
✅ **Squads**: Successfully siege weak enemy rooms
✅ **CPU**: Maintain bucket >4000 during normal operations
✅ **Reputation**: Feared by neighbors (they avoid your borders)

---

## Next Steps Beyond Phase 6

Once the roadmap is complete, consider:
- **Boosted Combat**: Use labs to boost attack creeps
- **Power Processing**: Leverage power creeps
- **Market Dominance**: Automated trading for strategic advantage
- **Nuke Capability**: Ultimate offensive weapon
- **Multi-Room Coordinated Attacks**: 3+ rooms attacking single target

---

**This roadmap transforms your bot from cautious to aggressive while maintaining stability and testability. Each phase builds on previous work, allowing you to pivot if needed. Good luck, and may you dominate the server!**
