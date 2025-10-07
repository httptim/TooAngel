'use strict';


const {debugLog} = require('./logging');
const {findRoomsWithinReach} = require('./helper_findMyRooms');
const {canSupportExpansion} = require('./brain_economy');

/**
 * isClaimableRoom - Checks if a room is claimable
 * - not already claimed
 * - has a controller
 * - has at least two sources
 * - is not `Occupied`
 * - is not `Reserved`
 *
 * @param {string} roomName - The room to check
 * @return {boolean} - If the room is claimable
 **/
function isClaimableRoom(roomName) {
  const data = global.data.rooms[roomName];
  if (Memory.myRooms.indexOf(roomName) >= 0) {
    return false;
  }
  if (!data.controllerId) {
    return false;
  }
  if (data.sources < 2) {
    return false;
  }
  if (data.state === 'Occupied') {
    return false;
  }
  if (data.state === 'Controlled') {
    return false;
  }
  if (data.state === 'HostileReserved') {
    return false;
  }
  return true;
}

/**
 * getMinLinearDistanceToMyRooms
 *
 * @param {string} roomName
 * @return {number}
 */
function getMinLinearDistanceToMyRooms(roomName) {
  let minDistance = config.nextRoom.maxDistance;
  for (const myRoom of Memory.myRooms) {
    const distance = Game.map.getRoomLinearDistance(roomName, myRoom);
    minDistance = Math.min(distance, minDistance);
  }
  return minDistance;
}

/**
 * Advanced room scoring system
 * @param {string} roomName - Room to score
 * @param {string} originRoom - Room expanding from
 * @return {number} - Higher is better
 */
function scoreClaimableRoom(roomName, originRoom) {
  const data = global.data.rooms[roomName];
  if (!data) {
    return 0;
  }

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

  // Controller position bonus for corner/edge rooms (easier to defend)
  if (data.controller && data.controller.pos) {
    const controllerX = data.controller.pos.x;
    const controllerY = data.controller.pos.y;
    if (controllerX < 10 || controllerX > 40 || controllerY < 10 || controllerY > 40) {
      score += 500; // Corner/edge bonus
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
 * getNextRoomValuatedRoomMap - Evaluates rooms based on mineral and distance
 * and sort based on the value
 *
 * @param {array} rooms
 * @param {string} originRoom - Room expanding from
 * @return {array}
 */
function getNextRoomValuatedRoomMap(rooms, originRoom) {
  // Use new scoring if originRoom provided
  if (originRoom) {
    const scoredRooms = rooms.map((roomName) => ({
      roomName: roomName,
      value: scoreClaimableRoom(roomName, originRoom),
    }));
    scoredRooms.sort((a, b) => b.value - a.value);
    return scoredRooms;
  }

  // Fallback to old scoring
  const mineralValues = JSON.parse(JSON.stringify(config.nextRoom.mineralValues));
  for (const roomName of Memory.myRooms) {
    mineralValues[global.data.rooms[roomName].mineral] /= 2;
  }
  const evaluatedRooms = rooms.map((roomName) => {
    return {
      value: (config.nextRoom.distanceFactor * getMinLinearDistanceToMyRooms(roomName)) + mineralValues[global.data.rooms[roomName].mineral],
      roomName: roomName,
    };
  });
  evaluatedRooms.sort((a, b) => b.value - a.value);
  return evaluatedRooms;
}

/**
 * haveEnoughSystemResources
 *
 * @return {bool}
 */
function haveEnoughSystemResources() {
  if (config.nextRoom.resourceStats) {
    debugLog('nextroomer', `stats: ${JSON.stringify(global.data.stats)}`);
    const myRoomsLength = Memory.myRooms.length;
    const cpuPerRoom = global.data.stats.cpuUsed / myRoomsLength;
    if (cpuPerRoom > global.data.stats.cpuIdle) {
      debugLog('nextroomer', `not enough cpu: ${cpuPerRoom} > ${global.data.stats.cpuIdle}`);
      return false;
    }
    const heapPerRoom = global.data.stats.heapUsed / myRoomsLength;
    if (heapPerRoom > global.data.stats.heapFree) {
      debugLog('nextroomer', `not enough heap: ${heapPerRoom} > ${global.data.stats.heapFree}`);
      return false;
    }
    const memoryPerRoom = global.data.stats.memoryUsed / myRoomsLength;
    if (memoryPerRoom > global.data.stats.memoryFree) {
      debugLog('nextroomer', `not enough heap: ${memoryPerRoom} > ${global.data.stats.memoryFree}`);
      return false;
    }
  } else {
    if (Memory.myRooms.length >= Game.gcl.level) {
      return false;
    }

    if (Memory.myRooms.length >= config.nextRoom.maxRooms) {
      return false;
    }

    if ((Memory.myRooms.length + 1) * config.nextRoom.cpuPerRoom >= Game.cpu.limit) {
      return false;
    }
  }
  return true;
}

/**
 * claimRoom
 *
 * @param {list} possibleRooms
 */
function claimRoom(possibleRooms) {
  const roomsWithinReach = possibleRooms.filter((room) => findRoomsWithinReach(room).length > 0);
  debugLog('nextroomer', `roomsWithinReach: ${JSON.stringify(roomsWithinReach)}`);

  const evaluatedRooms = getNextRoomValuatedRoomMap(roomsWithinReach);
  const selectedRoomName = evaluatedRooms[0].roomName;

  const possibleMyRooms = findRoomsWithinReach(selectedRoomName);
  const selectedMyRoom = possibleMyRooms[Math.floor(Math.random() * possibleMyRooms.length)];
  debugLog('nextroomer', `handleNextroomer - Will claim: ${selectedRoomName} from ${selectedMyRoom} based on ${JSON.stringify(evaluatedRooms)}`);
  // TODO selected the closest, highest energy, highest spawn idle room to spawn the claimer
  const room = Game.rooms[selectedMyRoom];
  const selectedRoomData = global.data.rooms[selectedRoomName];
  room.checkRoleToSpawn('claimer', 1, selectedRoomData.controllerId, selectedRoomName);
  for (const myRoomName of possibleMyRooms) {
    const myRoom = Game.rooms[myRoomName];
    if (!myRoom.isStruggling()) {
      continue;
    }
    myRoom.checkRoleToSpawn('nextroomer', 1, selectedRoomData.controllerId, selectedRoomName);
  }
}

brain.handleNextroomer = function() {
  if (!Memory.myRooms) {
    return;
  }
  if (Memory.myRooms.length >= Game.gcl.level) {
    return;
  }
  if (Game.time % config.nextRoom.intervalToCheck !== 0) {
    return;
  }

  debugLog('nextroomer', 'handleNextroom !!!!!!!!!!!!!!!!!!!!!!!');
  if (!haveEnoughSystemResources()) {
    return;
  }

  debugLog('nextroomer', 'handleNextroomer');

  const possibleRooms = Object.keys(global.data.rooms).filter(isClaimableRoom);
  if (possibleRooms.length > 0) {
    claimRoom(possibleRooms);
    return;
  }

  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    room.debugLog('nextroomer', `brain.handleNextroomer spawn scout to find claimable rooms`);
    room.checkRoleToSpawn('scout');
  }
};
