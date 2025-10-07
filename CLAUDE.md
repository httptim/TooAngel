# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the TooAngel bot for Screeps - a fully automated AI codebase for the MMO RTS game Screeps. The bot handles all aspects of colony management including base building, resource gathering, military operations, market trading, and territorial expansion. This is a mature open-source project with automated deployment to the public Screeps server.

## Common Commands

### Testing & Linting
- `npm test` - Run ESLint and full test suite
- `npm run test-no-server` - Run tests without server (faster)
- `npm run lint` - Run ESLint only

### Deployment
- `npm run deploy` - Deploy to Screeps server (requires credentials)
- `npm run deployLocal` - Deploy to local Screeps server
- `screeps-api upload src/*` - Direct upload to server

### Development
- `npm run setupTestServer` - Start test server with Docker Compose
- `npm run followLogs` - Monitor local server logs
- `npm run run-test` - Run tests on test server

## Code Architecture

### Execution Flow

The bot uses a three-tier execution model: **Brain → Room → Creep**. Execution begins in `src/main.js`, which initializes prototype extensions and calls `brain_main.execute()`. The brain module orchestrates global operations (memory cleanup via `brain_memory.js`, market operations via `brain_memory_market.js`, room expansion via `brain_nextroom.js`, squad coordination via `brain_squadmanager.js`, and statistics tracking via `brain_stats.js`) before iterating through all visible rooms. Each room calls `room.execute()` which then invokes `creep.handle()` for every creep in the room.

### Prototype Extension System

The codebase heavily extends native Screeps objects through prototype files:

- **Room prototypes**: Split by concern - `prototype_room_my.js` for owned rooms, `prototype_room_external.js` for remote harvesting, `prototype_room_basebuilder.js` for automated base layout calculation, `prototype_room_market.js` for terminal trading, `prototype_room_defense.js` for tower operations, etc.

- **Creep prototypes**: Specialized by function - `prototype_creep_move.js` for pathfinding, `prototype_creep_fight.js` for combat, `prototype_creep_harvest.js` for resource gathering, `prototype_creep_resources.js` for hauling and storage, `prototype_creep_routing.js` for multi-room movement.

- **Heap system**: Both Room and Creep use lazy-initialized heap properties (`global.data.rooms` and `global.data.creeps`) to cache expensive calculations without polluting Memory. This reduces serialization overhead and improves CPU performance.

### Role-Based Creep System

The bot has 30+ specialized roles defined in `role_*.js` files in the `src/` directory. Each role exports a configuration object with:
- **Body templates**: String notation like "MWC" (Move-Work-Carry) with scaling logic
- **Spawn settings**: Priority, conditions, and limits
- **action() method**: Main behavior executed when the creep reaches its destination

Key roles include:
- `role_sourcer.js` - Harvests energy from sources
- `role_carry.js` - Transports resources between structures
- `role_upgrader.js` - Upgrades room controllers
- `role_universal.js` - Flexible fill-everything role for early game
- `role_defender.js` - Defensive combat
- `role_squadsiege.js` - Offensive military operations

Roles register in the `global.roles` object during module loading. When `creep.handle()` executes, it retrieves the role via `this.unit()` (which looks up `roles[this.memory.role]`), handles routing to the target room, then calls `unit.action(this)` when the creep arrives at its destination.

### Room Management Architecture

The bot distinguishes between owned rooms and external rooms:

- **Owned rooms**: Flow is `myHandleRoom()` → `executeRoom()`. The execute function orchestrates base building (via `prototype_room_basebuilder.js`), manages spawning priority queues, operates towers, handles market activity, and maintains infrastructure. Base layout uses sophisticated cost matrices and PathFinder algorithms to calculate optimal structure placement.

- **External rooms**: Handled by `externalHandleRoom()`, focusing on resource extraction, defense setup, and room reservation with `CLAIM` parts.

### Brain Modules

Brain modules operate at a higher level than individual rooms:
- `brain_nextroom.js` - Evaluates and claims new rooms based on mineral value, source count, and distance from existing bases
- `brain_squadmanager.js` - Coordinates multi-creep military operations and attack campaigns
- `brain_memory.js` - Performs Memory cleanup and construction site aging to prevent memory bloat
- `brain_stats.js` - Tracks performance metrics and CPU usage
- `brain_memory_market.js` - Manages global market operations and resource trading

### Configuration

`src/config.js` contains extensive bot configuration including:
- Feature toggles (auto-expansion, market trading, power processing)
- Economic thresholds and priorities
- Military behavior settings
- Debug and visualization options

## Code Style & Conventions

### ESLint Configuration
- Google JavaScript style guide extended
- Complexity limit: 13
- Max statements per function: 30
- Max line length: 240 characters
- Requires JSDoc for functions, methods, and classes
- 2-space indentation

### Global Objects
The bot uses several global objects:
- `global.config` - Bot configuration
- `global.brain` - Brain module instances
- `global.roles` - Role definitions
- `global.cache` - Caching layer
- `global.visualizer` - Visualization tools
- `global.data.rooms` / `global.data.creeps` - Heap storage

### Important Patterns
1. **Lazy initialization**: Use getters that cache expensive operations in heap
2. **Role registration**: Roles self-register during module load
3. **Memory efficiency**: Minimize Memory writes, use heap for transient data
4. **CPU optimization**: Early exits, caching, and conditional execution based on CPU budget

## Development Notes

- The project uses Grunt for build automation (see `Gruntfile.js`)
- Tests use Mocha/Chai framework
- The bot is designed for continuous operation with automated deployment
- Community contributions are merged automatically via World Driven process (see CONTRIBUTING.md)
- When modifying roles, ensure body templates scale properly with available energy (300-3000+ energy)
- Base building logic is complex - changes to `prototype_room_basebuilder.js` should be tested thoroughly
- Combat and military operations are coordinated via squad system in `brain_squadmanager.js`

## Project Goals

The current focus is evolving from TooAngel's cautious, defensive approach toward more aggressive territorial expansion (see `src/docs/Overview.md` for detailed strategic roadmap). The bot is being enhanced with sophisticated combat tactics including:
- Quad formation movement for coordinated attacks
- Kiting mechanics for ranged units
- Focus fire coordination
- Tactical retreat logic
- Economic warfare capabilities
- Dynamic CPU allocation for combat operations

## File Organization

The `src/` directory contains:
- Main entry point: `main.js`
- Brain modules: `brain_*.js`
- Prototype extensions: `prototype_*.js`
- Role definitions: `role_*.js`
- Utility modules: `config.js`, `diplomacy.js`, `find.js`, `helpers.js`, `logging.js`
- Documentation: `docs/` subdirectory

When adding new features, follow the existing architectural patterns: prototype extensions for object-level behavior, roles for creep behavior, brain modules for global coordination.
