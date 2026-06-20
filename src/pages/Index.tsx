import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';

type Cell = { id: number; value: number; merged?: boolean; isNew?: boolean };
type Grid = (Cell | null)[][];

const SIZE = 4;
let TILE_ID = 1;

const TILE_STYLES: Record<number, { bg: string; color: string }> = {
  2: { bg: '#eee4da', color: '#776e65' },
  4: { bg: '#ede0c8', color: '#776e65' },
  8: { bg: '#f2b179', color: '#f9f6f2' },
  16: { bg: '#f59563', color: '#f9f6f2' },
  32: { bg: '#f67c5f', color: '#f9f6f2' },
  64: { bg: '#f65e3b', color: '#f9f6f2' },
  128: { bg: '#edcf72', color: '#f9f6f2' },
  256: { bg: '#edcc61', color: '#f9f6f2' },
  512: { bg: '#edc850', color: '#f9f6f2' },
  1024: { bg: '#edc53f', color: '#f9f6f2' },
  2048: { bg: '#edc22e', color: '#f9f6f2' },
};

const emptyGrid = (): Grid => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

const addRandomTile = (grid: Grid): Grid => {
  const empty: [number, number][] = [];
  grid.forEach((row, r) => row.forEach((cell, c) => { if (!cell) empty.push([r, c]); }));
  if (empty.length === 0) return grid;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = grid.map((row) => [...row]);
  next[r][c] = { id: TILE_ID++, value: Math.random() < 0.9 ? 2 : 4, isNew: true };
  return next;
};

const initGrid = (): Grid => addRandomTile(addRandomTile(emptyGrid()));

const clone = (g: Grid): Grid => g.map((row) => row.map((c) => (c ? { ...c, merged: false, isNew: false } : null)));

const moveRow = (row: (Cell | null)[]): { row: (Cell | null)[]; gained: number; moved: boolean } => {
  const filtered = row.filter((c): c is Cell => c !== null);
  const result: (Cell | null)[] = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i++) {
    if (i < filtered.length - 1 && filtered[i].value === filtered[i + 1].value) {
      const val = filtered[i].value * 2;
      result.push({ id: filtered[i].id, value: val, merged: true });
      gained += val;
      i++;
    } else {
      result.push({ ...filtered[i] });
    }
  }
  while (result.length < SIZE) result.push(null);
  const moved = row.some((c, i) => (c?.id ?? null) !== (result[i]?.id ?? null) || (c?.value ?? 0) !== (result[i]?.value ?? 0));
  return { row: result, gained, moved };
};

const transpose = (g: Grid): Grid => g[0].map((_, c) => g.map((row) => row[c]));
const reverse = (g: Grid): Grid => g.map((row) => [...row].reverse());

const move = (grid: Grid, dir: 'left' | 'right' | 'up' | 'down') => {
  let g = clone(grid);
  let gained = 0;
  let moved = false;
  const apply = (rows: Grid) => rows.map((row) => {
    const res = moveRow(row);
    gained += res.gained;
    if (res.moved) moved = true;
    return res.row;
  });
  if (dir === 'left') g = apply(g);
  if (dir === 'right') g = reverse(apply(reverse(g)));
  if (dir === 'up') g = transpose(apply(transpose(g)));
  if (dir === 'down') g = transpose(reverse(apply(reverse(transpose(g)))));
  return { grid: g, gained, moved };
};

const hasMoves = (grid: Grid): boolean => {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) return true;
      const v = grid[r][c]!.value;
      if (c < SIZE - 1 && grid[r][c + 1]?.value === v) return true;
      if (r < SIZE - 1 && grid[r + 1][c]?.value === v) return true;
    }
  return false;
};

interface HistoryEntry { score: number; max: number; date: string }

const Index = () => {
  const [grid, setGrid] = useState<Grid>(initGrid);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const loaded = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);

  const playSound = useCallback((merged: boolean) => {
    if (!soundOn) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = merged ? 440 : 220;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* ignore */ }
  }, [soundOn]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('game2048');
      if (saved) {
        const d = JSON.parse(saved);
        if (d.grid) {
          setGrid(d.grid);
          const maxId = Math.max(0, ...d.grid.flat().filter(Boolean).map((c: Cell) => c.id));
          TILE_ID = maxId + 1;
        }
        setScore(d.score || 0);
        setGameOver(d.gameOver || false);
        setWon(d.won || false);
      }
      const b = localStorage.getItem('best2048');
      if (b) setBest(Number(b));
      const h = localStorage.getItem('history2048');
      if (h) setHistory(JSON.parse(h));
      const s = localStorage.getItem('sound2048');
      if (s !== null) setSoundOn(s === 'true');
    } catch { /* ignore */ }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    localStorage.setItem('game2048', JSON.stringify({ grid, score, gameOver, won }));
  }, [grid, score, gameOver, won]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      localStorage.setItem('best2048', String(score));
    }
  }, [score, best]);

  useEffect(() => { localStorage.setItem('sound2048', String(soundOn)); }, [soundOn]);

  const saveHistory = useCallback((finalScore: number) => {
    const maxTile = Math.max(0, ...grid.flat().filter(Boolean).map((c) => c!.value));
    const entry: HistoryEntry = { score: finalScore, max: maxTile, date: new Date().toLocaleDateString('ru-RU') };
    setHistory((prev) => {
      const next = [entry, ...prev].sort((a, b) => b.score - a.score).slice(0, 10);
      localStorage.setItem('history2048', JSON.stringify(next));
      return next;
    });
  }, [grid]);

  const doMove = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    if (gameOver) return;
    setGrid((cur) => {
      const { grid: ng, gained, moved } = move(cur, dir);
      if (!moved) return cur;
      const withTile = addRandomTile(ng);
      if (gained > 0) {
        setScore((s) => s + gained);
        playSound(true);
      } else {
        playSound(false);
      }
      const maxTile = Math.max(0, ...withTile.flat().filter(Boolean).map((c) => c!.value));
      if (maxTile >= 2048 && !won) setWon(true);
      if (!hasMoves(withTile)) {
        setGameOver(true);
        setScore((s) => { saveHistory(s + gained); return s; });
      }
      return withTile;
    });
  }, [gameOver, won, playSound, saveHistory]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
        a: 'left', d: 'right', w: 'up', s: 'down',
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); doMove(dir); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
    else doMove(dy > 0 ? 'down' : 'up');
    touchStart.current = null;
  };

  const newGame = () => {
    if (!gameOver && score > 0) saveHistory(score);
    setGrid(initGrid());
    setScore(0);
    setGameOver(false);
    setWon(false);
  };

  const tiles: { cell: Cell; r: number; c: number }[] = [];
  grid.forEach((row, r) => row.forEach((cell, c) => { if (cell) tiles.push({ cell, r, c }); }));

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 font-body" style={{ color: '#776e65' }}>
      <div className="w-full max-w-[480px] animate-fade-in">
        <header className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-[64px] leading-none font-800" style={{ color: '#776e65' }}>2048</h1>
            <p className="text-[15px] mt-2 max-w-[230px]">
              Соединяй плитки и собери <strong>2048!</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <ScoreBox label="СЧЁТ" value={score} />
            <ScoreBox label="РЕКОРД" value={best} />
          </div>
        </header>

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <IconBtn icon={soundOn ? 'Volume2' : 'VolumeX'} onClick={() => setSoundOn((s) => !s)} />
            <IconBtn icon="HelpCircle" onClick={() => setShowRules((v) => !v)} />
          </div>
          <button
            onClick={newGame}
            className="px-5 h-11 rounded-md font-700 text-[15px] text-white transition-colors hover:opacity-90"
            style={{ background: '#8f7a66' }}
          >
            Новая игра
          </button>
        </div>

        <div
          className="relative rounded-md select-none touch-none"
          style={{ background: '#bbada0', padding: '12px', aspectRatio: '1' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid grid-cols-4 gap-3 w-full h-full">
            {Array.from({ length: SIZE * SIZE }).map((_, i) => (
              <div key={i} className="grid-cell rounded-md" />
            ))}
          </div>

          {tiles.map(({ cell, r, c }) => (
            <Tile key={cell.id} cell={cell} r={r} c={c} />
          ))}

          {(gameOver || won) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md animate-fade-in z-10"
              style={{ background: 'rgba(238,228,218,0.73)' }}>
              <h2 className="text-[52px] font-800 mb-4" style={{ color: '#776e65' }}>
                {won && !gameOver ? 'Победа!' : 'Игра окончена!'}
              </h2>
              <div className="flex gap-3">
                {won && !gameOver && (
                  <button onClick={() => setWon(false)} className="px-5 h-11 rounded-md font-700 text-white" style={{ background: '#8f7a66' }}>
                    Продолжить
                  </button>
                )}
                <button onClick={newGame} className="px-5 h-11 rounded-md font-700 text-white" style={{ background: '#8f7a66' }}>
                  Заново
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mt-4 text-[13px]" style={{ color: '#998f86' }}>
          <Icon name="ArrowUp" size={14} /><Icon name="ArrowDown" size={14} />
          <Icon name="ArrowLeft" size={14} /><Icon name="ArrowRight" size={14} />
          <span>стрелки, свайпы или WASD</span>
        </div>

        {showRules && (
          <div className="mt-5 rounded-md p-5 animate-fade-in text-[14px] space-y-2"
            style={{ background: '#eee4da', color: '#776e65' }}>
            <h3 className="text-xl font-700 mb-2">Как играть</h3>
            <p>Свайпай или жми стрелки, чтобы двигать все плитки.</p>
            <p>Две плитки с одинаковым числом сливаются в одну.</p>
            <p>Цель — собрать плитку <strong>2048</strong>. Прогресс сохраняется автоматически!</p>
          </div>
        )}

        <section className="mt-6">
          <h3 className="text-2xl font-700 mb-3 flex items-center gap-2" style={{ color: '#776e65' }}>
            <Icon name="Trophy" size={22} /> Лучшие результаты
          </h3>
          {history.length === 0 ? (
            <p className="text-[14px]" style={{ color: '#998f86' }}>Пока нет завершённых игр. Сыграй первую!</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded-md px-4 py-3"
                  style={{ background: '#eee4da' }}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-6 font-700" style={{ color: '#bbada0' }}>{i + 1}</span>
                    <div>
                      <p className="font-700">{h.score} очков</p>
                      <p className="text-xs" style={{ color: '#998f86' }}>плитка {h.max} · {h.date}</p>
                    </div>
                  </div>
                  {i === 0 && <Icon name="Crown" size={20} style={{ color: '#edc22e' }} />}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="text-center text-xs mt-8 pb-4" style={{ color: '#bbada0' }}>
          Сделано на poehali.dev · собери 2048
        </footer>
      </div>
    </div>
  );
};

const Tile = ({ cell, r, c }: { cell: Cell; r: number; c: number }) => {
  const style = TILE_STYLES[cell.value] || { bg: '#3c3a32', color: '#f9f6f2' };
  const digits = String(cell.value).length;
  const fontSize = digits >= 4 ? 'clamp(18px,5vw,30px)' : digits === 3 ? 'clamp(24px,6vw,38px)' : 'clamp(30px,8vw,46px)';
  return (
    <div
      className={`absolute flex items-center justify-center rounded-md font-700 ${cell.isNew ? 'animate-tile-pop' : cell.merged ? 'animate-tile-merge' : ''}`}
      style={{
        background: style.bg,
        color: style.color,
        fontSize,
        width: 'calc((100% - 24px - 36px) / 4)',
        height: 'calc((100% - 24px - 36px) / 4)',
        left: `calc(12px + ${c} * ((100% - 24px - 36px) / 4 + 12px))`,
        top: `calc(12px + ${r} * ((100% - 24px - 36px) / 4 + 12px))`,
        transition: 'left 0.12s ease, top 0.12s ease',
      }}
    >
      {cell.value}
    </div>
  );
};

const ScoreBox = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md px-4 py-2 min-w-[80px] text-center" style={{ background: '#bbada0' }}>
    <p className="text-[11px] tracking-wide font-700" style={{ color: '#eee4da' }}>{label}</p>
    <p className="text-xl font-700 text-white">{value}</p>
  </div>
);

const IconBtn = ({ icon, onClick }: { icon: string; onClick: () => void }) => (
  <button onClick={onClick}
    className="w-11 h-11 rounded-md flex items-center justify-center transition-colors text-white hover:opacity-90"
    style={{ background: '#bbada0' }}>
    <Icon name={icon} size={18} />
  </button>
);

export default Index;
