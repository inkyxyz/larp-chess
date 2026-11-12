const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// PST: индекс 0 = a8 (верхняя левая клетка с точки зрения белых)
const PAWN_PST = [
   0,  0,  0,  0,  0,  0,  0,  0,
  60, 60, 60, 60, 60, 60, 60, 60,
  12, 12, 22, 32, 32, 22, 12, 12,
   6,  6, 12, 26, 26, 12,  6,  6,
   0,  0,  0, 22, 22,  0,  0,  0,
   6, -6,-10,  0,  0,-10, -6,  6,
   6, 10, 10,-22,-22, 10, 10,  6,
   0,  0,  0,  0,  0,  0,  0,  0
];
const KNIGHT_PST = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50
];
const BISHOP_PST = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20
];
const ROOK_PST = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0
];
const QUEEN_PST = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20
];
const KING_PST = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
];

const PST = { p: PAWN_PST, n: KNIGHT_PST, b: BISHOP_PST, r: ROOK_PST, q: QUEEN_PST, k: KING_PST };

const FILES = ['a','b','c','d','e','f','g','h'];

function pstLookup(type, isWhite, sq) {
  const file = FILES.indexOf(sq[0]);
  const rank = parseInt(sq[1], 10);
  const row = 8 - rank;                     // 0 сверху (rank 8)
  const idx = row * 8 + file;
  const t = PST[type];
  if (!t) return 0;
  if (isWhite) return t[idx];
  // зеркально для чёрных
  return t[(7 - row) * 8 + file];
}

export function evaluate(game) {
  // > 0 = лучше для белых
  const board = game.board();
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const sq = FILES[f] + (8 - r);
      const isWhite = piece.color === 'w';
      const sign = isWhite ? 1 : -1;
      const pstVal = pstLookup(piece.type, isWhite, sq);
      score += sign * (VALUES[piece.type] + pstVal);
    }
  }
  return score;
}

// Alpha-beta, depth = N plies
function alphabeta(game, depth, alpha, beta, maximizingWhite) {
  if (depth === 0 || game.isGameOver()) {
    if (game.isCheckmate()) {
      return maximizingWhite ? -99999 : 99999;
    }
    if (game.isDraw() || game.isStalemate()) return 0;
    return evaluate(game);
  }

  const moves = game.moves({ verbose: true });

  if (maximizingWhite) {
    let best = -Infinity;
    for (const m of moves) {
      game.move(m);
      const s = alphabeta(game, depth - 1, alpha, beta, false);
      game.undo();
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      game.move(m);
      const s = alphabeta(game, depth - 1, alpha, beta, true);
      game.undo();
      if (s < best) best = s;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// Возвращает лучший счёт для того, чей ход (positive = хорошо для него)
export function searchBest(game, depth = 2) {
  const isWhite = game.turn() === 'w';
  const raw = alphabeta(game, depth, -Infinity, Infinity, isWhite);
  return isWhite ? raw : -raw;
}

export function classifyMove(loss) {
  if (loss < 15)  return 'best';
  if (loss < 40)  return 'excellent';
  if (loss < 90)  return 'good';
  if (loss < 180) return 'inaccuracy';
  if (loss < 350) return 'mistake';
  return 'blunder';
}