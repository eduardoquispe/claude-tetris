'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const THEMES = {
  retro: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#42a5f5', '#ffb74d', '#b0bec5'],
    bg: '#1a1a2e',
    grid: 'rgba(255,255,255,0.05)',
  },
  neon: {
    colors: [null, '#00ffff', '#ffff00', '#ff00ff', '#00ff88', '#ff2244', '#4488ff', '#ff8800', '#aaaacc'],
    bg: '#000000',
    grid: 'rgba(0,255,255,0.08)',
  },
  pastel: {
    colors: [null, '#b2ebf2', '#fff9c4', '#e1bee7', '#c8e6c9', '#ffcdd2', '#bbdefb', '#ffe0b2', '#cfd8dc'],
    bg: '#fafafa',
    grid: 'rgba(0,0,0,0.06)',
  },
  pixel: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#42a5f5', '#ffb74d', '#b0bec5'],
    bg: '#0d0d0d',
    grid: 'rgba(255,255,255,0.04)',
  },
};

let currentTheme = 'retro';

function getThemeColors() { return THEMES[currentTheme].colors; }

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const nameInputSection = document.getElementById('name-input-section');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const scoresContainer = document.getElementById('scores-container');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const startLevelSelect = document.getElementById('start-level-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, maxLinesCleared;
let startLevel = 1;

const SCORES_KEY = 'tetris_scores';

function loadScores() {
  try { return JSON.parse(localStorage.getItem(SCORES_KEY)) || []; }
  catch { return []; }
}

function saveScore(name, finalScore, finalLines, finalCombo) {
  const scores = loadScores();
  scores.push({ name, score: finalScore, lines: finalLines, combo: finalCombo });
  scores.sort((a, b) => b.score - a.score);
  scores.splice(5);
  localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
  return scores;
}

function isTopScore(finalScore) {
  const scores = loadScores();
  return scores.length < 5 || finalScore >= scores[scores.length - 1].score;
}

function renderScores(container, currentScore) {
  const scores = loadScores();
  if (!scores.length) { container.innerHTML = '<p>No hay records aún.</p>'; return; }
  let html = '<table class="scores-table"><thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Líneas</th><th>Combo</th></tr></thead><tbody>';
  scores.forEach((s, i) => {
    const isHighlight = currentScore !== undefined && s.score === currentScore;
    const safeName = String(s.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html += `<tr class="${isHighlight ? 'highlight' : ''}"><td>${i + 1}</td><td>${safeName}</td><td>${s.score.toLocaleString()}</td><td>${s.lines}</td><td>${s.combo}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (cleared > maxLinesCleared) maxLinesCleared = cleared;
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function shadeColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const colors = getThemeColors();
  const color = colors[colorIndex];
  context.globalAlpha = alpha ?? 1;

  if (currentTheme === 'neon') {
    context.shadowBlur = 12;
    context.shadowColor = color;
    context.fillStyle = color;
    context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
    context.shadowBlur = 0;
  } else if (currentTheme === 'pastel') {
    const rr = 4, px = x * size + 1, py = y * size + 1, w = size - 2, h = size - 2;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(px + rr, py);
    context.lineTo(px + w - rr, py);
    context.quadraticCurveTo(px + w, py, px + w, py + rr);
    context.lineTo(px + w, py + h - rr);
    context.quadraticCurveTo(px + w, py + h, px + w - rr, py + h);
    context.lineTo(px + rr, py + h);
    context.quadraticCurveTo(px, py + h, px, py + h - rr);
    context.lineTo(px, py + rr);
    context.quadraticCurveTo(px, py, px + rr, py);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(px, py, w, 3);
  } else if (currentTheme === 'pixel') {
    const cell = Math.floor((size - 2) / 3);
    for (let pr = 0; pr < 3; pr++) {
      for (let pc = 0; pc < 3; pc++) {
        context.fillStyle = (pr + pc) % 2 === 0 ? color : shadeColor(color, -20);
        context.fillRect(x * size + 1 + pc * cell, y * size + 1 + pr * cell, cell - 1, cell - 1);
      }
    }
  } else {
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  }

  context.globalAlpha = 1;
}

function getGridColor() {
  return THEMES[currentTheme].grid;
}

function drawGrid() {
  ctx.strokeStyle = getGridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function applyTheme(name) {
  currentTheme = name;
  localStorage.setItem('tetris_theme', name);
  const theme = THEMES[name];
  document.documentElement.style.setProperty('--game-bg', theme.bg);
  document.documentElement.style.setProperty('--grid-color', theme.grid);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  nameInputSection.classList.add('hidden');
  playerNameInput.value = '';
  if (isTopScore(score)) {
    nameInputSection.classList.remove('hidden');
    playerNameInput.focus();
  } else {
    renderScores(scoresContainer, undefined);
  }
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseOverlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  paused = false;
  gameOver = false;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  level = startLevel;
  lines = 0;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  updateHUD();
  combo = 0; maxCombo = 0; maxLinesCleared = 0;

  // --- THEMES ---
  const savedTheme = localStorage.getItem('tetris_theme');
  if (savedTheme && THEMES[savedTheme]) applyTheme(savedTheme);

  renderScores(scoresContainer, undefined);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

saveScoreBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Anónimo';
  saveScore(name, score, lines, maxCombo);
  nameInputSection.classList.add('hidden');
  renderScores(scoresContainer, score);
});

playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveScoreBtn.click();
});

resetScoresBtn.addEventListener('click', () => {
  localStorage.removeItem(SCORES_KEY);
  renderScores(scoresContainer);
});

for (let i = 1; i <= 15; i++) {
  const opt = document.createElement('option');
  opt.value = i; opt.textContent = i;
  startLevelSelect.appendChild(opt);
}

resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', init);
startLevelSelect.addEventListener('change', e => { startLevel = +e.target.value; });

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

themeToggle.addEventListener('change', () => {
  if (themeToggle.checked) {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIcon.textContent = '🌙';
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeIcon.textContent = '☀️';
  }
});

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

applyTheme(currentTheme);
init();
