# Remote Mining Fix - Smart Scouting & Safe Harvesting

## The Problem

After implementing the remote mining brain in Phase 2, you noticed that:
1. The console showed rooms were being assigned for remote mining
2. `Memory.remoteMining` contained the correct assignments
3. **BUT** no creeps were actually spawning to harvest these rooms

## Root Cause

The TooAngel bot has two separate systems that weren't connected:

1. **Our new system**: `brain_remote_mining.js` which assigns rooms to `Memory.remoteMining`
2. **Existing system**: `prototype_room_external.js` which uses `room.data.reservation` to track which base owns a room

The existing spawning logic (`checkSourcer()` and `checkAndSpawnReserver()`) only works when a room has `data.reservation` set. Our new brain was assigning rooms to `Memory.remoteMining` but never setting up the reservation data structure.

## The Solution

Modified `/src/prototype_room_external.js` in the `handleUnreservedRoom()` function to bridge the gap:

```javascript
Room.prototype.handleUnreservedRoom = function() {
  // ... existing checks ...

  // NEW: Check if this room is assigned in Memory.remoteMining
  if (Memory.remoteMining) {
    for (const baseRoom in Memory.remoteMining) {
      if (Memory.remoteMining[baseRoom].includes(this.name)) {
        // This room is assigned for remote mining from baseRoom
        this.data.reservation = {
          base: baseRoom,
          created: Game.time,
        };
        this.debugLog('reserver', `Remote mining assignment: ${this.name} assigned to ${baseRoom}`);
        return this.handleUnreservedRoomWithReservation();
      }
    }
  }

  // ... continue with existing logic ...
}
```

## How It Works Now

1. **Brain assigns rooms** (every 500 ticks):
   - `brain_remote_mining.js` analyzes nearby rooms
   - Assigns best candidates to `Memory.remoteMining[baseRoom]`
   - Example: `Memory.remoteMining['W1N1'] = ['W1N2', 'W2N1']`

2. **Room gets visited** (when creep enters or visibility):
   - `handleUnreservedRoom()` is called
   - Checks if room is in `Memory.remoteMining`
   - If yes, creates `data.reservation` linking it to the base

3. **Spawning happens automatically**:
   - `handleUnreservedRoomWithReservation()` is called
   - This triggers `checkSourcer()` to spawn sourcers
   - For RCL 2+, also triggers `checkAndSpawnReserver()`
   - Base room spawns creeps with the remote room as target

## Why Creeps Weren't Spawning Before

The room needs to be "seen" (have visibility) for the external room handler to run. If you just assigned rooms but never had vision of them, they wouldn't spawn. Now with the fix:

1. As soon as a scout or any creep enters an assigned room
2. OR if you have observer coverage
3. The room will be linked to its base and spawning will begin

## Road Building

Road building is already implemented and automatic:
- Sourcer role has `buildRoad = true` property
- When sourcers move, they call `buildRoad()` in their movement code
- This creates construction sites along frequently traveled paths
- Roads will be built automatically as sourcers travel to/from remote rooms

## Testing the Fix

1. **Check assignments**:
   ```javascript
   Memory.remoteMining
   // Should show: {W1N1: ['W1N2'], W2N2: ['W2N3']}
   ```

2. **Check room reservation** (after room is visible):
   ```javascript
   Game.rooms['W1N2'].data.reservation
   // Should show: {base: 'W1N1', created: 12345}
   ```

3. **Watch for spawning**:
   - Enable debug: `config.debug.spawn = true`
   - Should see: "Spawn: sourcer for W1N2" messages

4. **Monitor creep movement**:
   - Sourcers should path to assigned rooms
   - Roads should appear along their paths over time

## If Still Not Working

1. **No visibility**: Make sure scout creeps are exploring to give vision
2. **Wrong RCL requirements**: Check early game logic in `handleUnreservedRoomWithReservation()`
3. **Energy too low**: Need at least 300 energy at RCL 1-3
4. **Distance too far**: Early game limited to 2 tiles distance

## Strategic Scout System (NEW)

After your feedback about smart strategy, we've added a scout-first approach:

### 1. Scout Spawning (`brain_remote_mining.js`)
```javascript
brain.spawnScoutsForRemoteMining = function() {
  // For each remote mining target
  // If room hasn't been seen in 1000 ticks or never seen
  // Spawn a scout with that specific target
}
```

### 2. Scout Priority (`role_scout.js`)
Scouts now prioritize assigned targets:
- If `creep.memory.target` exists, go there first
- Once target reached, resume normal exploration
- This ensures remote mining rooms get scouted quickly

### 3. Safety Check (`prototype_room_external.js`)
Before assigning sourcers to a room:
```javascript
// Check if room is safe before assigning
const hostileCreeps = this.find(FIND_HOSTILE_CREEPS);
const hostileStructures = this.find(FIND_HOSTILE_STRUCTURES);

if (hostileCreeps.length > 0 || hostileStructures.length > 0) {
  // Skip this room, mark as hostile
  Memory.hostileRooms[this.name] = Game.time;
  continue;
}
```

## Complete Flow (Scout → Harvest)

```
1. Brain assigns remote mining targets (Memory.remoteMining)
   ↓
2. Scout spawner checks each target's visibility
   ↓
3. If not seen recently, spawn scout with target
   ↓
4. Scout travels to assigned room (cheap, 1 MOVE part)
   ↓
5. Room handler checks if room is safe
   ↓
6. If safe: Create reservation, spawn sourcers
   If hostile: Mark hostile, skip room
   ↓
7. Sourcers harvest, build roads automatically
```

## Benefits of Scout-First Approach

✅ **Cost Efficient**: Scouts are cheap (50 energy) vs sourcers (300+ energy)
✅ **Intelligence**: Know room status before committing resources
✅ **Safety**: Never send harvesters into hostile territory
✅ **Adaptive**: Automatically skip dangerous rooms
✅ **Road Planning**: Scouts reveal terrain for optimal road placement

## Summary

The complete fix involves three layers:
1. **Assignment**: Smart room selection via `Memory.remoteMining`
2. **Reconnaissance**: Scout-first strategy for safety
3. **Execution**: Only spawn harvesters to confirmed safe rooms

This creates a strategic, efficient remote mining system that minimizes losses!