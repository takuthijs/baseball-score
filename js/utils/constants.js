/**
 * 定数定義
 */
export const POSITIONS = [
  { id: 'P',  label: '投手', short: 'P' },
  { id: 'C',  label: '捕手', short: 'C' },
  { id: '1B', label: '一塁手', short: '1B' },
  { id: '2B', label: '二塁手', short: '2B' },
  { id: '3B', label: '三塁手', short: '3B' },
  { id: 'SS', label: '遊撃手', short: 'SS' },
  { id: 'LF', label: '左翼手', short: 'LF' },
  { id: 'CF', label: '中堅手', short: 'CF' },
  { id: 'RF', label: '右翼手', short: 'RF' },
  { id: 'DH', label: '指名打者', short: 'DH' },
];

export const AT_BAT_RESULTS = [
  { id: 'single',         label: '単打',       short: '単打',       category: 'hit',  emoji: '🔵' },
  { id: 'double',         label: '二塁打',     short: '二塁打',     category: 'hit',  emoji: '🔵' },
  { id: 'triple',         label: '三塁打',     short: '三塁打',     category: 'hit',  emoji: '🔵' },
  { id: 'homerun',        label: '本塁打',     short: '本塁打',     category: 'homerun', emoji: '💥' },
  { id: 'strikeout',      label: '三振',       short: '三振',       category: 'out',  emoji: '❌' },
  { id: 'groundout',      label: 'ゴロアウト', short: 'ゴロアウト', category: 'out',  emoji: '❌' },
  { id: 'flyout',         label: 'フライアウト', short: 'フライアウト', category: 'out', emoji: '❌' },
  { id: 'lineout',        label: 'ライナー',    short: 'ライナー',    category: 'out',  emoji: '❌' },
  { id: 'walk',           label: '四球',       short: '四球',       category: 'walk', emoji: '🟢' },
  { id: 'hitByPitch',     label: '死球',       short: '死球',       category: 'walk', emoji: '🟢' },
  { id: 'error',          label: 'エラー',     short: 'エラー',     category: 'error', emoji: '⚠️' },
  { id: 'fieldersChoice', label: '野選',       short: '野選',       category: 'out',  emoji: '🔶' },
  { id: 'sacrifice',      label: '犠打',       short: '犠打',       category: 'out',  emoji: '🔶' },
  { id: 'sacrificeFly',   label: '犠牲フライ', short: '犠牲フライ', category: 'out', emoji: '🔶' },
  { id: 'doublePlay',     label: '併殺打',     short: '併殺打',     category: 'out',  emoji: '❌' },
];

export const PLAY_ACTIONS = [
  { id: 'steal',     label: '盗塁',   emoji: '🏃' },
  { id: 'advance',   label: '進塁',   emoji: '➡️' },
  { id: 'advanceTwo', label: '2つ進塁', emoji: '⏭️' },
  { id: 'out',       label: 'アウト', emoji: '🚫' },
  { id: 'setRunner', label: 'ランナー修正', emoji: '🧩' },
  { id: 'setInningState', label: '特殊開始設定', emoji: '🧭' },
  { id: 'error',     label: 'エラー', emoji: '⚠️' },
  { id: 'wildPitch', label: '暴投',   emoji: '💨' },
  { id: 'passedBall', label: '捕逸',  emoji: '💨' },
  { id: 'balk',      label: 'ボーク', emoji: '🚩' },
  { id: 'score',     label: '得点',   emoji: '🏠' },
  { id: 'pitcherStats', label: '投手成績', emoji: '📊' },
  { id: 'playerChange', label: '選手交代', emoji: '🔁' },
  { id: 'other',     label: 'その他', emoji: '📝' },
];

export const BASES = [
  { id: '1B', label: '一塁' },
  { id: '2B', label: '二塁' },
  { id: '3B', label: '三塁' },
  { id: 'home', label: '本塁' },
];

export const BATTED_BALL_POSITIONS = [
  { id: 'P', label: '投' },
  { id: 'C', label: '捕' },
  { id: '1B', label: '一' },
  { id: '2B', label: '二' },
  { id: '3B', label: '三' },
  { id: 'SS', label: '遊' },
  { id: 'LF', label: '左' },
  { id: 'CF', label: '中' },
  { id: 'RF', label: '右' },
];

export const BATTED_BALL_ZONES = [
  { id: 'pitcher-front', label: '投手前' },
  { id: 'between-1b-2b', label: '一二塁間' },
  { id: 'between-2b-ss', label: '二遊間' },
  { id: 'between-ss-3b', label: '三遊間' },
  { id: 'left-line', label: 'レフト線' },
  { id: 'left-center', label: '左中間' },
  { id: 'center', label: 'センター方向' },
  { id: 'right-center', label: '右中間' },
  { id: 'right-line', label: 'ライト線' },
  { id: 'foul', label: 'ファウルゾーン' },
];

export const RESULT_CATEGORIES = {
  hit: { color: 'var(--color-hit)', label: 'ヒット' },
  homerun: { color: 'var(--color-homerun)', label: '本塁打' },
  out: { color: 'var(--color-out)', label: 'アウト' },
  walk: { color: 'var(--color-walk)', label: '四死球' },
  error: { color: 'var(--color-error)', label: 'エラー' },
};

/** 結果がヒット（出塁）か判定 */
export function isHitResult(result) {
  return ['single', 'double', 'triple', 'homerun'].includes(result);
}

/** 結果がアウトか判定 */
export function isOutResult(result) {
  return ['strikeout', 'groundout', 'flyout', 'lineout', 'fieldersChoice', 'sacrifice', 'sacrificeFly', 'doublePlay'].includes(result);
}

/** 結果が出塁か判定（四死球・エラー含む） */
export function isOnBaseResult(result) {
  return ['single', 'double', 'triple', 'homerun', 'walk', 'hitByPitch', 'error'].includes(result);
}

/** 結果からカテゴリCSSクラスを取得 */
export function getResultClass(result) {
  const found = AT_BAT_RESULTS.find(r => r.id === result);
  if (!found) return '';
  if (found.category === 'homerun') return 'homerun';
  return found.category;
}

/** 結果から短縮ラベルを取得 */
export function getResultLabel(result) {
  const found = AT_BAT_RESULTS.find(r => r.id === result);
  return found ? found.label : result;
}

export function getResultShort(result) {
  const found = AT_BAT_RESULTS.find(r => r.id === result);
  return found ? found.short : result;
}

export function isBattedOutResult(result) {
  return ['groundout', 'flyout', 'lineout'].includes(result);
}

export const DEFAULT_INNINGS = 7;
