/**
 * 試合履歴画面
 */
import { el, formatDate, showToast } from '../utils/helpers.js';
import * as DB from '../db.js';
import { computeGameState } from '../models/state.js';

export async function renderHistory(container, navigate, params = {}) {
  container.innerHTML = '';
  
  const teams = await DB.getTeams();
  const teamId = params.teamId || (teams.length > 0 ? teams[0].id : null);
  
  if (!teamId) {
    navigate('home');
    return;
  }

  const team = await DB.getTeam(teamId);
  const games = await DB.getGames(teamId);

  const page = el('div', { className: 'page-history' }, [
    el('div', { className: 'header-bar' }, [
      el('button', { className: 'header-bar-action', textContent: '←', onClick: () => navigate('home') }),
      el('h1', { className: 'header-bar-title', textContent: '試合履歴' }),
      el('div', { className: 'header-bar-action' }),
    ]),
    el('div', { className: 'page-body', id: 'history-body' }),
  ]);

  container.appendChild(page);
  
  const body = document.getElementById('history-body');

  if (games.length === 0) {
    body.appendChild(el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state-icon', textContent: '📊' }),
      el('div', { className: 'empty-state-title', textContent: '試合記録がありません' }),
      el('div', { className: 'empty-state-text', textContent: '新しい試合を始めてみましょう' }),
    ]));
    return;
  }

  const list = el('div', { className: 'game-history-list' });
  
  for (const game of games) {
    const members = await DB.getMembers(teamId);
    const events = await DB.getAllEvents(game.id);
    const opponentScores = await DB.getOpponentScores(game.id);
    const state = computeGameState(events, game, members, opponentScores);
    
    const isActive = game.status === 'active';
    
    const card = el('div', { className: 'game-history-card' }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', { className: 'game-history-date', textContent: formatDate(game.date || game.createdAt) }),
        el('span', { 
          className: `badge ${isActive ? 'badge-primary' : 'badge-out'}`,
          textContent: isActive ? '進行中' : '終了',
        }),
      ]),
      
      el('div', { className: 'game-history-teams' }, [
        el('span', { className: 'game-history-team', textContent: team.name }),
        el('span', { className: 'game-history-score', textContent: ` ${state.score.team} ` }),
        el('span', { className: 'game-history-vs', textContent: '-' }),
        el('span', { className: 'game-history-score', textContent: ` ${state.score.opponent} ` }),
        el('span', { className: 'game-history-team', textContent: game.opponentName || '相手' }),
      ]),
      
      el('div', { style: { display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' } }, [
        el('button', {
          className: 'btn btn-secondary btn-sm',
          style: { flex: 1 },
          textContent: isActive ? '再開する' : '詳細を見る',
          onClick: () => navigate('game', { gameId: game.id }),
        }),
        el('button', {
          className: 'btn btn-ghost btn-sm',
          textContent: '🗑',
          onClick: async () => {
            if (confirm('この試合記録を削除しますか？')) {
              await DB.deleteGame(game.id);
              showToast('試合を削除しました');
              renderHistory(container, navigate, params);
            }
          },
        }),
      ]),
    ]);
    
    list.appendChild(card);
  }

  body.appendChild(list);
}
