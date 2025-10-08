'use strict';

/**
 * Squad formation types
 */
const FORMATIONS = {
  QUAD: 'quad',      // 2x2 formation for maximum damage
  LINE: 'line',      // Line formation for walls
  SCATTER: 'scatter' // Spread out to avoid AOE
};

/**
 * Get formation positions for squad members
 */
Creep.prototype.getFormationPosition = function(squad, role, formation = FORMATIONS.QUAD) {
  const members = [];

  // Collect all squad members
  if (squad.siege) {
    Object.keys(squad.siege).forEach(id => {
      const creep = Game.getObjectById(id);
      if (creep) members.push(creep);
    });
  }
  if (squad.heal) {
    Object.keys(squad.heal).forEach(id => {
      const creep = Game.getObjectById(id);
      if (creep) members.push(creep);
    });
  }

  // Sort for consistent ordering
  members.sort((a, b) => a.id.localeCompare(b.id));

  const myIndex = members.findIndex(m => m.id === this.id);
  if (myIndex === -1) return null;

  // Get leader (first member)
  const leader = members[0];
  if (!leader) return null;

  switch (formation) {
    case FORMATIONS.QUAD:
      // 2x2 formation
      const positions = [
        {x: 0, y: 0},  // Leader
        {x: 1, y: 0},  // Right
        {x: 0, y: 1},  // Below
        {x: 1, y: 1}   // Diagonal
      ];
      const offset = positions[myIndex % 4];
      return new RoomPosition(
        Math.min(49, Math.max(0, leader.pos.x + offset.x)),
        Math.min(49, Math.max(0, leader.pos.y + offset.y)),
        leader.pos.roomName
      );

    case FORMATIONS.LINE:
      // Horizontal line
      return new RoomPosition(
        Math.min(49, Math.max(0, leader.pos.x + myIndex)),
        leader.pos.y,
        leader.pos.roomName
      );

    case FORMATIONS.SCATTER:
      // Spread out with 2 tile spacing
      const angle = (myIndex * 2 * Math.PI) / members.length;
      const distance = 3;
      return new RoomPosition(
        Math.min(49, Math.max(0, leader.pos.x + Math.round(Math.cos(angle) * distance))),
        Math.min(49, Math.max(0, leader.pos.y + Math.round(Math.sin(angle) * distance))),
        leader.pos.roomName
      );

    default:
      return null;
  }
};

/**
 * Move in squad formation
 */
Creep.prototype.squadFormationMove = function(squad, target, formation = FORMATIONS.QUAD) {
  const formationPos = this.getFormationPosition(squad, this.memory.role, formation);

  if (formationPos) {
    // Check if in position
    if (!this.pos.isEqualTo(formationPos)) {
      // Move to formation position
      this.moveTo(formationPos, {range: 0, maxRooms: 1});
      this.say('📍');
      return true;
    }
  }

  // If in formation or no formation, move as group toward target
  if (target) {
    const leader = this.getSquadLeader(squad);
    if (leader && leader.id === this.id) {
      // Leader moves toward target
      this.moveTo(target, {range: 3, maxRooms: 1});
    } else if (leader) {
      // Others follow leader
      this.moveTo(leader, {range: 1, maxRooms: 1});
    }
  }

  return false;
};

/**
 * Get squad leader (first alive member)
 */
Creep.prototype.getSquadLeader = function(squad) {
  const members = [];

  if (squad.siege) {
    Object.keys(squad.siege).forEach(id => {
      const creep = Game.getObjectById(id);
      if (creep) members.push(creep);
    });
  }
  if (squad.heal) {
    Object.keys(squad.heal).forEach(id => {
      const creep = Game.getObjectById(id);
      if (creep) members.push(creep);
    });
  }

  members.sort((a, b) => a.id.localeCompare(b.id));
  return members[0];
};

/**
 * Original squad move function - enhanced
 */
Creep.prototype.squadMove = function(squad, maxRange, moveRandom, role) {
  // Check for combat situation
  const enemies = this.room.find(FIND_HOSTILE_CREEPS);
  const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES);

  if (enemies.length > 0 || hostileStructures.length > 0) {
    // Combat mode - use formation
    const target = enemies[0] || hostileStructures[0];
    return this.squadFormationMove(squad, target.pos, FORMATIONS.QUAD);
  }

  // Original travel behavior
  if (this.room.name === squad.moveTarget) {
    const nextExits = this.room.find(this.memory.routing.route[this.memory.routing.routePos].exit);
    if (nextExits.length < 1) {
      return false;
    }
    const nextExit = nextExits[Math.floor(nextExits.length / 2)];
    const range = this.pos.getRangeTo(nextExit.x, nextExit.y);
    if (range < maxRange) {
      Memory.squads[this.memory.squad][role][this.id].waiting = true;
      if (moveRandom) {
        this.moveRandom();
      }
      return true;
    }
  }
  return false;
};
