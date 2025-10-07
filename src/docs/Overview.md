# Screeps Aggressive Bot - Project Overview

## Game Description

**Screeps** is a massively multiplayer online real-time strategy (MMO RTS) game for programmers where you control your colony entirely through JavaScript code. Your scripts run 24/7, managing creeps (units), building structures, gathering resources, and competing against other players. The game runs in **ticks** (server cycles), and your code executes every tick with a **CPU limit**, making efficiency critical.

### Core Game Mechanics

**Territory & Expansion**
- World divided into **rooms** connected by exits
- Each room has one **Room Controller** that can be claimed
- **Room Control Level (RCL)** 0-8 unlocks features as you upgrade
- Higher RCL = more structures, bigger creeps, more power

**Resources & Economy**
- **Energy** is the primary resource for spawning, building, and upgrading
- **Sources** regenerate energy every 300 ticks
- **Minerals** (H, O, U, L, K, Z, X) for boosting and advanced production
- **Storage**, **Containers**, and **Links** manage resource logistics

**Combat System**
- **Creep body parts**: ATTACK (melee), RANGED_ATTACK (ranged), HEAL (healing), TOUGH (HP buffer)
- **Structures**: Towers (automatic defense), Walls, Ramparts (defense)
- **Tactics**: Kiting, focus fire, squad formations, strategic positioning
- Creeps live 1500 ticks unless renewed

---

## Current State: TooAngel Framework

Your bot is built on the **TooAngel skeleton**, a mature open-source Screeps codebase with:

### Existing Systems
✅ **Brain System** - Multi-room coordination and management  
✅ **Role-based Architecture** - Modular creep roles (harvester, builder, defender, etc.)  
✅ **Diplomacy Module** - Tracks player behavior and assigns aggression ratings  
✅ **Squad Management** - Siege squads, melee squads, and heal squads  
✅ **Room Claiming** - Automated expansion with `claimer` and `nextroomer` roles  
✅ **Defense System** - Tower automation, defender creeps, and rampart building  
✅ **Auto-Attack Logic** - Retaliation system based on player ratings  
✅ **Efficient Pathfinding** - Cached paths and cost matrices  

### Current Behavior
- **Reactive Defense**: Responds to attacks but doesn't proactively dominate territory
- **Moderate Expansion**: Claims new rooms when ready but not aggressively
- **Diplomatic Stance**: Rates players and only attacks if provoked
- **Resource Focus**: Prioritizes economic growth over territorial dominance

---

## Project Goals: Aggressive Territorial Domination

### Vision: Become Like "Tigga"

Tigga is a hyper-aggressive bot that has conquered most of the server through:
- **Relentless expansion** - Claims territory faster than opponents can respond
- **Sophisticated combat** - Quad attackers, kiting, tactical retreats
- **Territory denial** - Keeps out scouts, invaders, and competitors
- **Strategic aggression** - Knows when to fight and when to build

### Your Bot's Evolution Path

#### Phase 1: Foundation Building (CURRENT PRIORITY)
**Goal**: Establish a strong home base before engaging in combat

- **Economic Stability**
  - Maximize energy harvesting efficiency in home room
  - Build Storage (RCL 4) for resource reserves
  - Construct Links (RCL 5+) for efficient energy distribution
  - Maintain 50k+ energy reserves before aggressive actions

- **Infrastructure Development**
  - Complete road networks between key structures
  - Build and maintain 3+ towers for defense
  - Fortify ramparts around critical structures (spawn, storage, towers)
  - Establish container-based energy distribution

- **Early Expansion**
  - Claim 1-2 adjacent rooms with 2+ energy sources
  - Focus on rooms with strategic positions (corner rooms, defensible chokepoints)
  - Build basic infrastructure in new rooms (spawn, extensions, towers)

**DO NOT** engage in offensive operations until home base is at RCL 5+ with stable economy.

---

#### Phase 2: Aggressive Expansion (MID-GAME)
**Goal**: Rapidly claim adjacent territory and establish forward bases

- **Territory Claiming Strategy**
  - Identify high-value rooms (3 sources, center rooms, mineral types needed)
  - Send claimer + nextroomer + defender escorts
  - Build spawn immediately and establish minimal defense
  - Claim rooms faster than opponents can respond

- **Scout Targeting**
  - Detect enemy scouts entering your rooms or adjacent territories
  - Deploy defender creeps to eliminate scouts before they report back
  - Maintain vision control with your own scouting network

- **Invader Management**
  - Auto-spawn defenders when NPC invaders appear
  - Keep invaders away from critical structures
  - Use towers + defender creeps for efficient elimination

- **Buffer Zones**
  - Reserve rooms between your bases and competitors
  - Send attackunreserve creeps to clear hostile reservations
  - Maintain reserver creeps in strategic buffer rooms

---

#### Phase 3: Sophisticated Combat (LATE-GAME)
**Goal**: Deploy advanced attack formations and dominate contested areas

- **Quad Attackers Implementation**
  - 4 creeps moving as a coordinated unit
  - Formation: 2 RANGED_ATTACK + 2 HEAL creeps
  - Synchronized movement to maintain squad cohesion
  - Focus fire on single targets for rapid elimination

- **Kiting Mechanics**
  - Ranged creeps maintain 3-tile distance from melee attackers
  - Calculate enemy movement and pre-position accordingly
  - Use terrain (ramparts, swamps) to slow melee enemies
  - Continuously deal damage while retreating

- **Tactical Retreat Logic**
  - Monitor creep HP (retreat if below 60% health)
  - Fall back to friendly ramparts or towers
  - Heal while covered by tower fire
  - Re-engage once at full health

- **Target Prioritization**
  - High threat: Attackers and ranged attackers
  - Medium threat: Healers (eliminate to cripple enemy squads)
  - Low threat: Workers and carriers
  - Strategic targets: Enemy spawns and towers

- **Room Sieging**
  - Deploy squadsiege creeps with WORK parts to dismantle structures
  - Protect siege units with heal squads
  - Target spawn, towers, storage in that order
  - Maintain supply lines for prolonged sieges

---

## Technical Requirements & Architecture

### Scaling Strategy

**Multi-Room Coordination**
- Brain system manages all rooms centrally
- Distribute CPU usage across rooms based on priority
- Remote mining from adjacent rooms to home bases
- Shared defense resources when rooms are under attack

**Dynamic Spawning**
- Scale creep bodies based on available energy (300 → 3000+)
- Adjust spawn priorities based on threat level
- Emergency spawning when critical roles are missing
- Queue system for efficient spawn utilization

**Performance Optimization**
- Keep code execution under CPU limits
- Cache expensive calculations (pathfinding, room scans)
- Use `Game.cpu.getUsed()` to profile bottlenecks
- Minimize per-tick operations for idle creeps

### Combat AI Improvements

**Existing Systems to Enhance**
1. **diplomacy.js** - Currently tracks player ratings
   - **Modification**: Lower aggression threshold for attack decisions
   - **Addition**: Proactively rate nearby players as "hostile" to justify attacks
   - **Enhancement**: Track territorial expansion patterns, not just attacks

2. **brain_squadmanager.js** - Has squad logic but underutilized
   - **Expansion**: Add quad formation movement logic
   - **Addition**: Sophisticated targeting algorithms
   - **Enhancement**: Dynamic squad composition based on enemy composition

3. **role_defender.js / role_attackunreserve.js** - Basic combat roles
   - **Improvement**: Implement kiting behavior for ranged defenders
   - **Addition**: Flee logic when outmatched
   - **Enhancement**: Focus fire coordination between multiple defenders

4. **prototype_room_defense.js** - Tower management
   - **Optimization**: Better target prioritization for towers
   - **Addition**: Coordinate tower fire with defender creeps
   - **Enhancement**: Energy reservation for emergency defense

### New Systems to Build

**Advanced Combat Formations**
```javascript
// Pseudo-code structure
class QuadFormation {
  constructor(creeps) {
    this.rangedAttackers = creeps.filter(c => c.role === 'rangedAttacker');
    this.healers = creeps.filter(c => c.role === 'healer');
  }
  
  maintainFormation() {
    // Keep creeps within 1 tile of each other
  }
  
  kiteEnemies(enemies) {
    // Calculate safe position 3 tiles from nearest melee enemy
    // Move formation while attacking
  }
  
  focusFire(target) {
    // All ranged attackers target same enemy
  }
}
```

**Territorial Intelligence**
```javascript
// Track room ownership, military presence, expansion patterns
class TerritoryAnalyzer {
  identifyExpansionTargets() {
    // Find undefended rooms near your territory
  }
  
  assessThreatLevel(room) {
    // Count enemy towers, defenders, fortifications
  }
  
  planAttackRoute(from, to) {
    // Find path avoiding heavily defended rooms
  }
}
```

**Dynamic Decision Making**
```javascript
// Decide between building economy vs. attacking
if (totalEnergy > 50000 && rcl >= 5 && nearbyThreats === 0) {
  // Safe to launch offensive operations
  launchSquad(targetRoom);
} else if (totalEnergy < 20000 || underAttack) {
  // Focus on defense and economy
  spawnDefenders();
  fortifyBase();
}
```

---

## Development Roadmap

### Immediate Priorities (Phase 1)
1. ✅ Audit current TooAngel codebase capabilities
2. ⬜ Optimize home room layout and energy flow
3. ⬜ Implement adjacent room claiming automation
4. ⬜ Strengthen base defense (towers, ramparts, defenders)
5. ⬜ Establish 50k+ energy reserve threshold

### Mid-Term Goals (Phase 2)
1. ⬜ Modify diplomacy.js for aggressive stance
2. ⬜ Add scout detection and elimination system
3. ⬜ Implement buffer zone control with reservers
4. ⬜ Build automated expansion to 4-5 rooms

### Long-Term Goals (Phase 3)
1. ⬜ Develop quad formation movement system
2. ⬜ Implement kiting mechanics for ranged units
3. ⬜ Create tactical retreat and heal logic
4. ⬜ Build room siege capabilities
5. ⬜ Deploy multi-room coordinated attacks

---

## CPU Management & Allocation Strategy

### Understanding the CPU Bucket System

**Core Mechanics:**
- **Base CPU Limit**: Your account has a fixed CPU limit per tick (e.g., 20-300 depending on GCL and subscription)
- **CPU Bucket**: Accumulates unused CPU up to 10,000 maximum
- **Burst Capacity**: Can use up to 500 CPU in a single tick when bucket has accumulation
- **Bucket Math**: If you use 100 CPU but have 150 limit, 50 CPU goes into bucket each tick

**Strategic Implications:**
```javascript
// Example: You have 150 CPU limit
// Normal operation: Use ~120 CPU/tick → Bank 30 CPU/tick
// After 333 ticks: Bucket full (10,000 CPU)
// During attack: Spend 500 CPU for one tick of intensive calculations
```

### Dynamic CPU Allocation

**Peace-Time Priority (Bucket > 5000)**
```javascript
if (Game.cpu.bucket > 5000) {
  // Allocate CPU generously
  - 40% Room economy (harvesting, building, upgrading)
  - 30% Infrastructure (pathfinding, structure maintenance)
  - 20% Scouting and intelligence gathering
  - 10% Market operations and logistics
}
```

**War-Time Priority (Under Attack or Attacking)**
```javascript
if (isUnderAttack || isAttacking) {
  // Shift CPU allocation
  - 50% Combat operations (squad AI, targeting, kiting)
  - 25% Defense systems (tower management, rampart repair)
  - 15% Emergency spawning (defenders, healers)
  - 10% Critical economy (keep harvesters alive)
  
  // Skip non-critical operations
  - Pause market trading
  - Defer upgrader work
  - Skip remote mining
  - Reduce scouting frequency
}
```

**Critical Situation (Bucket < 2000)**
```javascript
if (Game.cpu.bucket < 2000) {
  // Emergency CPU conservation mode
  - Pause all offensive operations
  - Minimal defense (towers only)
  - Essential economy only
  - Cache all pathfinding aggressively
  - Skip visualization and stats
  
  // Let bucket recover before resuming operations
}
```

### CPU Optimization Techniques for Combat

**1. Pathfinding Caching**
```javascript
// Cache attack paths for entire squads
if (!Memory.attackPaths[targetRoom]) {
  const path = PathFinder.search(startPos, endPos, options);
  Memory.attackPaths[targetRoom] = {
    path: path.path,
    tick: Game.time,
    cost: path.cost
  };
}
// Reuse cached path for 100 ticks or until invalidated
```

**2. Lazy Evaluation**
```javascript
// Only calculate targeting when needed
class Squad {
  get targets() {
    if (!this._targets || Game.time > this._targetsCalculatedTick) {
      this._targets = this.findTargets(); // Expensive operation
      this._targetsCalculatedTick = Game.time;
    }
    return this._targets;
  }
}
```

**3. Batched Processing**
```javascript
// Process squads in batches when CPU allows
const squadsToProcess = Object.keys(Memory.squads);
const batchSize = Math.floor(Game.cpu.tickLimit / 10);
const startIndex = Game.time % squadsToProcess.length;
const batch = squadsToProcess.slice(startIndex, startIndex + batchSize);

batch.forEach(squadId => processSquad(squadId));
```

**4. Early Exit Patterns**
```javascript
// Stop processing if approaching CPU limit
function processRoom(room) {
  if (Game.cpu.getUsed() > Game.cpu.tickLimit * 0.9) {
    Memory.skippedRooms = Memory.skippedRooms || [];
    Memory.skippedRooms.push(room.name);
    return; // Skip this room, process next tick
  }
  // Continue with room logic...
}
```

### CPU Budget Per Operation

**Baseline Costs (approximate):**
- `PathFinder.search()`: 2-10 CPU (depending on distance)
- `Room.find()` with filters: 0.5-2 CPU
- `Creep.moveTo()`: 0.5-3 CPU (cached vs uncached)
- Tower attack/heal: 0.1 CPU per tower
- Squad AI (4 creeps): 1-3 CPU per tick
- Market operations: 0.5-1 CPU per transaction

**Combat Operation CPU Budget:**
```javascript
// Example: Managing 3 attack squads (12 creeps)
Base squad movement:     3 CPU
Target acquisition:      2 CPU
Formation maintenance:   2 CPU
Combat decisions:        3 CPU
Healing coordination:    2 CPU
Tower support:           1 CPU
------------------------
Total per tick:         13 CPU

// With 150 CPU limit, can sustain ~11 active squads simultaneously
// Or ~22 squads if you bank CPU and burst every other tick
```

---

## Advanced Combat Tactics & Scenarios

### Scenario 1: Attacking an Undefended Expanding Room (RCL 1-3)

**Characteristics:**
- Single spawn, few or no towers
- Limited ramparts and walls
- Minimal defender creeps
- Controller is vulnerable

**Attack Strategy:**
```
Phase 1: Scout Assessment
- Send observer or scout creep
- Identify spawn location and tower count
- Check for defender creeps
- Assess wall/rampart coverage

Phase 2: Strike Force Composition
- 2x Ranged Attackers (RANGED_ATTACK + MOVE + HEAL)
- 1x Melee Attacker (ATTACK + TOUGH + MOVE)
- Optional: 1x Healer (HEAL + MOVE)

Phase 3: Execution
1. Target spawn FIRST (prevents reinforcements)
   - Focus all ranged fire on spawn
   - Spawn has only 5,000 HP - dies quickly
2. Eliminate any defender creeps
3. Target controller (attackController to drain downgrade timer)
4. Claim room when controller goes neutral

Time to complete: 200-500 ticks
Risk level: LOW
```

### Scenario 2: Attacking a Developed Base (RCL 5-6)

**Characteristics:**
- 2+ Towers with good coverage
- Storage with energy reserves
- Ramparts protecting key structures
- Multiple defender creeps
- Terminal may be present

**Attack Strategy:**
```
Phase 1: Intelligence Gathering
- Observer reconnaissance every 50 ticks
- Map tower positions and ranges
- Identify weak points in rampart coverage
- Count defender creeps and estimate spawn rate
- Check storage energy levels

Phase 2: Strike Force Composition
- 4x Ranged Quad (formation of RANGED_ATTACK + HEAL + MOVE)
- 2x Siege Creeps (WORK for dismantling + TOUGH + MOVE)
- 2x Dedicated Healers (HEAL + MOVE)
- Consider boosting with:
  - UH (ATTACK boost)
  - KO (RANGED_ATTACK boost)
  - LO (HEAL boost)
  - XGHO2 (Fatigue reduction)

Phase 3: Execution - Multi-Stage Assault
STAGE 1: Establish Beachhead (100-200 ticks)
- Quad formation enters room
- Stay at edge, away from tower optimal range (>20 tiles)
- Kite and eliminate any defenders that approach
- Healers keep quad at full HP

STAGE 2: Tower Drain (200-500 ticks)
- Force towers to spend energy attacking quad
- Healers counter tower damage
- When tower energy depleted, advance

STAGE 3: Rampart Breach (100-300 ticks)
- Siege creeps dismantle ramparts protecting towers
- Quad provides cover fire
- Focus on creating path to towers

STAGE 4: Tower Elimination (50-100 ticks)
- Once ramparts down, focus fire on towers
- Towers have 3,000 HP each
- Eliminate all towers before proceeding

STAGE 5: Spawn Assault (100-200 ticks)
- With towers down, target spawns
- Each spawn: 5,000 HP
- Prevent creep reinforcements

STAGE 6: Storage Raid (50-100 ticks)
- Dismantle storage (30,000 HP)
- Plunder resources if you have carriers
- Or just deny enemy the resources

STAGE 7: Controller Attack (Variable)
- Use attackController to drain timer
- Claim when neutral

Time to complete: 600-1500 ticks (1-2 hours)
Risk level: MEDIUM
Energy cost: 50,000-100,000
```

### Scenario 3: Attacking a Fortress (RCL 8)

**Characteristics:**
- 6 Towers with overlapping coverage
- 3 Spawns for rapid reinforcement
- Multiple layers of ramparts (300M HP potential)
- Walls creating chokepoints
- Dedicated defender creeps with boosting
- Terminal, Observer, Nuker, Labs active
- Player is likely online and reacting

**Attack Strategy:**
```
Phase 1: Prolonged Intelligence
- Use your own terminal to trade for minerals
- Prepare boost production (T3 boosts)
- Observer surveillance for 1000+ ticks
- Identify defender spawn patterns
- Find weakest entry point

Phase 2: Resource Preparation
- Accumulate 200,000+ energy
- Produce T3 boosts:
  - XUH2O (ATTACK +300%)
  - XKHO2 (RANGED_ATTACK +300%)
  - XLHO2 (HEAL +300%)
  - XGHO2 (Fatigue reduction +300%)
- Have 2-3 rooms supporting the offensive

Phase 3: Strike Force Composition
WAVE 1 - Distraction Force (Expendable)
- 8x Cheap ranged creeps (draw tower fire)
- Goal: Drain tower energy and reveal defenses

WAVE 2 - Main Assault (Boosted)
- 8x Boosted Quad Formations (32 creeps total)
  - Each quad: 2 Ranged + 2 Healers
  - All creeps fully boosted
- 4x Boosted Siege Creeps (WORK parts for dismantling)
- 4x Additional boosted healers

WAVE 3 - Reinforcement (Staged)
- Ready to spawn replacements every 50 ticks
- Maintain pressure continuously

Phase 4: Execution - Sustained Siege
STAGE 1: Sacrifice Wave (100 ticks)
- Send distraction force
- They die, but drain tower energy (60 energy per tower attack)
- 6 towers × 1000 energy capacity = 6000 energy to drain
- Takes ~200 attacks = significant time

STAGE 2: Breach Point Selection (50 ticks)
- While towers recharge, scout creeps find weak rampart
- Avoid corners (tower fire concentrates)
- Look for rampart isolated from tower range

STAGE 3: Rampart Assault (500-2000 ticks)
- All quads focus fire on single rampart section
- Even 300M HP rampart falls to sustained fire
- 32 boosted ranged creeps × 150 damage/tick = 4800 damage/tick
- 300M HP ÷ 4800 = 62,500 ticks... that's not working
- WAIT - Use siege creeps with WORK parts!
- Boosted WORK dismantle: 50 HP per tick per part
- 4 siege creeps × 20 WORK parts × 50 HP = 4000 HP/tick
- 300M HP ÷ 4000 = 75,000 ticks = TOO LONG

REALITY CHECK: RCL 8 Fortress Alternative Strategy
- Don't breach ramparts directly
- Attack downgrade timer with attackController
- Each attack: -300 ticks from downgrade timer
- Force defender to constantly upgrade
- Economic warfare: drain their energy
- OR use Nuker if you have RCL 8 (destroy ramparts, towers)
- OR negotiate/diplomacy

Time to complete: WEEKS (not practical head-on)
Risk level: EXTREME
Better approach: Economic/diplomatic warfare, nukes, or asymmetric tactics
```

### Scenario 4: Defensive Response - You're Under Attack

**Immediate Actions (0-10 ticks):**
```javascript
// Shift CPU to defense mode immediately
Memory.defenseMode = true;

// Emergency spawning
if (room.energyAvailable > 1000) {
  spawn.spawnCreep(
    [RANGED_ATTACK, RANGED_ATTACK, HEAL, HEAL, MOVE, MOVE],
    'emergency_defender_' + Game.time
  );
}

// Tower focus fire
const hostiles = room.find(FIND_HOSTILE_CREEPS);
const priority = hostiles.sort((a, b) => 
  calculateThreat(b) - calculateThreat(a)
)[0];
towers.forEach(tower => tower.attack(priority));

// Activate safe mode if critical (last resort)
if (spawns[0].hits < 1000 && room.controller.safeModeAvailable) {
  room.controller.activateSafeMode();
}
```

**Short-Term Response (10-100 ticks):**
- Spawn additional defenders
- Pull remote miners back to defend
- Emergency rampart construction around spawn
- Tower energy prioritization (fill towers over storage)
- Rally defenders to chokepoints

**Medium-Term Response (100-1000 ticks):**
- Assess attacker strength and strategy
- Spawn counter-composition (healers if they have ranged, melee if weak)
- Request reinforcements from other owned rooms
- Build emergency fortifications
- If overwhelmed: evacuate energy via carriers to other rooms

**Long-Term Response (1000+ ticks):**
- Launch counter-offensive against attacker's base
- Fortify weak points identified in the attack
- Improve rampart HP in critical areas
- Enhance defender spawn queue for future attacks

---

## Adaptive Combat Decisions

### Target Prioritization Algorithm

```javascript
function calculateThreatScore(creep) {
  let threat = 0;
  
  // Body part threats
  threat += countParts(creep, ATTACK) * 80;
  threat += countParts(creep, RANGED_ATTACK) * 100;
  threat += countParts(creep, HEAL) * 120; // Healers enable others
  threat += countParts(creep, WORK) * 60; // Siege capability
  threat += countParts(creep, CLAIM) * 200; // Controller threat
  
  // Position threats
  if (creep.pos.getRangeTo(spawn) < 5) threat += 200;
  if (creep.pos.getRangeTo(tower) < 5) threat += 150;
  if (creep.pos.getRangeTo(storage) < 10) threat += 100;
  
  // HP consideration (prioritize wounded)
  threat *= (creep.hits / creep.hitsMax);
  
  return threat;
}

// Focus fire on highest threat
const target = hostiles.reduce((max, creep) => 
  calculateThreatScore(creep) > calculateThreatScore(max) ? creep : max
);
```

### Formation Adaptation

**Against Melee-Heavy Enemy:**
- Use ranged kiting formation
- Maintain 3-tile distance
- Continuous retreat while firing

**Against Ranged-Heavy Enemy:**
- Close distance quickly (minimize time under fire)
- Use TOUGH parts as damage sponge
- Get into melee range where ranged is weaker

**Against Healer Support:**
- ALWAYS kill healers first
- Healers typically have less HP
- Removing healers collapses enemy formation

**Against Tower-Heavy Defense:**
- Stay at range (>20 tiles if possible)
- Force towers to spend energy
- Advance when towers empty

### Real-Time Tactical Adjustments

```javascript
class SquadBrain {
  assessSituation() {
    const enemies = this.room.find(FIND_HOSTILE_CREEPS);
    const towers = this.room.find(FIND_HOSTILE_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER
    });
    
    const ourHP = this.squad.reduce((sum, c) => sum + c.hits, 0);
    const ourMaxHP = this.squad.reduce((sum, c) => sum + c.hitsMax, 0);
    const hpPercent = ourHP / ourMaxHP;
    
    // Decision matrix
    if (hpPercent < 0.4) {
      return 'RETREAT'; // Fall back to heal
    }
    if (enemies.length > this.squad.length * 2) {
      return 'KITE'; // We're outnumbered, stay mobile
    }
    if (towers.length > 0 && hpPercent < 0.7) {
      return 'EDGE_COMBAT'; // Stay out of tower range
    }
    if (enemies.length === 0) {
      return 'SIEGE'; // No resistance, attack structures
    }
    return 'ENGAGE'; // Standard combat
  }
  
  execute() {
    const tactic = this.assessSituation();
    switch(tactic) {
      case 'RETREAT': this.executeRetreat(); break;
      case 'KITE': this.executeKiting(); break;
      case 'EDGE_COMBAT': this.executeEdgeCombat(); break;
      case 'SIEGE': this.executeSiege(); break;
      case 'ENGAGE': this.executeEngagement(); break;
    }
  }
}
```

---

## Key Questions for Refinement

1. **Current RCL Level**: What room level are you currently at? This determines what features are available.

2. **Resource Availability**: How much energy can you sustain per tick? This affects how quickly you can spawn attack forces.

3. **Neighbors**: Are there aggressive players near you? We need to balance defense vs. offense accordingly.

4. **CPU Limit**: What's your current CPU limit and usage? Aggressive strategies require more CPU for combat logic.

5. **Boosting**: Do you have access to Labs and minerals for boosting combat creeps? This massively increases effectiveness.

6. **Combat Testing**: Have you tested the existing squad system? Understanding current limitations will help.

---

## Detailed Tactical Implementations

### Kiting Mechanics - Stay Alive While Dealing Damage

**Core Principle:** Maintain optimal distance from enemies while continuously attacking

**Ranged Kiting (vs Melee Attackers):**
```javascript
function executeRangedKite(creep, enemies) {
  const nearestEnemy = creep.pos.findClosestByRange(enemies);
  const distance = creep.pos.getRangeTo(nearestEnemy);
  
  // Optimal range: 3 tiles (ranged attack works up to 3, melee only at 1)
  if (distance < 3) {
    // Too close! Move away
    const fleeDirection = creep.pos.getDirectionTo(nearestEnemy);
    const oppositeDirection = (fleeDirection + 3) % 8 + 1; // Reverse direction
    creep.move(oppositeDirection);
  } else if (distance > 3) {
    // Too far, close distance slightly
    creep.moveTo(nearestEnemy);
  }
  // else distance === 3, perfect - stay still
  
  // Always attack while kiting
  if (distance <= 3) {
    creep.rangedAttack(nearestEnemy);
  } else {
    creep.rangedMassAttack(); // Hits multiple targets at range
  }
}
```

**Advanced Kiting (Predictive Movement):**
```javascript
function predictiveKite(creep, enemy) {
  // Calculate where enemy will be next tick
  const enemyNextPos = predictNextPosition(enemy);
  
  // Calculate position that maintains 3-tile distance from predicted position
  const idealPos = findPositionAtRange(enemyNextPos, 3);
  
  // Move to that position
  creep.moveTo(idealPos);
  
  // Attack current position
  creep.rangedAttack(enemy);
}

function predictNextPosition(enemy) {
  // Check enemy's last move direction from memory
  const lastPos = Memory.enemyTracking[enemy.id]?.lastPos;
  if (lastPos) {
    const dx = enemy.pos.x - lastPos.x;
    const dy = enemy.pos.y - lastPos.y;
    return new RoomPosition(
      enemy.pos.x + dx,
      enemy.pos.y + dy,
      enemy.room.name
    );
  }
  return enemy.pos;
}
```

**Terrain-Aware Kiting:**
```javascript
function terrainKite(creep, enemy) {
  // Kite toward swamp tiles (slows melee chasers)
  // Avoid walls and corners
  
  const surroundingTiles = creep.room.lookForAtArea(
    LOOK_TERRAIN,
    creep.pos.y - 1, creep.pos.x - 1,
    creep.pos.y + 1, creep.pos.x + 1,
    true
  );
  
  const swampTiles = surroundingTiles.filter(t => 
    t.terrain === 'swamp' && 
    t.x !== enemy.pos.x && t.y !== enemy.pos.y
  );
  
  if (swampTiles.length > 0) {
    // Move to swamp (we have MOVE parts, enemy might not)
    const swampPos = new RoomPosition(
      swampTiles[0].x, swampTiles[0].y, creep.room.name
    );
    creep.moveTo(swampPos);
  } else {
    // Standard kite
    executeRangedKite(creep, [enemy]);
  }
}
```

### Quad Formation Mechanics

**Formation Maintenance:**
```javascript
class QuadFormation {
  constructor(creepIds) {
    this.creeps = creepIds.map(id => Game.getObjectById(id));
    this.leader = this.creeps[0]; // Top-left creep is leader
  }
  
  get isIntact() {
    // Check all creeps are within 1 tile of each other
    for (let i = 0; i < this.creeps.length; i++) {
      for (let j = i + 1; j < this.creeps.length; j++) {
        if (this.creeps[i].pos.getRangeTo(this.creeps[j]) > 1) {
          return false;
        }
      }
    }
    return true;
  }
  
  move(direction) {
    // Move all creeps in formation simultaneously
    const moveOrder = this.calculateMoveOrder(direction);
    
    // Move in correct order to avoid blocking
    for (const creep of moveOrder) {
      creep.move(direction);
    }
  }
  
  calculateMoveOrder(direction) {
    // Determine which creeps need to move first to avoid blocking
    // Example: Moving RIGHT, rightmost creeps move first
    switch(direction) {
      case RIGHT:
      case BOTTOM_RIGHT:
      case TOP_RIGHT:
        return this.creeps.sort((a, b) => b.pos.x - a.pos.x);
      case LEFT:
      case BOTTOM_LEFT:
      case TOP_LEFT:
        return this.creeps.sort((a, b) => a.pos.x - b.pos.x);
      case BOTTOM:
        return this.creeps.sort((a, b) => b.pos.y - a.pos.y);
      case TOP:
        return this.creeps.sort((a, b) => a.pos.y - b.pos.y);
    }
  }
  
  moveTo(target) {
    if (!this.isIntact) {
      this.reform(); // Regroup before moving
      return;
    }
    
    const direction = this.leader.pos.getDirectionTo(target);
    this.move(direction);
  }
  
  reform() {
    // Rally all creeps to leader position
    for (const creep of this.creeps) {
      if (creep !== this.leader) {
        creep.moveTo(this.leader);
      }
    }
  }
}
```

**Quad Combat Pattern:**
```javascript
class QuadCombat extends QuadFormation {
  engage(enemies) {
    // Identify highest threat
    const target = this.selectTarget(enemies);
    
    // Position quad for optimal damage
    this.positionForAttack(target);
    
    // All ranged creeps focus fire
    this.rangedCreeps.forEach(creep => {
      if (creep.pos.getRangeTo(target) <= 3) {
        creep.rangedAttack(target);
      }
    });
    
    // Healers heal most wounded squad member
    const wounded = this.getMostWounded();
    this.healers.forEach(healer => {
      if (healer.pos.isNearTo(wounded)) {
        healer.heal(wounded);
      } else {
        healer.rangedHeal(wounded);
      }
    });
  }
  
  positionForAttack(target) {
    // Stay at range 2-3 for optimal ranged attack
    const distance = this.leader.pos.getRangeTo(target);
    
    if (distance < 2) {
      // Too close, back up
      const awayDirection = this.leader.pos.getDirectionTo(target);
      const opposite = (awayDirection + 3) % 8 + 1;
      this.move(opposite);
    } else if (distance > 3) {
      // Too far, move closer
      this.moveTo(target);
    }
    // else perfect range, hold position
  }
  
  getMostWounded() {
    return this.creeps.reduce((worst, creep) => 
      (creep.hits / creep.hitsMax) < (worst.hits / worst.hitsMax) ? creep : worst
    );
  }
  
  shouldRetreat() {
    const avgHP = this.creeps.reduce((sum, c) => 
      sum + (c.hits / c.hitsMax), 0) / this.creeps.length;
    return avgHP < 0.5;
  }
}
```

### Focus Fire Coordination

**Problem:** Multiple attackers targeting different enemies = inefficient damage
**Solution:** Coordinated focus fire system

```javascript
class FocusFireCoordinator {
  constructor(roomName) {
    this.roomName = roomName;
    this.currentTarget = null;
    this.targetAssignedTick = 0;
  }
  
  selectTarget(attackers, enemies) {
    // Reassign target every 3 ticks or when current target dead
    if (Game.time - this.targetAssignedTick < 3 && 
        this.currentTarget && 
        this.currentTarget.hits > 0) {
      return this.currentTarget;
    }
    
    // Calculate which enemy will die fastest under focus fire
    const scores = enemies.map(enemy => {
      const totalDPS = this.calculateCombinedDPS(attackers);
      const timeToKill = enemy.hits / totalDPS;
      const threat = this.calculateThreatScore(enemy);
      
      // Prefer: High threat, Low time-to-kill
      return {
        enemy: enemy,
        score: threat / timeToKill
      };
    });
    
    const best = scores.reduce((max, s) => 
      s.score > max.score ? s : max
    );
    
    this.currentTarget = best.enemy;
    this.targetAssignedTick = Game.time;
    return this.currentTarget;
  }
  
  calculateCombinedDPS(attackers) {
    return attackers.reduce((dps, attacker) => {
      const attackParts = attacker.body.filter(p => 
        p.type === ATTACK || p.type === RANGED_ATTACK
      ).length;
      return dps + (attackParts * 10); // ~10 damage per part per tick
    }, 0);
  }
  
  assignAttacks(attackers, target) {
    attackers.forEach(attacker => {
      const range = attacker.pos.getRangeTo(target);
      
      if (range === 1 && attacker.getActiveBodyparts(ATTACK) > 0) {
        attacker.attack(target);
      } else if (range <= 3 && attacker.getActiveBodyparts(RANGED_ATTACK) > 0) {
        attacker.rangedAttack(target);
      } else {
        // Move closer while staying in formation
        attacker.moveTo(target);
      }
    });
  }
}

// Usage
const coordinator = new FocusFireCoordinator(room.name);
const target = coordinator.selectTarget(myAttackers, enemies);
coordinator.assignAttacks(myAttackers, target);
```

### Structure Target Prioritization in Base Sieges

**Priority Matrix:**
```javascript
const STRUCTURE_PRIORITY = {
  [STRUCTURE_SPAWN]: 1000,        // HIGHEST - stops reinforcements
  [STRUCTURE_TOWER]: 900,          // HIGH - active threat
  [STRUCTURE_STORAGE]: 700,        // MEDIUM-HIGH - resources
  [STRUCTURE_TERMINAL]: 650,       // MEDIUM-HIGH - resources + trading
  [STRUCTURE_LAB]: 600,            // MEDIUM - prevents boosting
  [STRUCTURE_FACTORY]: 550,        // MEDIUM - production
  [STRUCTURE_NUKER]: 500,          // MEDIUM - strategic weapon
  [STRUCTURE_POWER_SPAWN]: 450,    // LOW-MEDIUM - power processing
  [STRUCTURE_LINK]: 400,           // LOW - logistics
  [STRUCTURE_EXTENSION]: 300,      // LOW - already disrupted without spawn
  [STRUCTURE_OBSERVER]: 200,       // VERY LOW - intelligence
  [STRUCTURE_RAMPART]: 100,        // LOWEST - only if blocking path
  [STRUCTURE_WALL]: 50             // LOWEST - only if blocking path
};

function selectStructureTarget(structures, siegePosition) {
  return structures
    .filter(s => !s.my) // Enemy structures only
    .map(structure => {
      const basePriority = STRUCTURE_PRIORITY[structure.structureType] || 0;
      const distance = siegePosition.getRangeTo(structure);
      const hpFactor = structure.hits / structure.hitsMax;
      
      // Adjust priority by distance and HP
      // Prefer: Close, nearly destroyed targets of high value
      const score = basePriority * (1 / distance) * (2 - hpFactor);
      
      return { structure, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.structure;
}
```

### Tactical Retreat Logic

**When to Retreat:**
```javascript
function shouldRetreat(squad) {
  const avgHP = calculateAverageHP(squad);
  const enemies = squad.room.find(FIND_HOSTILE_CREEPS);
  const towers = squad.room.find(FIND_HOSTILE_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER && s.energy > 0
  });
  
  // Retreat conditions
  if (avgHP < 0.4) return true;  // Heavy damage
  if (enemies.length > squad.length * 3) return true; // Overwhelmed
  if (towers.length > 2 && avgHP < 0.7) return true; // Tower threat
  if (squad.some(c => c.hits < c.hitsMax * 0.2)) return true; // Member critical
  
  return false;
}

function executeRetreat(squad) {
  const safeRoom = findSafeRoom(squad.room.name);
  const exitDirection = squad.room.findExitTo(safeRoom);
  const exitPos = squad.pos.findClosestByPath(exitDirection);
  
  // Move toward exit while maintaining formation
  if (squad.isQuadFormation) {
    squad.moveTo(exitPos);
  } else {
    squad.forEach(creep => creep.moveTo(exitPos));
  }
  
  // Defensive actions during retreat
  squad.healers.forEach(healer => {
    const wounded = findMostWounded(squad);
    if (healer.pos.isNearTo(wounded)) {
      healer.heal(wounded);
    } else {
      healer.rangedHeal(wounded);
    }
  });
  
  // Rear guard provides covering fire
  const rearGuard = findRearMostCreeps(squad, 2);
  rearGuard.forEach(creep => {
    const nearestEnemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (nearestEnemy && creep.pos.getRangeTo(nearestEnemy) <= 3) {
      creep.rangedAttack(nearestEnemy);
    }
  });
}

function findSafeRoom(currentRoom) {
  // Return owned room or reserved room closest to current position
  const ownedRooms = Object.keys(Game.rooms).filter(name => 
    Game.rooms[name].controller?.my
  );
  
  return ownedRooms.reduce((closest, roomName) => {
    const distance = Game.map.getRoomLinearDistance(currentRoom, roomName);
    const closestDistance = Game.map.getRoomLinearDistance(currentRoom, closest);
    return distance < closestDistance ? roomName : closest;
  });
}
```

### Healing Prioritization

**Triage System:**
```javascript
class CombatMedic {
  prioritizeHealing(squad) {
    const wounded = squad.filter(c => c.hits < c.hitsMax);
    
    if (wounded.length === 0) {
      // No wounded, stay with formation
      return this.healSelf();
    }
    
    // Triage categories
    const critical = wounded.filter(c => c.hits < c.hitsMax * 0.3);
    const serious = wounded.filter(c => c.hits < c.hitsMax * 0.6);
    const minor = wounded.filter(c => c.hits < c.hitsMax * 0.9);
    
    let target;
    if (critical.length > 0) {
      // Save critical creeps first
      target = critical.reduce((worst, c) => 
        c.hits < worst.hits ? c : worst
      );
    } else if (serious.length > 0) {
      // Heal serious injuries
      target = this.findClosest(serious);
    } else {
      // Top off minor injuries
      target = this.findClosest(minor);
    }
    
    return this.healTarget(target);
  }
  
  healTarget(target) {
    if (this.pos.isNearTo(target)) {
      this.heal(target); // 12 HP per HEAL part
    } else {
      this.rangedHeal(target); // 4 HP per HEAL part
    }
    
    // Move closer if not adjacent
    if (!this.pos.isNearTo(target)) {
      this.moveTo(target);
    }
  }
  
  healSelf() {
    if (this.hits < this.hitsMax) {
      this.heal(this);
    }
  }
}
```

---

## Economic Warfare Tactics

### Resource Denial Strategy

**Concept:** Attack enemy economy rather than military

**Remote Mining Harassment:**
```javascript
// Repeatedly kill enemy remote miners
// Cost them energy without major military commitment

function harass RemoteMiners(targetRoom) {
  const scouts = targetRoom.find(FIND_HOSTILE_CREEPS, {
    filter: c => c.getActiveBodyparts(WORK) > 0 && 
                 c.getActiveBodyparts(ATTACK) === 0
  });
  
  if (scouts.length > 0) {
    // Small, cheap raiding party
    const raider = {
      body: [ATTACK, ATTACK, MOVE, MOVE],
      role: 'raider',
      target: scouts[0].id
    };
    
    spawnCreep(raider);
    // Forces enemy to spawn defenders or lose miners
  }
}
```

**Controller Downgrade Pressure:**
```javascript
// Repeatedly attack controller to force constant upgrading
// Drains their energy reserves

function attackController(targetRoom) {
  const attacker = {
    body: [CLAIM, CLAIM, MOVE, MOVE], // CLAIM for attackController
    role: 'controller_attacker',
    target: targetRoom
  };
  
  // Each attack reduces downgrade timer by 300 ticks
  // Forces enemy to divert resources to upgrading
}
```

---

## What Makes Tigga-Style Bots Successful

### The Tigga Formula

**1. Relentless Expansion**
- Claims rooms faster than opponents can react
- Always expanding to new territories
- Doesn't wait for "perfect" conditions
- Accepts some risk for territorial gain

**2. Intelligent CPU Management**
- Banks CPU during peace for combat bursts
- Dynamically shifts priorities based on situation
- Skips non-essential operations during war
- Never lets CPU bucket fall below 2000

**3. Adaptive Combat AI**
- Assesses situation every tick
- Changes tactics based on enemy composition
- Retreats when overwhelmed, attacks when advantageous
- Uses terrain and positioning strategically

**4. Economic Dominance**
- More rooms = more energy = more military
- Maintains strong economy even during war
- Uses economic warfare against enemies
- Trades resources via Terminal for strategic advantage

**5. Sophisticated Squad Tactics**
- Quad formations for concentrated firepower
- Kiting to minimize losses
- Focus fire to eliminate threats quickly
- Coordinated healing to sustain attacks

**6. Territorial Awareness**
- Scouts constantly
- Knows enemy positions and strengths
- Eliminates enemy scouts to deny intelligence
- Controls buffer zones between territories

**7. Rapid Response**
- Detects attacks immediately
- Spawns defenders quickly
- Counter-attacks enemy home base
- Makes aggression costly for opponents

### The Mindset Shift

**From TooAngel's Cautious Approach:**
- "Wait until fully built up before expanding"
- "Only attack if provoked"
- "Preserve creeps and avoid losses"
- "Focus on perfect efficiency"

**To Tigga's Aggressive Approach:**
- "Expand aggressively, build while expanding"
- "Attack preemptively to deny enemy growth"
- "Accept losses if they achieve strategic goals"
- "Focus on territorial dominance over efficiency"

**Key Philosophical Difference:**
```
TooAngel: Risk-averse, efficiency-focused, reactive
Tigga: Risk-accepting, expansion-focused, proactive
```

---

## Implementation Checklist

### Phase 1: Foundation (Week 1-2)
- [ ] Home room reaches RCL 5+
- [ ] Storage with 50k+ energy reserves
- [ ] 2+ towers for defense
- [ ] Roads connecting all key structures
- [ ] Automated defender spawning on attack
- [ ] CPU bucket consistently above 5000

### Phase 2: Initial Aggression (Week 3-4)
- [ ] Claim 1st adjacent room
- [ ] Implement scout detection system
- [ ] Deploy first attack squad successfully
- [ ] Test kiting mechanics against NPCs
- [ ] Buffer zone reservation system active
- [ ] Can respond to attacks within 10 ticks

### Phase 3: Expansion (Week 5-8)
- [ ] Control 3+ rooms
- [ ] Quad formation system working
- [ ] Focus fire coordination implemented
- [ ] Successfully siege an enemy room
- [ ] Economic warfare tactics deployed
- [ ] CPU allocation system dynamic

### Phase 4: Dominance (Week 9+)
- [ ] Control 5+ rooms
- [ ] Boosted combat creeps in use
- [ ] Multiple simultaneous attack fronts
- [ ] Territory expanding every week
- [ ] Enemies avoid your borders
- [ ] Recognized as aggressive threat

---

## Success Metrics

**Economic Indicators**
- Energy income > 10 energy/tick per room
- Storage maintained at 50k+ energy in all rooms
- All spawns active with queued creeps
- Terminal trading for strategic resources

**Territorial Indicators**
- Control 5+ rooms by month 2
- Control 10+ rooms by month 4
- Buffer zones reserved around all bases
- Zero enemy scouts surviving in your territory
- Expanding into new territory every 3-7 days

**Combat Indicators**
- Win rate > 80% in defensive engagements
- Win rate > 60% in offensive engagements
- Successfully capture 1+ room per week
- Enemy players abandon rooms near your territory
- Reputation as dangerous opponent

**Efficiency Indicators**
- CPU usage 60-80% during peace (banking CPU)
- CPU usage 95-100% during active combat (using banked CPU)
- Creep travel time optimized with roads
- < 5% creep losses to inefficiency (pathing errors, etc)

**Sophistication Indicators**
- Kiting successfully extends creep lifetime
- Quad formations maintain cohesion
- Focus fire eliminates targets 50% faster
- Tactical retreats save 70%+ of squad HP
- Dynamic target prioritization working

---

## Philosophical Approach

**"Expand or Die"**  
Screeps rewards aggressive expansion. Territory = Resources = Power. Every room you claim is one fewer for your opponents. Hesitation is death.

**"The Best Defense is a Good Offense"**  
Rather than waiting to be attacked, project power into contested areas. Keep enemies on the defensive. Make them fear attacking you because they know retaliation is swift.

**"Sophistication Through Iteration"**  
Start simple (basic defenders), test in real scenarios, iterate with improvements (kiting, focus fire, formations). Every battle teaches lessons. Improve constantly.

**"Scale or Fail"**  
As you grow, systems must scale efficiently. What works for 1 room must work for 10 rooms without multiplying CPU usage. Design for scale from the start.

**"Calculated Aggression"**  
Don't be reckless, but don't be timid. Attack when you have advantage. Retreat when overwhelmed. Always be calculating risk vs reward.

**"Economic Warfare Wins Wars"**  
Direct military confrontation with RCL 8 fortresses is often futile. Attack their economy, deny their expansion, drain their resources. Win through attrition.

**"Intelligence is Power"**  
Know your enemies. Scout constantly. Eliminate their scouts. Information asymmetry creates opportunities.

---

## Getting Started

**Recommended First Steps:**
1. Review existing combat roles in your codebase
2. Test current squad spawning in a safe room
3. Identify bottlenecks in economy preventing aggression
4. Set up monitoring for enemy activity in adjacent rooms
5. Begin Phase 1 development focusing on economic stability

Let me know your current state and any specific areas where you need code examples or strategic advice!