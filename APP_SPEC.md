# 草野球スコアブック 実装仕様メモ

最終更新: 2026-04-28

## 1. データ保存は localStorage?

いいえ。現在は **IndexedDB** に保存しています。  
`localStorage` は使っていません。

- 実装ファイル: `js/db.js`
- ライブラリ: `Dexie` (`lib/dexie.min.js`)
- DB名: `BaseballScorebook`

### 保存テーブル

- `teams` チーム
- `members` メンバー
- `games` 試合
- `atBats` 打席イベント
- `plays` プレーイベント
- `pitcherStats` 投手成績（回/表裏単位）
- `opponentScores` 相手得点

## 2. アプリ全体構成

### ルーティング / 起動

- `index.html`
  - エントリポイント
  - `js/app.js` を読み込み
- `js/app.js`
  - DB初期化 (`initDB`)
  - 画面ルーティング (`home / team / gameSetup / game / history`)
  - hashベースの戻る対応

### PWA / オフライン

- `manifest.json`
  - PWA定義
- `sw.js`
  - Service Worker
  - 静的アセットをキャッシュし、オフライン時に利用

### 画面

- `js/views/home.js`
  - TOP画面（開始/チーム管理/履歴）
  - 進行中試合カード表示
- `js/views/team.js`
  - チーム作成・編集、メンバー管理
- `js/views/gameSetup.js`
  - 試合作成（相手名、日付、イニング、先攻後攻、打順）
- `js/views/game.js`
  - 試合中の記録画面（ステータス、タイムライン、入力）
- `js/views/history.js`
  - 試合履歴一覧

### 状態計算

- `js/models/state.js`
  - イベントログを入力に、現在状態を再計算
  - アウト/ランナー/得点/イニング/打順インデックスを算出

### 定数/共通

- `js/utils/constants.js`
  - 打席結果、プレー種別、塁、打球方向候補など
- `js/utils/helpers.js`
  - DOM生成、toast、フォーマットなど

## 3. データモデル（要点）

### atBat（打席イベント）

主な項目:

- `gameId`, `inning`, `side`, `order`
- `batterId`, `result`
- `rbiProduced`
- `note`
- `fieldDirection`（打球位置）
- `specialFlags`（例: 振り逃げ成功）
- `mode`（現在は詳細固定）

### play（プレーイベント）

主な項目:

- `gameId`, `inning`, `side`, `order`
- `relatedAtBatId`
- `action`（盗塁/進塁/アウト/得点/ランナー修正/投手成績など）
- `runner`, `runnerId`
- `resultStatus`
- `note`

## 4. 処理フロー

## 4.1 試合画面表示

1. `renderGame()` が試合情報・メンバーを取得
2. `refreshAll()` でイベント一覧を取得
3. `computeGameState()` で現状態を再計算
4. ステータスバー・ログ・入力パネルを再描画

## 4.2 打席記録

1. 打席結果ボタン押下
2. 必要に応じてモーダル入力
   - 三振詳細（振り逃げ）
   - 打球方向（ヒット/アウト）
   - 打点確認
3. `atBats` に保存
4. 必要なら同打席内ランナー結果を `plays` として追加
5. `postAtBatCheck()` で3アウト判定し、必要ならチェンジ処理へ

## 4.3 プレー記録

1. `＋プレー` からアクション選択
2. 対象ランナー/進塁数/備考を入力
3. `plays` に保存
4. `refreshAll()` で再計算・再描画

## 4.4 3アウト時

1. `state.halfInningEnded` が `true`
2. 3アウトモーダルで投手成績入力
3. `pitcherStats` 保存
4. タイムライン用 `play(action: "pitcherStats")` 追加
5. イニング変更マーカー（システムイベント）追加
6. 再計算して次半イニングへ

## 5. 現在の主要仕様

- 記録モードは実質 **詳細固定**
- ランナー操作:
  - 進塁 / 2つ進塁
  - 生還
  - アウト
  - ランナー修正（塁上ランナーの強制置換）
- 打席内ランナー結果入力:
  - アウト系打席や打点発生時に入力可能
- 打球位置:
  - ヒット時・アウト時ともに「守備位置＋方向詳細」入力可
- 投手成績:
  - 被得点 / 三振 / 自責点 / 被本塁打 / メモ
  - タイムラインに記録を残す
- スコア表示:
  - 上部固定スコアおよびスコアボードは `0` 明示表示

## 6. 補足（運用）

- DBスキーマは `db.version(2)` まで定義
- 旧データ互換を考慮した読み取りを一部実装（投手成績）
- Service Worker更新時、古いキャッシュが残る場合は再読み込みが必要になることがあります
