/**
 * IndexedDB管理 (Dexie.js)
 */

// DB は app.js で初期化後にセットされる
let db = null;

export function initDB() {
  db = new Dexie('BaseballScorebook');
  
  db.version(1).stores({
    teams:   '++id, name, createdAt',
    members: '++id, teamId, name, number, createdAt',
    games:   '++id, teamId, date, status, createdAt',
    atBats:  '++id, gameId, inning, side, order, timestamp',
    plays:   '++id, gameId, inning, side, relatedAtBatId, order, timestamp',
    pitcherStats: '++id, gameId',
    opponentScores: '++id, gameId, inning, side',
  });

  db.version(2).stores({
    teams:   '++id, name, createdAt',
    members: '++id, teamId, name, number, createdAt',
    games:   '++id, teamId, date, status, createdAt',
    atBats:  '++id, gameId, inning, side, order, timestamp',
    plays:   '++id, gameId, inning, side, relatedAtBatId, order, timestamp',
    pitcherStats: '++id, gameId, inning, side',
    opponentScores: '++id, gameId, inning, side',
  });

  return db;
}

export function getDB() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// ── Teams ──
export async function getTeams() {
  return db.teams.orderBy('createdAt').reverse().toArray();
}

export async function getTeam(id) {
  return db.teams.get(id);
}

export async function addTeam(team) {
  return db.teams.add({ ...team, createdAt: Date.now() });
}

export async function updateTeam(id, changes) {
  return db.teams.update(id, changes);
}

export async function deleteTeam(id) {
  await db.transaction('rw', [db.teams, db.members, db.games, db.atBats, db.plays, db.pitcherStats, db.opponentScores], async () => {
    const games = await db.games.where('teamId').equals(id).toArray();
    for (const game of games) {
      await db.atBats.where('gameId').equals(game.id).delete();
      await db.plays.where('gameId').equals(game.id).delete();
      await db.pitcherStats.where('gameId').equals(game.id).delete();
      await db.opponentScores.where('gameId').equals(game.id).delete();
    }
    await db.games.where('teamId').equals(id).delete();
    await db.members.where('teamId').equals(id).delete();
    await db.teams.delete(id);
  });
}

// ── Members ──
export async function getMembers(teamId) {
  return db.members.where('teamId').equals(teamId).toArray();
}

export async function getMember(id) {
  return db.members.get(id);
}

export async function addMember(member) {
  return db.members.add({ ...member, createdAt: Date.now() });
}

export async function updateMember(id, changes) {
  return db.members.update(id, changes);
}

export async function deleteMember(id) {
  return db.members.delete(id);
}

// ── Games ──
export async function getGames(teamId) {
  return db.games.where('teamId').equals(teamId).reverse().sortBy('createdAt');
}

export async function getGame(id) {
  return db.games.get(id);
}

export async function addGame(game) {
  return db.games.add({ ...game, createdAt: Date.now() });
}

export async function updateGame(id, changes) {
  return db.games.update(id, changes);
}

export async function deleteGame(id) {
  await db.transaction('rw', [db.games, db.atBats, db.plays, db.pitcherStats, db.opponentScores], async () => {
    await db.atBats.where('gameId').equals(id).delete();
    await db.plays.where('gameId').equals(id).delete();
    await db.pitcherStats.where('gameId').equals(id).delete();
    await db.opponentScores.where('gameId').equals(id).delete();
    await db.games.delete(id);
  });
}

// ── AtBats ──
export async function getAtBats(gameId) {
  return db.atBats.where('gameId').equals(gameId).sortBy('order');
}

export async function addAtBat(atBat) {
  return db.atBats.add({ ...atBat, timestamp: Date.now() });
}

export async function updateAtBat(id, changes) {
  return db.atBats.update(id, changes);
}

export async function deleteAtBat(id) {
  return db.atBats.delete(id);
}

// ── Plays ──
export async function getPlays(gameId) {
  return db.plays.where('gameId').equals(gameId).sortBy('order');
}

export async function addPlay(play) {
  return db.plays.add({ ...play, timestamp: Date.now() });
}

export async function updatePlay(id, changes) {
  return db.plays.update(id, changes);
}

export async function deletePlay(id) {
  return db.plays.delete(id);
}

// ── All Events (merged and sorted) ──
export async function getAllEvents(gameId) {
  const [atBats, plays] = await Promise.all([
    getAtBats(gameId),
    getPlays(gameId),
  ]);
  
  const events = [
    ...atBats.map(ab => ({ ...ab, type: 'atBat' })),
    ...plays.map(p => ({ ...p, type: 'play' })),
  ];
  
  events.sort((a, b) => a.order - b.order);
  return events;
}

/** 次のorder値を取得 */
export async function getNextOrder(gameId) {
  const events = await getAllEvents(gameId);
  if (events.length === 0) return 1;
  return Math.max(...events.map(e => e.order)) + 1;
}

// ── Opponent Scores ──
export async function getOpponentScores(gameId) {
  return db.opponentScores.where('gameId').equals(gameId).toArray();
}

export async function setOpponentScore(gameId, inning, side, runs) {
  // upsert
  const existing = await db.opponentScores
    .where('gameId').equals(gameId)
    .filter(s => s.inning === inning && s.side === side)
    .first();
  
  if (existing) {
    return db.opponentScores.update(existing.id, { runs });
  } else {
    return db.opponentScores.add({ gameId, inning, side, runs });
  }
}

// ── Pitcher Stats ──
export async function getPitcherStats(gameId, inning = null, side = null) {
  const all = await db.pitcherStats.where('gameId').equals(gameId).toArray();
  if (inning === null) return all;
  return all.filter((s) => {
    const inningMatch = (s.inning ?? null) === inning;
    const sideMatch = side === null ? true : (s.side ?? null) === side;
    return inningMatch && sideMatch;
  });
}

export async function deletePitcherStat(id) {
  return db.pitcherStats.delete(id);
}

export async function updatePitcherStat(id, changes) {
  return db.pitcherStats.update(id, changes);
}

export async function setPitcherStats(gameId, stats, inning = null, side = null) {
  const existing = await db.pitcherStats
    .where('gameId').equals(gameId)
    .filter((s) => (s.inning ?? null) === inning && (s.side ?? null) === side)
    .first();

  if (existing) {
    return db.pitcherStats.update(existing.id, stats);
  } else {
    return db.pitcherStats.add({ gameId, inning, side, ...stats });
  }
}

export async function addPitcherStats(gameId, stats, inning = null, side = null) {
  return db.pitcherStats.add({ gameId, inning, side, ...stats });
}

export async function getNextPitcherAppearanceOrder(gameId) {
  const all = await db.pitcherStats.where('gameId').equals(gameId).toArray();
  if (all.length === 0) return 1;
  return Math.max(...all.map((s) => Number(s.appearanceOrder) || 0)) + 1;
}

// ── Active Games ──
export async function getActiveGames() {
  return db.games.where('status').equals('active').reverse().sortBy('createdAt');
}

// ── Event Reorder (transactional) ──
export async function reorderAllEvents(gameId) {
  const events = await getAllEvents(gameId);
  events.sort((a, b) => a.order - b.order);
  await db.transaction('rw', [db.atBats, db.plays], async () => {
    for (let i = 0; i < events.length; i++) {
      const newOrder = i + 1;
      if (events[i].order !== newOrder) {
        if (events[i].type === 'atBat') await db.atBats.update(events[i].id, { order: newOrder });
        else await db.plays.update(events[i].id, { order: newOrder });
      }
    }
  });
}

// ── Export / Import ──
export async function exportAllData() {
  const [teams, members, games, atBats, plays, pitcherStats, opponentScores] = await Promise.all([
    db.teams.toArray(),
    db.members.toArray(),
    db.games.toArray(),
    db.atBats.toArray(),
    db.plays.toArray(),
    db.pitcherStats.toArray(),
    db.opponentScores.toArray(),
  ]);
  return { version: 2, exportedAt: Date.now(), teams, members, games, atBats, plays, pitcherStats, opponentScores };
}

export async function importAllData(data) {
  if (!data || data.version !== 2) throw new Error('サポートされていないデータ形式です（バージョン2のみ対応）');
  await db.transaction('rw', [db.teams, db.members, db.games, db.atBats, db.plays, db.pitcherStats, db.opponentScores], async () => {
    await Promise.all([
      db.teams.clear(), db.members.clear(), db.games.clear(),
      db.atBats.clear(), db.plays.clear(), db.pitcherStats.clear(), db.opponentScores.clear(),
    ]);
    if (data.teams?.length) await db.teams.bulkAdd(data.teams);
    if (data.members?.length) await db.members.bulkAdd(data.members);
    if (data.games?.length) await db.games.bulkAdd(data.games);
    if (data.atBats?.length) await db.atBats.bulkAdd(data.atBats);
    if (data.plays?.length) await db.plays.bulkAdd(data.plays);
    if (data.pitcherStats?.length) await db.pitcherStats.bulkAdd(data.pitcherStats);
    if (data.opponentScores?.length) await db.opponentScores.bulkAdd(data.opponentScores);
  });
}
