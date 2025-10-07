'use strict';

/**
 * Traffic Resolver - Resolves all registered movement intentions
 * This is called at the end of room execution to coordinate creep movements
 * and prevent traffic jams.
 */

/**
 * Resolves traffic for a room
 * @param {Room} room - The room to resolve traffic for
 */
Room.prototype.resolveTraffic = function() {
  if (!config.trafficManager || !config.trafficManager.enabled) {
    return;
  }

  const movementMap = new Map();
  const terrain = Game.map.getRoomTerrain(this.name);
  const creepsInRoom = this.find(FIND_MY_CREEPS);

  // Initialize all creeps at their current positions
  creepsInRoom.forEach((creep) => {
    const packedCoord = creep._packCoordinates(creep.pos);
    creep._matchedPackedCoord = packedCoord;
    movementMap.set(packedCoord, creep);
  });

  // Process each creep's intended movement
  for (const creep of creepsInRoom) {
    const intendedPackedCoord = creep._intendedPackedCoord;

    if (!intendedPackedCoord) {
      continue;
    }

    const matchedPackedCoord = creep._matchedPackedCoord;

    if (matchedPackedCoord === intendedPackedCoord) continue;

    const visitedCreeps = new Set();
    movementMap.delete(matchedPackedCoord);
    delete creep._matchedPackedCoord;

    if (this._depthFirstSearch(creep, 0, terrain, movementMap, visitedCreeps) > 0) {
      continue;
    }

    // Couldn't find a path, creep stays in place
    creep._matchedPackedCoord = creep._packCoordinates(creep.pos);
    movementMap.set(creep._matchedPackedCoord, creep);
  }

  // Execute all resolved movements
  creepsInRoom.forEach((creep) => {
    if (!creep._matchedPackedCoord) {
      return;
    }

    const matchedPos = creep._unpackCoordinates(creep._matchedPackedCoord);
    
    if (!creep.pos.isEqualTo(matchedPos.x, matchedPos.y)) {
      creep._originalMove(creep.pos.getDirectionTo(matchedPos.x, matchedPos.y));
    }
  });
};

/**
 * Depth-first search to find movement solutions
 */
Room.prototype._depthFirstSearch = function(creep, score, terrain, movementMap, visitedCreeps) {
  visitedCreeps.add(creep.name);

  if (!creep.my) {
    return -Infinity;
  }

  const possibleMoves = this._getPossibleMoves(creep, terrain);
  const emptyTiles = [];
  const occupiedTiles = [];

  for (const coord of possibleMoves) {
    const packed = creep._packCoordinates(coord);
    if (movementMap.get(packed)) {
      occupiedTiles.push(coord);
    } else {
      emptyTiles.push(coord);
    }
  }

  for (const coord of [...emptyTiles, ...occupiedTiles]) {
    const packedCoord = creep._packCoordinates(coord);

    if (creep._intendedPackedCoord === packedCoord) {
      score++;
    }

    const occupyingCreep = movementMap.get(packedCoord);

    if (!occupyingCreep) {
      if (score > 0) {
        creep._matchedPackedCoord = packedCoord;
        movementMap.set(packedCoord, creep);
      }
      return score;
    }

    if (!visitedCreeps.has(occupyingCreep.name)) {
      if (occupyingCreep._intendedPackedCoord === packedCoord) {
        score--;
      }

      const result = this._depthFirstSearch(
        occupyingCreep,
        score,
        terrain,
        movementMap,
        visitedCreeps
      );

      if (result > 0) {
        creep._matchedPackedCoord = packedCoord;
        movementMap.set(packedCoord, creep);
        return result;
      }
    }
  }

  return -Infinity;
};

/**
 * Get possible moves for a creep
 */
Room.prototype._getPossibleMoves = function(creep, terrain) {
  const possibleMoves = [];

  if (creep.fatigue > 0 || creep.getActiveBodyparts(MOVE) === 0) {
    return possibleMoves;
  }

  const intendedPackedCoord = creep._intendedPackedCoord;

  if (intendedPackedCoord) {
    possibleMoves.push(creep._unpackCoordinates(intendedPackedCoord));
    return possibleMoves;
  }

  // Random possible moves if no intention set
  const deltas = [
    { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
    { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }
  ];

  for (const delta of deltas) {
    const coord = { x: creep.pos.x + delta.x, y: creep.pos.y + delta.y };

    if (this._isValidMove(coord, terrain)) {
      possibleMoves.push(coord);
    }
  }

  return possibleMoves;
};

/**
 * Check if a move is valid
 */
Room.prototype._isValidMove = function(coord, terrain) {
  if (terrain.get(coord.x, coord.y) === TERRAIN_MASK_WALL) {
    return false;
  }

  if (coord.x === 0 || coord.x === 49 || coord.y === 0 || coord.y === 49) {
    return false;
  }

  return true;
};