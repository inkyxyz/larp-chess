let Chess;
try {
  ({ Chess } = await import('https://esm.sh/chess.js@1.0.0'));
} catch (e) {
  document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Не удалось загрузить шахматную библиотеку. Проверьте соединение.</p>';
  throw e;
}

import { evaluate, searchBest, classifyMove } from './engine.js';

const game = new Chess();
let selectedSquare = null;
let flipped = false;
let moveClassifications = [];
let lastEvalWhite = 0;

const boardEl = document.getElementById('board');
const canvas = document.getElementById('fx');
const ctx = canvas.getContext('2d');
const hintEl = document.getElementById('hint');
const evalFill = document.getElementById('evalFill');
const evalText = document.getElementById('evalText');
const lastMoveEl = document.getElementById('lastMove');
const historyEl = document.getElementById('history');
const gameOverEl = document.getElementById('gameOver');
const gameOverText = document.getElementById('gameOverText');
const themeBtns = document.querySelectorAll('.theme-btn');
const promotionEl = document.getElementById('promotion');
const promotionOptions = document.getElementById('promotionOptions');

const FILE_ORDER = ['a','b','c','d','e','f','g','h'];
const CLS_INFO = {
  brilliant:  { label: 'Блестящий',  color: 'var(--clr-brilliant)' },
  best:       { label: 'Лучший',     color: 'var(--clr-best)' },
  excellent:  { label: 'Отличный',   color: 'var(--clr-excellent)' },
  good:       { label: 'Хороший',    color: 'var(--clr-good)' },
  inaccuracy: { label: 'Неточность', color: 'var(--clr-inaccuracy)' },
  mistake:    { label: 'Ошибка',     color: 'var(--clr-mistake)' },
  blunder:    { label: 'Зевок',      color: 'var(--clr-blunder)' },
  book:       { label: 'Дебют',      color: 'var(--clr-book)' }
};

const PIECE_SYMBOL = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// ===== Рендер доски =====
function renderBoard() {
  const files = flipped ? [...FILE_ORDER].reverse() : FILE_ORDER;
  const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];

  let html = '';
  for (let ri = 0; ri < 8; ri++) {
    const rank = ranks[ri];
    for (let fi = 0; fi < 8; fi++) {
      const file = files[fi];
      const sq = file + rank;
      const isLight = (FILE_ORDER.indexOf(file) + rank) % 2 === 0;
      const piece = game.get(sq);

      let cls = `square ${isLight ? 'light' : 'dark'}`;
      html += `<div class="${cls}" data-sq="${sq}">`;

      if (ri === 7) html += `<span class="lbl-file">${file}</span>`;
      if (fi === 0) html += `<span class="lbl-rank">${rank}</span>`;

      if (piece) {
        const sym = PIECE_SYMBOL[piece.type];
        const col = piece.color === 'w' ? 'white' : 'black';
        html += `<div class="piece ${col}" data-color="${piece.color}">
          <svg viewBox="0 0 40 40"><use href="#pc-${sym}"/></svg>
        </div>`;
      }
      html += '</div>';
    }
  }
  boardEl.innerHTML = html;

  if (game.isCheck()) {
    const kingSq = findKingSquare(game.turn());
    if (kingSq) boardEl.querySelector(`[data-sq="${kingSq}"]`)?.classList.add('in-check');
  }

  const hist = game.history({ verbose: true });
  if (hist.length > 0) {
    const last = hist[hist.length - 1];
    boardEl.querySelector(`[data-sq="${last.from}"]`)?.classList.add('last-move');
    boardEl.querySelector(`[data-sq="${last.to}"]`)?.classList.add('last-move');
  }

  if (selectedSquare) {
    boardEl.querySelector(`[data-sq="${selectedSquare}"]`)?.classList.add('selected');
    const moves = game.moves({ square: selectedSquare, verbose: true });
    for (const m of moves) {
      const el = boardEl.querySelector(`[data-sq="${m.to}"]`);
      if (!el) continue;
      el.classList.add(m.captured ? 'legal-capture' : 'legal-move');
    }
  }
}

function findKingSquare(color) {
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === color) {
        return FILE_ORDER[f] + (8 - r);
      }
    }
  }
  return null;
}

// ===== Взаимодействие =====
boardEl.addEventListener('click', (e) => {
  if (game.isGameOver()) return;
  const sqEl = e.target.closest('[data-sq]');
  if (!sqEl) return;
  const sq = sqEl.dataset.sq;

  if (selectedSquare) {
    if (sq === selectedSquare) {
      selectedSquare = null;
      renderBoard();
      return;
    }

    const legal = game.moves({ square: selectedSquare, verbose: true });
    const target = legal.find(m => m.to === sq);

    if (target) {
      if (target.promotion) {
        showPromotionPicker(game.turn(), (choice) => {
          executeMove(selectedSquare, sq, choice);
        });
        selectedSquare = null;
        renderBoard();
      } else {
        const from = selectedSquare;
        selectedSquare = null;
        executeMove(from, sq);
      }
    } else {
      const piece = game.get(sq);
      if (piece && piece.color === game.turn()) {
        selectedSquare = sq;
      } else {
        selectedSquare = null;
      }
      renderBoard();
    }
  } else {
    const piece = game.get(sq);
    if (piece && piece.color === game.turn()) {
      selectedSquare = sq;
      renderBoard();
    }
  }
});

// ===== Выполнение хода =====
function executeMove(from, to, promotion = 'q') {
  const sourcePiece = boardEl.querySelector(`[data-sq="${from}"] .piece`);
  if (!sourcePiece) return;
  const fromRect = sourcePiece.getBoundingClientRect();

  const targetPiece = boardEl.querySelector(`[data-sq="${to}"] .piece`);
  const capturedRect = targetPiece?.getBoundingClientRect();
  const capturedColor = targetPiece?.dataset.color;

  const fenBefore = game.fen();
  const mover = game.turn();
  const move = game.move({ from, to, promotion });
  if (!move) return;

  // Рендер + FLIP-анимация
  renderBoard();
  const destPiece = boardEl.querySelector(`[data-sq="${to}"] .piece`);
  if (destPiece) {
    const toRect = destPiece.getBoundingClientRect();
    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;
    destPiece.animate([
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'translate(0, 0)' }
    ], { duration: 280, easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)' });
  }

  // Частицы при взятии
  if (capturedRect) {
    const color = capturedColor === 'w' ? '#fdf8ee' : '#3d2f22';
    burst(capturedRect.left + capturedRect.width / 2, capturedRect.top + capturedRect.height / 2, color, 32);
  }

  // Обновляем eval-bar
  lastEvalWhite = evaluate(game);
  updateEvalBar(lastEvalWhite);

  // Классификация отложенно
  setTimeout(() => classifyAndReport(fenBefore, move, mover, from, to), 30);
}

function classifyAndReport(fenBefore, move, mover, from, to) {
  const temp = new Chess(fenBefore);
  const bestScore = searchBest(temp, 2);

  const postWhite = evaluate(game);
  const postScore = mover === 'w' ? postWhite : -postWhite;
  const loss = bestScore - postScore;

  let cls = classifyMove(loss);

  // Проверка на brilliancy: ценный ход, попал под бой, но позиция не рухнула
  if (['n','b','r','q'].includes(move.piece) && loss < 80) {
    const oppMoves = game.moves({ verbose: true });
    const capturable = oppMoves.some(m => m.to === to && m.captured);
    if (capturable) cls = 'brilliant';
  }

  moveClassifications.push(cls);
  updateHistory();
  updateLastMove(cls, move);
  showHint(cls);

  if (cls === 'blunder') {
    const wrap = boardEl.parentElement;
    wrap.classList.add('shake');
    wrap.addEventListener('animationend', () => wrap.classList.remove('shake'), { once: true });
  }

  if (game.isGameOver()) setTimeout(showGameOver, 500);
}

// ===== Обновление панелей =====
function updateEvalBar(scoreWhite) {
  const clamped = Math.max(-1000, Math.min(1000, scoreWhite));
  const pct = 50 + (clamped / 1000) * 50;
  evalFill.style.width = pct + '%';
  const sign = scoreWhite >= 0 ? '+' : '';
  evalText.textContent = sign + (scoreWhite / 100).toFixed(1);
}

function updateHistory() {
  const hist = game.history({ verbose: true });
  if (hist.length === 0) {
    historyEl.innerHTML = '<span class="muted">Пока пусто</span>';
    return;
  }

  const rows = [];
  for (let i = 0; i < hist.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    const w = hist[i];
    const b = hist[i + 1];
    rows.push(`
      <div class="hist-row">
        <span class="hist-num">${num}.</span>
        ${renderHistMove(w, moveClassifications[i])}
        ${b ? renderHistMove(b, moveClassifications[i + 1]) : '<span></span>'}
      </div>
    `);
  }
  historyEl.innerHTML = rows.join('');
  historyEl.scrollTop = historyEl.scrollHeight;
}

function renderHistMove(move, cls) {
  const info = CLS_INFO[cls];
  const icon = cls ? `<svg style="color:${info.color}" viewBox="0 0 24 24"><use href="#cls-${cls}"/></svg>` : '';
  return `<span class="hist-move">${icon}${move.san}</span>`;
}

function updateLastMove(cls, move) {
  const info = CLS_INFO[cls];
  lastMoveEl.innerHTML = `
    <div class="last-move-icon" style="background:${info.color}22;color:${info.color}">
      <svg viewBox="0 0 24 24"><use href="#cls-${cls}"/></svg>
    </div>
    <div class="last-move-body">
      <div class="last-move-label" style="color:${info.color}">${info.label}</div>
      <div class="last-move-move">${move.san}</div>
    </div>
  `;
}

function showHint(cls) {
  const info = CLS_INFO[cls];
  hintEl.innerHTML = `
    <svg style="color:${info.color}" viewBox="0 0 24 24"><use href="#cls-${cls}"/></svg>
    <span>${info.label}</span>
  `;
  hintEl.dataset.cls = cls;
  hintEl.classList.add('show');
  clearTimeout(hintEl._t);
  hintEl._t = setTimeout(() => hintEl.classList.remove('show'), 1700);
}

// ===== Частицы =====
const parts = [];
let dpr = window.devicePixelRatio || 1;

function resizeCanvas() {
  const wrap = canvas.parentElement.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  canvas.width = wrap.width * dpr;
  canvas.height = wrap.height * dpr;
  canvas.style.width = wrap.width + 'px';
  canvas.style.height = wrap.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);

function burst(clientX, clientY, color, n = 28) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5;
    parts.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 1,
      size: 2 + Math.random() * 4,
      color
    });
  }
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.22;
    p.vx *= 0.985;
    p.life -= 0.022;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(tick);
}

// ===== Game over =====
function showGameOver() {
  let msg = 'Партия завершена';
  if (game.isCheckmate()) {
    msg = game.turn() === 'w' ? 'Мат. Победа чёрных' : 'Мат. Победа белых';
  } else if (game.isStalemate()) {
    msg = 'Пат. Ничья';
  } else if (game.isThreefoldRepetition()) {
    msg = 'Троекратное повторение. Ничья';
  } else if (game.isInsufficientMaterial()) {
    msg = 'Недостаточно материала. Ничья';
  } else if (game.isDraw()) {
    msg = 'Ничья';
  }
  gameOverText.textContent = msg;
  gameOverEl.hidden = false;
}

// ===== Promotion =====
function showPromotionPicker(color, callback) {
  const pieces = ['q', 'r', 'b', 'n'];
  promotionOptions.innerHTML = pieces.map(p => `
    <button class="promotion-opt" data-piece="${p}">
      <svg class="piece ${color === 'w' ? 'white' : 'black'}" viewBox="0 0 40 40">
        <use href="#pc-${PIECE_SYMBOL[p]}"/>
      </svg>
    </button>
  `).join('');
  promotionEl.hidden = false;

  const handler = (e) => {
    const btn = e.target.closest('.promotion-opt');
    if (!btn) return;
    promotionEl.hidden = true;
    promotionOptions.removeEventListener('click', handler);
    callback(btn.dataset.piece);
  };
  promotionOptions.addEventListener('click', handler);
}

// ===== Кнопки / темы =====
document.getElementById('newBtn').addEventListener('click', () => resetGame());
document.getElementById('gameOverNew').addEventListener('click', () => {
  gameOverEl.hidden = true;
  resetGame();
});
document.getElementById('flipBtn').addEventListener('click', () => {
  flipped = !flipped;
  renderBoard();
});

themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    themeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.body.dataset.theme = btn.dataset.theme;
  });
});

function resetGame() {
  game.reset();
  selectedSquare = null;
  moveClassifications = [];
  lastEvalWhite = 0;
  lastMoveEl.innerHTML = '<span class="muted">Сделайте ход, чтобы увидеть разбор</span>';
  gameOverEl.hidden = true;
  renderBoard();
  updateHistory();
  updateEvalBar(0);
}

// ===== Инициализация =====
renderBoard();
updateEvalBar(0);
resizeCanvas();
requestAnimationFrame(tick);