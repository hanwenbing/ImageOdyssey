import { useState } from "react";

type SquareValue = "X" | "O" | null;
type Squares = SquareValue[];
type History = Squares[];
type WinnerResult = {
  winner: Exclude<SquareValue, null>;
  line: number[];
} | null;
type SquareProps = {
  value: SquareValue;
  index: number;
  isWinning: boolean;
  onSquareClick: () => void;
};
type BoardProps = {
  xIsNext: boolean;
  squares: Squares;
  onPlay: (nextSquares: Squares) => void;
};

function Square({ value, index, isWinning, onSquareClick }: SquareProps) {
  const markColor =
    value === "X"
      ? "text-cyan-200 drop-shadow-[0_0_14px_rgba(34,211,238,0.9)]"
      : "text-rose-200 drop-shadow-[0_0_14px_rgba(251,113,133,0.9)]";
  const emptyStyle =
    "text-zinc-600 hover:border-emerald-300/80 hover:bg-emerald-300/10 hover:text-emerald-200";
  const winningStyle = isWinning
    ? "border-amber-300 bg-amber-300/20 shadow-[0_0_28px_rgba(252,211,77,0.35)]"
    : "border-white/15 bg-white/[0.06]";

  return (
    <button
      type="button"
      aria-label={`Square ${index + 1}${value ? ` marked ${value}` : ""}`}
      className={`flex aspect-square items-center justify-center rounded-2xl border text-5xl font-black transition duration-200 ease-out hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:text-6xl ${winningStyle} ${
        value ? markColor : emptyStyle
      }`}
      onClick={onSquareClick}
    >
      {value ?? <span className="text-base font-semibold">{index + 1}</span>}
    </button>
  );
}

function calculateWinner(squares: Squares): WinnerResult {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { winner: squares[a], line: [a, b, c] };
    }
  }

  return null;
}

function createEmptySquares(): Squares {
  return Array<SquareValue>(9).fill(null);
}

function Board({ xIsNext, squares, onPlay }: BoardProps) {
  const winnerResult = calculateWinner(squares);
  const winner = winnerResult?.winner ?? null;
  const winningLine = winnerResult?.line ?? [];
  const status = winner
    ? `${winner} controls the grid`
    : `Next player: ${xIsNext ? "X" : "O"}`;

  function handleClick(i: number) {
    if (squares[i] || winner) {
      return;
    }

    const nextSquares = squares.slice();
    nextSquares[i] = xIsNext ? "X" : "O";
    onPlay(nextSquares);
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300">
            Match status
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">{status}</h2>
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl font-black ${
            xIsNext
              ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-200"
              : "border-rose-300/50 bg-rose-300/10 text-rose-200"
          }`}
        >
          {xIsNext ? "X" : "O"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {squares.map((value, index) => (
          <Square
            key={index}
            value={value}
            index={index}
            isWinning={winningLine.includes(index)}
            onSquareClick={() => handleClick(index)}
          />
        ))}
      </div>
    </section>
  );
}

export default function Game() {
  const [history, setHistory] = useState<History>([createEmptySquares()]);
  const [currentMove, setCurrentMove] = useState(0);
  const xIsNext = currentMove % 2 === 0;
  const currentSquares = history[currentMove];

  function handlePlay(nextSquares: Squares) {
    const nextHistory = [...history.slice(0, currentMove + 1), nextSquares];
    setHistory(nextHistory);
    setCurrentMove(nextHistory.length - 1);
  }

  function jumpTo(nextMove: number) {
    setCurrentMove(nextMove);
  }

  function resetGame() {
    setHistory([createEmptySquares()]);
    setCurrentMove(0);
  }

  const moves = history.map((_squares, move) => {
    const description = move > 0 ? `Move #${move}` : "Start";
    const isCurrent = move === currentMove;

    return (
      <li key={move}>
        <button
          type="button"
          className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
            isCurrent
              ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
              : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-emerald-300/50 hover:bg-emerald-300/10 hover:text-emerald-100"
          }`}
          onClick={() => jumpTo(move)}
        >
          {description}
        </button>
      </li>
    );
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.20),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.18),transparent_30%),linear-gradient(135deg,#18181b_0%,#111827_42%,#1c1917_100%)] px-4 py-8 text-zinc-100 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <header className="lg:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-[0.45em] text-emerald-300">
            Tailwind Arena
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl">
                Tic-Tac-Toe
              </h1>
              <p className="mt-3 max-w-2xl text-base text-zinc-300">
                A time-travel board with bright marks, glass panels, and a move
                console built from Tailwind utility classes.
              </p>
            </div>
            <button
              type="button"
              className="w-fit rounded-2xl border border-emerald-300/40 bg-emerald-300/10 px-5 py-3 text-sm font-bold text-emerald-100 shadow-lg shadow-emerald-950/30 transition hover:-translate-y-0.5 hover:bg-emerald-300/20 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              onClick={resetGame}
            >
              Reset match
            </button>
          </div>
        </header>

        <div>
          <Board xIsNext={xIsNext} squares={currentSquares} onPlay={handlePlay} />
        </div>

        <aside className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-200">
              Timeline
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              Move history
            </h2>
          </div>
          <ol className="space-y-2">{moves}</ol>
        </aside>
      </div>
    </main>
  );
}
