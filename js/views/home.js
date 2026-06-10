/**
 * ホーム画面
 */
import { el } from '../utils/helpers.js';
import * as DB from '../db.js';

let latestRenderToken = 0;

export async function renderHome(container, navigate) {
  const renderToken = ++latestRenderToken;
  const teams = await DB.getTeams();
  if (renderToken !== latestRenderToken) return;
  
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
  ]);

  // 最近の試合を表示
  if (teams.length > 0) {
    const recentSection = el('div', { className: 'home-recent' });
    const sectionTitle = el('div', { className: 'home-section-title' }, [
      el('span', { textContent: '📋' }),
      el('span', { textContent: '進行中の試合' }),
    ]);
    recentSection.appendChild(sectionTitle);

    let hasActive = false;
    for (const team of teams) {
      const games = await DB.getGames(team.id);
      if (renderToken !== latestRenderToken) return;
      const activeGames = games.filter(g => g.status === 'active');
      
      for (const game of activeGames) {
        hasActive = true;
        const card = el('div', { 
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
        ]);
        recentSection.appendChild(card);
      }
    }

    if (hasActive) {
      page.appendChild(recentSection);
    }
  }

  container.appendChild(page);
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
