
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BubbleData, GameStatus, GameState, Particle, BubbleType, FloatingText } from './types';
import { getGeminiFeedback } from './services/geminiService';
import { GoogleGenAI } from "@google/genai";

const COLORS = [
  'rgba(147, 197, 253, 0.5)', 
  'rgba(249, 168, 212, 0.5)', 
  'rgba(167, 243, 208, 0.5)', 
  'rgba(253, 230, 138, 0.5)', 
  'rgba(196, 181, 253, 0.5)', 
];

const INITIAL_LIVES = 3;
const MAX_LIVES = 5;
const SPAWN_INTERVAL = 800;

const BGM_URL = 'https://cdn.pixabay.com/audio/2022/01/21/audio_1919830504.mp3';
const POP_SFX_URL = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';
const HIT_SFX_URL = 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState & { backgroundUrl?: string, highScore: number }>({
    score: 0,
    lives: INITIAL_LIVES,
    level: 1,
    status: GameStatus.START,
    geminiMessage: '',
    backgroundUrl: '',
    highScore: 0
  });

  const [bubbles, setBubbles] = useState<BubbleData[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const gameLoopRef = useRef<number | null>(null);
  const lastSpawnRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const popSfxRef = useRef<HTMLAudioElement | null>(null);
  const hitSfxRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const savedScore = localStorage.getItem('bubblePopHighScore');
    if (savedScore) {
      setGameState(prev => ({ ...prev, highScore: parseInt(savedScore) }));
    }

    bgmRef.current = new Audio(BGM_URL);
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.3;
    popSfxRef.current = new Audio(POP_SFX_URL);
    popSfxRef.current.volume = 0.5;
    hitSfxRef.current = new Audio(HIT_SFX_URL);
    hitSfxRef.current.volume = 0.4;

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      bgmRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (bgmRef.current) bgmRef.current.muted = isMuted;
    if (popSfxRef.current) popSfxRef.current.muted = isMuted;
    if (hitSfxRef.current) hitSfxRef.current.muted = isMuted;
  }, [isMuted]);

  const generateBackground = async () => {
    setIsGeneratingBg(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: "An immersive underwater bioluminescent coral reef, high quality, digital art style, glowing sea life" }]
        },
        config: { imageConfig: { aspectRatio: "9:16" } }
      });

      const part = response.candidates[0].content.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        setGameState(prev => ({ ...prev, backgroundUrl: `data:image/png;base64,${part.inlineData.data}` }));
      }
    } catch (error) {
      console.error("Background Gen Error:", error);
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const startGame = () => {
    bgmRef.current?.play().catch(() => {});
    if (!gameState.backgroundUrl && !isGeneratingBg) {
      generateBackground();
    }
    setGameState(prev => ({
      ...prev,
      score: 0,
      lives: INITIAL_LIVES,
      level: 1,
      status: GameStatus.PLAYING,
      geminiMessage: ''
    }));
    setBubbles([]);
    setParticles([]);
    setFloatingTexts([]);
    lastSpawnRef.current = performance.now();
  };

  const resumeGame = () => {
    setGameState(prev => ({ ...prev, status: GameStatus.PLAYING }));
    lastSpawnRef.current = performance.now();
  };

  const pauseGame = () => {
    if (gameState.status === GameStatus.PLAYING) {
      setGameState(prev => ({ ...prev, status: GameStatus.PAUSED }));
    }
  };

  const triggerShake = (intensity: number) => {
    setShakeIntensity(intensity);
    setTimeout(() => setShakeIntensity(0), 200);
  };

  const createFloatingText = (x: number, y: number, text: string, color: string) => {
    setFloatingTexts(prev => [...prev, { id: Date.now() + Math.random(), x, y, text, color, life: 1.0 }]);
  };

  const createBubble = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const rand = Math.random();
    let type = BubbleType.STANDARD, size = Math.random() * 40 + 50, health = 1, speedMult = 1, points = 100;
    let color = COLORS[Math.floor(Math.random() * COLORS.length)];

    if (rand < 0.05 && gameState.lives < MAX_LIVES) {
      type = BubbleType.HEART; color = 'rgba(244, 63, 94, 0.7)'; size = 60;
    } else if (rand < 0.12) {
      type = BubbleType.GOLD; color = 'rgba(250, 204, 21, 0.7)'; size = 50; points = 500;
    } else if (rand < 0.25) {
      type = BubbleType.SPEEDY; color = 'rgba(56, 189, 248, 0.7)'; size = 40; speedMult = 2.5; points = 250;
    } else if (rand < 0.40) {
      type = BubbleType.ARMORED; color = 'rgba(100, 116, 139, 0.8)'; size = 80; health = 3; speedMult = 0.6; points = 400;
    }

    setBubbles(prev => [...prev, {
      id: Date.now() + Math.random(),
      x: Math.random() * (clientWidth - size),
      y: clientHeight + size,
      size,
      speed: (Math.random() * 2 + 1.2) * (1 + gameState.level * 0.1) * speedMult,
      color, points, isPopping: false, type, health, maxHealth: health
    }]);
  }, [gameState.level, gameState.lives]);

  const handlePop = (id: number) => {
    if (gameState.status !== GameStatus.PLAYING) return;
    setBubbles(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const b = prev[idx];
      const newHealth = b.health - 1;
      const cx = b.x + b.size / 2, cy = b.y + b.size / 2;

      if (newHealth <= 0) {
        popSfxRef.current?.play().catch(() => {});
        const pCount = b.type === BubbleType.GOLD ? 30 : 15;
        const newParticles = Array.from({ length: pCount }).map(() => ({
          id: Math.random(), x: cx, y: cy, vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15, color: b.color, life: 1.0
        }));
        setParticles(p => [...p, ...newParticles]);
        triggerShake(b.type === BubbleType.ARMORED ? 8 : 2);
        createFloatingText(cx, cy, b.type === BubbleType.HEART ? "VIDA +1" : `+${b.points}`, b.type === BubbleType.GOLD ? '#facc15' : '#fff');
        
        setGameState(s => ({
          ...s, score: s.score + b.points,
          level: Math.floor((s.score + b.points) / 1200) + 1,
          lives: Math.min(MAX_LIVES, s.lives + (b.type === BubbleType.HEART ? 1 : 0))
        }));
        return prev.filter(bubble => bubble.id !== id);
      }
      hitSfxRef.current?.play().catch(() => {});
      const hitParts = Array.from({ length: 5 }).map(() => ({
        id: Math.random(), x: cx, y: cy, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, color: '#fff', life: 1.0
      }));
      setParticles(p => [...p, ...hitParts]);
      const nb = [...prev]; nb[idx] = { ...b, health: newHealth };
      return nb;
    });
  };

  const gameLoop = useCallback((time: number) => {
    if (gameState.status !== GameStatus.PLAYING) return;

    if (time - lastSpawnRef.current > Math.max(120, SPAWN_INTERVAL - (gameState.level * 45))) {
      createBubble(); 
      lastSpawnRef.current = time;
    }

    setBubbles(prev => {
      const up = prev.map(b => ({ ...b, y: b.y - b.speed }));
      const missed = up.filter(b => b.y < -b.size);
      if (missed.some(m => m.type !== BubbleType.HEART && m.type !== BubbleType.GOLD)) {
        triggerShake(10);
        setGameState(s => {
          const nl = s.lives - 1;
          return nl <= 0 ? { ...s, lives: 0, status: GameStatus.GAMEOVER } : { ...s, lives: nl };
        });
      }
      return up.filter(b => b.y >= -b.size);
    });

    setParticles(p => p.map(pt => ({ ...pt, x: pt.x + pt.vx, y: pt.y + pt.vy, vy: pt.vy + 0.1, life: pt.life - 0.02 })).filter(pt => pt.life > 0));
    setFloatingTexts(t => t.map(ft => ({ ...ft, y: ft.y - 1.5, life: ft.life - 0.015 })).filter(ft => ft.life > 0));
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameState.status, gameState.level, createBubble]);

  useEffect(() => {
    if (gameState.status === GameStatus.PLAYING) {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    } else if (gameState.status === GameStatus.GAMEOVER) {
      if (gameState.score > gameState.highScore) {
        localStorage.setItem('bubblePopHighScore', gameState.score.toString());
        setGameState(prev => ({ ...prev, highScore: gameState.score }));
      }
      setIsLoading(true);
      getGeminiFeedback(gameState.score, gameState.level).then(msg => { setGameState(s => ({ ...s, geminiMessage: msg })); setIsLoading(false); });
    }
    
    return () => { if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current); };
  }, [gameState.status, gameLoop]);

  const Footer = () => (
    <footer className="w-full flex flex-col items-center gap-4 py-8 z-50">
      <div className="flex flex-wrap justify-center gap-4 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em]">
        <a href="https://github.com/codigo-y-mas-codigo/Bubble-Pop-Master---El-Juego-de-Burbujas" target="_blank" rel="noopener" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full border border-white/10 transition-all">GitHub Repo</a>
        <a href="https://luisangelmacielp.vercel.app/" target="_blank" rel="noopener" className="bg-blue-600/20 hover:bg-blue-600/40 px-4 py-2 rounded-full border border-blue-500/30 transition-all">Desarrollado por <span className="text-white">Luis Angel Maciel</span></a>
      </div>
    </footer>
  );

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-[#050510] text-white touch-none" style={{ transform: shakeIntensity > 0 ? `translate(${(Math.random()-0.5)*shakeIntensity}px, ${(Math.random()-0.5)*shakeIntensity}px)` : 'none' }}>
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a20] via-[#050510] to-[#000]">
        {gameState.backgroundUrl && (
          <div className="absolute inset-0 bg-cover bg-center animate-fade-in transition-opacity duration-1000 opacity-60" style={{ backgroundImage: `url(${gameState.backgroundUrl})` }} />
        )}
        <div className="absolute inset-0 bg-blue-900/10 mix-blend-overlay"></div>
      </div>

      {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.PAUSED) && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
          <div className="bg-white/5 backdrop-blur-md p-4 rounded-3xl border border-white/10 text-center pointer-events-auto">
            <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Score</div>
            <div className="text-4xl font-black">{gameState.score}</div>
          </div>

          <div className="flex flex-col items-end gap-3 pointer-events-auto">
            <div className="flex items-center gap-3">
              <button 
                onClick={gameState.status === GameStatus.PLAYING ? pauseGame : resumeGame}
                className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 hover:bg-white/20 transition-all active:scale-90"
              >
                {gameState.status === GameStatus.PLAYING ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="2"/><rect x="14" y="4" width="4" height="16" rx="2"/></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
              <div className="flex gap-2 bg-black/40 p-2 rounded-full border border-white/10">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${i < gameState.lives ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-white/5'}`} />
                ))}
              </div>
            </div>
            <div className="bg-blue-500 px-4 py-1 rounded-full text-[10px] font-black italic">LEVEL {gameState.level}</div>
          </div>
        </div>
      )}

      <div className="relative w-full h-full z-10">
        {bubbles.map(b => (
          <div key={b.id} onPointerDown={() => handlePop(b.id)} className={`absolute rounded-full cursor-pointer transition-transform active:scale-125`} style={{ left: b.x, top: b.y, width: b.size, height: b.size, background: b.type === BubbleType.GOLD ? 'radial-gradient(circle at 30% 30%, #fff, #facc15 60%, #a16207)' : `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), ${b.color} 70%)`, boxShadow: b.type === BubbleType.GOLD ? '0 0 25px rgba(250,204,21,0.5)' : 'inset 0 0 10px rgba(255,255,255,0.3)', border: b.type === BubbleType.ARMORED ? '3px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.2)' }}>
            <div className="absolute top-[15%] left-[15%] w-[20%] h-[20%] bg-white/40 rounded-full blur-[1px]"></div>
            {b.type === BubbleType.ARMORED && b.health > 1 && <div className="absolute inset-0 flex items-center justify-center font-black text-white/40">{b.health}</div>}
            {b.type === BubbleType.HEART && <div className="absolute inset-0 flex items-center justify-center text-xl">❤️</div>}
          </div>
        ))}
        {particles.map(p => <div key={p.id} className="absolute rounded-full pointer-events-none" style={{ left: p.x, top: p.y, width: 8*p.life, height: 8*p.life, background: p.color, opacity: p.life }} />)}
        {floatingTexts.map(t => <div key={t.id} className="absolute pointer-events-none font-black text-xl italic" style={{ left: t.x, top: t.y, color: t.color, opacity: t.life, transform: `translateY(${(1-t.life)*-40}px)` }}>{t.text}</div>)}
      </div>

      {gameState.status === GameStatus.START && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl p-8 overflow-y-auto">
          <div className="my-auto flex flex-col items-center max-w-2xl w-full">
            <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter text-center leading-[0.85] mb-6 bg-gradient-to-b from-white to-blue-500 bg-clip-text text-transparent drop-shadow-2xl">BUBBLE<br/>MASTER</h1>
            <div className="bg-yellow-400 text-black px-6 py-1 rounded-full font-black tracking-widest text-sm mb-12 shadow-lg uppercase">
              {gameState.highScore > 0 ? `HIGH SCORE: ${gameState.highScore}` : 'READY TO POP?'}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12">
              {[{t:'Standard', d:'1 Tap'}, {t:'Armored', d:'3 Taps'}, {t:'Speedy', d:'Fast'}, {t:'Heart', d:'+1 Life'}].map((x,i) => (
                <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center">
                  <div className="text-blue-400 text-[10px] font-black uppercase mb-1">{x.t}</div>
                  <div className="text-slate-400 text-[10px]">{x.d}</div>
                </div>
              ))}
            </div>
            <button onClick={startGame} className="px-16 py-6 bg-white text-black rounded-full font-black text-3xl hover:scale-105 active:scale-95 transition-all shadow-2xl hover:bg-blue-500 hover:text-white">JUGAR AHORA</button>
          </div>
          <Footer />
        </div>
      )}

      {gameState.status === GameStatus.PAUSED && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 backdrop-blur-md p-8">
          <div className="bg-[#0f172a]/80 backdrop-blur-2xl p-10 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col items-center max-w-xs w-full">
            <h2 className="text-4xl font-black italic mb-8 tracking-tighter">PAUSA</h2>
            <div className="flex flex-col gap-4 w-full">
              <button 
                onClick={resumeGame}
                className="w-full py-5 bg-white text-black rounded-2xl font-black text-xl hover:bg-blue-500 hover:text-white transition-all shadow-lg active:scale-95"
              >
                REANUDAR
              </button>
              <button 
                onClick={startGame}
                className="w-full py-4 bg-white/10 border border-white/10 rounded-2xl font-bold text-lg hover:bg-white/20 transition-all active:scale-95"
              >
                REINICIAR
              </button>
              <button 
                onClick={() => setGameState(s => ({ ...s, status: GameStatus.START }))}
                className="w-full py-4 text-slate-400 font-bold hover:text-white transition-all uppercase text-xs tracking-widest"
              >
                SALIR AL MENÚ
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState.status === GameStatus.GAMEOVER && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl p-8">
          <div className="my-auto flex flex-col items-center">
            <div className="text-red-500 font-black tracking-[0.4em] uppercase text-sm mb-4">Game Over</div>
            <div className="text-[10rem] font-black leading-none mb-2">{gameState.score}</div>
            <div className="text-slate-500 text-xs uppercase tracking-widest mb-10">Puntuación Final</div>
            <div className="w-full max-w-sm bg-white/5 p-6 rounded-[2rem] border border-white/10 mb-10 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              {isLoading ? <div className="animate-pulse py-4 font-bold text-blue-300">CALCULANDO TU GRANDEZA...</div> : <p className="text-xl font-bold italic">"{gameState.geminiMessage}"</p>}
            </div>
            <div className="flex flex-col gap-4 w-full max-w-xs">
              <button onClick={startGame} className="w-full py-5 bg-blue-600 rounded-2xl font-black text-xl hover:bg-blue-500 transition-all shadow-xl">REINTENTAR</button>
              <button onClick={() => setGameState(s => ({ ...s, status: GameStatus.START }))} className="py-2 text-slate-500 hover:text-white uppercase text-xs tracking-widest font-bold">Menú Principal</button>
            </div>
          </div>
          <Footer />
        </div>
      )}
    </div>
  );
};

export default App;
