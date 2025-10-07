# Strategic Hostile Response System

## Overview

A comprehensive threat assessment and response system that intelligently handles hostile encounters based on your strength and the threat level. This is critical for early game survival and efficient expansion.

## Core Philosophy

**"Know when to fight, when to flee, and when to avoid altogether"**

- **RCL 1-2**: Avoid ALL conflicts, focus on growth
- **RCL 3-4**: Engage only minimal threats (1-2 weak creeps)
- **RCL 5-6**: Handle low threats, blockade moderate ones
- **RCL 7-8**: Attack moderate threats, siege strong ones

## System Components

### 1. Threat Assessment (`brain_hostile_response.js`)

**Threat Levels**:
```javascript
NONE: 0       // Empty room
MINIMAL: 1    // 1-2 weak creeps, no towers
LOW: 2        // 3-5 creeps or 1 tower
MODERATE: 3   // Multiple towers or strong creeps
HIGH: 4       // Fortified room with multiple towers
EXTREME: 5    // Source Keeper or heavily fortified
```

The system evaluates:
- Number of hostile creeps
- Tower count and placement
- Spawn presence
- Room ownership (NPC vs Player)
- Source Keeper lairs

### 2. Response Strategies

#### AVOID (Default for early game)
- Remove room from remote mining targets
- Add to avoid list for 5000 ticks
- Find alternative rooms
- **Used when**: Threat exceeds capabilities

#### DEFEND (RCL 3+)
- Spawn 1-2 defenders to clear threat
- Quick response for weak enemies
- **Used when**: MINIMAL threat, enough energy

#### BLOCKADE (RCL 5+)
- Position defenders at room entrances
- Prevent hostile expansion toward base
- Don't engage directly
- **Used when**: MODERATE threat nearby

#### ATTACK (RCL 7+)
- Spawn attack squad (2 ranged + 1 healer)
- Actively eliminate threat
- **Used when**: Can overpower the enemy

#### SIEGE (RCL 7+)
- Long-term tower draining strategy
- 2 drainers + 2 healers
- **Used when**: HIGH threat but winnable

#### KEEPER_TEAM (If enabled)
- Specialized Source Keeper squad
- Requires config.keepers.enabled
- **Used when**: SK room with valuable resources

### 3. Scout Integration

Scouts now:
1. **Report hostiles** when discovered
2. **Flee when attacked** (return to base)
3. **Clear targets** if hostile (stop trying to scout there)
4. **Provide intelligence** for threat assessment

### 4. Remote Mining Safety

The system prevents wasted resources:
1. Scout checks room first (50 energy)
2. If hostile, marks as avoided
3. No sourcers sent to hostile rooms
4. Alternative rooms selected automatically

## Decision Matrix

| RCL | MINIMAL | LOW | MODERATE | HIGH | EXTREME |
|-----|---------|-----|----------|------|---------|
| 1-2 | AVOID   | AVOID | AVOID | AVOID | AVOID |
| 3-4 | DEFEND* | AVOID | AVOID | AVOID | AVOID |
| 5-6 | DEFEND  | DEFEND | BLOCKADE | AVOID | AVOID |
| 7-8 | ATTACK  | ATTACK | ATTACK | SIEGE | AVOID** |

*Only if energy > 800
**Unless keeper team enabled

## Memory Structures

### `Memory.hostileRooms`
```javascript
{
  "W1N2": 12345,  // Game.time when reported
  "W2N3": 12789
}
```

### `Memory.threatAssessments`
```javascript
{
  "W1N2": {
    level: 2,
    type: "NPC",
    owner: null,
    details: "3 creeps, 1 tower, 0 spawns",
    creeps: 3,
    towers: 1,
    spawns: 0,
    assessed: 12345
  }
}
```

### `Memory.avoidRooms`
```javascript
{
  "W1N2": 17345  // Avoid until Game.time 17345
}
```

## Strategic Benefits

### Early Game (RCL 1-2)
✅ **Survival focus**: Never waste resources on fights
✅ **Smart avoidance**: Find peaceful expansion paths
✅ **Energy conservation**: Every bit goes to growth

### Mid Game (RCL 3-6)
✅ **Selective engagement**: Only fight winnable battles
✅ **Blockade strategy**: Control territory without costly wars
✅ **Resource protection**: Defend remote mining operations

### Late Game (RCL 7-8)
✅ **Aggressive expansion**: Clear obstacles actively
✅ **Siege capabilities**: Take down fortified positions
✅ **SK farming**: Harvest high-value rooms (if enabled)

## Testing & Monitoring

### Console Commands
```javascript
// Check hostile rooms
Memory.hostileRooms

// View threat assessments
Memory.threatAssessments

// See avoided rooms
Memory.avoidRooms

// Force threat assessment
brain.reportHostileRoom('W1N2', 'manual')

// Check response strategy for a room
const threat = brain.assessThreat('W1N2');
brain.determineResponse(threat, 'W1N1');
```

### Debug Output
Enable hostile debugging:
```javascript
config.debug.hostile = true
```

Expected output:
```
[hostile] Scout report from W1N2: Threat level 2 - 3 creeps, 1 tower, 0 spawns
[hostile] W1N1 -> W1N2: Executing AVOID strategy (threat: 2)
[hostile] W1N1: Removed W1N2 from remote mining targets
```

## Configuration

In `config.js`, you can adjust:
```javascript
config.hostile = {
  avoidDuration: 5000,      // How long to avoid hostile rooms
  reassessInterval: 500,    // Ticks between threat reassessments
  maxDefenderDistance: 3,   // Max distance for defender response
};
```

## Integration Points

### With Remote Mining
- Hostile rooms automatically removed from targets
- Alternative rooms selected in next cycle
- Scouts check safety before harvesters spawn

### With Expansion
- Room claiming considers hostile neighbors
- Avoids expanding toward aggressive players
- Prioritizes peaceful directions

### With Economy
- Response strategies respect energy levels
- No military spawning during EMERGENCY economy
- Blockades used when can't afford attacks

## Edge Cases Handled

1. **Scout killed before reporting**: Room marked hostile on next visibility
2. **Hostile clears while avoided**: Reassessed after avoid period
3. **Multiple threats**: Closest base responds to each
4. **Owned room attacked**: Separate defense system handles (existing)
5. **SK rooms**: Special handling with keeper teams

## Future Enhancements

Potential improvements:
- Alliance system (coordinate with friends)
- Reputation tracking (remember aggressive players)
- Scouting patterns (systematic exploration)
- Combat predictions (simulate battle outcomes)
- Resource denial (harass enemy harvesters)

## Summary

This system provides intelligent, strategic responses to hostile encounters. By avoiding fights when weak, blocking when moderate, and attacking when strong, your bot maximizes survival and growth. The scout-first approach ensures you never waste resources on doomed missions, while the threat assessment ensures appropriate responses to each situation.

**Remember**: In Screeps, the best fight is often the one you don't have!