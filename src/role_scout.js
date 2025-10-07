'use strict';

/*
 * scout moves around to provide visibility
 */

roles.scout = {};
roles.scout.settings = {
  layoutString: 'M',
  amount: [1],
  maxLayoutAmount: 1,
};

/**
 * move - moves the creep to the nextRoom
 *
 * @param {object} creep
 */
function move(creep) {
  let path = creep.memory.path;
  if (path) {
    const moveResult = creep.moveByPath(path);
    if (moveResult === OK) {
      creep.memory.incompleteCount = 0;
      return;
    }
    if (moveResult !== ERR_NOT_FOUND && moveResult !== ERR_INVALID_ARGS) {
      return;
    }
  }
  let incompleteCount = creep.memory.incompleteCount;
  if (!incompleteCount) {
    incompleteCount = 1;
  } else {
    ++incompleteCount;
  }
  if (incompleteCount > 25) {
    incompleteCount = 0;
    creep.data.nextRoom = getNextRoom(creep);
  }
  creep.memory.incompleteCount = incompleteCount;
  const targetPosObject = new RoomPosition(25, 25, creep.data.nextRoom);
  const search = PathFinder.search(
    creep.pos,
    {
      pos: targetPosObject,
      range: 20,
    },
    {
      roomCallback: creep.room.getCostMatrixCallback(targetPosObject, false, true, true),
    },
  );
  creep.memory.path = path = search.path;
  const moveResult = creep.moveByPath(path);
  if (moveResult === OK) {
    creep.memory.incompleteCount = 0;
  }
}

/**
 * getNextRoom
 *
 * @param {object} creep
 * @return {string}
 */
function getNextRoom(creep) {
  // Priority 1: If scout has a specific target (remote mining room), go there
  if (creep.memory.target) {
    // Check if we're already in the target room
    if (creep.room.name === creep.memory.target) {
      // Target reached, clear it and continue normal scouting
      delete creep.memory.target;
    } else {
      // Still need to reach target
      return creep.memory.target;
    }
  }

  // Priority 2: Normal exploration - find least recently seen adjacent room
  const exits = Game.map.describeExits(creep.room.name);
  const rooms = Object.keys(exits).map((direction) => exits[direction]);
  rooms.sort(() => Math.random() - 0.5);
  let nextRoom = rooms[0];
  let lastSeen = (global.data.rooms[nextRoom] || {}).lastSeen;
  for (const room of rooms) {
    const roomLastSeen = (global.data.rooms[room] || {}).lastSeen;
    if ((lastSeen && !roomLastSeen) || (lastSeen > roomLastSeen)) {
      nextRoom = room;
      lastSeen = roomLastSeen;
    }
  }
  return nextRoom;
}

/**
 * explore - follow the unseen or latest `lastSeen` rooms
 *
 * @param {object} creep
 */
function explore(creep) {
  if (!creep.data.nextRoom) {
    creep.data.nextRoom = getNextRoom(creep);
  }
  if (creep.room.name === creep.data.nextRoom) {
    creep.data.nextRoom = getNextRoom(creep);
  }
  creep.say(creep.data.nextRoom);
  move(creep);
}

/**
 * Check for hostiles and report them
 * @param {object} creep - Scout creep
 */
function checkAndReportHostiles(creep) {
  const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
  const hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
    filter: (s) => s.structureType !== STRUCTURE_CONTROLLER &&
                   s.structureType !== STRUCTURE_KEEPER_LAIR
  });

  if (hostileCreeps.length > 0 || hostileStructures.length > 0) {
    // Report hostile room
    if (brain.reportHostileRoom) {
      brain.reportHostileRoom(creep.room.name, 'scout');
    }

    // If this was our target, clear it
    if (creep.memory.target === creep.room.name) {
      delete creep.memory.target;
      creep.say('Hostile!');
    }
  }
}

roles.scout.action = function(creep) {
  creep.notifyWhenAttacked(false);

  // Check for hostiles in current room
  checkAndReportHostiles(creep);

  // If attacked, flee to base
  if (creep.hits < creep.hitsMax) {
    const baseRoom = creep.memory.base;
    if (baseRoom && creep.room.name !== baseRoom) {
      creep.moveTo(new RoomPosition(25, 25, baseRoom));
      creep.say('Flee!');
      return true;
    }
  }

  explore(creep);
  return true;
};
