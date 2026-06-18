/**
 * 状態再計算エンジン
 * 全イベントログから試合状態を計算する（最重要コンポーネント）
 */
import { isHitResult, isOutResult, isOnBaseResult, NOTE_FLAG_DROPPED_THIRD_STRIKE } from '../utils/constants.js';

/**
 * 試合状態を全イベントから再計算
 * @param {Array} events - getAllEvents() の結果
 * @param {Object} game - ゲームデータ
 * @param {Array} members - メンバーデータ
 * @param {Array} opponentScores - 相手チーム得点データ
 * @param {number|null} upToOrder - ここまでの状態を計算（null = 全部）
 * @returns {Object} 計算された試合状態
 */
export function computeGameState(events, game, members, opponentScores = [], upToOrder = null) {
  const teamAttackSide = game?.isHome ? 'bottom' : 'top';
  const state = {
    inning: 1,
    side: teamAttackSide,  // 自チームの攻撃半イニング
    outs: 0,
    runners: {
      first: null,   // { memberId, name }
      second: null,
      third: null,
    },
    score: {
      team: 0,       // 自チーム
      opponent: 0,   // 相手チーム
    },
    currentBatterIndex: 0,  // 打順インデックス
    atBatCount: 0,
    eventCount: 0,
    inningScores: {
      team: {},      // { 1: 2, 2: 0, 3: 1, ... }
      opponent: {},
    },
    halfInningEnded: false,
    isGameOver: false,
  };

  // 相手チームの得点を集計
  for (const os of opponentScores) {
    state.inningScores.opponent[os.inning] = os.runs || 0;
    state.score.opponent += (os.runs || 0);
  }

  const lineup = game.lineup || [];
  const memberMap = {};
  for (const m of members) {
    memberMap[m.id] = m;
  }

  // 現在のイニングと表裏を追跡
  let currentInning = 1;
  let currentSide = teamAttackSide;
  let outs = 0;
  let runners = { first: null, second: null, third: null };
  let teamScore = 0;
  let inningTeamScores = {};
  let batterIndex = 0;
  let atBatCount = 0;
  let halfInningEnded = false;

  for (const event of events) {
    if (upToOrder !== null && event.order > upToOrder) break;

    // イニング・表裏の更新（イベントに記録されたイニング情報を使用）
    if (event.inning !== currentInning || event.side !== currentSide) {
      // イニングが変わった
      currentInning = event.inning;
      currentSide = event.side;
      outs = 0;
      runners = { first: null, second: null, third: null };
      halfInningEnded = false;
    }

    if (event.type === 'atBat') {
      atBatCount++;
      const batter = memberMap[event.batterId] || { name: '不明' };
      const batterId = event.batterId;

      // 打順インデックスを更新
      const idx = lineup.indexOf(batterId);
      if (idx >= 0) {
        batterIndex = (idx + 1) % lineup.length;
      }

      if (event.mode === 'simple') {
        // ── 簡易モード: ランナー進塁を自動計算 ──
        processSimpleMode(event, batter, batterId, runners, state, inningTeamScores, currentInning);
      } else {
        // ── 詳細モード: ランナー処理は play イベントで行う ──
        // 打者自身の塁を処理
        if (isHitResult(event.result)) {
          placeBatterOnBase(event.result, batterId, batter.name, runners, state, inningTeamScores, currentInning);
        } else if (event.result === 'walk' || event.result === 'hitByPitch') {
          // 押し出し処理
          pushRunners(batterId, batter.name, runners, state, inningTeamScores, currentInning);
        } else if (event.result === 'error') {
          // エラー出塁
          placeBatterOnBase('single', batterId, batter.name, runners, state, inningTeamScores, currentInning);
        } else if (event.result === 'fieldersChoice') {
          // 野選: 打者は一塁（アウトは playイベントで処理）
          runners.first = { memberId: batterId, name: batter.name };
        }
      }

      // アウトカウント
      if (isOutResult(event.result) && !isDroppedThirdStrikeSuccess(event)) {
        outs++;
        if (event.result === 'doublePlay') {
          outs++;
        }
      }

      // 打点加算
      if (event.rbiProduced) {
        // rbiProducedは打点として既にカウント済み
      }

      // 3アウト判定
      if (outs >= 3) {
        outs = 3;
        runners = { first: null, second: null, third: null };
        halfInningEnded = true;
      } else {
        halfInningEnded = false;
      }

    } else if (event.type === 'play') {
      // ── プレーイベント処理 ──
      processPlayEvent(event, runners, state, inningTeamScores, currentInning, memberMap);

      if (event.action === 'setInningState') {
        const presetOuts = getPresetOuts(event.note);
        if (presetOuts !== null) outs = presetOuts;
      }

      // アウト処理: 明示的アウト or 盗塁失敗
      if (event.action === 'out' && event.resultStatus === 'success') {
        const outBase = resolveRunnerBase(event, runners);
        if (outBase !== null) {
          outs++;
          removeRunner(outBase, runners);
        }
      } else if (event.action === 'steal' && event.resultStatus === 'failure') {
        const stealBase = resolveRunnerBase(event, runners);
        if (stealBase !== null) {
          outs++;
          removeRunner(stealBase, runners);
        }
      }

      if (outs >= 3) {
        outs = 3;
        runners = { first: null, second: null, third: null };
        halfInningEnded = true;
      } else {
        halfInningEnded = false;
      }
    }

    state.eventCount++;
  }

  // 最終状態を設定
  state.inning = currentInning;
  state.side = currentSide;
  state.outs = Math.min(outs, 3);
  state.halfInningEnded = halfInningEnded;
  state.runners = { ...runners };
  state.currentBatterIndex = batterIndex;
  state.atBatCount = atBatCount;
  state.inningScores.team = inningTeamScores;

  // 自チーム得点を集計
  state.score.team = Object.values(inningTeamScores).reduce((sum, v) => sum + v, 0);

  // 試合終了判定
  if (game.status === 'finished') {
    state.isGameOver = true;
  }

  return state;
}

/**
 * 簡易モード: 打席結果に基づいてランナーを自動進塁
 */
function processSimpleMode(event, batter, batterId, runners, state, inningScores, inning) {
  const result = event.result;
  const rbi = event.rbiProduced || 0;

  if (result === 'homerun') {
    // 全ランナー＋打者が生還
    let runs = 1;
    if (runners.third) runs++;
    if (runners.second) runs++;
    if (runners.first) runs++;
    runners.first = null;
    runners.second = null;
    runners.third = null;
    addInningScore(inningScores, inning, runs);
  } else if (result === 'triple') {
    // 全ランナー生還、打者三塁
    let runs = 0;
    if (runners.third) runs++;
    if (runners.second) runs++;
    if (runners.first) runs++;
    runners.first = null;
    runners.second = null;
    runners.third = { memberId: batterId, name: batter.name };
    addInningScore(inningScores, inning, runs);
  } else if (result === 'double') {
    // ランナー：三塁→生還、二塁→生還、一塁→三塁、打者二塁
    let runs = 0;
    if (runners.third) runs++;
    if (runners.second) runs++;
    runners.third = runners.first;
    runners.first = null;
    runners.second = { memberId: batterId, name: batter.name };
    addInningScore(inningScores, inning, runs);
  } else if (result === 'single') {
    // ランナー：三塁→生還、二塁→三塁、一塁→二塁、打者一塁
    let runs = 0;
    if (runners.third) runs++;
    runners.third = runners.second;
    runners.second = runners.first;
    runners.first = { memberId: batterId, name: batter.name };
    addInningScore(inningScores, inning, runs);
  } else if (result === 'walk' || result === 'hitByPitch') {
    pushRunners(batterId, batter.name, runners, state, inningScores, inning);
  } else if (result === 'error') {
    // エラー出塁: 単打と同じ進塁
    let runs = 0;
    if (runners.third) runs++;
    runners.third = runners.second;
    runners.second = runners.first;
    runners.first = { memberId: batterId, name: batter.name };
    addInningScore(inningScores, inning, runs);
  } else if (result === 'sacrifice' || result === 'sacrificeFly') {
    // 犠打/犠飛: ランナーを一つ進塁
    let runs = 0;
    if (result === 'sacrificeFly' && runners.third) {
      runs++;
      runners.third = null;
    } else if (result === 'sacrifice') {
      if (runners.third) { runs++; runners.third = null; }
      if (runners.second) { runners.third = runners.second; runners.second = null; }
      if (runners.first) { runners.second = runners.first; runners.first = null; }
    }
    addInningScore(inningScores, inning, runs);
  } else if (result === 'fieldersChoice') {
    runners.first = { memberId: batterId, name: batter.name };
  }
  // strikeout, groundout, flyout, lineout, doublePlay → ランナー変更なし（簡易モード）
}

/**
 * 打者をベースに配置する
 */
function placeBatterOnBase(result, batterId, batterName, runners, state, inningScores, inning) {
  let runs = 0;

  if (result === 'homerun') {
    if (runners.third) runs++;
    if (runners.second) runs++;
    if (runners.first) runs++;
    runs++; // 打者本人
    runners.first = null;
    runners.second = null;
    runners.third = null;
  } else if (result === 'triple') {
    if (runners.third) runs++;
    if (runners.second) runs++;
    if (runners.first) runs++;
    runners.first = null;
    runners.second = null;
    runners.third = { memberId: batterId, name: batterName };
  } else if (result === 'double') {
    if (runners.third) runs++;
    if (runners.second) runs++;
    runners.third = runners.first;
    runners.first = null;
    runners.second = { memberId: batterId, name: batterName };
  } else if (result === 'single') {
    if (runners.third) runs++;
    runners.third = runners.second;
    runners.second = runners.first;
    runners.first = { memberId: batterId, name: batterName };
  }

  addInningScore(inningScores, inning, runs);
}

/**
 * 四死球: ランナーを押し出し
 */
function pushRunners(batterId, batterName, runners, state, inningScores, inning) {
  let runs = 0;

  if (runners.first) {
    if (runners.second) {
      if (runners.third) {
        // 満塁 → 押し出し
        runs++;
      }
      runners.third = runners.second;
    }
    runners.second = runners.first;
  }
  runners.first = { memberId: batterId, name: batterName };

  addInningScore(inningScores, inning, runs);
}

/**
 * プレーイベント処理
 */
function processPlayEvent(event, runners, state, inningScores, inning, memberMap) {
  const resolvedBase = resolveRunnerBase(event, runners);
  if (event.action === 'steal') {
    if (event.resultStatus === 'success') {
      // 盗塁成功: ランナーを進塁
      advanceRunner(resolvedBase, runners, inningScores, inning);
    }
    // 失敗はアウトとして別途処理
  } else if (event.action === 'advance') {
    advanceRunner(resolvedBase, runners, inningScores, inning);
  } else if (event.action === 'advanceTwo') {
    advanceRunnerTwice(resolvedBase, runners, inningScores, inning);
  } else if (event.action === 'score') {
    // 生還 (resolvedBase が null = 既に placeBatterOnBase で処理済みのため二重加算しない)
    if (resolvedBase !== null) {
      removeRunner(resolvedBase, runners);
      addInningScore(inningScores, inning, 1);
    }
  } else if (event.action === 'wildPitch' || event.action === 'passedBall' || event.action === 'balk') {
    const isTwoBaseAdvance = typeof event.note === 'string' && event.note.includes('[ADVANCE_TWO]');
    advanceAllRunners(runners, inningScores, inning, isTwoBaseAdvance ? 2 : 1);
  } else if (event.action === 'error') {
    // エラーによる進塁
    advanceRunner(resolvedBase, runners, inningScores, inning);
  } else if (event.action === 'setRunner') {
    setRunnerState(event.runner, event.runnerId, runners, memberMap);
  } else if (event.action === 'setInningState') {
    applyInningStatePreset(event, runners, memberMap);
  }
}

function resolveRunnerBase(event, runners) {
  if (event?.runnerId) {
    if (runners.first?.memberId === event.runnerId) return '1B';
    if (runners.second?.memberId === event.runnerId) return '2B';
    if (runners.third?.memberId === event.runnerId) return '3B';
    // runnerId が指定されているのに見つからない場合は、
    // 既に生還/アウト済みランナーとみなし、塁情報フォールバックしない。
    return null;
  }
  return event?.runner;
}

/**
 * ランナーを一つ進塁
 */
function advanceRunner(base, runners, inningScores, inning) {
  if (base === '3B') {
    if (runners.third) {
      addInningScore(inningScores, inning, 1);
      runners.third = null;
    }
  } else if (base === '2B') {
    if (runners.second) {
      runners.third = runners.second;
      runners.second = null;
    }
  } else if (base === '1B') {
    if (runners.first) {
      runners.second = runners.first;
      runners.first = null;
    }
  }
}

function advanceRunnerTwice(base, runners, inningScores, inning) {
  advanceRunner(base, runners, inningScores, inning);
  if (base === '1B') {
    advanceRunner('2B', runners, inningScores, inning);
  } else if (base === '2B') {
    advanceRunner('3B', runners, inningScores, inning);
  }
}

/**
 * ランナーを除去
 */
function removeRunner(base, runners) {
  if (base === '1B') runners.first = null;
  else if (base === '2B') runners.second = null;
  else if (base === '3B') runners.third = null;
}

function setRunnerState(base, runnerId, runners, memberMap) {
  if (runnerId) {
    // 同一ランナーの重複在塁を防ぐ
    if (runners.first?.memberId === runnerId) runners.first = null;
    if (runners.second?.memberId === runnerId) runners.second = null;
    if (runners.third?.memberId === runnerId) runners.third = null;
  }
  const target = runnerId ? { memberId: runnerId, name: memberMap[runnerId]?.name || '不明' } : null;
  if (base === '1B') runners.first = target;
  else if (base === '2B') runners.second = target;
  else if (base === '3B') runners.third = target;
}

function advanceAllRunners(runners, inningScores, inning, steps = 1) {
  const moveOne = () => {
    let runs = 0;
    if (runners.third) {
      runs++;
      runners.third = null;
    }
    if (runners.second) {
      runners.third = runners.second;
      runners.second = null;
    }
    if (runners.first) {
      runners.second = runners.first;
      runners.first = null;
    }
    addInningScore(inningScores, inning, runs);
  };
  for (let i = 0; i < steps; i++) moveOne();
}

function applyInningStatePreset(event, runners, memberMap) {
  try {
    const preset = JSON.parse(event.note || '{}');
    const r = preset.runners || {};
    runners.first = r.first ? { memberId: r.first, name: memberMap[r.first]?.name || '不明' } : null;
    runners.second = r.second ? { memberId: r.second, name: memberMap[r.second]?.name || '不明' } : null;
    runners.third = r.third ? { memberId: r.third, name: memberMap[r.third]?.name || '不明' } : null;
  } catch (e) {
    // ignore invalid preset
  }
}

function getPresetOuts(note) {
  try {
    const preset = JSON.parse(note || '{}');
    const outs = Number(preset.outs);
    if (Number.isNaN(outs)) return null;
    return Math.max(0, Math.min(2, outs));
  } catch (e) {
    return null;
  }
}

/**
 * イニング得点を加算
 */
function addInningScore(inningScores, inning, runs) {
  if (runs <= 0) return;
  inningScores[inning] = (inningScores[inning] || 0) + runs;
}

function isDroppedThirdStrikeSuccess(atBatEvent) {
  if (!atBatEvent || atBatEvent.result !== 'strikeout') return false;
  if (atBatEvent?.specialFlags?.droppedThirdStrikeSuccess === true) return true;
  return typeof atBatEvent.note === 'string' && atBatEvent.note.includes(NOTE_FLAG_DROPPED_THIRD_STRIKE);
}

/**
 * イベントログからイニングの変わり目を検出
 * @returns {Array} イニング変更ポイント [{order, inning, side}]
 */
export function detectInningChanges(events) {
  const changes = [];
  let lastInning = null;
  let lastSide = null;

  for (const event of events) {
    if (event.inning !== lastInning || event.side !== lastSide) {
      changes.push({
        order: event.order,
        inning: event.inning,
        side: event.side,
      });
      lastInning = event.inning;
      lastSide = event.side;
    }
  }

  return changes;
}
