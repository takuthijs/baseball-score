/**
 * チーム管理画面
 */
import { el, showToast } from '../utils/helpers.js';
import * as DB from '../db.js';
import { computeGameState } from '../models/state.js';

let currentTeamId = null;

export async function renderTeam(container, navigate, params = {}) {
  container.innerHTML = '';
  
  const teams = await DB.getTeams();

  // チームがない場合は作成を促す
  if (teams.length === 0 || params.autoCreate) {
    renderTeamCreate(container, navigate);
    return;
  }

  currentTeamId = params.teamId || teams[0].id;
  const team = await DB.getTeam(currentTeamId);
  const members = await DB.getMembers(currentTeamId);

  const page = el('div', { className: 'page-team' }, [
    // Header
    el('div', { className: 'header-bar' }, [
      el('button', { className: 'header-bar-action', textContent: '←', onClick: () => navigate('home') }),
      el('h1', { className: 'header-bar-title', textContent: team.name }),
      el('button', { className: 'header-bar-action', textContent: '⚙', onClick: () => showTeamEditModal(container, navigate, team) }),
    ]),
    
    // Body
    el('div', { className: 'page-body' }, [
      // Members Section
      el('div', { className: 'setup-section' }, [
        el('div', { className: 'setup-section-title' }, [
          el('span', { textContent: '👥' }),
          el('span', { textContent: `メンバー (${members.length}人)` }),
        ]),
        
        // Member List
        ...members.map(m => createMemberItem(m, container, navigate)),
        
        // Add Member Button
        el('button', { 
          className: 'btn btn-secondary btn-block', 
          style: { marginTop: 'var(--space-md)' },
          onClick: () => showMemberModal(container, navigate, null),
        }, [
          el('span', { textContent: '＋ メンバーを追加' }),
        ]),
        el('button', {
          className: 'btn btn-primary btn-block',
          style: { marginTop: 'var(--space-sm)' },
          textContent: '📊 通算成績を共有',
          onClick: () => showTeamSummaryModal(team, members),
        }),
      ]),
    ]),
  ]);

  container.appendChild(page);
}

function createMemberItem(member, container, navigate) {
  const posLabel = formatMemberCategoryLabel(member);
  
  return el('div', { className: 'member-item' }, [
    el('div', { className: 'member-number', textContent: member.number || '-' }),
    el('div', { className: 'member-info' }, [
      el('div', { className: 'member-name', textContent: member.name }),
      el('div', { className: 'member-position', textContent: posLabel }),
    ]),
    el('div', { className: 'member-actions' }, [
      el('button', { 
        className: 'btn btn-ghost btn-sm', 
        textContent: '✏️',
        onClick: () => showMemberModal(container, navigate, member),
      }),
      el('button', { 
        className: 'btn btn-ghost btn-sm', 
        textContent: '🗑',
        onClick: async () => {
          if (confirm(`${member.name} を削除しますか？`)) {
            await DB.deleteMember(member.id);
            showToast('メンバーを削除しました');
            renderTeam(container, navigate, { teamId: currentTeamId });
          }
        },
      }),
    ]),
  ]);
}

function renderTeamCreate(container, navigate) {
  container.innerHTML = '';
  
  let teamName = '';
  
  const page = el('div', { className: 'page-team' }, [
    el('div', { className: 'header-bar' }, [
      el('button', { className: 'header-bar-action', textContent: '←', onClick: () => navigate('home') }),
      el('h1', { className: 'header-bar-title', textContent: 'チーム作成' }),
      el('div', { className: 'header-bar-action' }),
    ]),
    
    el('div', { className: 'page-body' }, [
      el('div', { style: { padding: 'var(--space-2xl) 0', textAlign: 'center' } }, [
        el('div', { style: { fontSize: '3rem', marginBottom: 'var(--space-lg)' }, textContent: '⚾' }),
        el('h2', { style: { fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-2xl)' }, textContent: 'チームを作りましょう' }),
      ]),
      
      el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
        el('label', { className: 'input-label', textContent: 'チーム名' }),
        el('input', { 
          className: 'input-field', 
          type: 'text', 
          placeholder: 'チーム名を入力',
          id: 'team-name-input',
          onInput: (e) => { teamName = e.target.value; },
        }),
      ]),
      
      el('button', {
        className: 'btn btn-primary btn-block btn-lg',
        textContent: 'チームを作成',
        onClick: async () => {
          if (!teamName.trim()) {
            showToast('チーム名を入力してください', 'error');
            return;
          }
          const id = await DB.addTeam({ name: teamName.trim() });
          showToast('チームを作成しました！');
          renderTeam(container, navigate, { teamId: id });
        },
      }),
    ]),
  ]);

  container.appendChild(page);
}

function showMemberModal(container, navigate, member) {
  const isEdit = !!member;
  let name = member?.name || '';
  let number = member?.number || '';
  let categories = normalizeMemberCategories(member);

  const overlay = el('div', { className: 'modal-overlay active', id: 'member-modal' });
  
  const content = el('div', { className: 'modal-content' }, [
    el('div', { className: 'modal-handle' }),
    el('div', { className: 'modal-header' }, [
      el('h2', { className: 'modal-title', textContent: isEdit ? 'メンバー編集' : 'メンバー追加' }),
      el('button', { className: 'modal-close', textContent: '✕', onClick: () => overlay.remove() }),
    ]),

    el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
      el('label', { className: 'input-label', textContent: '名前' }),
      el('input', {
        className: 'input-field',
        type: 'text',
        placeholder: '選手名',
        value: name,
        onInput: (e) => { name = e.target.value; },
      }),
    ]),

    el('div', { className: 'input-group', style: { marginBottom: 'var(--space-base)' } }, [
      el('label', { className: 'input-label', textContent: '背番号' }),
      el('input', {
        className: 'input-field',
        type: 'text',
        placeholder: '背番号',
        value: number,
        onInput: (e) => { number = e.target.value; },
      }),
    ]),

    el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
      el('label', { className: 'input-label', textContent: '守備カテゴリ（複数選択）' }),
      createCategoryMultiSelect(categories, (vals) => { categories = vals; }),
    ]),

    el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: isEdit ? '保存' : '追加',
      onClick: async () => {
        if (!name.trim()) {
          showToast('名前を入力してください', 'error');
          return;
        }
        if (isEdit) {
          await DB.updateMember(member.id, { name: name.trim(), number: number.trim(), positionCategories: categories });
          showToast('メンバーを更新しました');
        } else {
          await DB.addMember({ teamId: currentTeamId, name: name.trim(), number: number.trim(), positionCategories: categories });
          showToast('メンバーを追加しました');
        }
        overlay.remove();
        renderTeam(container, navigate, { teamId: currentTeamId });
      },
    }),
  ]);

  overlay.appendChild(content);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

function showTeamEditModal(container, navigate, team) {
  let teamName = team.name;

  const overlay = el('div', { className: 'modal-overlay active' });
  
  const content = el('div', { className: 'modal-content' }, [
    el('div', { className: 'modal-handle' }),
    el('div', { className: 'modal-header' }, [
      el('h2', { className: 'modal-title', textContent: 'チーム設定' }),
      el('button', { className: 'modal-close', textContent: '✕', onClick: () => overlay.remove() }),
    ]),

    el('div', { className: 'input-group', style: { marginBottom: 'var(--space-xl)' } }, [
      el('label', { className: 'input-label', textContent: 'チーム名' }),
      el('input', {
        className: 'input-field',
        type: 'text',
        value: teamName,
        onInput: (e) => { teamName = e.target.value; },
      }),
    ]),

    el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: '保存',
      style: { marginBottom: 'var(--space-md)' },
      onClick: async () => {
        if (!teamName.trim()) {
          showToast('チーム名を入力してください', 'error');
          return;
        }
        await DB.updateTeam(team.id, { name: teamName.trim() });
        showToast('チーム名を更新しました');
        overlay.remove();
        renderTeam(container, navigate, { teamId: team.id });
      },
    }),
    
    el('button', {
      className: 'btn btn-danger btn-block',
      textContent: 'チームを削除',
      onClick: async () => {
        if (confirm('チームと全てのデータを削除しますか？この操作は取り消せません。')) {
          await DB.deleteTeam(team.id);
          showToast('チームを削除しました');
          overlay.remove();
          navigate('home');
        }
      },
    }),
  ]);

  overlay.appendChild(content);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function createCategoryMultiSelect(initialValues, onChange) {
  const categories = [
    { id: 'infielder', label: '内野' },
    { id: 'outfielder', label: '外野' },
    { id: 'pitcher', label: '投手' },
    { id: 'catcher', label: '捕手' },
  ];
  const selected = new Set(initialValues || []);
  const wrap = el('div', { className: 'btn-group' });
  const emit = () => onChange(Array.from(selected));
  for (const c of categories) {
    const btn = el('button', {
      className: `chip ${selected.has(c.id) ? 'active' : ''}`,
      textContent: c.label,
      onClick: () => {
        if (selected.has(c.id)) selected.delete(c.id);
        else selected.add(c.id);
        btn.classList.toggle('active', selected.has(c.id));
        emit();
      },
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

async function showTeamSummaryModal(team, members) {
  const games = await DB.getGames(team.id);
  const sortedMembers = [...members].sort((a, b) => toUniformNumber(a.number) - toUniformNumber(b.number));
  const statsMap = {};
  sortedMembers.forEach((m) => { statsMap[m.id] = createEmptyStatRow(m); });

  for (const game of games) {
    const events = await DB.getAllEvents(game.id);
    const opponentScores = await DB.getOpponentScores(game.id);
    for (const event of events) {
      if (event.type !== 'atBat') continue;
      const stat = statsMap[event.batterId];
      if (!stat) continue;
      stat.pa++;
      if (isAtBatCounted(event.result)) stat.ab++;
      if (isHit(event.result)) stat.h++;
      if (event.result === 'double') stat.double++;
      if (event.result === 'triple') stat.triple++;
      if (event.result === 'homerun') stat.hr++;
      if (event.result === 'walk') stat.bb++;
      if (event.result === 'hitByPitch') stat.hbp++;
      if (event.result === 'strikeout') stat.so++;
      if (event.result === 'sacrifice') stat.sh++;
      if (event.result === 'sacrificeFly') stat.sf++;
      if (event.result === 'doublePlay') stat.gdp++;
      if (event.result === 'error') stat.reachedOnError++;
      stat.rbi += (event.rbiProduced || 0);
      const before = computeGameState(events, game, members, opponentScores, (event.order || 0) - 0.1);
      if (before.runners.second || before.runners.third) {
        if (isAtBatCounted(event.result)) stat.rispAb++;
        if (isHit(event.result)) stat.rispH++;
      }
    }
    for (const event of events) {
      if (event.type !== 'play') continue;
      if (!event.runnerId) continue;
      const stat = statsMap[event.runnerId];
      if (!stat) continue;
      if (event.action === 'steal' && event.resultStatus === 'success') stat.sb++;
      if (
        event.action === 'score' ||
        (event.action === 'advance' && event.resultStatus === 'success' && event.runner === '3B') ||
        (event.action === 'advanceTwo' && event.resultStatus === 'success' && (event.runner === '2B' || event.runner === '3B'))
      ) stat.r++;
    }
    for (const event of events) {
      if (event.type !== 'play') continue;
      if (!(event.action === 'steal' && event.resultStatus === 'failure')) continue;
      const catcherId = event.catcherId || getGameCatcherId(game);
      if (!catcherId) continue;
      const catcherStat = statsMap[catcherId];
      if (catcherStat) catcherStat.cs++;
    }
    for (const event of events) {
      if (event.type === 'atBat' && event.result === 'homerun') {
        const stat = statsMap[event.batterId];
        if (stat) stat.r++;
      }
    }
  }

  const headers = [
    '選手名', '出場(先発・代打・代走・守備)', '打順', '守備位置', '打席', '打数', '安打', '本塁打',
    '打点', '得点', '盗塁', '二塁打', '三塁打', '得点圏打数', '得点圏安打', '三振', '四球', '死球',
    '犠打', '犠飛', '併殺打', '敵失', '盗塁阻止', '打率', 'OPS',
  ];
  const rows = sortedMembers.map((m) => {
    const st = statsMap[m.id];
    const posLabel = formatMemberCategoryLabel(m);
    const avg = st.ab > 0 ? (st.h / st.ab) : 0;
    const obpDen = st.ab + st.bb + st.hbp + st.sf;
    const obp = obpDen > 0 ? (st.h + st.bb + st.hbp) / obpDen : 0;
    const tb = (st.h - st.double - st.triple - st.hr) + (2 * st.double) + (3 * st.triple) + (4 * st.hr);
    const slg = st.ab > 0 ? tb / st.ab : 0;
    const ops = obp + slg;
    return [
      m.name || '', '', '', posLabel, st.pa, st.ab, st.h, st.hr, st.rbi, st.r, st.sb, st.double, st.triple, st.rispAb, st.rispH,
      st.so, st.bb, st.hbp, st.sh, st.sf, st.gdp, st.reachedOnError, st.cs,
      formatDecimal(avg), formatDecimal(ops),
    ];
  });
  const text = [
    `${team.name} 通算成績（背番号順）`,
    headers.join('\t'),
    ...rows.map((r) => r.join('\t')),
  ].join('\n');

  const overlay = el('div', { className: 'modal-overlay active' });
  const content = el('div', { className: 'modal-content' }, [
    el('div', { className: 'modal-handle' }),
    el('div', { className: 'modal-header' }, [
      el('h2', { className: 'modal-title', textContent: '共有テンプレート' }),
      el('button', { className: 'modal-close', textContent: '✕', onClick: () => overlay.remove() }),
    ]),
    el('div', { className: 'text-secondary', style: { marginBottom: 'var(--space-sm)', fontSize: 'var(--font-size-sm)' }, textContent: 'LINE共有しやすいTSV形式です（貼り付け可）' }),
    el('textarea', { className: 'input-field', style: { minHeight: '220px', fontSize: '12px', lineHeight: '1.5', marginBottom: 'var(--space-md)' }, value: text }),
    el('div', { style: { display: 'flex', gap: 'var(--space-sm)' } }, [
      el('button', {
        className: 'btn btn-secondary',
        style: { flex: 1 },
        textContent: 'コピー',
        onClick: async () => {
          await navigator.clipboard.writeText(text);
          showToast('テンプレートをコピーしました');
        },
      }),
      el('button', {
        className: 'btn btn-primary',
        style: { flex: 1 },
        textContent: '画像保存',
        onClick: () => {
          downloadShareTemplateImage(`${team.name} 通算成績`, headers, rows);
        },
      }),
    ]),
  ]);
  overlay.appendChild(content);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function normalizeMemberCategories(member) {
  if (Array.isArray(member?.positionCategories)) return member.positionCategories;
  return [];
}

function formatMemberCategoryLabel(member) {
  const labels = [];
  const values = normalizeMemberCategories(member);
  if (values.includes('infielder')) labels.push('内野');
  if (values.includes('outfielder')) labels.push('外野');
  if (values.includes('pitcher')) labels.push('投手');
  if (values.includes('catcher')) labels.push('捕手');
  return labels.join(' / ');
}

function createEmptyStatRow(member) {
  return {
    memberId: member.id,
    pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, r: 0, sb: 0, double: 0, triple: 0,
    rispAb: 0, rispH: 0, so: 0, bb: 0, hbp: 0, sh: 0, sf: 0, gdp: 0, reachedOnError: 0, cs: 0,
  };
}

function isHit(result) {
  return ['single', 'double', 'triple', 'homerun'].includes(result);
}

function isAtBatCounted(result) {
  return !['walk', 'hitByPitch', 'sacrifice', 'sacrificeFly'].includes(result);
}

function formatDecimal(value) {
  return value.toFixed(3);
}

function toUniformNumber(numberText) {
  const v = Number(numberText);
  return Number.isNaN(v) ? 9999 : v;
}

function getGameCatcherId(game) {
  const lineup = game?.lineup || [];
  const lineupPositions = game?.lineupPositions || {};
  for (const memberId of lineup) {
    if (lineupPositions[memberId] === 'C') return memberId;
  }
  return null;
}

function downloadShareTemplateImage(teamName, headers, rows) {
  const colWidth = 140;
  const rowHeight = 28;
  const width = Math.min(3800, headers.length * colWidth + 32);
  const effectiveCols = Math.floor((width - 32) / colWidth);
  const visibleHeaders = headers.slice(0, effectiveCols);
  const visibleRows = rows.map((r) => r.slice(0, effectiveCols));
  const height = 120 + rowHeight * (visibleRows.length + 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`${teamName} 共有テンプレート`, 16, 32);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText('※ 横幅制限のため右側列は一部省略される場合があります', 16, 52);
  const startX = 16;
  let y = 76;
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(startX, y, visibleHeaders.length * colWidth, rowHeight);
  ctx.fillStyle = '#111827';
  ctx.font = '12px sans-serif';
  visibleHeaders.forEach((h, i) => {
    ctx.fillText(h, startX + i * colWidth + 6, y + 18);
  });
  y += rowHeight;
  visibleRows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 1) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(startX, y, visibleHeaders.length * colWidth, rowHeight);
    }
    ctx.fillStyle = '#1f2937';
    row.forEach((v, i) => {
      ctx.fillText(String(v || ''), startX + i * colWidth + 6, y + 18);
    });
    y += rowHeight;
  });
  ctx.strokeStyle = '#d1d5db';
  for (let c = 0; c <= visibleHeaders.length; c++) {
    const x = startX + c * colWidth;
    ctx.beginPath();
    ctx.moveTo(x, 76);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  for (let r = 0; r <= visibleRows.length + 1; r++) {
    const yy = 76 + r * rowHeight;
    ctx.beginPath();
    ctx.moveTo(startX, yy);
    ctx.lineTo(startX + visibleHeaders.length * colWidth, yy);
    ctx.stroke();
  }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${teamName}_share_template.png`;
  a.click();
  showToast('共有画像を保存しました');
}
