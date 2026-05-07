import { Grid } from './grid.js';

// ── State ──────────────────────────────────────────────────────────────────
const S = {
  canvas: null, ctx: null,
  level: null, grid: null, cs: 60,
  snakes: [],
  timer: 120, timerMax: 120,
  timerHandle: null,
  animating: new Set(), // snake ids currently animating
  difficulty: 1,
  win: false, lose: false,
  flashSnake: -1,            // id of snake to flash red (blocked)
  flashTimer: 0,
};

// ── Init ───────────────────────────────────────────────────────────────────
export function init(canvas) {
  S.canvas = canvas;
  S.ctx    = canvas.getContext('2d');

  canvas.addEventListener('click',      onTap);
  canvas.addEventListener('touchstart', onTap, { passive: false });

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.difficulty = parseInt(btn.dataset.d);
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadLevel();
    });
  });

  document.getElementById('btn-retry').addEventListener('click',  loadLevel);
  document.getElementById('btn-next') .addEventListener('click', () => { S.difficulty = Math.min(S.difficulty + 1, 7); loadLevel(); });
  document.getElementById('btn-retry2').addEventListener('click', loadLevel);

  loadLevel();
}

// ── Level loading ──────────────────────────────────────────────────────────
async function loadLevel() {
  hideOverlay('overlay-win');
  hideOverlay('overlay-lose');

  try {
    const res  = await fetch(`/api/level?difficulty=${S.difficulty}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    startLevel(data);
  } catch (err) {
    console.error('Failed to load level:', err);
  }
}

function startLevel(data) {
  S.level = data;
  S.grid  = Grid[data.grid_type] || Grid.square;
  S.win   = false;
  S.lose  = false;
  S.flashSnake = -1;

  // Fit canvas to viewport
  const maxW = Math.min(window.innerWidth  - 32, 520);
  const maxH = window.innerHeight - 160;
  const BASE = 64;
  const raw  = S.grid.canvasSize(data.rows, data.cols, BASE);
  const scale = Math.min(maxW / raw.w, maxH / raw.h, 1.4);
  S.cs = BASE * scale;

  const sz = S.grid.canvasSize(data.rows, data.cols, S.cs);
  S.canvas.width  = sz.w;
  S.canvas.height = sz.h;

  // Build snakes
  S.snakes = data.snakes.map(s => ({
    id:         s.id,
    color:      s.color,
    rail:       s.rail,          // [[r,c], ...]
    bodyLen:    s.body_length,
    headIdx:    s.body_length - 1, // index of head in rail
    exited:     false,
    blocked:    false,
  }));

  document.getElementById('grid-badge').textContent = data.grid_type;
  document.getElementById('level-num').textContent  = `Nível ${data.difficulty}`;

  resetTimer();
  render();
}

// ── Timer ──────────────────────────────────────────────────────────────────
function resetTimer() {
  clearInterval(S.timerHandle);
  S.timer    = 120;
  S.timerMax = 120;
  S.timerHandle = setInterval(tickTimer, 1000);
  updateTimerUI();
}

function tickTimer() {
  if (S.win || S.lose) return;
  S.timer--;
  updateTimerUI();
  if (S.timer <= 0) {
    clearInterval(S.timerHandle);
    S.lose = true;
    showOverlay('overlay-lose');
  }
}

function updateTimerUI() {
  const m = Math.floor(S.timer / 60);
  const s = S.timer % 60;
  const el = document.getElementById('timer');
  el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  el.classList.toggle('urgent', S.timer <= 20);

  const pct = S.timer / S.timerMax;
  const bar = document.getElementById('timer-bar');
  bar.style.width = `${pct * 100}%`;
  bar.style.background = pct > 0.4 ? '#e94560' : '#ff9f1c';
}

// ── Tap handling ───────────────────────────────────────────────────────────
function onTap(e) {
  e.preventDefault();
  if (S.win || S.lose) return;

  const rect   = S.canvas.getBoundingClientRect();
  const scaleX = S.canvas.width  / rect.width;
  const scaleY = S.canvas.height / rect.height;
  const touch  = e.touches ? e.touches[0] : e;
  const px     = (touch.clientX - rect.left) * scaleX;
  const py     = (touch.clientY - rect.top)  * scaleY;

  // Find closest snake body cell to tap point
  let minD = Infinity, hit = null;
  for (const sn of S.snakes) {
    if (sn.exited) continue;
    for (const cell of bodyCells(sn)) {
      const ctr = S.grid.cellCenter(cell[0], cell[1], S.cs);
      const d   = Math.hypot(ctr.x - px, ctr.y - py);
      if (d < minD) { minD = d; hit = sn; }
    }
  }

  if (!hit || minD > S.cs * 0.75) return;
  if (S.animating.has(hit.id)) return;
  tryMove(hit);
}

// ── Move logic ─────────────────────────────────────────────────────────────
function bodyCells(sn) {
  const start = Math.max(0, sn.headIdx - sn.bodyLen + 1);
  return sn.rail.slice(start, sn.headIdx + 1);
}

function occupiedMap() {
  const map = new Map();
  for (const sn of S.snakes) {
    if (sn.exited) continue;
    for (const [r, c] of bodyCells(sn)) map.set(`${r},${c}`, sn.id);
  }
  return map;
}

function tryMove(sn) {
  const nextIdx = sn.headIdx + 1;
  // Already at end of rail → just mark exited
  if (nextIdx >= sn.rail.length) {
    sn.exited = true;
    checkWin();
    render();
    return;
  }

  const [nr, nc] = sn.rail[nextIdx];
  const occ = occupiedMap();
  const key  = `${nr},${nc}`;

  if (occ.has(key) && occ.get(key) !== sn.id) {
    // Blocked — flash
    triggerFlash(sn.id);
    return;
  }

  // Animate movement
  animateMove(sn, nextIdx);
}

function animateMove(sn, nextIdx) {
  const STEPS = 8;
  let step = 0;

  S.animating.add(sn.id);
  const start = cellPt(sn.rail[sn.headIdx]);
  const end   = cellPt(sn.rail[nextIdx]);

  function frame() {
    step++;
    const t = step / STEPS;
    sn._anim = { from: start, to: end, t: easeOut(t) };

    if (step >= STEPS) {
      sn._anim   = null;
      sn.headIdx = nextIdx;
      S.animating.delete(sn.id);
      render();
    } else {
      render();
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

function cellPt(cell) {
  return S.grid.cellCenter(cell[0], cell[1], S.cs);
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

function triggerFlash(id) {
  S.flashSnake = id;
  S.flashTimer = 6; // frames
  renderFlash();
}

function renderFlash() {
  if (S.flashTimer <= 0) { S.flashSnake = -1; render(); return; }
  S.flashTimer--;
  render();
  requestAnimationFrame(renderFlash);
}

function checkWin() {
  if (S.snakes.every(sn => sn.exited)) {
    clearInterval(S.timerHandle);
    S.win = true;
    setTimeout(() => showOverlay('overlay-win'), 400);
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────
function render() {
  const { ctx, canvas, level, grid, cs } = S;
  if (!level) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#12111e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  grid.drawBackground(ctx, level.rows, level.cols, cs);

  // Draw rail (faint tube)
  for (const sn of S.snakes) {
    if (sn.exited) continue;
    drawRail(sn);
  }

  // Draw snake bodies
  for (const sn of S.snakes) {
    if (sn.exited) continue;
    drawSnake(sn);
  }
}

function drawRail(sn) {
  const { ctx, grid, cs } = S;
  const r = cs * 0.13;

  ctx.strokeStyle = sn.color + '28';
  ctx.lineWidth   = r * 2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  ctx.beginPath();
  const first = grid.cellCenter(sn.rail[0][0], sn.rail[0][1], cs);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < sn.rail.length; i++) {
    const p = grid.cellCenter(sn.rail[i][0], sn.rail[i][1], cs);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawSnake(sn) {
  const { ctx, grid, cs } = S;
  const cells  = bodyCells(sn);
  if (!cells.length) return;

  const r       = cs * 0.28;
  const isFlash = S.flashSnake === sn.id && S.flashTimer % 2 === 0;
  const color   = isFlash ? '#ff4444' : sn.color;

  // Compute point list, inserting animated head if needed
  const pts = cells.map(c => grid.cellCenter(c[0], c[1], cs));

  if (sn._anim) {
    // Replace head with interpolated position
    const { from, to, t } = sn._anim;
    pts[pts.length - 1] = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
  }

  // Outline (depth)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth   = r * 2 + 5;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  drawPath(ctx, pts);

  // Body
  ctx.strokeStyle = color;
  ctx.lineWidth   = r * 2;
  drawPath(ctx, pts);

  // Head circle
  const head = pts[pts.length - 1];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r * 1.25, 0, Math.PI * 2);
  ctx.fill();

  // Head outline
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Eyes — orient based on travel direction
  const dir  = pts.length > 1
    ? { x: head.x - pts[pts.length - 2].x, y: head.y - pts[pts.length - 2].y }
    : { x: 1, y: 0 };
  const len  = Math.hypot(dir.x, dir.y) || 1;
  const nx   = -dir.y / len, ny = dir.x / len; // perpendicular

  drawEye(ctx, head.x + nx * r * 0.45, head.y + ny * r * 0.45, r * 0.28);
  drawEye(ctx, head.x - nx * r * 0.45, head.y - ny * r * 0.45, r * 0.28);
}

function drawPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function drawEye(ctx, x, y, r) {
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.1, r * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + r * 0.05, y - r * 0.1, r * 0.18, 0, Math.PI * 2); ctx.fill();
}

// ── Overlays ────────────────────────────────────────────────────────────────
function showOverlay(id) { document.getElementById(id).classList.add('visible'); }
function hideOverlay(id) { document.getElementById(id).classList.remove('visible'); }
