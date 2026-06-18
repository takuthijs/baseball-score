/**
 * 打球方向 — 扇形フィールド図と座標からのエリア自動判定
 */
import { BATTED_BALL_POSITIONS, BATTED_BALL_ZONES } from './constants.js';

const SVG_SIZE = 200;
const VIEW_BOX = { x: 0, y: 50, w: 200, h: 156 };
const HOME_SVG = { x: 100, y: 186 };
const OUTER_RADIUS = 132;
const FENCE_RADIUS = 108;
const FOUL_ANGLE = 45;
const FENCE_RATIO = FENCE_RADIUS / OUTER_RADIUS;

function toStoredCoords(sx, sy) {
  return { pinX: sx / SVG_SIZE, pinY: sy / SVG_SIZE };
}

function fromStoredCoords(pinX, pinY) {
  return { sx: pinX * SVG_SIZE, sy: pinY * SVG_SIZE };
}

function clientToSvg(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { sx: HOME_SVG.x, sy: HOME_SVG.y };
  return pt.matrixTransform(ctm.inverse());
}

function quarterSectorPath(r, home = HOME_SVG) {
  const { x: hx, y: hy } = home;
  const offset = r * Math.SQRT1_2;
  const leftX = hx - offset;
  const leftY = hy - offset;
  const rightX = hx + offset;
  return `M ${hx} ${hy} L ${leftX} ${leftY} A ${r} ${r} 0 0 1 ${rightX} ${leftY} Z`;
}

function quarterBandPath(innerR, outerR) {
  const { x: hx, y: hy } = HOME_SVG;
  const lo = outerR * Math.SQRT1_2;
  const li = innerR * Math.SQRT1_2;
  const outer = `M ${hx} ${hy} L ${hx - lo} ${hy - lo} A ${outerR} ${outerR} 0 0 1 ${hx + lo} ${hy - lo} Z`;
  const inner = `M ${hx} ${hy} L ${hx - li} ${hy - li} A ${innerR} ${innerR} 0 0 0 ${hx + li} ${hy - li} Z`;
  return `${outer} ${inner}`;
}

/** 本塁ベース（五角形・先端が捕手方向） */
function homePlatePath() {
  const { x: hx, y: hy } = HOME_SVG;
  return [
    `M ${hx} ${hy + 10}`,
    `L ${hx - 9} ${hy + 4}`,
    `L ${hx - 9} ${hy - 1}`,
    `L ${hx + 9} ${hy - 1}`,
    `L ${hx + 9} ${hy + 4}`,
    'Z',
  ].join(' ');
}

function lookupPosition(id) {
  return BATTED_BALL_POSITIONS.find((p) => p.id === id) || null;
}

function lookupZone(id) {
  return BATTED_BALL_ZONES.find((z) => z.id === id) || null;
}

function outfieldPosition(angle) {
  if (angle < -15) return 'LF';
  if (angle < 15) return 'CF';
  return 'RF';
}

/** 正規化座標 (0–1, 200px基準) から守備位置・エリアを推定 */
export function resolveFieldLocation(nx, ny) {
  const { sx, sy } = fromStoredCoords(nx, ny);
  const dx = sx - HOME_SVG.x;
  const dy = HOME_SVG.y - sy;
  const angle = Math.atan2(dx, dy) * (180 / Math.PI);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ratio = Math.min(dist / OUTER_RADIUS, 1);

  if (Math.abs(angle) > FOUL_ANGLE || ratio < 0.04) {
    const zone = lookupZone('foul');
    return {
      position: null,
      positionLabel: null,
      zone: 'foul',
      zoneLabel: zone?.label || 'ファウル',
      pinX: nx,
      pinY: ny,
    };
  }

  let position;
  let zone;

  if (ratio > FENCE_RATIO) {
    position = outfieldPosition(angle);
    zone = 'homerun';
  } else if (ratio < 0.32) {
    if (Math.abs(angle) < 7) {
      position = 'P';
      zone = 'pitcher-front';
    } else if (angle < -7) {
      position = angle < -22 ? '3B' : 'SS';
      zone = 'between-ss-3b';
    } else {
      position = angle > 22 ? '1B' : '2B';
      zone = angle > 22 ? 'between-1b-2b' : 'between-2b-ss';
    }
  } else if (ratio < 0.52) {
    if (angle < -18) {
      position = '3B';
      zone = 'between-ss-3b';
    } else if (angle < -6) {
      position = 'SS';
      zone = 'between-2b-ss';
    } else if (angle < 6) {
      position = '2B';
      zone = 'pitcher-front';
    } else if (angle < 18) {
      position = '2B';
      zone = 'between-1b-2b';
    } else {
      position = '1B';
      zone = 'between-1b-2b';
    }
  } else {
    const deep = ratio > FENCE_RATIO * 0.72;
    position = outfieldPosition(angle);
    if (angle < -20) {
      zone = deep ? 'left-line' : 'left-center';
    } else if (angle < 20) {
      zone = 'center';
    } else {
      zone = deep ? 'right-line' : 'right-center';
    }
  }

  const pos = lookupPosition(position);
  const zn = lookupZone(zone);
  return {
    position,
    positionLabel: pos?.label || null,
    zone,
    zoneLabel: zn?.label || null,
    pinX: nx,
    pinY: ny,
  };
}

function svgEl(tag, attrs = {}) {
  const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') {
      elem.setAttribute('class', val);
    } else {
      elem.setAttribute(key, val);
    }
  }
  return elem;
}

function polarPoint(angleDeg, dist) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: HOME_SVG.x + dist * Math.sin(rad),
    y: HOME_SVG.y - dist * Math.cos(rad),
  };
}

/**
 * 扇形フィールド図を生成
 * @returns {{ wrap: HTMLElement, setPin: Function, getResolved: Function }}
 */
export function createFieldDiagram({ pinX = null, pinY = null, onPlace = null } = {}) {
  let resolved = (pinX != null && pinY != null) ? resolveFieldLocation(pinX, pinY) : null;

  const labelEl = document.createElement('div');
  labelEl.className = 'field-detected-label';
  labelEl.textContent = resolved
    ? formatDetectedLabel(resolved)
    : 'フィールドをタップして打球位置を指定';

  const svg = svgEl('svg', {
    class: 'field-svg',
    viewBox: `${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.w} ${VIEW_BOX.h}`,
    role: 'img',
    'aria-label': '打球方向フィールド',
  });

  const sectorPath = quarterSectorPath(OUTER_RADIUS);

  // ホームランゾーン（フェンス外側）
  svg.appendChild(svgEl('path', {
    class: 'field-hr',
    d: quarterBandPath(FENCE_RADIUS, OUTER_RADIUS),
    'fill-rule': 'evenodd',
  }));

  // 外野芝生（フェンス内）
  svg.appendChild(svgEl('path', {
    class: 'field-grass',
    d: quarterSectorPath(FENCE_RADIUS),
  }));

  // 内野土
  svg.appendChild(svgEl('path', {
    class: 'field-dirt',
    d: 'M 100 186 L 68 152 L 100 122 L 132 152 Z',
  }));

  // フェンスライン
  const fenceOffset = FENCE_RADIUS * Math.SQRT1_2;
  svg.appendChild(svgEl('path', {
    class: 'field-fence',
    d: `M ${HOME_SVG.x - fenceOffset} ${HOME_SVG.y - fenceOffset} A ${FENCE_RADIUS} ${FENCE_RADIUS} 0 0 1 ${HOME_SVG.x + fenceOffset} ${HOME_SVG.y - fenceOffset}`,
  }));

  // ファウルライン
  const outerOffset = OUTER_RADIUS * Math.SQRT1_2;
  svg.appendChild(svgEl('line', {
    class: 'field-line',
    x1: String(HOME_SVG.x),
    y1: String(HOME_SVG.y),
    x2: String(HOME_SVG.x - outerOffset),
    y2: String(HOME_SVG.y - outerOffset),
  }));
  svg.appendChild(svgEl('line', {
    class: 'field-line',
    x1: String(HOME_SVG.x),
    y1: String(HOME_SVG.y),
    x2: String(HOME_SVG.x + outerOffset),
    y2: String(HOME_SVG.y - outerOffset),
  }));

  // ピッチャープレート
  svg.appendChild(svgEl('rect', {
    class: 'field-pitcher-plate',
    x: '89',
    y: '141.5',
    width: '22',
    height: '5',
    rx: '0.5',
  }));

  // ホームベース
  svg.appendChild(svgEl('path', {
    class: 'field-home',
    d: homePlatePath(),
  }));

  // HRラベル
  const hrDist = (FENCE_RADIUS + OUTER_RADIUS) / 2;
  for (const angle of [-22, 0, 22]) {
    const pt = polarPoint(angle, hrDist);
    svg.appendChild(svgEl('text', {
      class: 'field-hr-label',
      x: String(pt.x),
      y: String(pt.y),
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      textContent: 'HR',
    }));
  }

  const pinGroup = svgEl('g', { class: 'field-pin-group' });
  svg.appendChild(pinGroup);

  const hitArea = svgEl('path', {
    class: 'field-hit-area',
    d: sectorPath,
  });
  svg.appendChild(hitArea);

  function renderPin() {
    pinGroup.innerHTML = '';
    if (resolved?.pinX == null || resolved?.pinY == null) return;
    const { sx, sy } = fromStoredCoords(resolved.pinX, resolved.pinY);
    pinGroup.appendChild(svgEl('circle', {
      class: 'field-pin',
      cx: String(sx),
      cy: String(sy),
      r: '8',
    }));
    pinGroup.appendChild(svgEl('circle', {
      class: 'field-pin-ring',
      cx: String(sx),
      cy: String(sy),
      r: '13',
    }));
  }

  function placeFromEvent(e) {
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;
    const { x: sx, y: sy } = clientToSvg(svg, clientX, clientY);
    const { pinX, pinY } = toStoredCoords(sx, sy);
    resolved = resolveFieldLocation(pinX, pinY);
    labelEl.textContent = formatDetectedLabel(resolved);
    renderPin();
    onPlace?.(resolved);
  }

  hitArea.addEventListener('click', placeFromEvent);
  hitArea.addEventListener('touchend', (e) => {
    e.preventDefault();
    placeFromEvent(e.changedTouches[0]);
  });

  renderPin();

  const wrap = document.createElement('div');
  wrap.className = 'field-diagram';
  wrap.appendChild(svg);
  wrap.appendChild(labelEl);

  return {
    wrap,
    setPin(nx, ny) {
      resolved = (nx != null && ny != null) ? resolveFieldLocation(nx, ny) : null;
      labelEl.textContent = resolved
        ? formatDetectedLabel(resolved)
        : 'フィールドをタップして打球位置を指定';
      renderPin();
    },
    getResolved() {
      return resolved;
    },
  };
}

export function formatDetectedLabel(resolved) {
  if (!resolved) return '';
  if (resolved.zone === 'foul') return 'ファウルゾーン';
  if (resolved.zone === 'homerun') {
    return resolved.positionLabel ? `ホームラン（${resolved.positionLabel}）` : 'ホームラン';
  }
  const parts = [];
  if (resolved.positionLabel) parts.push(resolved.positionLabel);
  return parts.join(' ') || '位置を特定できません';
}

export function buildFieldDirection(resolved) {
  if (!resolved) {
    return {
      position: null,
      positionLabel: null,
      zone: null,
      zoneLabel: null,
      pinX: null,
      pinY: null,
    };
  }
  return {
    position: resolved.position,
    positionLabel: resolved.positionLabel,
    zone: resolved.zone,
    zoneLabel: resolved.zoneLabel,
    pinX: resolved.pinX,
    pinY: resolved.pinY,
  };
}
