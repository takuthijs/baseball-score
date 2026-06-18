/**
 * ホーム画面
 */
import { el, showToast, createModal, showConfirmModal } from '../utils/helpers.js';
import * as DB from '../db.js';

let latestRenderToken = 0;

export async function renderHome(container, navigate) {
  const renderToken = ++latestRenderToken;
  const [teams, activeGames] = await Promise.all([DB.getTeams(), DB.getActiveGames()]);
  if (renderToken !== latestRenderToken) return;

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));

  container.innerHTML = '';

  const page = el('div', { className: 'page-home' }, [
    // Hero
    el('div', { className: 'home-hero' }, [
      el('div', { className: 'home-logo', textContent: '⚾' }),
      el('h1', { className: 'home-title', textContent: 'ScoreBook' }),
      el('p', { className: 'home-subtitle', textContent: '草野球スコア管理' }),
    ]),

    // Actions
    el('div', { className: 'home-actions', id: 'home-actions' }, [
      createActionCard('⚾', 'primary', '試合を始める', '新しい試合を記録する', () => {
        if (teams.length === 0) {
          navigate('team', { autoCreate: true });
        } else {
          navigate('gameSetup', { teamId: teams[0].id });
        }
      }),
      createActionCard('👥', 'accent', 'チーム管理', 'メンバーの登録・編集', () => {
        navigate('team');
      }),
      createActionCard('📊', 'hit', '試合履歴', '過去の試合記録を見る', () => {
        if (teams.length > 0) {
          navigate('history', { teamId: teams[0].id });
        } else {
          navigate('team', { autoCreate: true });
        }
      }),
    ]),

    // データ管理（小さめのリンク）
    el('div', { style: { textAlign: 'center', marginTop: 'var(--space-xl)' } }, [
      el('button', {
        style: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' },
        textContent: '💾 データ管理（バックアップ/復元）',
        onClick: () => showDataManagementModal(),
      }),
    ]),
  ]);

  // 進行中の試合を表示
  if (activeGames.length > 0) {
    const recentSection = el('div', { className: 'home-recent' });
    recentSection.appendChild(el('div', { className: 'home-section-title' }, [
      el('span', { textContent: '📋' }),
      el('span', { textContent: '進行中の試合' }),
    ]));
    for (const game of activeGames) {
      if (renderToken !== latestRenderToken) return;
      const team = teamMap[game.teamId];
      if (!team) continue;
      recentSection.appendChild(el('div', {
        className: 'game-history-card',
        onClick: () => navigate('game', { gameId: game.id }),
      }, [
        el('div', { className: 'game-history-date', textContent: new Date(game.createdAt).toLocaleDateString('ja-JP') }),
        el('div', { className: 'game-history-teams' }, [
          el('span', { className: 'game-history-team', textContent: team.name }),
          el('span', { className: 'game-history-vs', textContent: ' vs ' }),
          el('span', { className: 'game-history-team', textContent: game.opponentName || '相手チーム' }),
        ]),
        el('div', { className: 'badge badge-primary', textContent: '進行中' }),
      ]));
    }
    page.appendChild(recentSection);
  }

  container.appendChild(page);
}

function showDataManagementModal() {
  createModal('データ管理', (content, close) => {
    content.appendChild(el('div', { className: 'text-secondary', style: { marginBottom: 'var(--space-lg)', fontSize: 'var(--font-size-sm)' }, textContent: 'データはすべてこのデバイスのIndexedDBに保存されています。機種変更前にバックアップしてください。' }));

    content.appendChild(el('button', {
      className: 'btn btn-primary btn-block',
      style: { marginBottom: 'var(--space-md)' },
      textContent: '📤 バックアップをダウンロード',
      onClick: async () => {
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
          showToast('バックアップを保存しました', 'success');
        } catch (e) {
          showToast('エクスポートに失敗しました', 'error');
        }
      },
    }));

    content.appendChild(el('button', {
      className: 'btn btn-secondary btn-block',
      style: { marginBottom: 'var(--space-lg)' },
      textContent: '📥 バックアップから復元',
      onClick: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          showConfirmModal('現在のデータをすべて上書きします。よろしいですか？', async () => {
            try {
              const text = await file.text();
              const data = JSON.parse(text);
              await DB.importAllData(data);
              showToast('復元しました。再読み込みします…', 'success');
              setTimeout(() => location.reload(), 1200);
            } catch (err) {
              showToast(`復元に失敗しました: ${err.message}`, 'error');
            }
          }, '復元する');
        };
        input.click();
      },
    }));
  });
}

function createActionCard(icon, colorClass, label, desc, onClick) {
  return el('button', { className: 'home-action-card', onClick }, [
    el('div', { className: `home-action-icon ${colorClass}`, textContent: icon }),
    el('div', { className: 'home-action-content' }, [
      el('div', { className: 'home-action-label', textContent: label }),
      el('div', { className: 'home-action-desc', textContent: desc }),
    ]),
  ]);
}
