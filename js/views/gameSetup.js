/**
 * 試合セットアップ画面
 */
import { el, showToast, moveArrayItem } from '../utils/helpers.js';
import { POSITIONS, DEFAULT_INNINGS } from '../utils/constants.js';
import * as DB from '../db.js';

export async function renderGameSetup(container, navigate, params = {}) {
  container.innerHTML = '';
  
  const teamId = params.teamId;
  if (!teamId) {
    navigate('home');
    return;
  }

  const team = await DB.getTeam(teamId);
  const members = await DB.getMembers(teamId);

  let opponentName = '';
  let innings = DEFAULT_INNINGS;
  let gameDate = new Date().toISOString().split('T')[0];
  let lineup = []; // Array of member IDs in batting order
  let lineupPositions = {}; // { memberId: 'P' ... }
  let isHome = true; // 自チームがホーム（後攻）

  const page = el('div', { className: 'page-game-setup' }, [
    // Header
    el('div', { className: 'header-bar' }, [
      el('button', { className: 'header-bar-action', textContent: '←', onClick: () => navigate('home') }),
      el('h1', { className: 'header-bar-title', textContent: '試合設定' }),
      el('div', { className: 'header-bar-action' }),
    ]),
    
    el('div', { className: 'page-body', id: 'setup-body' }),
    
    // Footer
    el('div', { className: 'setup-footer' }, [
      el('button', {
        className: 'btn btn-primary btn-block btn-lg',
        id: 'start-game-btn',
        textContent: '試合開始 ⚾',
        onClick: async () => {
          if (!opponentName.trim()) {
            showToast('相手チーム名を入力してください', 'error');
            return;
          }
          if (lineup.length === 0) {
            showToast('打順に選手を追加してください', 'error');
            return;
          }
          if (lineup.some((id) => !lineupPositions[id])) {
            showToast('全選手の守備位置を設定してください', 'error');
            return;
          }
          
          const gameId = await DB.addGame({
            teamId,
            opponentName: opponentName.trim(),
            date: gameDate,
            innings,
            lineup,
            lineupPositions,
            isHome,
            status: 'active',
          });
          
          showToast('試合を開始します！');
          navigate('game', { gameId });
        },
      }),
    ]),
  ]);

  container.appendChild(page);
  
  const body = document.getElementById('setup-body');
  
  function renderBody() {
    body.innerHTML = '';
    
    // 試合情報
    body.appendChild(el('div', { className: 'setup-section' }, [
      el('div', { className: 'setup-section-title' }, [
        el('span', { textContent: '📋' }),
        el('span', { textContent: '試合情報' }),
      ]),
      
      el('div', { className: 'input-group', style: { marginBottom: 'var(--space-md)' } }, [
        el('label', { className: 'input-label', textContent: '相手チーム名' }),
        el('input', {
          className: 'input-field',
          type: 'text',
          placeholder: '相手チーム名',
          value: opponentName,
          onInput: (e) => { opponentName = e.target.value; },
        }),
      ]),
      
      el('div', { style: { display: 'flex', gap: 'var(--space-md)' } }, [
        el('div', { className: 'input-group', style: { flex: 1 } }, [
          el('label', { className: 'input-label', textContent: '日付' }),
          el('input', {
            className: 'input-field',
            type: 'date',
            value: gameDate,
            onInput: (e) => { gameDate = e.target.value; },
          }),
        ]),
        el('div', { className: 'input-group', style: { flex: 1 } }, [
          el('label', { className: 'input-label', textContent: 'イニング数' }),
          el('input', {
            className: 'input-field',
            type: 'number',
            min: '1',
            max: '15',
            value: String(innings),
            onInput: (e) => { innings = parseInt(e.target.value) || DEFAULT_INNINGS; },
          }),
        ]),
      ]),

      // 先攻/後攻 切替
      el('div', { style: { marginTop: 'var(--space-md)' } }, [
        el('label', { className: 'input-label', textContent: '攻守' }),
        el('div', { className: 'tab-bar', style: { marginTop: 'var(--space-xs)' } }, [
          el('button', { 
            className: `tab-item ${!isHome ? 'active' : ''}`,
            textContent: '先攻（ビジター）',
            onClick: () => { isHome = false; renderBody(); },
          }),
          el('button', { 
            className: `tab-item ${isHome ? 'active' : ''}`,
            textContent: '後攻（ホーム）',
            onClick: () => { isHome = true; renderBody(); },
          }),
        ]),
      ]),
    ]));
    
    // 打順設定
    const lineupSection = el('div', { className: 'setup-section' }, [
      el('div', { className: 'setup-section-title' }, [
        el('span', { textContent: '📝' }),
        el('span', { textContent: `打順 (${lineup.length}人)` }),
      ]),
    ]);

    // 打順リスト
    const lineupList = el('div', { className: 'lineup-list' });
    lineup.forEach((memberId, index) => {
      const member = members.find(m => m.id === memberId);
      if (!member) return;
      
      const posLabel = POSITIONS.find(p => p.id === (lineupPositions[memberId] || ''))?.short || '';
      
      const item = el('div', { 
        className: 'lineup-item',
        draggable: 'true',
        'data-index': String(index),
      }, [
        el('div', { className: 'drag-handle' }, [
          el('span'), el('span'), el('span'),
        ]),
        el('div', { className: 'lineup-order', textContent: String(index + 1) }),
        el('div', { className: 'lineup-player-name', textContent: member.name }),
        createLineupPositionSelect(lineupPositions[memberId] || '', (val) => { lineupPositions[memberId] = val; }),
        el('button', { 
          className: 'lineup-remove',
          textContent: '✕',
          onClick: () => {
            delete lineupPositions[memberId];
            lineup.splice(index, 1);
            renderBody();
          },
        }),
      ]);

      // Drag events
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(index));
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = index;
        lineup = moveArrayItem(lineup, fromIndex, toIndex);
        renderBody();
      });

      // Touch drag support
      let touchStartY = 0;
      item.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      lineupList.appendChild(item);
    });
    
    lineupSection.appendChild(lineupList);

    // 未選択メンバー
    const availableMembers = members.filter(m => !lineup.includes(m.id));
    if (availableMembers.length > 0) {
      const availableSection = el('div', { style: { marginTop: 'var(--space-md)' } }, [
        el('div', { className: 'input-label', textContent: 'タップして打順に追加' }),
        el('div', { className: 'available-players' }, 
          availableMembers.map(m => 
            el('button', {
              className: 'available-player-chip',
              textContent: `${m.number ? '#' + m.number + ' ' : ''}${m.name}`,
              onClick: () => {
                lineup.push(m.id);
                lineupPositions[m.id] = lineupPositions[m.id] || '';
                renderBody();
              },
            })
          )
        ),
      ]);
      lineupSection.appendChild(availableSection);
    }

    body.appendChild(lineupSection);
  }

  renderBody();
}

function createLineupPositionSelect(currentValue, onChange) {
  const select = el('select', { className: 'lineup-position', onChange: (e) => onChange(e.target.value) });
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '守備位置を選択';
  if (!currentValue) placeholder.selected = true;
  select.appendChild(placeholder);
  for (const pos of POSITIONS) {
    const option = document.createElement('option');
    option.value = pos.id;
    option.textContent = `${pos.label} (${pos.short})`;
    if (currentValue === pos.id) option.selected = true;
    select.appendChild(option);
  }
  return select;
}
