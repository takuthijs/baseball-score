/**
 * 試合記録画面 (メイン)
 */
import { el, showToast, formatInning, escapeHtml, createModal, showConfirmModal } from '../utils/helpers.js';
import {
  AT_BAT_RESULTS, PLAY_ACTIONS, BASES, POSITIONS,
  BATTED_BALL_POSITIONS, BATTED_BALL_ZONES,
  getResultLabel, getResultShort, getResultClass, isOutResult, isOnBaseResult, isBattedOutResult, isHitResult,
  NOTE_SYS_INNING_CHANGE, NOTE_FLAG_ADVANCE_TWO, NOTE_FLAG_DROPPED_THIRD_STRIKE,
} from '../utils/constants.js';
import { computeGameState, detectInningChanges } from '../models/state.js';
import * as DB from '../db.js';

let currentGameId = null;
let currentGame = null;
let currentTeam = null;
let currentMembers = [];
let currentState = null;
let currentEvents = [];
let recordMode = 'detailed';
let batterIndexOverride = null;
let isRecording = false;

function getTeamAttackSide() {
  return currentGame?.isHome ? 'bottom' : 'top';
}

function getOpponentAttackSide() {
  return getTeamAttackSide() === 'top' ? 'bottom' : 'top';
}

function isSystemEvent(event) {
  return event?.type === 'play' && event?.action === 'other' && typeof event?.note === 'string' && event.note.startsWith(NOTE_SYS_INNING_CHANGE);
}

export async function renderGame(container, navigate, params = {}) {
  container.innerHTML = '';
  currentGameId = params.gameId;
  if (!currentGameId) { navigate('home'); return; }
  currentGame = await DB.getGame(currentGameId);
  if (!currentGame) { navigate('home'); return; }
  currentTeam = await DB.getTeam(currentGame.teamId);
  currentMembers = await DB.getMembers(currentGame.teamId);

  const page = el('div', { className: 'page-game', style: { display: 'flex', flexDirection: 'column', height: '100dvh' } }, [
    el('div', { className: 'game-status-bar', id: 'status-bar' }),
    el('div', { className: 'event-log-area', id: 'event-log-area' }),
    el('div', { className: 'game-input-panel', id: 'input-panel' }),
  ]);
  container.appendChild(page);
  await refreshAll();
}

async function refreshAll() {
  const events = await DB.getAllEvents(currentGameId);
  const opponentScores = await DB.getOpponentScores(currentGameId);
  currentEvents = events;
  currentState = computeGameState(events, currentGame, currentMembers, opponentScores);
  renderStatusBar(currentState);
  renderEventLog(events, currentState);
  renderInputPanel(currentState);
}

// ════════════ STATUS BAR ════════════
function renderStatusBar(state) {
  const bar = document.getElementById('status-bar');
  if (!bar) return;
  bar.innerHTML = '';
  const inningText = formatInning(state.inning, state.side);
  const mainRow = el('div', { className: 'status-main' }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-md)' } }, [
      el('button', { className: 'header-bar-action', textContent: '☰', onClick: showGameMenu }),
      el('div', { className: 'status-inning' }, [
        el('span', { className: 'inning-label', textContent: inningText }),
      ]),
    ]),
    createRunnerDiamond(state.runners),
    el('div', { className: 'status-outs' }, [
      el('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginRight: '4px' }, textContent: 'OUT' }),
      ...([0, 1, 2].map(i => el('div', { className: `out-dot ${i < state.outs ? 'active' : ''}` }))),
    ]),
  ]);
  bar.appendChild(mainRow);
  const scoreRow = el('button', {
    className: 'status-score-toggle',
    textContent: `${currentTeam?.name || 'チーム'} ${state.score.team ?? 0} - ${state.score.opponent ?? 0} ${currentGame.opponentName || '相手'} ▼`,
    onClick: () => { const b = document.getElementById('score-board'); if(b) b.classList.toggle('open'); },
  });
  bar.appendChild(scoreRow);
  bar.appendChild(createScoreBoard(state));
}

function createRunnerDiamond(runners) {
  const d = el('div', { className: 'status-runners' });
  [{ cls: 'runner-1b', a: !!runners.first }, { cls: 'runner-2b', a: !!runners.second }, { cls: 'runner-3b', a: !!runners.third }]
    .forEach(b => d.appendChild(el('div', { className: `runner-diamond ${b.cls} ${b.a ? 'active' : ''}` })));
  return d;
}

function createScoreBoard(state) {
  const totalInnings = Math.max(currentGame.innings || 7, state.inning);
  const board = el('div', { className: 'score-board', id: 'score-board' });
  const table = el('table', { className: 'score-table' });
  const thead = el('tr');
  thead.appendChild(el('th', { textContent: '' }));
  for (let i = 1; i <= totalInnings; i++) {
    thead.appendChild(el('th', { className: i === state.inning ? 'current-inning' : '', textContent: String(i) }));
  }
  thead.appendChild(el('th', { className: 'total-col', textContent: 'R' }));
  table.appendChild(thead);
  // Team row
  const tRow = el('tr');
  tRow.appendChild(el('td', { textContent: currentTeam?.name?.substring(0, 4) || 'チーム', style: { fontSize: 'var(--font-size-xs)', textAlign: 'left' } }));
  for (let i = 1; i <= totalInnings; i++) {
    const s = state.inningScores.team[i];
    tRow.appendChild(el('td', { className: i === state.inning ? 'current-inning' : '', textContent: String(s ?? 0) }));
  }
  tRow.appendChild(el('td', { className: 'total-col', textContent: String(state.score.team ?? 0) }));
  table.appendChild(tRow);
  // Opponent row
  const oRow = el('tr');
  oRow.appendChild(el('td', { textContent: currentGame.opponentName?.substring(0, 4) || '相手', style: { fontSize: 'var(--font-size-xs)', textAlign: 'left' } }));
  for (let i = 1; i <= totalInnings; i++) {
    const s = state.inningScores.opponent[i];
    oRow.appendChild(el('td', { className: i === state.inning ? 'current-inning' : '', textContent: String(s ?? 0) }));
  }
  oRow.appendChild(el('td', { className: 'total-col', textContent: String(state.score.opponent ?? 0) }));
  table.appendChild(oRow);
  board.appendChild(table);
  return board;
}

// ════════════ EVENT LOG ════════════
function renderEventLog(events, state) {
  const area = document.getElementById('event-log-area');
  if (!area) return;
  area.innerHTML = '';
  if (events.length === 0) {
    area.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state-icon', textContent: '📝' }),
      el('div', { className: 'empty-state-title', textContent: '記録がまだありません' }),
      el('div', { className: 'empty-state-text', textContent: '下の入力パネルから打席結果を記録しましょう' }),
    ]));
    return;
  }
  const list = el('div', { className: 'event-log-list' });
  let lastInning = null, lastSide = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (isSystemEvent(event)) continue;
    if (event.inning !== lastInning || event.side !== lastSide) {
      list.appendChild(el('div', { className: 'event-item inning-change', textContent: `── ${formatInning(event.inning, event.side)} ──` }));
      lastInning = event.inning;
      lastSide = event.side;
    }
    if (event.type === 'atBat') {
      list.appendChild(createAtBatLogItem(event, events, i));
    } else if (event.type === 'play') {
      list.appendChild(createPlayLogItem(event));
    }
  }
  area.appendChild(list);
  requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
}

function createAtBatLogItem(event, allEvents, eventIndex) {
  const member = currentMembers.find(m => m.id === event.batterId);
  const name = member?.name || '不明';
  const resultLabel = getResultLabel(event.result);
  const resultClass = getResultClass(event.result);
  const badgeCls = (resultClass === 'hit' || resultClass === 'homerun') ? 'hit' : resultClass === 'out' ? 'out' : 'primary';
  let detailText = '';
  if (event.rbiProduced > 0) detailText += `${event.rbiProduced}打点 `;
  if (event?.specialFlags?.droppedThirdStrikeSuccess) detailText += '振り逃げ成功 ';
  if (event.fieldDirection?.position || event.fieldDirection?.zone) {
    const battedType = event.fieldDirection.battedTypeLabel || event.fieldDirection.battedType || '';
    const pos = event.fieldDirection.positionLabel || event.fieldDirection.position || '';
    const zone = event.fieldDirection.zoneLabel || event.fieldDirection.zone || '';
    const location = [battedType, pos, zone].filter(Boolean).join(' ');
    if (location) detailText += `(${location}) `;
  }
  if (event.note) detailText += event.note.replace(NOTE_FLAG_DROPPED_THIRD_STRIKE, '').trim();

  const item = el('div', { className: 'event-item at-bat' }, [
    el('div', { className: 'event-number', textContent: `#${event.atBatNumber || ''}` }),
    el('div', { className: 'event-content', onClick: () => showAtBatEditModal(event) }, [
      el('div', { className: 'event-summary', textContent: name }),
      el('div', { className: 'event-detail', textContent: detailText.trim() }),
    ]),
    el('div', { className: 'event-result-badge' }, [
      el('span', { className: `badge badge-${badgeCls}`, textContent: resultLabel }),
    ]),
    // プレー挿入ボタン
    el('button', {
      className: 'btn btn-ghost btn-sm',
      textContent: '＋',
      style: { fontSize: 'var(--font-size-xs)', padding: '2px 6px', color: 'var(--color-text-muted)' },
      onClick: () => showInsertPlayModal(event),
    }),
  ]);
  return item;
}

function createPlayLogItem(event) {
  if (event.action === 'setInningState') {
    return el('div', { className: 'event-item play-event', onClick: () => showPlayEditModal(event) }, [
      el('div', { className: 'event-content' }, [
        el('div', { className: 'event-summary', style: { fontSize: 'var(--font-size-sm)' }, textContent: '特殊開始を設定' }),
        el('div', { className: 'event-detail', textContent: formatPresetNote(event.note) }),
      ]),
      el('span', { className: 'badge badge-primary', textContent: '設定' }),
    ]);
  }
  if (event.action === 'pitcherStats') {
    return el('div', { className: 'event-item play-event', onClick: () => showPlayEditModal(event) }, [
      el('div', { className: 'event-content' }, [
        el('div', { className: 'event-summary', style: { fontSize: 'var(--font-size-sm)' }, textContent: '投手成績を記録' }),
        el('div', { className: 'event-detail', textContent: event.note || '' }),
      ]),
      el('span', { className: 'badge badge-primary', textContent: '記録' }),
    ]);
  }
  if (event.action === 'playerChange') {
    return el('div', { className: 'event-item play-event', onClick: () => showPlayEditModal(event) }, [
      el('div', { className: 'event-content' }, [
        el('div', { className: 'event-summary', style: { fontSize: 'var(--font-size-sm)' }, textContent: '選手交代' }),
        el('div', { className: 'event-detail', textContent: event.note || '' }),
      ]),
      el('span', { className: 'badge badge-primary', textContent: '交代' }),
    ]);
  }

  const action = PLAY_ACTIONS.find(a => a.id === event.action);
  const actionLabel = action?.label || event.action;
  const baseLabel = BASES.find(b => b.id === event.runner)?.label || event.runner || '';
  const runner = currentMembers.find(m => m.id === event.runnerId);
  const runnerName = runner?.name || '';
  const statusText = event.resultStatus === 'success' ? '成功' : '失敗';
  const cleanNote = (event.note || '').replace(NOTE_FLAG_ADVANCE_TWO, '').trim();
  const isTwoAdvance = typeof event.note === 'string' && event.note.includes(NOTE_FLAG_ADVANCE_TWO);
  let summary = runnerName ? `${runnerName} ${actionLabel}` : actionLabel;
  if (event.runner) summary += ` (${baseLabel})`;
  if (isTwoAdvance) summary += ' [2つ進塁]';

  return el('div', {
    className: 'event-item play-event',
    onClick: () => showPlayEditModal(event),
  }, [
    el('div', { className: 'event-content' }, [
      el('div', { className: 'event-summary', style: { fontSize: 'var(--font-size-sm)' }, textContent: summary }),
      el('div', { className: 'event-detail', textContent: cleanNote }),
    ]),
    el('span', { className: `badge ${event.resultStatus === 'success' ? 'badge-primary' : 'badge-out'}`, textContent: statusText }),
  ]);
}

// ════════════ INPUT PANEL ════════════
function renderInputPanel(state) {
  const panel = document.getElementById('input-panel');
  if (!panel) return;
  panel.innerHTML = '';
  const isTeamAttack = state.side === getTeamAttackSide();
  if (currentGame.status === 'finished') {
    panel.appendChild(el('div', { style: { textAlign: 'center', padding: 'var(--space-md)' } }, [
      el('span', { className: 'badge badge-out', textContent: '試合終了' }),
      el('button', {
        className: 'btn btn-primary btn-block',
        style: { marginTop: 'var(--space-sm)' },
        textContent: 'この試合を再開する',
        onClick: async () => {
          await DB.updateGame(currentGameId, { status: 'active' });
          currentGame.status = 'active';
          showToast('試合を再開しました');
          await refreshAll();
        },
      }),
    ]));
    return;
  }
  if (state.halfInningEnded) {
    panel.appendChild(el('div', { style: { textAlign: 'center', padding: 'var(--space-md)' } }, [
      el('span', { className: 'badge badge-out', textContent: '3アウト チェンジ待ち' }),
      el('button', {
        className: 'btn btn-primary btn-block',
        style: { marginTop: 'var(--space-sm)' },
        textContent: 'イニングを進める',
        onClick: () => showThreeOutModal(state),
      }),
    ]));
    return;
  }
  if (!isTeamAttack) {
    panel.appendChild(el('div', { style: { textAlign: 'center', padding: 'var(--space-md)' } }, [
      el('span', { className: 'badge badge-primary', textContent: '守備中（投手記録）' }),
      el('div', { className: 'text-secondary', style: { marginTop: 'var(--space-xs)', marginBottom: 'var(--space-sm)', fontSize: 'var(--font-size-sm)' }, textContent: `${formatInning(state.inning, state.side)} の記録` }),
      el('button', {
        className: 'btn btn-primary btn-block',
        style: { marginTop: 'var(--space-sm)' },
        textContent: '⚾ 投手成績を入力',
        onClick: () => showPitcherStatsModal({ inning: state.inning, side: state.side }),
      }),
      el('button', {
        className: 'btn btn-secondary btn-block',
        style: { marginTop: 'var(--space-sm)' },
        textContent: '🔢 相手得点を編集',
        onClick: () => showOpponentScoreModal(state),
      }),
      el('button', {
        className: 'btn btn-ghost btn-block',
        style: { marginTop: 'var(--space-sm)' },
        textContent: '🔄 イニング変更',
        onClick: () => showInningChangeModal(),
      }),
    ]));
    return;
  }
  const lineup = currentGame.lineup || [];
  const currentBatterIdx = (batterIndexOverride !== null ? batterIndexOverride : state.currentBatterIndex) % lineup.length;
  const currentBatterId = lineup[currentBatterIdx];
  const currentBatter = currentMembers.find(m => m.id === currentBatterId);

  const todayStats = getBatterTodayStats(currentBatterId, currentEvents);
  const statsLabel = todayStats.ab > 0
    ? `${todayStats.ab}打数${todayStats.h}安打`
    : '本日初打席';

  // 打者選択行
  const batterRow = el('div', { className: 'input-batter-row' }, [
    el('button', { className: 'batter-select-btn', onClick: () => showBatterSelectModal(state) }, [
      el('div', { className: 'player-avatar player-avatar-sm', textContent: currentBatter?.number || '?' }),
      el('div', { style: { flex: 1, textAlign: 'left' } }, [
        el('span', { className: 'batter-name', textContent: currentBatter?.name || '打者を選択' }),
        el('span', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 'var(--space-sm)' }, textContent: statsLabel }),
      ]),
      el('span', { className: 'batter-arrow', textContent: '▼' }),
    ]),
  ]);
  panel.appendChild(batterRow);

  panel.appendChild(el('div', { style: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', marginBottom: 'var(--space-xs)', textAlign: 'center' }, textContent: '詳細モード: 自動計算後に＋プレーでランナー修正できます' }));

  const mainResults = [
    { id: 'single', short: '安打', cls: 'hit' },
    { id: 'double', short: '二塁打', cls: 'hit' },
    { id: 'triple', short: '三塁打', cls: 'hit' },
    { id: 'homerun', short: 'HR', cls: 'homerun' },
    { id: 'strikeout', short: '三振', cls: 'out' },
    { id: 'groundout', short: 'ゴロ', cls: 'out' },
    { id: 'flyout', short: 'フライ', cls: 'out' },
    { id: 'walk', short: '四球', cls: 'walk' },
  ];
  const resultGrid = el('div', { className: 'result-buttons' });
  for (const r of mainResults) {
    resultGrid.appendChild(el('button', { className: `btn-result ${r.cls}`, textContent: r.short, onClick: () => recordAtBat(r.id, currentBatterId, state) }));
  }
  panel.appendChild(resultGrid);

  const lastUserEvent = getLastUserEvent(currentEvents);
  const actionsRow = el('div', { className: 'input-actions' }, [
    el('button', { className: 'play-add-btn', textContent: '📋 その他', onClick: () => showMoreResultsModal(currentBatterId, state) }),
    el('button', { className: 'play-add-btn', textContent: '＋ プレー', onClick: () => showPlayInputModal(state, null) }),
    el('button', { className: 'opponent-score-btn', textContent: '🔢 相手得点', onClick: () => showOpponentScoreModal(state) }),
    el('button', {
      className: 'play-add-btn undo-btn',
      textContent: '↩ 取消',
      disabled: !lastUserEvent,
      style: !lastUserEvent ? { opacity: '0.35' } : {},
      onClick: () => lastUserEvent && showUndoModal(lastUserEvent),
    }),
  ]);
  panel.appendChild(actionsRow);
}

// ════════════ RECORD AT BAT ════════════
async function recordAtBat(result, batterId, state) {
  if (isRecording) return;
  isRecording = true;
  setResultButtonsDisabled(true);
  const nextOrder = await DB.getNextOrder(currentGameId);
  const rbi = calculateAutoRBI(result, state.runners);
  const atBat = {
    gameId: currentGameId, inning: state.inning, side: state.side,
    atBatNumber: state.atBatCount + 1, batterId, pitcherId: null,
    result, rbiProduced: rbi, runsScored: 0, note: '',
    fieldDirection: null, specialFlags: {}, mode: recordMode, order: nextOrder,
  };

  if (result === 'strikeout') {
    isRecording = false;
    setResultButtonsDisabled(false);
    showStrikeoutOptionsModal(atBat, state);
    return;
  }

  if (isBattedOutResult(result) || isHitResult(result) || result === 'doublePlay') {
    isRecording = false;
    setResultButtonsDisabled(false);
    showBattedBallLocationModal(atBat, state);
    return;
  }

  // 詳細モードで出塁系: 打点確認モーダル
  if (recordMode === 'detailed' && isOnBaseResult(result)) {
    isRecording = false;
    setResultButtonsDisabled(false);
    showRBIConfirmModal(atBat, state);
    return;
  }
  await finalizeAtBatRecord(atBat, state);
}

function calculateAutoRBI(result, runners) {
  let rbi = 0;
  if (result === 'homerun') { rbi = 1; if (runners.first) rbi++; if (runners.second) rbi++; if (runners.third) rbi++; }
  else if (result === 'triple') { if (runners.first) rbi++; if (runners.second) rbi++; if (runners.third) rbi++; }
  else if (result === 'double') { if (runners.second) rbi++; if (runners.third) rbi++; }
  else if (result === 'single') { if (runners.third) rbi++; }
  else if (result === 'sacrificeFly') { if (runners.third) rbi = 1; }
  else if (result === 'walk' || result === 'hitByPitch') { if (runners.first && runners.second && runners.third) rbi = 1; }
  return rbi;
}

function showStrikeoutOptionsModal(atBat, state) {
  createModal('三振の記録', (content, close) => {
    let droppedThirdStrikeSuccess = false;
    let note = atBat.note || '';
    const chipWrap = el('div', { className: 'btn-group', style: { marginBottom: 'var(--space-base)' } });
    const normalBtn = el('button', {
      className: 'chip active',
      textContent: '通常三振',
      onClick: () => {
        droppedThirdStrikeSuccess = false;
        normalBtn.classList.add('active');
        droppedBtn.classList.remove('active');
      },
    });
    const droppedBtn = el('button', {
      className: 'chip',
      textContent: '振り逃げ成功',
      onClick: () => {
        droppedThirdStrikeSuccess = true;
        droppedBtn.classList.add('active');
        normalBtn.classList.remove('active');
      },
    });
    chipWrap.appendChild(normalBtn);
    chipWrap.appendChild(droppedBtn);
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '結果種別' }));
    content.appendChild(chipWrap);
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
      el('label', { className: 'input-label', textContent: '備考' }),
      el('input', { className: 'input-field', type: 'text', value: note, placeholder: '特記事項', onInput: (e) => { note = e.target.value; } }),
    ]));
    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: '記録する',
      onClick: async () => {
        atBat.specialFlags = { ...(atBat.specialFlags || {}), droppedThirdStrikeSuccess };
        atBat.note = note;
        if (droppedThirdStrikeSuccess && !atBat.note.includes(NOTE_FLAG_DROPPED_THIRD_STRIKE)) {
          atBat.note = `${atBat.note} ${NOTE_FLAG_DROPPED_THIRD_STRIKE}`.trim();
        }
        close();
        await finalizeAtBatRecord(atBat, state, '三振を記録');
      },
    }));
  });
}

function showBattedBallLocationModal(atBat, state) {
  createModal('打球位置入力', (content, close) => {
    let selectedBattedType = atBat.fieldDirection?.battedType || '';
    let selectedPosition = atBat.fieldDirection?.position || '';
    let selectedZone = atBat.fieldDirection?.zone || '';
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '打球種別' }));
    const typeGroup = el('div', { className: 'btn-group', style: { marginBottom: 'var(--space-base)' } });
    const typeOptions = ['ゴロ', 'フライ', 'ライナー'];
    for (const type of typeOptions) {
      const btn = el('button', {
        className: `chip ${selectedBattedType === type ? 'active' : ''}`,
        textContent: type,
        onClick: () => {
          selectedBattedType = type;
          typeGroup.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
          btn.classList.add('active');
        },
      });
      typeGroup.appendChild(btn);
    }
    content.appendChild(typeGroup);
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '守備位置' }));
    const positionWrap = el('div', { className: 'result-buttons', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-base)' } });
    for (const pos of BATTED_BALL_POSITIONS) {
      const btn = el('button', {
        className: 'btn-result special',
        textContent: pos.label,
        style: selectedPosition === pos.id ? { borderColor: 'var(--color-primary)', boxShadow: '0 0 0 2px var(--color-primary-dim)' } : {},
        onClick: () => {
          selectedPosition = pos.id;
          positionWrap.querySelectorAll('.btn-result').forEach((b) => { b.style.borderColor = ''; b.style.boxShadow = ''; });
          btn.style.borderColor = 'var(--color-primary)';
          btn.style.boxShadow = '0 0 0 2px var(--color-primary-dim)';
        },
      });
      positionWrap.appendChild(btn);
    }
    content.appendChild(positionWrap);
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '方向詳細' }));
    const zoneSelect = el('select', { className: 'input-field', style: { marginBottom: 'var(--space-xl)' }, onChange: (e) => { selectedZone = e.target.value; } }, [
      el('option', { value: '', textContent: '選択してください' }),
    ]);
    for (const z of BATTED_BALL_ZONES) {
      zoneSelect.appendChild(el('option', { value: z.id, textContent: z.label }));
    }
    zoneSelect.value = selectedZone || '';
    content.appendChild(zoneSelect);
    content.appendChild(el('div', { style: { display: 'flex', gap: 'var(--space-md)' } }, [
      el('button', {
        className: 'btn btn-secondary',
        style: { flex: 1 },
        textContent: '戻る',
        onClick: () => close(),
      }),
      el('button', {
        className: 'btn btn-primary',
        style: { flex: 1 },
        textContent: '記録する',
        onClick: async () => {
          atBat.fieldDirection = {
            battedType: selectedBattedType || null,
            battedTypeLabel: selectedBattedType || null,
            position: selectedPosition || null,
            positionLabel: BATTED_BALL_POSITIONS.find((p) => p.id === selectedPosition)?.label || null,
            zone: selectedZone || null,
            zoneLabel: BATTED_BALL_ZONES.find((z) => z.id === selectedZone)?.label || null,
          };
          close();
          await finalizeAtBatRecord(atBat, state);
        },
      }),
    ]));
  });
}

async function finalizeAtBatRecord(atBat, state, toastMessage = null) {
  try {
    const atBatId = await DB.addAtBat(atBat);
    batterIndexOverride = null;
    if (shouldPromptRunnerOutcome(atBat, state)) {
      showRunnerOutcomeModal({ ...atBat, id: atBatId }, state, toastMessage || `${getResultLabel(atBat.result)}を記録`);
      return;
    }
    showToast(toastMessage || `${getResultLabel(atBat.result)}を記録`, 'success');
    await postAtBatCheck();
  } finally {
    isRecording = false;
    setResultButtonsDisabled(false);
  }
}

function shouldPromptRunnerOutcome(atBat, state) {
  if (!atBat || atBat.mode !== 'detailed') return false;
  const hasRunner = !!(state?.runners?.first || state?.runners?.second || state?.runners?.third);
  if (!hasRunner) return false;
  if (atBat?.specialFlags?.droppedThirdStrikeSuccess) return true;
  return isOutResult(atBat.result) || (atBat.rbiProduced || 0) > 0;
}

function showRunnerOutcomeModal(atBat, state, toastMessage) {
  const runnerMap = [
    { base: '1B', runner: state.runners.first },
    { base: '2B', runner: state.runners.second },
    { base: '3B', runner: state.runners.third },
  ].filter((r) => !!r.runner);
  const selections = {};
  for (const r of runnerMap) {
    selections[r.base] = getDefaultRunnerOutcomeForAtBat(atBat?.result, r.base);
  }

  createModal('打席内ランナー結果', (content, close) => {
    content.appendChild(el('div', {
      className: 'text-secondary',
      style: { marginBottom: 'var(--space-base)', fontSize: 'var(--font-size-sm)' },
      textContent: 'この打席で各ランナーがどうなったかを記録してください',
    }));

    for (const row of runnerMap) {
      const baseLabel = BASES.find((b) => b.id === row.base)?.label || row.base;
      content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-xs)' }, textContent: `${baseLabel}: ${row.runner.name}` }));
      const group = el('div', { className: 'btn-group', style: { marginBottom: 'var(--space-base)' } });
      const options = [
        { id: 'stay', label: 'そのまま' },
        { id: 'advance', label: '進塁' },
        { id: 'advanceTwo', label: '2つ進塁' },
        { id: 'score', label: '生還' },
        { id: 'out', label: 'アウト' },
      ];
      for (const opt of options) {
        const btn = el('button', {
          className: `chip ${selections[row.base] === opt.id ? 'active' : ''}`,
          textContent: opt.label,
          onClick: () => {
            selections[row.base] = opt.id;
            group.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
            btn.classList.add('active');
          },
        });
        group.appendChild(btn);
      }
      content.appendChild(group);
    }

    content.appendChild(el('div', { style: { display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' } }, [
      el('button', {
        className: 'btn btn-secondary',
        style: { flex: 1 },
        textContent: '自動反映',
        onClick: async () => {
          await applyRunnerOutcomeSelections(atBat, runnerMap, selections);
          close();
          showToast(`${toastMessage}（自動反映）`, 'success');
          await postAtBatCheck();
        },
      }),
      el('button', {
        className: 'btn btn-primary',
        style: { flex: 1 },
        textContent: '保存',
        onClick: async () => {
          await applyRunnerOutcomeSelections(atBat, runnerMap, selections);
          close();
          showToast(`${toastMessage}（ランナー結果反映）`, 'success');
          await postAtBatCheck();
        },
      }),
    ]));
  });
}

async function applyRunnerOutcomeSelections(atBat, runnerMap, selections) {
  for (const row of runnerMap) {
    const selected = selections[row.base];
    if (!selected || selected === 'stay') continue;
    const action = selected === 'advance' ? 'advance' : selected;
    await DB.addPlay({
      gameId: currentGameId,
      inning: atBat.inning,
      side: atBat.side,
      relatedAtBatId: atBat.id,
      action,
      runner: row.base,
      runnerId: row.runner.memberId,
      runnerName: row.runner.name || '',
      resultStatus: 'success',
      outPosition: null,
      note: '',
      order: await DB.getNextOrder(currentGameId),
    });
  }
}

function getDefaultRunnerOutcomeForAtBat(result, base) {
  if (result === 'homerun' || result === 'triple') return 'score';
  if (result === 'double') {
    if (base === '3B' || base === '2B') return 'score';
    if (base === '1B') return 'advanceTwo';
  }
  if (result === 'single') {
    if (base === '3B') return 'score';
    return 'advance';
  }
  return 'stay';
}

/** 打席記録後の3アウトチェック + イニング遷移確認 */
async function postAtBatCheck() {
  const events = await DB.getAllEvents(currentGameId);
  const opponentScores = await DB.getOpponentScores(currentGameId);
  const state = computeGameState(events, currentGame, currentMembers, opponentScores);

  if (state.halfInningEnded) {
    // 3アウト → イニング遷移確認ダイアログ
    showThreeOutModal(state);
  } else {
    await refreshAll();
  }
}

/** 3アウト時のモーダル: 投手入力 + イニング遷移確認 */
function showThreeOutModal(state) {
  const nextInning = state.inning + 1;
  const nextSide = getTeamAttackSide();
  const nextLabel = formatInning(nextInning, nextSide);
  const pitcherTargetInning = state.inning;
  const pitcherTargetSide = getOpponentAttackSide();
  const pitcherTargetLabel = formatInning(pitcherTargetInning, pitcherTargetSide);

  createModal('3アウト チェンジ', (content, close) => {
    content.appendChild(el('div', { style: { textAlign: 'center', marginBottom: 'var(--space-lg)' } }, [
      el('div', { style: { fontSize: '2rem', marginBottom: 'var(--space-sm)' }, textContent: '⚾' }),
      el('div', { style: { fontSize: 'var(--font-size-md)', fontWeight: 'bold' }, textContent: `${formatInning(state.inning, state.side)} 終了` }),
      el('div', { className: 'text-secondary', style: { marginTop: 'var(--space-xs)' }, textContent: `次は ${nextLabel} です` }),
    ]));

    // 投手成績入力セクション
    content.appendChild(el('div', { style: { marginBottom: 'var(--space-lg)' } }, [
      el('div', { className: 'input-label', style: { marginBottom: 'var(--space-xs)', fontWeight: 'bold' }, textContent: '📊 投手成績（任意）' }),
      el('div', { className: 'text-secondary', style: { fontSize: 'var(--font-size-sm)' }, textContent: `${pitcherTargetLabel}（相手攻撃）` }),
    ]));

    let selectedPitcherId = null;
    let inningsPitched = '1.0';
    let pitches = 0;
    let runsAllowed = 0;
    let earnedRuns = 0;
    let hitsAllowed = 0;
    let homeRunsAllowed = 0;
    let strikeouts = 0;
    let walks = 0;
    let hitByPitch = 0;
    let balks = 0;
    let wildPitches = 0;
    const lineupMembers = (currentGame.lineup || []).map((id) => currentMembers.find((m) => m.id === id)).filter(Boolean);
    const pitcherSelect = el('select', {
      className: 'input-field',
      style: { marginBottom: 'var(--space-base)' },
      onChange: (e) => { selectedPitcherId = e.target.value ? Number(e.target.value) : null; },
    }, [el('option', { value: '', textContent: '投手を選択' })]);
    for (const m of lineupMembers) pitcherSelect.appendChild(el('option', { value: String(m.id), textContent: m.name }));
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
      el('label', { className: 'input-label', textContent: '投手名' }),
      pitcherSelect,
    ]));
    content.appendChild(el('div', { className: 'pitcher-stat-row' }, [
      el('span', { className: 'pitcher-stat-label', textContent: '投球回' }),
      createInningsPitchedSelect(inningsPitched, (v) => { inningsPitched = v; }),
    ]));
    content.appendChild(el('div', { className: 'pitcher-stat-row' }, [
      el('span', { className: 'pitcher-stat-label', textContent: '投球数' }),
      el('input', { className: 'pitcher-stat-input', type: 'number', min: '0', value: String(pitches), onInput: (e) => { pitches = parseInt(e.target.value, 10) || 0; } }),
    ]));
    const statRows = [
      { label: '失点', value: 0, onInput: (v) => { runsAllowed = v; } },
      { label: '自責点', value: 0, onInput: (v) => { earnedRuns = v; } },
      { label: '被安打', value: 0, onInput: (v) => { hitsAllowed = v; } },
      { label: '被本塁打', value: 0, onInput: (v) => { homeRunsAllowed = v; } },
      { label: '奪三振', value: 0, onInput: (v) => { strikeouts = v; } },
      { label: '与四球', value: 0, onInput: (v) => { walks = v; } },
      { label: '与死球', value: 0, onInput: (v) => { hitByPitch = v; } },
      { label: 'ボーク', value: 0, onInput: (v) => { balks = v; } },
      { label: '暴投', value: 0, onInput: (v) => { wildPitches = v; } },
    ];
    for (const r of statRows) {
      content.appendChild(el('div', { className: 'pitcher-stat-row' }, [
        el('span', { className: 'pitcher-stat-label', textContent: r.label }),
        el('input', { className: 'pitcher-stat-input', type: 'number', min: '0', value: String(r.value), onInput: (e) => r.onInput(e.target.value) }),
      ]));
    }

    const savePitcherEntry = async () => {
      if (!selectedPitcherId) return false;
      const pitcher = currentMembers.find((m) => m.id === selectedPitcherId);
      const appearanceOrder = await DB.getNextPitcherAppearanceOrder(currentGameId);
      const pitcherSummary = `${pitcherTargetLabel} ${pitcher?.name || '投手未選択'} 失点:${runsAllowed} 自責:${earnedRuns} 投球回:${formatInningsPitchedLabel(inningsPitched)} 球数:${pitches}`;
      await DB.addPitcherStats(
        currentGameId,
        {
          pitcherId: selectedPitcherId,
          pitcherName: pitcher?.name || '',
          appearanceOrder,
          inningsPitched,
          pitches,
          runsAllowed,
          earnedRuns,
          hitsAllowed,
          homeRunsAllowed,
          strikeouts,
          walks,
          hitByPitch,
          balks,
          wildPitches,
          note: '',
        },
        pitcherTargetInning,
        pitcherTargetSide,
      );
      await syncOpponentScoreFromPitcherStats(pitcherTargetInning, pitcherTargetSide);
      await DB.addPlay({
        gameId: currentGameId,
        inning: pitcherTargetInning,
        side: pitcherTargetSide,
        relatedAtBatId: null,
        action: 'pitcherStats',
        runner: '',
        runnerId: null,
        resultStatus: 'success',
        outPosition: null,
        note: pitcherSummary,
        order: await DB.getNextOrder(currentGameId),
      });
      return true;
    };

    const clearPitcherForm = () => {
      selectedPitcherId = null;
      if (pitcherSelect) pitcherSelect.value = '';
      inningsPitched = '0.1';
      pitches = 0;
      runsAllowed = 0;
      earnedRuns = 0;
      hitsAllowed = 0;
      homeRunsAllowed = 0;
      strikeouts = 0;
      walks = 0;
      hitByPitch = 0;
      balks = 0;
      wildPitches = 0;
    };

    content.appendChild(el('button', {
      className: 'btn btn-secondary btn-block',
      style: { marginBottom: 'var(--space-sm)' },
      textContent: '＋ 投手情報を追加',
      onClick: async () => {
        if (!selectedPitcherId) {
          showToast('投手を選択してください', 'error');
          return;
        }
        const saved = await savePitcherEntry();
        if (saved) {
          clearPitcherForm();
          showToast('投手情報を追加しました');
        }
      },
    }));

    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: `${nextLabel} へ進む`,
      onClick: async () => {
        if (selectedPitcherId) {
          await savePitcherEntry();
        }
        const pitcher = currentMembers.find((m) => m.id === selectedPitcherId);
        await createInningChangeMarker(nextInning, nextSide);
        close();
        showToast(`${nextLabel}に進みます`);
        await refreshAll();
      },
    }));
  });
}

// ════════════ MODALS ════════════

function showBatterSelectModal(state) {
  createModal('打者選択', (content, close) => {
    const lineup = currentGame.lineup || [];
    const currentIdx = (batterIndexOverride !== null ? batterIndexOverride : state.currentBatterIndex) % lineup.length;
    lineup.forEach((memberId, idx) => {
      const member = currentMembers.find(m => m.id === memberId);
      if (!member) return;
      const isCurrent = idx === currentIdx;
      const stats = getBatterTodayStats(memberId, currentEvents);
      const statsText = stats.ab > 0 ? `${stats.ab}打数${stats.h}安打` : '未打席';
      content.appendChild(el('button', {
        className: 'list-item',
        style: isCurrent ? { background: 'var(--color-primary-dim)', borderRadius: 'var(--radius-md)' } : {},
        onClick: () => { batterIndexOverride = idx; renderInputPanel(currentState); close(); },
      }, [
        el('div', { className: 'player-avatar player-avatar-sm', textContent: member.number || String(idx + 1) }),
        el('div', { className: 'list-item-content' }, [
          el('div', { className: 'list-item-title', textContent: `${idx + 1}番 ${member.name}` }),
          el('div', { className: 'list-item-subtitle', textContent: statsText }),
        ]),
        isCurrent ? el('span', { className: 'badge badge-primary', textContent: '次の打者' }) : el('span'),
      ]));
    });
  });
}

function showMoreResultsModal(batterId, state) {
  createModal('その他の結果', (content, close) => {
    const more = [
      { id: 'hitByPitch', label: '死球', cls: 'walk' }, { id: 'error', label: 'エラー出塁', cls: 'error-btn' },
      { id: 'fieldersChoice', label: '野選', cls: 'out' }, { id: 'sacrifice', label: '犠打', cls: 'special' },
      { id: 'sacrificeFly', label: '犠牲フライ', cls: 'special' }, { id: 'doublePlay', label: '併殺打', cls: 'out' },
      { id: 'lineout', label: 'ライナー', cls: 'out' },
    ];
    const grid = el('div', { className: 'result-buttons', style: { gridTemplateColumns: 'repeat(3, 1fr)' } });
    for (const r of more) {
      grid.appendChild(el('button', { className: `btn-result ${r.cls}`, textContent: r.label, onClick: () => { close(); recordAtBat(r.id, batterId, state); } }));
    }
    content.appendChild(grid);
  });
}

/** プレー追加モーダル（afterEvent=null: 末尾に追加, afterEvent!=null: その直後に挿入） */
function showPlayInputModal(state, afterEvent) {
  createModal(afterEvent ? 'プレー挿入' : 'プレー追加', (content, close) => {
    let selectedAction = '', selectedRunner = '', selectedRunnerId = null, resultStatus = 'success', note = '';
    let selectedTargetBase = '';
    let advanceSteps = 1;
    // アクション
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: 'アクション' }));
    const actionGrid = el('div', { className: 'result-buttons', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-base)' } });
    for (const action of PLAY_ACTIONS) {
      const btn = el('button', { className: 'btn-result special', textContent: `${action.emoji} ${action.label}`,
        onClick: () => {
          selectedAction = action.id;
          actionGrid.querySelectorAll('.btn-result').forEach(b => { b.style.borderColor = ''; b.style.background = ''; });
          btn.style.borderColor = 'var(--color-primary)';
          btn.style.background = 'var(--color-primary-dim)';
          if (!['advance', 'steal', 'error', 'wildPitch', 'passedBall', 'balk'].includes(selectedAction)) {
            advanceSteps = 1;
            oneStepBtn.classList.add('active');
            twoStepBtn.classList.remove('active');
          }
        },
      });
      actionGrid.appendChild(btn);
    }
    content.appendChild(actionGrid);

    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '進塁数（必要時）' }));
    const stepTabs = el('div', { className: 'tab-bar', style: { marginBottom: 'var(--space-base)' } });
    const oneStepBtn = el('button', {
      className: 'tab-item active',
      textContent: '1つ進塁',
      onClick: () => { advanceSteps = 1; oneStepBtn.classList.add('active'); twoStepBtn.classList.remove('active'); },
    });
    const twoStepBtn = el('button', {
      className: 'tab-item',
      textContent: '2つ進塁',
      onClick: () => { advanceSteps = 2; twoStepBtn.classList.add('active'); oneStepBtn.classList.remove('active'); },
    });
    stepTabs.appendChild(oneStepBtn);
    stepTabs.appendChild(twoStepBtn);
    content.appendChild(stepTabs);

    // ランナー選択
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '対象ランナー' }));
    const runnerBtns = el('div', { className: 'btn-group', style: { marginBottom: 'var(--space-base)' } });
    const runnerOpts = [];
    if (state.runners.first) runnerOpts.push({ base: '1B', name: state.runners.first.name, id: state.runners.first.memberId });
    if (state.runners.second) runnerOpts.push({ base: '2B', name: state.runners.second.name, id: state.runners.second.memberId });
    if (state.runners.third) runnerOpts.push({ base: '3B', name: state.runners.third.name, id: state.runners.third.memberId });
    if (runnerOpts.length === 0) runnerBtns.appendChild(el('div', { className: 'text-muted', style: { fontSize: 'var(--font-size-sm)' }, textContent: 'ランナーなし' }));
    for (const r of runnerOpts) {
      const baseLabel = BASES.find(b => b.id === r.base)?.label || r.base;
      const btn = el('button', { className: 'chip', textContent: `${baseLabel}: ${r.name}`,
        onClick: () => { selectedRunner = r.base; selectedRunnerId = r.id; runnerBtns.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); btn.classList.add('active'); },
      });
      runnerBtns.appendChild(btn);
    }
    content.appendChild(runnerBtns);

    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: 'ランナー修正先（ランナー修正時のみ）' }));
    const baseBtns = el('div', { className: 'btn-group', style: { marginBottom: 'var(--space-base)' } });
    ['1B', '2B', '3B'].forEach((base) => {
      const btn = el('button', {
        className: 'chip',
        textContent: BASES.find((b) => b.id === base)?.label || base,
        onClick: () => {
          selectedTargetBase = base;
          baseBtns.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
        },
      });
      baseBtns.appendChild(btn);
    });
    content.appendChild(baseBtns);

    const runnerSelectLabel = el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '修正後ランナー（ランナー修正時のみ）' });
    const runnerSelect = el('select', { className: 'input-field', style: { marginBottom: 'var(--space-base)' }, onChange: (e) => { selectedRunnerId = e.target.value ? Number(e.target.value) : null; } }, [
      el('option', { value: '', textContent: '空にする' }),
    ]);
    for (const m of currentMembers) {
      if (!m) continue;
      runnerSelect.appendChild(el('option', { value: String(m.id), textContent: m.name }));
    }
    content.appendChild(runnerSelectLabel);
    content.appendChild(runnerSelect);

    // 成功/失敗
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '結果' }));
    const statusBtns = el('div', { className: 'tab-bar', style: { marginBottom: 'var(--space-base)' } });
    const sBtn = el('button', { className: 'tab-item active', textContent: '成功', onClick: () => { resultStatus = 'success'; sBtn.classList.add('active'); fBtn.classList.remove('active'); } });
    const fBtn = el('button', { className: 'tab-item', textContent: '失敗(アウト)', onClick: () => { resultStatus = 'failure'; fBtn.classList.add('active'); sBtn.classList.remove('active'); } });
    statusBtns.appendChild(sBtn); statusBtns.appendChild(fBtn);
    content.appendChild(statusBtns);

    // 備考
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
      el('label', { className: 'input-label', textContent: '備考' }),
      el('input', { className: 'input-field', type: 'text', placeholder: '詳細メモ', onInput: (e) => { note = e.target.value; } }),
    ]));

    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block btn-lg', textContent: '記録する',
      onClick: async () => {
        if (!selectedAction) { showToast('アクションを選択してください', 'error'); return; }
        const requiresRunner = ['steal', 'advance', 'advanceTwo', 'out', 'error', 'score'];
        if (requiresRunner.includes(selectedAction) && !selectedRunner) { showToast('対象ランナーを選択してください', 'error'); return; }
        if (selectedAction === 'setRunner' && !selectedTargetBase) { showToast('修正先の塁を選択してください', 'error'); return; }
        let actionToSave = selectedAction;
        let noteToSave = note;
        if (['advance', 'steal', 'error'].includes(selectedAction) && advanceSteps === 2) {
          actionToSave = 'advanceTwo';
        }
        if (['wildPitch', 'passedBall', 'balk'].includes(selectedAction) && advanceSteps === 2) {
          noteToSave = `${noteToSave} ${NOTE_FLAG_ADVANCE_TWO}`.trim();
        }
        let order;
        if (afterEvent) {
          // 挿入: afterEventのorder + 0.5 → 後で全体を再番号付け
          order = afterEvent.order + 0.5;
        } else {
          order = await DB.getNextOrder(currentGameId);
        }
        await DB.addPlay({
          gameId: currentGameId, inning: afterEvent ? afterEvent.inning : state.inning, side: afterEvent ? afterEvent.side : state.side,
          relatedAtBatId: afterEvent?.id || null, action: actionToSave, runner: actionToSave === 'setRunner' ? selectedTargetBase : selectedRunner, runnerId: selectedRunnerId,
          runnerName: selectedRunnerId ? (currentMembers.find((m) => m.id === selectedRunnerId)?.name || '') : '',
          catcherId: (actionToSave === 'steal' && resultStatus === 'failure') ? getCurrentCatcherId() : null,
          resultStatus, outPosition: null, note: noteToSave, order,
        });
        // 挿入の場合はorder再番号付け
        if (afterEvent) await reorderEvents();
        close();
        showToast('プレーを記録しました');
        await postAtBatCheck();
      },
    }));
  });
}

/** 打席の直後にプレーを挿入するモーダル */
async function showInsertPlayModal(afterEvent) {
  const opponentScores = await DB.getOpponentScores(currentGameId);
  const stateAtInsertion = computeGameState(currentEvents, currentGame, currentMembers, opponentScores, afterEvent.order);
  showPlayInputModal(stateAtInsertion, afterEvent);
}

/** イベントのorder値を整数に再番号付け（トランザクション） */
async function reorderEvents() {
  await DB.reorderAllEvents(currentGameId);
}

async function createInningChangeMarker(nextInning, nextSide) {
  const order = await DB.getNextOrder(currentGameId);
  await DB.addPlay({
    gameId: currentGameId,
    inning: nextInning,
    side: nextSide,
    relatedAtBatId: null,
    action: 'other',
    runner: '',
    runnerId: null,
    resultStatus: 'success',
    outPosition: null,
    note: NOTE_SYS_INNING_CHANGE,
    order,
  });
}

function showRBIConfirmModal(atBat, state) {
  createModal('打点確認', (content, close) => {
    let rbi = calculateAutoRBI(atBat.result, state.runners);
    content.appendChild(el('div', { style: { textAlign: 'center', marginBottom: 'var(--space-xl)' } }, [
      el('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 'bold', marginBottom: 'var(--space-sm)' }, textContent: getResultLabel(atBat.result) }),
      el('div', { className: 'text-secondary', textContent: '打点数を確認・修正してください' }),
    ]));
    const rbiDisplay = el('div', { style: { fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', minWidth: '48px', textAlign: 'center' }, textContent: String(rbi) });
    content.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' } }, [
      el('button', { className: 'btn btn-secondary btn-icon', textContent: '−', onClick: () => { if (rbi > 0) { rbi--; rbiDisplay.textContent = String(rbi); } } }),
      rbiDisplay,
      el('button', { className: 'btn btn-secondary btn-icon', textContent: '＋', onClick: () => { rbi++; rbiDisplay.textContent = String(rbi); } }),
    ]));
    content.appendChild(el('button', { className: 'btn btn-primary btn-block btn-lg', textContent: '記録する',
      onClick: async () => { atBat.rbiProduced = rbi; close(); await finalizeAtBatRecord(atBat, state, `${getResultLabel(atBat.result)} ${rbi}打点`); },
    }));
  });
}

function showOpponentScoreModal(state) {
  createModal('相手チーム得点入力', (content, close) => {
    const totalInnings = Math.max(currentGame.innings || 7, state.inning);
    content.appendChild(el('div', { className: 'text-secondary', style: { marginBottom: 'var(--space-lg)', fontSize: 'var(--font-size-sm)' }, textContent: '各イニングの相手チーム得点を入力' }));
    const inputs = {};
    for (let i = 1; i <= totalInnings; i++) {
      const cur = state.inningScores.opponent[i] || 0;
      inputs[i] = cur;
      content.appendChild(el('div', { className: 'pitcher-stat-row' }, [
        el('span', { className: 'pitcher-stat-label', textContent: `${i}回` }),
        el('input', { className: 'pitcher-stat-input', type: 'number', min: '0', value: String(cur), onInput: (e) => { inputs[i] = parseInt(e.target.value) || 0; } }),
      ]));
    }
    content.appendChild(el('button', { className: 'btn btn-primary btn-block btn-lg', style: { marginTop: 'var(--space-lg)' }, textContent: '保存',
      onClick: async () => {
        for (const [inn, runs] of Object.entries(inputs)) await DB.setOpponentScore(currentGameId, parseInt(inn), getOpponentAttackSide(), runs);
        close(); showToast('相手チームの得点を更新しました'); await refreshAll();
      },
    }));
  });
}

function showAtBatEditModal(event) {
  createModal('打席編集', (content, close) => {
    const member = currentMembers.find(m => m.id === event.batterId);
    let result = event.result, rbi = event.rbiProduced || 0, note = event.note || '';
    let droppedThirdStrikeSuccess = !!event?.specialFlags?.droppedThirdStrikeSuccess;
    let battedType = event?.fieldDirection?.battedType || '';
    let fieldPosition = event?.fieldDirection?.position || '';
    let fieldZone = event?.fieldDirection?.zone || '';
    content.appendChild(el('div', { style: { textAlign: 'center', marginBottom: 'var(--space-lg)' } }, [
      el('div', { style: { fontSize: 'var(--font-size-md)', fontWeight: 'bold' }, textContent: member?.name || '不明' }),
      el('div', { className: 'text-muted', textContent: formatInning(event.inning, event.side) }),
    ]));
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '結果' }));
    const rg = el('div', { className: 'result-buttons', style: { marginBottom: 'var(--space-base)' } });
    for (const r of AT_BAT_RESULTS) {
      const cls = r.category === 'homerun' ? 'homerun' : r.category === 'error' ? 'error-btn' : r.category;
      const btn = el('button', { className: `btn-result ${cls}`, textContent: r.short,
        style: result === r.id ? { borderColor: 'var(--color-primary)', boxShadow: '0 0 0 2px var(--color-primary-dim)' } : {},
        onClick: () => { result = r.id; rg.querySelectorAll('.btn-result').forEach(b => { b.style.borderColor = ''; b.style.boxShadow = ''; }); btn.style.borderColor = 'var(--color-primary)'; btn.style.boxShadow = '0 0 0 2px var(--color-primary-dim)'; },
      });
      rg.appendChild(btn);
    }
    content.appendChild(rg);
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
      el('label', { className: 'input-label', textContent: '打点' }),
      el('input', { className: 'input-field', type: 'number', min: '0', value: String(rbi), onInput: (e) => { rbi = parseInt(e.target.value) || 0; } }),
    ]));
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
      el('label', { className: 'input-label', textContent: '備考' }),
      el('input', { className: 'input-field', type: 'text', value: note, placeholder: '特記事項', onInput: (e) => { note = e.target.value; } }),
    ]));
    if (result === 'strikeout') {
      const droppedCheckbox = el('input', {
        type: 'checkbox',
        onChange: (e) => { droppedThirdStrikeSuccess = !!e.target.checked; },
      });
      droppedCheckbox.checked = droppedThirdStrikeSuccess;
      content.appendChild(el('label', { className: 'list-item', style: { marginBottom: 'var(--space-base)' } }, [
        droppedCheckbox,
        el('div', { className: 'list-item-content' }, [
          el('div', { className: 'list-item-title', textContent: '振り逃げ成功' }),
        ]),
      ]));
    }
    if (isBattedOutResult(result) || isHitResult(result) || result === 'doublePlay') {
      content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '打球種別' }));
      const typeSelect = el('select', { className: 'input-field', style: { marginBottom: 'var(--space-sm)' }, onChange: (e) => { battedType = e.target.value; } }, [
        el('option', { value: '', textContent: '未選択' }),
        el('option', { value: 'ゴロ', textContent: 'ゴロ' }),
        el('option', { value: 'フライ', textContent: 'フライ' }),
        el('option', { value: 'ライナー', textContent: 'ライナー' }),
      ]);
      typeSelect.value = battedType || '';
      content.appendChild(typeSelect);
      content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '打球位置（守備位置）' }));
      const posSelect = el('select', { className: 'input-field', style: { marginBottom: 'var(--space-sm)' }, onChange: (e) => { fieldPosition = e.target.value; } }, [
        el('option', { value: '', textContent: '未選択' }),
      ]);
      for (const p of BATTED_BALL_POSITIONS) posSelect.appendChild(el('option', { value: p.id, textContent: p.label }));
      posSelect.value = fieldPosition || '';
      content.appendChild(posSelect);
      content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '打球位置（方向詳細）' }));
      const zoneSelect = el('select', { className: 'input-field', style: { marginBottom: 'var(--space-xl)' }, onChange: (e) => { fieldZone = e.target.value; } }, [
        el('option', { value: '', textContent: '未選択' }),
      ]);
      for (const z of BATTED_BALL_ZONES) zoneSelect.appendChild(el('option', { value: z.id, textContent: z.label }));
      zoneSelect.value = fieldZone || '';
      content.appendChild(zoneSelect);
    }
    content.appendChild(el('div', { style: { display: 'flex', gap: 'var(--space-md)' } }, [
      el('button', { className: 'btn btn-danger', style: { flex: '0 0 auto' }, textContent: '削除',
        onClick: () => { showConfirmModal('この打席記録を削除しますか？', async () => { await DB.deleteAtBat(event.id); close(); showToast('削除しました'); await refreshAll(); }); },
      }),
      el('button', { className: 'btn btn-primary', style: { flex: 1 }, textContent: '保存',
        onClick: async () => {
          const nextFlags = { ...(event.specialFlags || {}), droppedThirdStrikeSuccess };
          const cleanedNote = (note || '').replace(NOTE_FLAG_DROPPED_THIRD_STRIKE, '').trim();
          const noteWithFlag = droppedThirdStrikeSuccess ? `${cleanedNote} ${NOTE_FLAG_DROPPED_THIRD_STRIKE}`.trim() : cleanedNote;
          const fieldDirection = (isBattedOutResult(result) || isHitResult(result) || result === 'doublePlay') ? {
            battedType: battedType || null,
            battedTypeLabel: battedType || null,
            position: fieldPosition || null,
            positionLabel: BATTED_BALL_POSITIONS.find((p) => p.id === fieldPosition)?.label || null,
            zone: fieldZone || null,
            zoneLabel: BATTED_BALL_ZONES.find((z) => z.id === fieldZone)?.label || null,
          } : null;
          await DB.updateAtBat(event.id, { result, rbiProduced: rbi, note: noteWithFlag, specialFlags: nextFlags, fieldDirection });
          close();
          showToast('更新しました');
          await refreshAll();
        },
      }),
    ]));
  });
}

function showPlayEditModal(event) {
  createModal('プレー編集', (content, close) => {
    let note = event.note || '';
    content.appendChild(el('div', { style: { marginBottom: 'var(--space-lg)' } }, [
      el('div', { className: 'text-secondary', textContent: `アクション: ${PLAY_ACTIONS.find(a => a.id === event.action)?.label || event.action}` }),
      el('div', { className: 'text-muted', textContent: formatInning(event.inning, event.side) }),
    ]));
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
      el('label', { className: 'input-label', textContent: '備考' }),
      el('input', { className: 'input-field', type: 'text', value: note, placeholder: '詳細メモ', onInput: (e) => { note = e.target.value; } }),
    ]));
    content.appendChild(el('div', { style: { display: 'flex', gap: 'var(--space-md)' } }, [
      el('button', { className: 'btn btn-danger', style: { flex: '0 0 auto' }, textContent: '削除',
        onClick: () => { showConfirmModal('このプレー記録を削除しますか？', async () => {
          if (event.action === 'pitcherStats') {
            const stats = await DB.getPitcherStats(currentGameId, event.inning, event.side);
            if (stats.length > 0) {
              stats.sort((a, b) => (b.id || 0) - (a.id || 0));
              await DB.deletePitcherStat(stats[0].id);
              await syncOpponentScoreFromPitcherStats(event.inning, event.side);
            }
          }
          await DB.deletePlay(event.id);
          close();
          showToast('削除しました');
          await refreshAll();
        }); },
      }),
      el('button', { className: 'btn btn-primary', style: { flex: 1 }, textContent: '保存',
        onClick: async () => { await DB.updatePlay(event.id, { note }); close(); showToast('更新しました'); await refreshAll(); },
      }),
    ]));
    if (event.action === 'pitcherStats') {
      content.appendChild(el('button', {
        className: 'btn btn-secondary btn-block',
        style: { marginTop: 'var(--space-sm)' },
        textContent: 'この投手成績を編集',
        onClick: () => {
          close();
          showPitcherStatsModal({ inning: event.inning, side: event.side, playEventId: event.id });
        },
      }));
    }
  });
}

function showGameMenu() {
  createModal('試合メニュー', (content, close) => {
    const items = [
      { icon: '📤', label: 'この試合を共有', desc: '打順順で共有テキスト/画像を作成', fn: () => { close(); showGameShareModal(); } },
      { icon: '🔄', label: 'イニング変更', desc: '手動でイニングを切り替える', fn: () => { close(); showInningChangeModal(); } },
      { icon: '🔁', label: '選手交代', desc: '現在の守備位置を入れ替える', fn: () => { close(); showPlayerChangeModal(); } },
      { icon: '🧭', label: '特殊開始設定', desc: '1アウト1,2塁などを設定', fn: () => { close(); showSpecialStartModal(); } },
      { icon: '⚾', label: '投手成績', desc: '被得点・三振・自責点', fn: () => { close(); showPitcherStatsModal(); } },
      { icon: '🏁', label: '試合終了', desc: 'この試合を終了する', fn: () => { close(); showFinishGameModal(); } },
      { icon: '💾', label: 'データをエクスポート', desc: '全データをJSONで保存', fn: () => { close(); exportData(); } },
      { icon: '🏠', label: 'ホームに戻る', desc: '試合は保存されます', fn: () => { close(); window.__navigate('home'); } },
    ];
    for (const it of items) {
      content.appendChild(el('button', { className: 'list-item', onClick: it.fn }, [
        el('div', { style: { fontSize: '1.5rem', width: '40px', textAlign: 'center' }, textContent: it.icon }),
        el('div', { className: 'list-item-content' }, [
          el('div', { className: 'list-item-title', textContent: it.label }),
          el('div', { className: 'list-item-subtitle', textContent: it.desc }),
        ]),
      ]));
    }
  });
}

async function showGameShareModal() {
  const events = await DB.getAllEvents(currentGameId);
  const pitcherStats = await DB.getPitcherStats(currentGameId);
  const lineup = currentGame.lineup || [];
  const statMap = {};
  lineup.forEach((id, idx) => {
    const m = currentMembers.find((mm) => mm.id === id);
    statMap[id] = createGameStatRow(m, idx + 1, formatFieldingPosition(currentGame.lineupPositions?.[id] || m?.position || ''));
  });

  for (const event of events) {
    if (event.type === 'atBat') {
      const st = statMap[event.batterId];
      if (!st) continue;
      st.pa++;
      if (isAtBatCounted(event.result)) st.ab++;
      if (isHitResult(event.result)) st.h++;
      if (event.result === 'double') st.double++;
      if (event.result === 'triple') st.triple++;
      if (event.result === 'homerun') st.hr++;
      if (event.result === 'walk') st.bb++;
      if (event.result === 'hitByPitch') st.hbp++;
      if (event.result === 'strikeout') st.so++;
      if (event.result === 'sacrifice') st.sh++;
      if (event.result === 'sacrificeFly') st.sf++;
      if (event.result === 'doublePlay') st.gdp++;
      if (event.result === 'error') st.reachedOnError++;
      st.rbi += (event.rbiProduced || 0);
    } else if (event.type === 'play' && event.runnerId) {
      const st = statMap[event.runnerId];
      if (!st) continue;
      if (event.action === 'steal' && event.resultStatus === 'success') st.sb++;
      if (
        event.action === 'score' ||
        (event.action === 'advance' && event.resultStatus === 'success' && event.runner === '3B') ||
        (event.action === 'advanceTwo' && event.resultStatus === 'success' && (event.runner === '2B' || event.runner === '3B'))
      ) st.r++;
    }
    if (event.type === 'play' && event.action === 'steal' && event.resultStatus === 'failure') {
      const catcherId = event.catcherId || getCurrentCatcherId();
      if (catcherId && statMap[catcherId]) statMap[catcherId].catcherCs++;
    }
  }
  for (const event of events) {
    if (event.type === 'atBat' && event.result === 'homerun' && statMap[event.batterId]) {
      statMap[event.batterId].r++;
    }
  }

  const headers = ['選手名', '打順', '守備位置', '打席', '打数', '安打', '本塁打', '打点', '得点', '盗塁', '二塁打', '三塁打', '三振', '四球', '死球', '犠打', '犠飛', '併殺打', '敵失', '盗塁阻止', '打率', 'OPS'];
  const rows = lineup.map((id) => {
    const st = statMap[id];
    if (!st) return null;
    const avg = st.ab > 0 ? st.h / st.ab : 0;
    const obpDen = st.ab + st.bb + st.hbp + st.sf;
    const obp = obpDen > 0 ? (st.h + st.bb + st.hbp) / obpDen : 0;
    const tb = (st.h - st.double - st.triple - st.hr) + (2 * st.double) + (3 * st.triple) + (4 * st.hr);
    const slg = st.ab > 0 ? tb / st.ab : 0;
    const ops = obp + slg;
    return [
      st.name, st.order, st.position, st.pa, st.ab, st.h, st.hr, st.rbi, st.r, st.sb, st.double, st.triple, st.so,
      st.bb, st.hbp, st.sh, st.sf, st.gdp, st.reachedOnError, st.catcherCs, avg.toFixed(3), ops.toFixed(3),
    ];
  }).filter(Boolean);
  const title = `${currentTeam?.name || '自チーム'} vs ${currentGame.opponentName || '相手'} (${currentGame.date || ''})`;
  const statusLine = `現在: ${formatInning(currentState.inning, currentState.side)} / ${currentState.outs}アウト / スコア ${currentState.score.team}-${currentState.score.opponent}`;
  const pitcherHeaders = ['選手名', '登板順', '勝敗', '投球回', '投球数', '失点', '自責点', '完投', '完封', '被安打', '被本塁打', '奪三振', '与四球', '与死球', 'ボーク', '暴投'];
  const pitcherKeySet = new Set();
  for (const s of pitcherStats) {
    const hasPitcherId = s.pitcherId !== null && s.pitcherId !== undefined;
    const hasPitcherName = typeof s.pitcherName === 'string' && s.pitcherName.trim() !== '';
    if (!hasPitcherId && !hasPitcherName) continue;
    const key = String(s.pitcherId || s.pitcherName || '');
    if (!key) continue;
    pitcherKeySet.add(key);
  }
  const singlePitcherKey = pitcherKeySet.size === 1 ? [...pitcherKeySet][0] : null;
  const gameFinished = currentGame.status === 'finished';
  const completeGameKey = (gameFinished && singlePitcherKey) ? singlePitcherKey : null;
  const isShutoutGame = gameFinished && (currentState.score.opponent || 0) === 0 && !!completeGameKey;
  const pitcherAggregateMap = {};
  for (const s of pitcherStats) {
    const hasPitcherId = s.pitcherId !== null && s.pitcherId !== undefined;
    const hasPitcherName = typeof s.pitcherName === 'string' && s.pitcherName.trim() !== '';
    if (!hasPitcherId && !hasPitcherName) continue;
    const key = String(s.pitcherId || s.pitcherName || '');
    if (!key) continue;
    if (!pitcherAggregateMap[key]) {
      pitcherAggregateMap[key] = {
        pitcherName: s.pitcherName || (currentMembers.find((m) => m.id === s.pitcherId)?.name || ''),
        appearanceOrder: Number(s.appearanceOrder) || 999,
        winLoss: s.winLoss || '',
        outsPitched: 0,
        pitches: 0,
        runsAllowed: 0,
        earnedRuns: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
        strikeouts: 0,
        walks: 0,
        hitByPitch: 0,
        balks: 0,
        wildPitches: 0,
      };
    }
    const agg = pitcherAggregateMap[key];
    agg.appearanceOrder = Math.min(agg.appearanceOrder, Number(s.appearanceOrder) || agg.appearanceOrder);
    if (s.winLoss) agg.winLoss = s.winLoss;
    agg.outsPitched += parseInningsLabelToOuts(s.inningsPitched || '0.0');
    agg.pitches += Number(s.pitches) || 0;
    agg.runsAllowed += Number(s.runsAllowed) || 0;
    agg.earnedRuns += Number(s.earnedRuns) || 0;
    agg.hitsAllowed += Number(s.hitsAllowed) || 0;
    agg.homeRunsAllowed += Number(s.homeRunsAllowed) || 0;
    agg.strikeouts += Number(s.strikeouts) || 0;
    agg.walks += Number(s.walks) || 0;
    agg.hitByPitch += Number(s.hitByPitch) || 0;
    agg.balks += Number(s.balks) || 0;
    agg.wildPitches += Number(s.wildPitches) || 0;
  }
  const orderedPitchers = Object.entries(pitcherAggregateMap)
    .sort((a, b) => a[1].appearanceOrder - b[1].appearanceOrder)
    .map(([key, agg], idx) => ({
      key,
      agg,
      normalizedOrder: idx + 1,
    }));
  const pitcherRows = orderedPitchers
    .map(({ key, agg, normalizedOrder }) => [
      agg.pitcherName,
      normalizedOrder,
      agg.winLoss || '',
      formatOutsToInningsLabel(agg.outsPitched),
      agg.pitches,
      agg.runsAllowed,
      agg.earnedRuns,
      completeGameKey && key === completeGameKey ? '1' : '0',
      isShutoutGame && key === completeGameKey ? '1' : '0',
      agg.hitsAllowed,
      agg.homeRunsAllowed,
      agg.strikeouts,
      agg.walks,
      agg.hitByPitch,
      agg.balks,
      agg.wildPitches,
    ]);
  const text = [
    title,
    statusLine,
    '',
    '[打者成績]',
    headers.join('\t'),
    ...rows.map((r) => r.join('\t')),
    '',
    '[投手成績]',
    pitcherHeaders.join('\t'),
    ...pitcherRows.map((r) => r.join('\t')),
  ].join('\n');

  createModal('この試合を共有', (content, close) => {
    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: '画像保存',
      onClick: () => downloadGameShareImage(
        `${currentTeam?.name || 'team'}_${currentGame?.opponentName || 'opponent'}_game_share.png`,
        title,
        statusLine,
        headers,
        rows,
        currentState,
        pitcherHeaders,
        pitcherRows,
      ),
    }));
  });
}

function createGameStatRow(member, order, position) {
  return {
    name: member?.name || '不明',
    order,
    position,
    pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, r: 0, sb: 0, double: 0, triple: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, gdp: 0, reachedOnError: 0, cs: 0, catcherCs: 0,
  };
}

function getCurrentCatcherId() {
  const lineup = currentGame?.lineup || [];
  const positions = currentGame?.lineupPositions || {};
  for (const memberId of lineup) {
    if (positions[memberId] === 'C') return memberId;
  }
  return null;
}

function formatFieldingPosition(positionId) {
  const found = POSITIONS.find((p) => p.id === positionId);
  if (!found) return positionId || '';
  return `${found.label} (${found.short})`;
}

function downloadGameShareImage(filename, title, statusLine, headers, rows, state, pitcherHeaders = [], pitcherRows = []) {
  const colWidth = 120;
  const tableWidth = headers.length * colWidth;
  const width = Math.min(3200, tableWidth + 40);
  const visibleCols = Math.floor((width - 40) / colWidth);
  const tableHeaders = headers.slice(0, visibleCols);
  const tableRows = rows.map((r) => r.slice(0, visibleCols));
  const pitcherTableWidth = pitcherHeaders.length * colWidth;
  const pitcherVisibleCols = Math.floor((width - 40) / colWidth);
  const visiblePitcherHeaders = pitcherHeaders.slice(0, pitcherVisibleCols);
  const visiblePitcherRows = pitcherRows.map((r) => r.slice(0, pitcherVisibleCols));
  const rowHeight = 28;
  const scoreRowHeight = 26;
  const scoreHeaderHeight = 28;
  const scoreLabelWidth = 100;
  const scoreCellWidth = 44;
  const scoreTop = 80;
  const inningsForBoard = Math.max(currentGame?.innings || 7, state?.inning || 1);
  const scoreCols = inningsForBoard + 1; // +R
  const scoreBoardWidth = scoreLabelWidth + scoreCols * scoreCellWidth;
  const scoreBoardHeight = scoreHeaderHeight + scoreRowHeight * 2;
  const tableHeight = rowHeight * (tableRows.length + 1);
  const pitcherTableHeight = rowHeight * (visiblePitcherRows.length + 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(620, 180 + scoreBoardHeight + tableHeight + pitcherTableHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(title, 16, 32);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#4b5563';
  ctx.fillText(statusLine, 16, 56);
  // score board
  ctx.fillStyle = '#eef2ff';
  ctx.fillRect(16, scoreTop, scoreBoardWidth, scoreHeaderHeight);
  ctx.fillStyle = '#111827';
  ctx.font = '12px sans-serif';
  ctx.fillText('', 20, scoreTop + 18);
  for (let i = 1; i <= inningsForBoard; i++) {
    ctx.fillText(String(i), 16 + scoreLabelWidth + (i - 1) * scoreCellWidth + 14, scoreTop + 18);
  }
  ctx.fillText('R', 16 + scoreLabelWidth + inningsForBoard * scoreCellWidth + 14, scoreTop + 18);
  const teamNameShort = (currentTeam?.name || 'チーム').substring(0, 6);
  const oppNameShort = (currentGame?.opponentName || '相手').substring(0, 6);
  const teamY = scoreTop + scoreHeaderHeight;
  const oppY = teamY + scoreRowHeight;
  ctx.fillStyle = '#111827';
  ctx.fillText(teamNameShort, 20, teamY + 17);
  ctx.fillText(oppNameShort, 20, oppY + 17);
  for (let i = 1; i <= inningsForBoard; i++) {
    const teamInning = state?.inningScores?.team?.[i] ?? 0;
    const oppInning = state?.inningScores?.opponent?.[i] ?? 0;
    const x = 16 + scoreLabelWidth + (i - 1) * scoreCellWidth + 14;
    ctx.fillText(String(teamInning), x, teamY + 17);
    ctx.fillText(String(oppInning), x, oppY + 17);
  }
  ctx.fillText(String(state?.score?.team ?? 0), 16 + scoreLabelWidth + inningsForBoard * scoreCellWidth + 14, teamY + 17);
  ctx.fillText(String(state?.score?.opponent ?? 0), 16 + scoreLabelWidth + inningsForBoard * scoreCellWidth + 14, oppY + 17);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(16, scoreTop, scoreBoardWidth, scoreBoardHeight);
  for (let c = 0; c <= scoreCols; c++) {
    const x = 16 + scoreLabelWidth + c * scoreCellWidth;
    ctx.beginPath();
    ctx.moveTo(x, scoreTop);
    ctx.lineTo(x, scoreTop + scoreBoardHeight);
    ctx.stroke();
  }
  for (let r = 0; r <= 2; r++) {
    const y = scoreTop + scoreHeaderHeight + r * scoreRowHeight;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(16 + scoreBoardWidth, y);
    ctx.stroke();
  }
  // batter table
  const batterTop = scoreTop + scoreBoardHeight + 20;
  ctx.fillStyle = '#efefef';
  ctx.fillRect(16, batterTop, tableHeaders.length * colWidth, rowHeight);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#111827';
  tableHeaders.forEach((h, i) => {
    ctx.fillText(String(h), 20 + i * colWidth, batterTop + 18);
  });
  tableRows.forEach((row, rowIndex) => {
    const y = batterTop + (rowIndex + 1) * rowHeight;
    if (rowIndex % 2 === 0) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(16, y, tableHeaders.length * colWidth, rowHeight);
    }
    ctx.fillStyle = '#111827';
    row.forEach((cell, colIndex) => {
      ctx.fillText(String(cell ?? ''), 20 + colIndex * colWidth, y + 18);
    });
  });
  ctx.strokeStyle = '#d1d5db';
  for (let c = 0; c <= tableHeaders.length; c++) {
    const x = 16 + c * colWidth;
    ctx.beginPath();
    ctx.moveTo(x, batterTop);
    ctx.lineTo(x, batterTop + tableHeight);
    ctx.stroke();
  }
  for (let r = 0; r <= tableRows.length + 1; r++) {
    const y = batterTop + r * rowHeight;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(16 + tableHeaders.length * colWidth, y);
    ctx.stroke();
  }
  // pitcher table
  const pitcherTop = batterTop + tableHeight + 28;
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('投手成績', 16, pitcherTop - 8);
  ctx.fillStyle = '#efefef';
  ctx.fillRect(16, pitcherTop, visiblePitcherHeaders.length * colWidth, rowHeight);
  ctx.fillStyle = '#111827';
  ctx.font = '12px sans-serif';
  visiblePitcherHeaders.forEach((h, i) => {
    ctx.fillText(String(h), 20 + i * colWidth, pitcherTop + 18);
  });
  visiblePitcherRows.forEach((row, rowIndex) => {
    const y = pitcherTop + (rowIndex + 1) * rowHeight;
    if (rowIndex % 2 === 0) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(16, y, visiblePitcherHeaders.length * colWidth, rowHeight);
    }
    ctx.fillStyle = '#111827';
    row.forEach((cell, colIndex) => {
      ctx.fillText(String(cell ?? ''), 20 + colIndex * colWidth, y + 18);
    });
  });
  ctx.strokeStyle = '#d1d5db';
  for (let c = 0; c <= visiblePitcherHeaders.length; c++) {
    const x = 16 + c * colWidth;
    ctx.beginPath();
    ctx.moveTo(x, pitcherTop);
    ctx.lineTo(x, pitcherTop + pitcherTableHeight);
    ctx.stroke();
  }
  for (let r = 0; r <= visiblePitcherRows.length + 1; r++) {
    const y = pitcherTop + r * rowHeight;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(16 + visiblePitcherHeaders.length * colWidth, y);
    ctx.stroke();
  }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
  showToast('共有画像を保存しました');
}

function showSpecialStartModal() {
  createModal('特殊開始設定', (content, close) => {
    let outs = 1;
    let firstId = currentState.runners.first?.memberId || null;
    let secondId = currentState.runners.second?.memberId || null;
    let thirdId = currentState.runners.third?.memberId || null;
    content.appendChild(el('div', { className: 'text-secondary', style: { marginBottom: 'var(--space-base)', fontSize: 'var(--font-size-sm)' }, textContent: '大会ルール用にアウト数・塁状況を直接設定します' }));
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
      el('label', { className: 'input-label', textContent: 'アウト数（0〜2）' }),
      el('input', { className: 'input-field', type: 'number', min: '0', max: '2', value: String(outs), onInput: (e) => { outs = Math.max(0, Math.min(2, parseInt(e.target.value) || 0)); } }),
    ]));
    const lineupMembers = (currentGame.lineup || []).map((id) => currentMembers.find((m) => m.id === id)).filter(Boolean);
    const createRunnerSelect = (label, onChange, value) => {
      const select = el('select', { className: 'input-field', onChange: (e) => onChange(e.target.value ? Number(e.target.value) : null) }, [
        el('option', { value: '', textContent: 'ランナーなし' }),
      ]);
      lineupMembers.forEach((m) => select.appendChild(el('option', { value: String(m.id), textContent: m.name })));
      select.value = value ? String(value) : '';
      return el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
        el('label', { className: 'input-label', textContent: label }),
        select,
      ]);
    };
    content.appendChild(createRunnerSelect('一塁ランナー', (v) => { firstId = v; }, firstId));
    content.appendChild(createRunnerSelect('二塁ランナー', (v) => { secondId = v; }, secondId));
    content.appendChild(createRunnerSelect('三塁ランナー', (v) => { thirdId = v; }, thirdId));
    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: '設定を保存',
      onClick: async () => {
        const preset = { outs, runners: { first: firstId, second: secondId, third: thirdId } };
        await DB.addPlay({
          gameId: currentGameId,
          inning: currentState.inning,
          side: currentState.side,
          relatedAtBatId: null,
          action: 'setInningState',
          runner: '',
          runnerId: null,
          resultStatus: 'success',
          outPosition: null,
          note: JSON.stringify(preset),
          order: await DB.getNextOrder(currentGameId),
        });
        close();
        showToast('特殊開始を設定しました');
        await refreshAll();
      },
    }));
  });
}

function showPlayerChangeModal() {
  createModal('選手交代', (content, close) => {
    const lineup = [...(currentGame.lineup || [])];
    const lineupPositions = { ...(currentGame.lineupPositions || {}) };
    const lineupMembers = lineup.map((id) => currentMembers.find((m) => m.id === id)).filter(Boolean);
    const allMembers = [...currentMembers];
    const currentPitcherId = lineup.find((id) => lineupPositions[id] === 'P') || null;
    let outgoingId = currentPitcherId;
    let incomingId = null;

    const outgoingSelect = el('select', { className: 'input-field', onChange: (e) => { outgoingId = e.target.value ? Number(e.target.value) : null; } }, [
      el('option', { value: '', textContent: '交代前選手を選択' }),
    ]);
    for (const m of lineupMembers) outgoingSelect.appendChild(el('option', { value: String(m.id), textContent: m.name }));
    if (outgoingId) outgoingSelect.value = String(outgoingId);

    const incomingSelect = el('select', { className: 'input-field', onChange: (e) => { incomingId = e.target.value ? Number(e.target.value) : null; } }, [
      el('option', { value: '', textContent: '交代後選手を選択' }),
    ]);
    for (const m of allMembers) incomingSelect.appendChild(el('option', { value: String(m.id), textContent: m.name }));

    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
      el('label', { className: 'input-label', textContent: '交代前（現在の出場選手）' }),
      outgoingSelect,
    ]));
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
      el('label', { className: 'input-label', textContent: '交代後（入る選手）' }),
      incomingSelect,
    ]));

    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: '交代を記録',
      onClick: async () => {
        if (!outgoingId || !incomingId) {
          showToast('交代前・交代後の選手を選択してください', 'error');
          return;
        }
        if (outgoingId === incomingId) {
          showToast('同じ選手は選択できません', 'error');
          return;
        }
        const outIdx = lineup.indexOf(outgoingId);
        if (outIdx >= 0 && !lineup.includes(incomingId)) {
          lineup[outIdx] = incomingId;
        }
        lineupPositions[outgoingId] = '';
        lineupPositions[incomingId] = 'P';
        await DB.updateGame(currentGameId, { lineup, lineupPositions });
        currentGame.lineup = lineup;
        currentGame.lineupPositions = lineupPositions;
        const outgoing = currentMembers.find((m) => m.id === outgoingId);
        const incoming = currentMembers.find((m) => m.id === incomingId);
        await DB.addPlay({
          gameId: currentGameId,
          inning: currentState.inning,
          side: currentState.side,
          relatedAtBatId: null,
          action: 'playerChange',
          runner: '',
          runnerId: null,
          resultStatus: 'success',
          outPosition: null,
          note: `投手交代: ${outgoing?.name || '不明'} → ${incoming?.name || '不明'}`,
          order: await DB.getNextOrder(currentGameId),
        });
        close();
        showToast('選手交代を記録しました');
        await refreshAll();
      },
    }));
  });
}

function showFinishGameModal() {
  createModal('試合終了', async (content, close) => {
    const pitcherStats = await DB.getPitcherStats(currentGameId);
    content.appendChild(el('div', { className: 'text-secondary', style: { marginBottom: 'var(--space-base)', fontSize: 'var(--font-size-sm)' }, textContent: '試合終了時に投手の勝敗を登録できます（任意）' }));
    const pitcherMap = {};
    let unknownIdx = 1;
    for (const s of pitcherStats) {
      const hasPitcherId = s.pitcherId !== null && s.pitcherId !== undefined;
      const hasPitcherName = typeof s.pitcherName === 'string' && s.pitcherName.trim() !== '';
      if (!hasPitcherId && !hasPitcherName) continue;
      const key = String(s.pitcherId || s.pitcherName || `unknown-${unknownIdx++}`);
      if (!pitcherMap[key]) {
        pitcherMap[key] = {
          key,
          pitcherId: s.pitcherId || null,
          pitcherName: s.pitcherName || (currentMembers.find((m) => m.id === s.pitcherId)?.name || '投手'),
          statIds: [],
        };
      }
      pitcherMap[key].statIds.push(s.id);
    }
    const pitchers = Object.values(pitcherMap);
    let winnerKey = '';
    let loserKey = '';
    let saverKey = '';
    if (pitcherStats.length === 0) {
      content.appendChild(el('div', { className: 'text-muted', style: { marginBottom: 'var(--space-lg)' }, textContent: '投手成績がまだありません' }));
    } else {
      const createPitcherResultSelect = (label, onChange) => {
        const select = el('select', {
          className: 'input-field',
          style: { marginBottom: 'var(--space-sm)' },
          onChange: (e) => onChange(e.target.value || ''),
        }, [
          el('option', { value: '', textContent: `${label}なし` }),
        ]);
        for (const p of pitchers) {
          select.appendChild(el('option', { value: p.key, textContent: p.pitcherName || '投手' }));
        }
        return el('div', { className: 'input-group', style: { marginBottom: 'var(--space-sm)' } }, [
          el('label', { className: 'input-label', textContent: label }),
          select,
        ]);
      };
      content.appendChild(createPitcherResultSelect('勝利投手', (v) => { winnerKey = v; }));
      content.appendChild(createPitcherResultSelect('敗戦投手', (v) => { loserKey = v; }));
      content.appendChild(createPitcherResultSelect('セーブ投手', (v) => { saverKey = v; }));
    }
    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: '試合終了を確定',
      onClick: async () => {
        if (winnerKey && loserKey && winnerKey === loserKey) {
          showToast('勝利投手と敗戦投手を別の投手にしてください', 'error');
          return;
        }
        for (const s of pitcherStats) {
          await DB.updatePitcherStat(s.id, { winLoss: '' });
        }
        const applyResult = async (key, mark) => {
          if (!key || !pitcherMap[key]) return;
          for (const statId of pitcherMap[key].statIds) {
            await DB.updatePitcherStat(statId, { winLoss: mark });
          }
        };
        await applyResult(winnerKey, '勝');
        await applyResult(loserKey, '敗');
        await applyResult(saverKey, 'S');
        await DB.updateGame(currentGameId, { status: 'finished' });
        currentGame.status = 'finished';
        close();
        showToast('試合終了');
        await refreshAll();
      },
    }));
  });
}

function formatPresetNote(note) {
  try {
    const preset = JSON.parse(note || '{}');
    const outs = Number.isFinite(Number(preset.outs)) ? Number(preset.outs) : 0;
    const runners = preset.runners || {};
    const labels = [];
    if (runners.first) labels.push('1塁');
    if (runners.second) labels.push('2塁');
    if (runners.third) labels.push('3塁');
    return `${outs}アウト / ${labels.length ? labels.join(',') + ' 走者あり' : '走者なし'}`;
  } catch (e) {
    return '特殊開始設定';
  }
}

function showInningChangeModal() {
  createModal('イニング変更', (content, close) => {
    let ni = currentState.inning, ns = currentState.side;
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
      el('label', { className: 'input-label', textContent: 'イニング' }),
      el('input', { className: 'input-field', type: 'number', min: '1', max: '15', value: String(ni), onInput: (e) => { ni = parseInt(e.target.value) || 1; } }),
    ]));
    const sideTab = el('div', { className: 'tab-bar', style: { marginBottom: 'var(--space-xl)' } });
    const tBtn = el('button', { className: `tab-item ${ns === 'top' ? 'active' : ''}`, textContent: '表', onClick: () => { ns = 'top'; tBtn.classList.add('active'); bBtn.classList.remove('active'); } });
    const bBtn = el('button', { className: `tab-item ${ns === 'bottom' ? 'active' : ''}`, textContent: '裏', onClick: () => { ns = 'bottom'; bBtn.classList.add('active'); tBtn.classList.remove('active'); } });
    sideTab.appendChild(tBtn); sideTab.appendChild(bBtn);
    content.appendChild(el('div', { className: 'input-label', style: { marginBottom: 'var(--space-sm)' }, textContent: '表裏' }));
    content.appendChild(sideTab);
    content.appendChild(el('button', { className: 'btn btn-primary btn-block btn-lg', textContent: '変更する',
      onClick: async () => {
        await createInningChangeMarker(ni, ns);
        close();
        showToast(`${formatInning(ni, ns)}に変更`);
        await refreshAll();
      },
    }));
  });
}

function showPitcherStatsModal(options = {}) {
  createModal('投手成績', async (content, close) => {
    let targetInning = options.inning || currentState?.inning || 1;
    let targetSide = options.side || getOpponentAttackSide();
    const getPitcherTargetLabel = () => formatInning(targetInning, targetSide);
    const existingForTarget = await DB.getPitcherStats(currentGameId, targetInning, targetSide);
    const existingPrimary = existingForTarget[0] || null;
    let selectedPitcherId = existingPrimary?.pitcherId || null;
    let inningsPitched = existingPrimary?.inningsPitched || ((options.inning === currentState?.inning && options.side === currentState?.side)
      ? formatOutsAsInnings(currentState?.outs || 0)
      : '1.0');
    let pitches = Number(existingPrimary?.pitches) || 0;
    let runsAllowed = Number(existingPrimary?.runsAllowed) || 0;
    let earnedRuns = Number(existingPrimary?.earnedRuns) || 0;
    let hitsAllowed = Number(existingPrimary?.hitsAllowed) || 0;
    let homeRunsAllowed = Number(existingPrimary?.homeRunsAllowed) || 0;
    let strikeouts = Number(existingPrimary?.strikeouts) || 0;
    let walks = Number(existingPrimary?.walks) || 0;
    let hitByPitch = Number(existingPrimary?.hitByPitch) || 0;
    let balks = Number(existingPrimary?.balks) || 0;
    let wildPitches = Number(existingPrimary?.wildPitches) || 0;
    const lineupMembers = (currentGame.lineup || []).map((id) => currentMembers.find((m) => m.id === id)).filter(Boolean);
    const targetLabel = el('div', { className: 'text-secondary', style: { marginBottom: 'var(--space-sm)' }, textContent: `${getPitcherTargetLabel()}（相手攻撃）` });
    content.appendChild(targetLabel);
    content.appendChild(el('div', { className: 'input-group', style: { marginBottom: 'var(--space-sm)' } }, [
      el('label', { className: 'input-label', textContent: '対象イニング' }),
      el('input', {
        className: 'input-field',
        type: 'number',
        min: '1',
        max: '15',
        value: String(targetInning),
        onInput: (e) => {
          targetInning = Math.max(1, parseInt(e.target.value, 10) || 1);
          targetLabel.textContent = `${getPitcherTargetLabel()}（相手攻撃）`;
        },
      }),
    ]));
    const sideTabs = el('div', { className: 'tab-bar', style: { marginBottom: 'var(--space-base)' } });
    const topBtn = el('button', {
      className: `tab-item ${targetSide === 'top' ? 'active' : ''}`,
      textContent: '表',
      onClick: () => {
        targetSide = 'top';
        topBtn.classList.add('active');
        bottomBtn.classList.remove('active');
        targetLabel.textContent = `${getPitcherTargetLabel()}（相手攻撃）`;
      },
    });
    const bottomBtn = el('button', {
      className: `tab-item ${targetSide === 'bottom' ? 'active' : ''}`,
      textContent: '裏',
      onClick: () => {
        targetSide = 'bottom';
        bottomBtn.classList.add('active');
        topBtn.classList.remove('active');
        targetLabel.textContent = `${getPitcherTargetLabel()}（相手攻撃）`;
      },
    });
    sideTabs.appendChild(topBtn);
    sideTabs.appendChild(bottomBtn);
    content.appendChild(sideTabs);
    const pitcherSelect = el('select', { className: 'input-field', style: { marginBottom: 'var(--space-sm)' }, onChange: (e) => { selectedPitcherId = e.target.value ? Number(e.target.value) : null; } }, [
      el('option', { value: '', textContent: '投手を選択' }),
    ]);
    for (const m of lineupMembers) pitcherSelect.appendChild(el('option', { value: String(m.id), textContent: m.name }));
    if (selectedPitcherId) pitcherSelect.value = String(selectedPitcherId);
    content.appendChild(pitcherSelect);
    const fields = [
      { label: '投球回', type: 'selectInnings', v: inningsPitched, fn: (v) => { inningsPitched = v; } },
      { label: '投球数', type: 'number', v: pitches, fn: (v) => { pitches = v; } },
      { label: '失点', type: 'number', v: runsAllowed, fn: (v) => { runsAllowed = v; } },
      { label: '自責点', type: 'number', v: earnedRuns, fn: (v) => { earnedRuns = v; } },
      { label: '被安打', type: 'number', v: hitsAllowed, fn: (v) => { hitsAllowed = v; } },
      { label: '被本塁打', type: 'number', v: homeRunsAllowed, fn: (v) => { homeRunsAllowed = v; } },
      { label: '奪三振', type: 'number', v: strikeouts, fn: (v) => { strikeouts = v; } },
      { label: '与四球', type: 'number', v: walks, fn: (v) => { walks = v; } },
      { label: '与死球', type: 'number', v: hitByPitch, fn: (v) => { hitByPitch = v; } },
      { label: 'ボーク', type: 'number', v: balks, fn: (v) => { balks = v; } },
      { label: '暴投', type: 'number', v: wildPitches, fn: (v) => { wildPitches = v; } },
    ];
    for (const f of fields) {
      content.appendChild(el('div', { className: 'pitcher-stat-row' }, [
        el('span', { className: 'pitcher-stat-label', textContent: f.label }),
        f.type === 'selectInnings'
          ? createInningsPitchedSelect(String(f.v), (v) => f.fn(v))
          : el('input', { className: 'pitcher-stat-input', type: 'number', min: '0', value: String(f.v), onInput: (e) => f.fn(parseInt(e.target.value, 10) || 0) }),
      ]));
    }
    content.appendChild(el('button', { className: 'btn btn-primary btn-block btn-lg', style: { marginTop: 'var(--space-xl)' }, textContent: '保存',
      onClick: async () => {
        if (!selectedPitcherId) {
          showToast('投手を選択してください', 'error');
          return;
        }
        const pitcher = currentMembers.find((m) => m.id === selectedPitcherId);
        const samePitcher = existingForTarget.find((s) => Number(s.pitcherId) === Number(selectedPitcherId));
        if (samePitcher) {
          await DB.updatePitcherStat(samePitcher.id, {
            pitcherName: pitcher?.name || '',
            inningsPitched,
            pitches,
            runsAllowed,
            earnedRuns,
            hitsAllowed,
            homeRunsAllowed,
            strikeouts,
            walks,
            hitByPitch,
            balks,
            wildPitches,
            note: '',
          });
        } else {
          const appearanceOrder = await DB.getNextPitcherAppearanceOrder(currentGameId);
          await DB.addPitcherStats(currentGameId, {
            pitcherId: selectedPitcherId,
            pitcherName: pitcher?.name || '',
            appearanceOrder,
            inningsPitched,
            pitches,
            runsAllowed,
            earnedRuns,
            hitsAllowed,
            homeRunsAllowed,
            strikeouts,
            walks,
            hitByPitch,
            balks,
            wildPitches,
            note: '',
          }, targetInning, targetSide);
        }
        await syncOpponentScoreFromPitcherStats(targetInning, targetSide);
        const summary = `${formatInning(targetInning, targetSide)} ${pitcher?.name || '投手未選択'} 失点:${runsAllowed} 自責:${earnedRuns} 投球回:${formatInningsPitchedLabel(inningsPitched)} 球数:${pitches}`;
        if (options.playEventId) {
          await DB.updatePlay(options.playEventId, {
            inning: targetInning,
            side: targetSide,
            note: summary,
          });
        } else {
          await DB.addPlay({
            gameId: currentGameId,
            inning: targetInning,
            side: targetSide,
            relatedAtBatId: null,
            action: 'pitcherStats',
            runner: '',
            runnerId: null,
            resultStatus: 'success',
            outPosition: null,
            note: summary,
            order: await DB.getNextOrder(currentGameId),
          });
        }
        close();
        showToast('投手成績を保存しました');
        await refreshAll();
      },
    }));
  });
}

async function syncOpponentScoreFromPitcherStats(inning, side) {
  const stats = await DB.getPitcherStats(currentGameId, inning, side);
  const totalRunsAllowed = stats.reduce((sum, row) => sum + (Number(row.runsAllowed) || 0), 0);
  await DB.setOpponentScore(currentGameId, inning, side, totalRunsAllowed);
}

function createInningsPitchedSelect(currentValue, onChange) {
  const select = el('select', { className: 'pitcher-stat-input', onChange: (e) => onChange(e.target.value) });
  for (const value of ['0.1', '0.2', '1.0']) {
    select.appendChild(el('option', { value, textContent: formatInningsPitchedLabel(value) }));
  }
  if ([...select.options].some((opt) => opt.value === currentValue)) select.value = currentValue;
  else select.value = '0.1';
  return select;
}

function formatOutsAsInnings(outs) {
  const safeOuts = Math.max(0, parseInt(outs, 10) || 0);
  const whole = Math.floor(safeOuts / 3);
  const rem = safeOuts % 3;
  return `${whole}.${rem}`;
}

function formatInningsPitchedLabel(value) {
  const text = String(value || '0.0');
  const [wholeText, remText = '0'] = text.split('.');
  const whole = parseInt(wholeText, 10) || 0;
  const rem = Math.max(0, Math.min(2, parseInt(remText, 10) || 0));
  if (rem === 0) return `${whole}`;
  if (rem === 1) return `${whole} 1/3`;
  return `${whole} 2/3`;
}

function parseInningsLabelToOuts(value) {
  const text = String(value || '0.0');
  const [wholeText, remText = '0'] = text.split('.');
  const whole = Math.max(0, parseInt(wholeText, 10) || 0);
  const rem = Math.max(0, Math.min(2, parseInt(remText, 10) || 0));
  return whole * 3 + rem;
}

function formatOutsToInningsLabel(outs) {
  const safeOuts = Math.max(0, parseInt(outs, 10) || 0);
  const whole = Math.floor(safeOuts / 3);
  const rem = safeOuts % 3;
  if (rem === 0) return `${whole}`;
  if (rem === 1) return `${whole} 1/3`;
  return `${whole} 2/3`;
}

// ════════════ GAME HELPERS ════════════

/** 打者の今日の成績を集計（打数・安打） */
function getBatterTodayStats(batterId, events) {
  let ab = 0, h = 0;
  for (const e of events) {
    if (e.type !== 'atBat' || e.batterId !== batterId) continue;
    if (isAtBatCounted(e.result)) ab++;
    if (isHitResult(e.result)) h++;
  }
  return { ab, h };
}

/** 打数にカウントされる結果か */
function isAtBatCounted(result) {
  return !['walk', 'hitByPitch', 'sacrifice', 'sacrificeFly'].includes(result);
}

/** 取消対象となる最後のユーザーイベントを取得（システムイベントを考慮） */
function getLastUserEvent(events) {
  if (!events || events.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!isSystemEvent(e)) return e;
  }
  return null;
}

/** 最後のイベントの取消ラベルを生成 */
function getUndoLabel(event) {
  if (!event) return '';
  if (event.type === 'atBat') {
    const member = currentMembers.find(m => m.id === event.batterId);
    return `${member?.name || '不明'} ${getResultLabel(event.result)}`;
  }
  const action = PLAY_ACTIONS.find(a => a.id === event.action);
  return action?.label || event.action;
}

/** 取消モーダル */
function showUndoModal(lastEvent) {
  const label = getUndoLabel(lastEvent);
  showConfirmModal(`「${label}」を取り消しますか？`, async () => {
    if (lastEvent.type === 'atBat') {
      const relatedPlays = currentEvents.filter(e => e.type === 'play' && e.relatedAtBatId === lastEvent.id);
      for (const p of relatedPlays) await DB.deletePlay(p.id);
      await DB.deleteAtBat(lastEvent.id);
    } else {
      await DB.deletePlay(lastEvent.id);
    }
    batterIndexOverride = null;
    showToast('取り消しました');
    await refreshAll();
  }, '取り消す');
}

/** 記録ボタンの有効/無効を切り替え */
function setResultButtonsDisabled(disabled) {
  const panel = document.getElementById('input-panel');
  if (!panel) return;
  panel.querySelectorAll('.btn-result, .play-add-btn').forEach(btn => {
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.5' : '';
  });
}

/** データエクスポート */
async function exportData() {
  try {
    const data = await DB.exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scorebook_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('エクスポートしました', 'success');
  } catch (e) {
    showToast('エクスポートに失敗しました', 'error');
  }
}

export { refreshAll };
