# CLAUDE.md - TooAngel Screeps Bot

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with the TooAngel Screeps bot codebase.

## Project Overview

TooAngel is a mature, fully automated AI bot for Screeps - an MMO RTS game where you control colonies through JavaScript code. The bot manages all aspects including resource gathering, base building, military operations, market trading, and territorial expansion. It's designed for continuous 24/7 operation on the public Screeps server.

## Architecture Overview

### Execution Flow: Brain → Room → Creep

The bot follows a three-tier execution model each tick:

1. **Brain Level** (`brain_main.execute()`)
   - Global operations and coordination
   - Memory cleanup and optimization
   - Market operations
   - Room expansion decisions
   - Squad management
   - Statistics tracking

2. **Room Level** (`room.execute()`)
   - Base building and layout
   - Spawn queue management
   - Tower operations
   - Market terminal trading
   - Infrastructure maintenance

3. **Creep Level** (`creep.handle()`)
   - Individual unit behavior
   - Role-based actions
   - Movement and pathfinding
   - Resource management
   - Combat operations

### Code Structure

```
src/
├── main.js                     # Entry point
├── config.js                   # Global configuration
├── brain_*.js                  # Global coordination modules
├── prototype_*.js              # Object extensions
├── role_*.js                   # Creep role definitions
└── docs/                       # Documentation
    ├── Overview.md            # Strategic roadmap
    └── CLAUDE.md             # This file
```

### Module Categories

#### Brain Modules (Global Coordination)
- `brain_main.js` - Core orchestration
- `brain_memory.js` - Memory optimization
- `brain_nextroom.js` - Expansion logic
- `brain_squadmanager.js` - Military coordination
- `brain_stats.js` - Performance tracking
- `brain_memory_market.js` - Market operations

#### Prototype Extensions
- **Room**: `prototype_room_*.js`
  - `_my.js` - Owned room management
  - `_external.js` - Remote harvesting
  - `_basebuilder.js` - Automated base layout
  - `_defense.js` - Tower and defense systems
  - `_market.js` - Terminal trading
- **Creep**: `prototype_creep_*.js`
  - `_move.js` - Pathfinding algorithms
  - `_fight.js` - Combat logic
  - `_harvest.js` - Resource gathering
  - `_resources.js` - Hauling and storage
  - `_routing.js` - Multi-room movement

#### Role System (30+ specialized roles)
Each role in `role_*.js` exports:
- **Body templates**: String notation (e.g., "MWC" for Move-Work-Carry)
- **Spawn settings**: Priority and conditions
- **action()**: Main behavior when at destination
- **preMove()**: Behavior while traveling

Key roles:
- `role_sourcer` - Energy harvesting
- `role_carry` - Resource transport
- `role_upgrader` - Controller upgrading
- `role_defender` - Defensive combat
- `role_squadsiege` - Offensive operations
- `role_claimer` - Room claiming
- `role_nextroomer` - Expansion support

## Development Patterns

### Memory vs Heap

The bot uses a dual storage strategy:
- **Memory**: Persistent data that survives resets
- **Heap**: Cached calculations (`global.data.*`)

```javascript
// Heap storage pattern
Object.defineProperty(Room.prototype, 'data', {
  get() {
    if (!global.data.rooms[this.name]) {
      global.data.rooms[this.name] = {};
    }
    return global.data.rooms[this.name];
  }
});
```

### Role Registration

Roles self-register during module loading:
```javascript
roles.defender = {};
roles.defender.settings = {
  layoutString: 'MRH',  // Move, Ranged Attack, Heal
  amount: {...}         // Scaling configuration
};
roles.defender.action = function(creep) {...};
```

### CPU Optimization

Critical for staying under tick limits:
- Early exits when CPU budget exceeded
- Lazy evaluation for expensive operations
- Caching pathfinding results
- Conditional execution based on intervals

### Configuration System

`config.js` contains extensive settings:
```javascript
global.config = {
  nextRoom: {
    maxRooms: 8,
    cpuPerRoom: 13,
    maxDistance: 10
  },
  autoAttack: {
    minAttackRCL: 6,
    timeBetweenAttacks: 2000
  },
  // ... many more settings
};
```

## Current Strategic Direction

The bot is evolving from TooAngel's defensive approach to a more aggressive territorial expansion strategy (see `docs/Overview.md`):

### Phase 1: Foundation (Current Priority)
- Establish strong home base (RCL 5+)
- Build energy reserves (50k+)
- Fortify defenses (3+ towers, ramparts)
- Stabilize economy

### Phase 2: Aggressive Expansion
- Claim adjacent territory rapidly
- Implement scout detection/elimination
- Deploy attack squads
- Control buffer zones

### Phase 3: Combat Sophistication
- Quad formation attacks
- Kiting mechanics for ranged units
- Focus fire coordination
- Tactical retreat logic

## Code Style Guidelines

### ESLint Configuration
- Google JavaScript style guide
- 2-space indentation
- Max complexity: 13
- Max statements: 30
- Max line length: 240
- JSDoc required for functions

### Naming Conventions
- Prototypes: `prototype_<object>_<feature>.js`
- Roles: `role_<name>.js`
- Brain modules: `brain_<function>.js`
- Helper functions: camelCase
- Constants: UPPER_SNAKE_CASE

### Important Patterns

1. **Lazy Initialization**
```javascript
get targets() {
  if (!this._targets || Game.time > this._cachedTick) {
    this._targets = this.findTargets();
    this._cachedTick = Game.time;
  }
  return this._targets;
}
```

2. **Role-based Behavior**
```javascript
Creep.prototype.handle = function() {
  const unit = this.unit();  // Get role config
  if (this.room.name !== this.memory.routing.targetRoom) {
    this.routeToRoom();     // Travel phase
  } else {
    unit.action(this);      // Action phase
  }
};
```

3. **Performance Guards**
```javascript
if (Game.cpu.getUsed() > Game.cpu.tickLimit * 0.9) {
  return; // Skip non-critical operations
}
```

## Common Development Tasks

### Adding a New Role

1. Create `role_newrole.js`:
```javascript
roles.newrole = {};
roles.newrole.settings = {
  layoutString: 'MWC',
  amount: [1, 1, 1]
};
roles.newrole.action = function(creep) {
  // Implement behavior
};
```

2. Role auto-registers on module load

### Modifying Combat Behavior

Key files:
- `prototype_creep_fight.js` - Combat mechanics
- `brain_squadmanager.js` - Squad coordination
- `diplomacy.js` - Player ratings
- `role_defender.js` - Defensive units

### Enhancing Base Building

- `prototype_room_basebuilder.js` - Layout algorithms
- Cost matrices determine structure placement
- PathFinder calculates optimal positions

### Debugging Tips

1. Enable debug flags in `config.js`:
```javascript
config.debug.attack = true;
config.debug.baseBuilding = true;
```

2. Use room logging:
```javascript
room.debugLog('category', 'message');
```

3. Monitor CPU usage:
```javascript
const start = Game.cpu.getUsed();
// ... code ...
console.log(`Operation took ${Game.cpu.getUsed() - start} CPU`);
```

## Performance Considerations

### CPU Management
- Base limit: 20-300 CPU (depends on GCL)
- CPU Bucket: Accumulates to 10,000
- Burst capacity: Up to 500 CPU/tick
- Target usage: 60-80% during peace

### Memory Limits
- 2MB total Memory size
- Minimize Memory writes
- Use heap for transient data
- Serialize paths efficiently

### Scaling Requirements
- Design for 10+ rooms
- Distribute CPU across rooms
- Prioritize critical operations
- Skip rooms when CPU limited

## Common Pitfalls to Avoid

1. **Memory Bloat**: Don't store large objects in Memory
2. **CPU Waste**: Cache expensive calculations
3. **Path Thrashing**: Reuse paths when possible
4. **Tower Drain**: Limit tower repairs
5. **Spawn Blocking**: Maintain spawn queue priorities

## Integration with External Systems

- **Screeps+**: Statistics dashboard (optional)
- **Grafana**: Performance monitoring
- **GitHub**: Automated deployment
- **Docker**: Local testing environment

## Project Maintenance

### Regular Tasks
- Monitor CPU usage patterns
- Clean up old Memory entries
- Update spawn priorities
- Adjust combat parameters
- Review market operations

### When Adding Features
1. Follow existing patterns
2. Update documentation
3. Consider multi-room scaling

## Support & Resources

- **Documentation**: `src/docs/Overview.md`
- **Community**: GitHub Issues
- **Testing**: `npm test`
- **Deployment**: `npm run deploy`

## Current Development Focus

Based on `Overview.md`, the immediate priorities are:
1. Optimize home room economy
2. Implement adjacent room claiming
3. Strengthen base defenses
4. Establish energy reserves
5. Enhance combat AI for territorial expansion

The long-term goal is transforming from a defensive bot to an aggressive territorial dominator like "Tigga", focusing on rapid expansion, sophisticated combat tactics, and economic warfare.