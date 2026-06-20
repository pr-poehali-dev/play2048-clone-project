import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';

type Cell = { id: number; value: number; merged?: boolean; isNew?: boolean };
type Grid = (Cell | null)[][];

const SIZE = 4;
let TILE_ID = 1;

const TILE_STYLES: Record<number, { bg: string; color: string; glow: string }> = {
  2: { bg: 'rgba(124,58,237,0.15)', color: '#a78bfa', glow: '#7c3aed' },
  4: { bg: 'rgba(124,58,237,0.25)', color: '#c4b5fd', glow: '#8b5cf6' },
  8: { bg: 'rgba(59,130,246,0.25)', color: '#93c5fd', glow: '#3b82f6' },
  16: { bg: 'rgba(6,182,212,0.25)', color: '#67e8f9', glow: '#06b6d4' },
  32: { bg: 'rgba(16,185,129,0.25)', color: '#6ee7b7', glow: '#10b981' },
  64: { bg: 'rgba(132,204,22,0.28)', color: '#bef264', glow: '#84cc16' },
  128: { bg: 'rgba(234,179,8,0.28)', color: '#fde047', glow: '#eab308' },
  256: { bg: 'rgba(249,115,22,0.3)', color: '#fdba74', glow: '#f97316' },
  512: { bg: 'rgba(244,63,94,0.3)', color: '#fda4af', glow: '#f43f5e' },
  1024: { bg: 'rgba(236,72,153,0.35)', color: '#f9a8d4', glow: '#ec4899' },
  2048: { bg: 'rgba(217,70,239,0.4)', color: '#f0abfc', glow: '#d946ef' },
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

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 font-body text-white">
      <div className="w-full max-w-md animate-fade-in">
        <header className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-6xl font-700 tracking-tight" style={{ color: '#a78bfa' }}>
              <span className="neon-text">2048</span>
            </h1>
            <p className="text-sm text-white/50 mt-1">Неоновая версия · ночной режим</p>
          </div>
          <div className="flex gap-2">
            <ScoreBox label="СЧЁТ" value={score} />
            <ScoreBox label="РЕКОРД" value={best} accent />
          </div>
        </header>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-white/60 max-w-[55%]">Объединяй плитки и собери <span className="text-purple-300 font-600">2048</span>!</p>
          <div className="flex gap-2">
            <IconBtn icon={soundOn ? 'Volume2' : 'VolumeX'} onClick={() => setSoundOn((s) => !s)} />
            <IconBtn icon="HelpCircle" onClick={() => setShowRules((v) => !v)} />
            <button
              onClick={newGame}
              className="px-4 h-10 rounded-xl font-600 text-sm transition-all hover:scale-105 active:scale-95"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.5)' }}
            >
              Новая игра
            </button>
          </div>
        </div>

        <div
          className="relative rounded-2xl p-3 select-none touch-none"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: SIZE * SIZE }).map((_, i) => (
              <div key={i} className="grid-cell rounded-xl aspect-square" />
            ))}
          </div>
          <div className="absolute inset-3 grid grid-cols-4 gap-3 pointer-events-none">
            {grid.flat().map((cell, i) =>
              cell ? (
                <Tile key={cell.id + '-' + i} cell={cell} />
              ) : (
                <div key={'e' + i} />
              )
            )}
          </div>

          {(gameOver || won) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl animate-fade-in z-10"
              style={{ background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(4px)' }}>
              <h2 className="font-display text-5xl neon-text mb-2" style={{ color: won && !gameOver ? '#f0abfc' : '#fda4af' }}>
                {won && !gameOver ? 'ПОБЕДА!' : 'КОНЕЦ'}
              </h2>
              <p className="text-white/70 mb-5">Счёт: {score}</p>
              <div className="flex gap-3">
                {won && !gameOver && (
                  <button onClick={() => setWon(false)} className="px-5 h-11 rounded-xl font-600 border border-white/20 hover:bg-white/10 transition">
                    Продолжить
                  </button>
                )}
                <button onClick={newGame} className="px-5 h-11 rounded-xl font-600"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#06b6d4)', boxShadow: '0 0 20px rgba(124,58,237,0.5)' }}>
                  Заново
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-white/40">
          <Icon name="ArrowUp" size={14} /><Icon name="ArrowDown" size={14} />
          <Icon name="ArrowLeft" size={14} /><Icon name="ArrowRight" size={14} />
          <span>стрелки или свайпы · WASD</span>
        </div>

        {showRules && (
          <div className="mt-5 rounded-2xl p-5 animate-fade-in text-sm text-white/70 space-y-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="font-display text-xl text-purple-300 mb-2">Правила</h3>
            <p>Свайпай или жми стрелки, чтобы двигать все плитки.</p>
            <p>Две плитки с одинаковым числом сливаются в одну.</p>
            <p>Цель — собрать плитку <span className="text-pink-300 font-600">2048</span>. Прогресс сохраняется автоматически!</p>
          </div>
        )}

        <section className="mt-6">
          <h3 className="font-display text-2xl text-cyan-300 mb-3 flex items-center gap-2">
            <Icon name="Trophy" size={22} /> Лучшие результаты
          </h3>
          {history.length === 0 ? (
            <p className="text-white/40 text-sm">Пока нет завершённых игр. Сыграй первую!</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg w-6 text-white/40">{i + 1}</span>
                    <div>
                      <p className="font-600">{h.score} очков</p>
                      <p className="text-xs text-white/40">плитка {h.max} · {h.date}</p>
                    </div>
                  </div>
                  {i === 0 && <Icon name="Crown" size={20} className="text-yellow-300" />}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="text-center text-white/30 text-xs mt-8 pb-4">
          Сделано на poehali.dev · собери 2048 ✦
        </footer>
      </div>
    </div>
  );
};

const Tile = ({ cell }: { cell: Cell }) => {
  const style = TILE_STYLES[cell.value] || { bg: 'rgba(217,70,239,0.45)', color: '#f5d0fe', glow: '#d946ef' };
  const fontSize = cell.value >= 1024 ? 'text-2xl' : cell.value >= 128 ? 'text-3xl' : 'text-4xl';
  return (
    <div
      className={`rounded-xl flex items-center justify-center font-display font-600 ${fontSize} ${cell.isNew ? 'animate-tile-pop' : cell.merged ? 'animate-tile-merge' : ''}`}
      style={{
        background: style.bg,
        color: style.color,
        border: `1.5px solid ${style.glow}`,
        boxShadow: `0 0 16px ${style.glow}66, inset 0 0 12px ${style.glow}33`,
        textShadow: `0 0 10px ${style.glow}`,
      }}
    >
      {cell.value}
    </div>
  );
};

const ScoreBox = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <div className="rounded-xl px-4 py-2 min-w-[72px] text-center"
    style={{
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${accent ? 'rgba(6,182,212,0.4)' : 'rgba(124,58,237,0.4)'}`,
    }}>
    <p className="text-[10px] tracking-widest text-white/50">{label}</p>
    <p className="font-display text-xl font-600" style={{ color: accent ? '#67e8f9' : '#a78bfa' }}>{value}</p>
  </div>
);

const IconBtn = ({ icon, onClick }: { icon: string; onClick: () => void }) => (
  <button onClick={onClick}
    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 text-white/70 hover:text-white"
    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
    <Icon name={icon} size={18} />
  </button>
);

export default Index;