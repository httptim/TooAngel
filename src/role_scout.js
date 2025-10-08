'use strict';

/*
 * scout moves around to provide visibility
 */

const {updateRoomIntelligence} = require('./scout_intelligence');

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
      creep.memory.noviceWallDetected = false;
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
  // If stuck for too long, check for novice walls or pick new room
  if (incompleteCount > 25) {
    // Check if we're stuck at room border (possible novice wall)
    if (creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49) {
      if (!creep.memory.noviceWallDetected) {
        creep.log(`Possible novice wall detected at border to ${creep.data.nextRoom}`);
        creep.memory.noviceWallDetected = true;
        // Mark this room as inaccessible for a while
        if (!Memory.inaccessibleRooms) {
          Memory.inaccessibleRooms = {};
        }
        Memory.inaccessibleRooms[creep.data.nextRoom] = Game.time + 1500; // Remember for 1500 ticks
      }
    }
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
  const exits = Game.map.describeExits(creep.room.name);
  const rooms = Object.keys(exits).map((direction) => exits[direction]);

  // Filter out inaccessible rooms (novice walls, etc.)
  const accessibleRooms = rooms.filter(room => {
    if (Memory.inaccessibleRooms && Memory.inaccessibleRooms[room]) {
      // Check if the inaccessibility has expired
      if (Memory.inaccessibleRooms[room] > Game.time) {
        return false; // Still inaccessible
      } else {
        // Clean up expired entry
        delete Memory.inaccessibleRooms[room];
      }
    }
    return true;
  });

  // If all rooms are inaccessible, fall back to original list
  const roomsToCheck = accessibleRooms.length > 0 ? accessibleRooms : rooms;
  roomsToCheck.sort(() => Math.random() - 0.5);

  let nextRoom = roomsToCheck[0];
  let lastSeen = (global.data.rooms[nextRoom] || {}).lastSeen;
  for (const room of roomsToCheck) {
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
  // Gather comprehensive intelligence about current room
  const intel = updateRoomIntelligence(creep.room);

  // Report critical findings
  if (intel.assessment.attackRecommended && intel.assessment.attackPriority >= 4) {
    creep.log(`High-priority target found in ${creep.room.name}: ${intel.assessment.attackStrategy}`);
  }
  if (intel.remoteHarvesters.length > 0) {
    creep.log(`Enemy harvesters in ${creep.room.name}: ${intel.remoteHarvesters.map(h => h.owner).join(', ')}`);
  }

  if (!creep.data.nextRoom) {
    creep.data.nextRoom = getNextRoom(creep);
  }
  if (creep.room.name === creep.data.nextRoom) {
    creep.data.nextRoom = getNextRoom(creep);
  }
  creep.say(creep.data.nextRoom);
  move(creep);
}

roles.scout.action = function(creep) {
  creep.notifyWhenAttacked(false);
  explore(creep);
  return true;
};
