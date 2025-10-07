# Aggressive Expansion Strategy

## Core Philosophy

**"Every room is either ours or a future conquest."**

The bot will transition from a reputation-based diplomacy system to a capability-based territorial domination system. Instead of asking "are they friendly?", we ask "can we take them?" and "is it profitable?". Every neighboring player is a competitor for resources and territory.

## Strategic Objectives

1. **Eliminate Competition**: Remove or suppress all nearby players competing for the same resources
2. **Secure Territory**: Control all profitable rooms within operational range
3. **Deny Intelligence**: Eliminate enemy scouts to prevent intelligence gathering
4. **Maximize Profit**: Only engage in profitable warfare that advances our position

## System Architecture

### 1. Intelligence & Assessment System

#### 1.1 Scout Elimination Module
**Priority: IMMEDIATE**

Every foreign scout entering our territory (owned, reserved, or remote mining rooms) is a threat that must be eliminated.

```javascript
// Scout Detection & Elimination
ScoutEliminator = {
  // Detect scouts in our territory
  detectScouts() {
    const scouts = [];
    for (const room of ourControlledRooms) {
      const hostiles = room.find(FIND_HOSTILE_CREEPS);
      for (const hostile of hostiles) {
        if (this.isScout(hostile)) {
          scouts.push({
            creep: hostile,
            room: room.name,
            owner: hostile.owner.username,
            threat: this.assessThreat(hostile)
          });
        }
      }
    }
    return scouts;
  },

  isScout(creep) {
    // Scout indicators:
    // - Only MOVE parts
    // - Small body (1-2 parts)
    // - No WORK/CARRY/ATTACK parts
    return creep.body.length <= 2 &&
           creep.body.every(p => p.type === MOVE);
  },

  eliminateScout(scout) {
    // Spawn defender to intercept
    const nearestCombat = findNearestDefender(scout.room);
    if (nearestCombat) {
      nearestCombat.interceptTarget(scout.creep);
    } else {
      // Emergency spawn
      spawnEmergencyDefender(scout.room);
    }

    // Mark player as hostile
    markPlayerHostile(scout.owner, 'scout_intrusion');
  }
}
```

#### 1.2 Room Strength Evaluator

Comprehensive assessment of enemy room capabilities:

```javascript
RoomStrengthEvaluator = {
  evaluate(roomName) {
    const room = Game.rooms[roomName];
    if (!room) return this.estimateFromMemory(roomName);

    return {
      // Military Strength (0-100)
      military: {
        towers: this.countTowers(room) * 15,        // Max 45 for 3 towers
        defenders: this.countDefenders(room) * 5,
        walls: this.averageWallStrength(room) / 100000,
        ramparts: this.averageRampartStrength(room) / 100000,
        safeMode: room.controller.safeMode || 0,
        spawns: this.countSpawns(room) * 10,
        boosts: this.hasBoostCapability(room) ? 20 : 0,
      },

      // Economic Strength (0-100)
      economic: {
        rcl: room.controller.level * 12.5,
        storage: Math.min(100, (room.storage?.store.energy || 0) / 10000),
        sources: room.sources.length * 25,
        mineral: this.mineralValue(room),
        remoteRooms: this.countRemoteRooms(room) * 10,
      },

      // Vulnerabilities (negative scores)
      vulnerabilities: {
        noTowers: !this.countTowers(room) ? -50 : 0,
        lowEnergy: room.storage?.store.energy < 10000 ? -30 : 0,
        noWalls: !this.hasWalls(room) ? -40 : 0,
        isolated: this.distanceToAllies(room) > 5 ? -20 : 0,
        overextended: this.remoteRooms > 3 ? -15 : 0,
      },

      // Retaliation Capability
      retaliation: {
        canRetaliate: this.military > 40,
        retaliationStrength: this.military + this.economic / 2,
        timeToMobilize: this.estimateMobilizationTime(room),
        allySupport: this.checkAllyProximity(room),
      }
    };
  }
}
```

### 2. Target Selection & Prioritization

#### 2.1 Remote Mining Takeover

**Priority Targets**: Enemy remote mining operations near our territory

```javascript
RemoteMiningTakeover = {
  findTargets() {
    const targets = [];

    // Scan all rooms we know about
    for (const roomName of Object.keys(Memory.rooms)) {
      const roomData = Memory.rooms[roomName];

      // Check if it's being remote mined by enemy
      if (this.isEnemyRemoteMining(roomData)) {
        const assessment = {
          room: roomName,
          owner: roomData.reservation?.username,
          value: this.calculateValue(roomData),
          cost: this.calculateTakeoverCost(roomData),
          profit: null,
        };

        assessment.profit = assessment.value - assessment.cost;

        if (assessment.profit > 0) {
          targets.push(assessment);
        }
      }
    }

    return targets.sort((a, b) => b.profit - a.profit);
  },

  calculateValue(room) {
    let value = 0;

    // Energy sources
    value += room.sources * 3000; // 3000 energy per source per 300 ticks

    // Strategic positioning
    if (this.blocksOurExpansion(room)) value += 5000;
    if (this.nearOurRooms(room)) value += 3000;

    // Denial value (preventing enemy from having it)
    value += 2000;

    return value;
  },

  calculateTakeoverCost(room) {
    let cost = 0;

    // Military cost to clear
    cost += this.combatCreepsCost(room);

    // Opportunity cost
    cost += this.travelDistance(room) * 50;

    // Risk cost (potential losses)
    cost += this.riskAssessment(room) * 100;

    return cost;
  },

  execute(target) {
    // Phase 1: Eliminate enemy miners
    this.eliminateMiners(target);

    // Phase 2: Break reservation
    this.breakReservation(target);

    // Phase 3: Establish our presence
    this.establishControl(target);

    // Phase 4: Defend against retaliation
    this.prepareDefense(target);
  }
}
```

#### 2.2 Main Room Conquest

When remote harassment isn't enough, go for the source:

```javascript
MainRoomConquest = {
  assessConquest(playerName) {
    const player = Memory.players[playerName];
    const rooms = player.rooms;

    // Find their main room(s)
    const mainRooms = this.identifyMainRooms(rooms);

    for (const room of mainRooms) {
      const assessment = {
        room: room.name,
        strength: RoomStrengthEvaluator.evaluate(room.name),
        ourStrength: this.calculateOurStrength(),
        feasible: false,
        profitable: false,
      };

      // Can we win?
      assessment.feasible = assessment.ourStrength >
                           assessment.strength.military * 1.2;

      // Is it worth it?
      assessment.profitable = this.calculateConquestROI(room) > 1.5;

      if (assessment.feasible && assessment.profitable) {
        return {
          target: room.name,
          strategy: this.selectStrategy(assessment),
          timeline: this.planTimeline(assessment),
        };
      }
    }

    return null;
  },

  selectStrategy(assessment) {
    const target = assessment.strength;

    if (target.military < 30) {
      return 'BLITZ'; // Quick overwhelming force
    } else if (target.vulnerabilities.noTowers) {
      return 'DEMOLITION'; // Destroy infrastructure
    } else if (target.economic > 70) {
      return 'SIEGE'; // Long-term siege
    } else {
      return 'ATTRITION'; // Wear them down
    }
  },

  executeConquest(plan) {
    switch(plan.strategy) {
      case 'BLITZ':
        this.launchBlitzkrieg(plan.target);
        break;
      case 'DEMOLITION':
        this.launchDemolition(plan.target);
        break;
      case 'SIEGE':
        this.beginSiege(plan.target);
        break;
      case 'ATTRITION':
        this.startAttritionCampaign(plan.target);
        break;
    }
  }
}
```

### 3. Attack Execution Framework

#### 3.1 Attack Types

```javascript
const AttackStrategies = {
  // Early Game (RCL 3+)
  HARASSMENT: {
    minRCL: 3,
    units: ['defender', 'defender'],
    cost: 1000,
    objectives: [
      'Kill remote miners',
      'Destroy roads/containers',
      'Force defense spending',
    ],
  },

  // Mid Game (RCL 4+)
  REMOTE_TAKEOVER: {
    minRCL: 4,
    units: ['defender', 'defender', 'healer'],
    cost: 2000,
    objectives: [
      'Clear remote mining room',
      'Break enemy reservation',
      'Establish our reservation',
    ],
  },

  // Advanced (RCL 5+)
  ECONOMIC_WARFARE: {
    minRCL: 5,
    units: ['defender', 'defender', 'dismantler', 'healer'],
    cost: 4000,
    objectives: [
      'Destroy economic infrastructure',
      'Kill haulers and miners',
      'Drain energy reserves',
    ],
  },

  // Late Game (RCL 6+)
  ROOM_CONQUEST: {
    minRCL: 6,
    units: generateConquestForce,
    cost: 10000,
    objectives: [
      'Destroy all spawns',
      'Eliminate all defenders',
      'Claim or raze room',
    ],
  },

  // End Game (RCL 7+)
  TOTAL_WAR: {
    minRCL: 7,
    units: generateWarMachine,
    cost: 50000,
    objectives: [
      'Eliminate player from region',
      'Claim all their rooms',
      'Destroy all infrastructure',
    ],
  },
}
```

#### 3.2 Retaliation Assessment & Response

Before attacking, assess likely retaliation:

```javascript
RetaliationAssessment = {
  assess(target, attackType) {
    // Scout their main room first
    const scoutReport = this.scoutMainRoom(target.owner);

    const assessment = {
      willRetaliate: false,
      retaliationStrength: 0,
      ourDefenseReady: false,
      recommendation: null,
    };

    // Will they retaliate?
    if (scoutReport.military > 30 && scoutReport.economic > 50) {
      assessment.willRetaliate = true;
      assessment.retaliationStrength = scoutReport.retaliationCapability;
    }

    // Can we handle it?
    if (assessment.willRetaliate) {
      assessment.ourDefenseReady = this.prepareDefenses(target.room);

      if (assessment.retaliationStrength > ourDefenseStrength * 1.5) {
        assessment.recommendation = 'ABORT';
      } else if (assessment.retaliationStrength > ourDefenseStrength) {
        assessment.recommendation = 'FORTIFY_THEN_ATTACK';
      } else {
        assessment.recommendation = 'ATTACK_WITH_DEFENSE';
      }
    } else {
      assessment.recommendation = 'ATTACK_IMMEDIATELY';
    }

    return assessment;
  },

  prepareDefenses(targetRoom) {
    // Position defenders
    this.positionDefenders(targetRoom);

    // Build emergency towers if possible
    this.buildEmergencyDefense(targetRoom);

    // Request reinforcements
    this.requestReinforcements(targetRoom);

    return true;
  },

  positionDefenders(room) {
    const defenders = [];

    // Spawn defenders in anticipation
    for (let i = 0; i < 3; i++) {
      defenders.push(spawnDefender(room));
    }

    // Position at choke points
    defenders.forEach(d => d.moveToDefensePosition(room));
  }
}
```

### 4. Decision Flow

```javascript
// Main decision loop (runs every 100 ticks)
function aggressiveExpansionTick() {
  // Step 1: Eliminate scouts
  const scouts = ScoutEliminator.detectScouts();
  scouts.forEach(scout => ScoutEliminator.eliminateScout(scout));

  // Step 2: Check for remote mining opportunities
  const remoteMiningTargets = RemoteMiningTakeover.findTargets();
  if (remoteMiningTargets.length > 0) {
    const target = remoteMiningTargets[0];

    // Assess retaliation risk
    const assessment = RetaliationAssessment.assess(target, 'REMOTE_TAKEOVER');

    switch(assessment.recommendation) {
      case 'ATTACK_IMMEDIATELY':
        RemoteMiningTakeover.execute(target);
        break;
      case 'ATTACK_WITH_DEFENSE':
        RetaliationAssessment.prepareDefenses(target.room);
        RemoteMiningTakeover.execute(target);
        break;
      case 'FORTIFY_THEN_ATTACK':
        if (RetaliationAssessment.prepareDefenses(target.room)) {
          RemoteMiningTakeover.execute(target);
        }
        break;
      case 'ABORT':
        // Too risky, look for easier target
        break;
    }
  }

  // Step 3: Consider main room attacks
  for (const player of getHostilePlayers()) {
    const conquest = MainRoomConquest.assessConquest(player.name);

    if (conquest) {
      // This is a major operation
      const assessment = RetaliationAssessment.assess(conquest, 'ROOM_CONQUEST');

      if (assessment.recommendation !== 'ABORT') {
        MainRoomConquest.executeConquest(conquest);
      }
    }
  }

  // Step 4: Maintain pressure
  maintainPressureOnAllFronts();
}
```

### 5. Profit Calculation

All attacks must be profitable:

```javascript
ProfitCalculator = {
  calculate(target, attackType) {
    const costs = {
      military: this.militaryCosts(attackType),
      opportunity: this.opportunityCost(target),
      risk: this.riskCost(target),
    };

    const gains = {
      immediate: this.immediateGains(target),
      strategic: this.strategicValue(target),
      future: this.futureValue(target),
      denial: this.denialValue(target), // Value of denying enemy
    };

    const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
    const totalGain = Object.values(gains).reduce((a, b) => a + b, 0);

    return {
      costs,
      gains,
      netProfit: totalGain - totalCost,
      roi: totalGain / totalCost,
      breakEven: totalCost / (this.energyPerTick(target) || 1),
      decision: (totalGain / totalCost) > 1.3 ? 'ATTACK' : 'SKIP',
    };
  }
}
```

## Implementation Phases

### Phase 1: Foundation (Immediate)
1. **Scout Elimination System** - Detect and kill all foreign scouts
2. **Intelligence Gathering** - Enhanced room evaluation
3. **Lower Attack Thresholds** - Enable attacks from RCL 3+

### Phase 2: Remote Warfare (Days 1-3)
1. **Remote Mining Takeover** - Claim nearby remote rooms
2. **Harassment Campaigns** - Constant pressure on neighbors
3. **Defense Preparation** - Ready for retaliation

### Phase 3: Conquest (Days 4-7)
1. **Weak Room Elimination** - Take out vulnerable neighbors
2. **Territory Consolidation** - Secure conquered areas
3. **Economic Integration** - Profit from new territories

### Phase 4: Domination (Week 2+)
1. **Regional Control** - Eliminate all nearby competition
2. **Expansion Acceleration** - Use profits for rapid growth
3. **Total War Capability** - Overwhelming force projection

## Configuration Changes

```javascript
// config.js modifications
config.aggression = {
  enabled: true,
  minRCL: 3,                    // Start aggression at RCL 3
  scoutElimination: true,       // Kill all scouts
  remoteRoomTakeover: true,     // Take profitable remote rooms
  profitThreshold: 1.3,         // Minimum ROI for attacks
  retaliationPrep: true,        // Prepare defenses before attacking
  continuousPressure: true,     // Never stop attacking
  peacefulPlayers: [],          // Empty - no one is safe
};

config.autoAttack = {
  notify: false,                // Don't notify, just attack
  minAttackRCL: 3,             // Reduced from 6
  timeBetweenAttacks: 100,     // Reduced from 2000
  attackWeakRooms: true,        // Target vulnerable rooms
  breakReservations: true,      // Break all enemy reservations
};
```

## Success Metrics

1. **Territory Control**: Own or control 80% of rooms within 5 range
2. **Competition Elimination**: No active hostile rooms within 3 range
3. **Economic Dominance**: 3x energy income vs. nearest competitor
4. **Military Superiority**: Can defeat any neighbor 1v1
5. **Intelligence Supremacy**: No enemy scouts survive > 50 ticks

## Core Principle

**"The best defense is the complete elimination of all nearby threats."**

Every tick without expanding or attacking is a tick wasted. Every enemy scout is an intelligence leak. Every nearby competitor is a future conflict. Strike first, strike hard, and never stop expanding.

---

## IMPLEMENTATION INSTRUCTIONS FOR CLAUDE

### Context
This document outlines the complete aggressive expansion strategy for the TooAngel Screeps bot. You are being asked to implement this system to transform the bot from defensive to aggressively territorial. The user has already implemented early expansion features (role_earlyharvester, brain_earlyexpansion) that start resource gathering from adjacent rooms at RCL 2.

### What You Need To Know
1. **Current State**: The bot currently uses a reputation-based diplomacy system that is too passive
2. **Desired State**: A capability-based system that evaluates "can we take them?" instead of "are they friendly?"
3. **User's Requirements**:
   - Kill all enemy scouts in our territory (owned/reserved/remote mining rooms)
   - Take over profitable enemy remote mining operations
   - Scout enemy main rooms to assess retaliation capability
   - Pre-position defenders if retaliation is likely
   - Attack main rooms if profitable and winnable

### Implementation Steps

#### Step 1: Configuration Changes (FIRST PRIORITY)
1. Open `config.js`
2. Add the new `config.aggression` section as shown above
3. Modify `config.autoAttack`:
   - Change `minAttackRCL` from 6 to 3
   - Change `timeBetweenAttacks` from 2000 to 100
   - Add `attackWeakRooms: true`
   - Add `breakReservations: true`

#### Step 2: Scout Elimination System
1. Create new file: `brain_scouteliminator.js`
2. Implement scout detection logic:
   - Check all controlled rooms for hostile creeps
   - Identify scouts (1-2 MOVE parts only, no WORK/CARRY/ATTACK)
   - Queue defender spawn or redirect existing defender
3. Integrate into `brain_main.js` execution flow
4. Add to `require.js` module loading

#### Step 3: Room Strength Evaluator
1. Create new file: `brain_roomstrength.js`
2. Implement evaluation functions:
   - Military strength (towers, defenders, walls, ramparts)
   - Economic strength (RCL, storage, sources)
   - Vulnerabilities (no towers, low energy, isolated)
   - Retaliation capability assessment
3. Store evaluations in Memory for caching

#### Step 4: Remote Mining Takeover
1. Create new file: `brain_remotetakeover.js`
2. Implement target identification:
   - Scan known rooms for enemy remote mining
   - Calculate value (energy sources × 3000 + strategic value)
   - Calculate cost (military + travel + risk)
   - Return sorted list by profit
3. Implement takeover execution:
   - Spawn attackers to eliminate enemy miners
   - Break enemy reservation
   - Establish our reservation
   - Position defenders for retaliation

#### Step 5: Retaliation Assessment
1. Enhance scout role to gather intelligence on enemy main rooms
2. Create assessment logic:
   - If target has military > 30 and economic > 50, expect retaliation
   - Compare their strength to our defense capability
   - Return recommendation: ATTACK_IMMEDIATELY, ATTACK_WITH_DEFENSE, FORTIFY_THEN_ATTACK, or ABORT
3. Implement defense preparation:
   - Spawn defenders preemptively
   - Position at strategic points
   - Build emergency towers if possible

#### Step 6: Main Attack Coordinator
1. Create new file: `brain_aggression.js`
2. Implement main decision loop (runs every 100 ticks):
   - Detect and eliminate scouts
   - Find profitable remote takeover targets
   - Assess main room conquest opportunities
   - Execute attacks based on profitability
3. Add profit calculation:
   - Costs: military, opportunity, risk
   - Gains: immediate energy, strategic value, future harvest, denial value
   - Only attack if ROI > 1.3

#### Step 7: Integration with Existing Systems
1. Modify `diplomacy.js`:
   - Remove positive reputation considerations
   - All non-owned players are potential targets
   - Track military capabilities instead of friendship
2. Modify `prototype_room_external.js`:
   - Add scout detection to room scanning
   - Flag enemy remote mining operations
3. Update spawn priorities to support aggressive roles

### Implementation Order & Reasoning

1. **Start with Config**: Lower barriers to aggression immediately
2. **Scout Elimination**: Deny intelligence to prevent enemy preparation
3. **Room Evaluation**: Need to know what we're up against
4. **Remote Takeover**: Easier targets, immediate profit
5. **Retaliation System**: Avoid costly mistakes
6. **Main Coordinator**: Tie everything together

### Key Logic Points

1. **Every scout is hostile**: No exceptions, kill on sight
2. **Profit drives decisions**: Only attack if ROI > 1.3
3. **Preemptive defense**: Position defenders BEFORE attacking
4. **Continuous pressure**: Always be attacking something
5. **No permanent friends**: Today's neutral is tomorrow's target

### Testing Approach

1. Test scout elimination in isolation first
2. Verify room strength calculations with known rooms
3. Start with remote takeovers before main room attacks
4. Monitor CPU usage - aggressive expansion is CPU intensive
5. Watch for retaliation patterns to refine assessment

### Expected Behavior After Implementation

- Bot immediately kills any foreign scout entering territory
- Constantly evaluates nearby rooms for takeover opportunities
- Launches attacks on profitable targets every 100-500 ticks
- Pre-positions defenders when attacking risky targets
- Gradually eliminates all competition within 3-5 room range
- Transitions from survival to regional domination

### Critical Success Factors

1. **CPU Management**: Don't exceed tick limits with new aggressive calculations
2. **Energy Balance**: Ensure attacks generate more energy than they consume
3. **Defense Readiness**: Never leave home vulnerable while attacking
4. **Target Priority**: Always attack the most profitable target first
5. **Escalation Control**: Start small (remote rooms) before attempting main room conquest

### Remember
The user wants aggression, not diplomacy. Every nearby player is competition to be eliminated or suppressed. The goal is territorial domination through calculated, profitable warfare. Start implementation with the configuration changes and scout elimination, as these provide immediate value with minimal risk.