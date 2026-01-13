
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BubbleData, GameStatus, GameState, Particle, BubbleType, FloatingText } from './types';
import { getLocalFeedback } from './services/feedbackService';
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
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  
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

    const savedMute = localStorage.getItem('bubblePopMuted') === 'true';
    setIsMuted(savedMute);

    bgmRef.current = new Audio(BGM_URL);
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.3;
    bgmRef.current.muted = savedMute;

    popSfxRef.current = new Audio(POP_SFX_URL);
    popSfxRef.current.volume = 0.5;
    popSfxRef.current.muted = savedMute;

    hitSfxRef.current = new Audio(HIT_SFX_URL);
    hitSfxRef.current.volume = 0.4;
    hitSfxRef.current.muted = savedMute;

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      bgmRef.current?.pause();
    };
  }, []);

  // Sync mute state with audio elements
  useEffect(() => {
    if (bgmRef.current) bgmRef.current.muted = isMuted;
    if (popSfxRef.current) popSfxRef.current.muted = isMuted;
    if (hitSfxRef.current) hitSfxRef.current.muted = isMuted;
    localStorage.setItem('bubblePopMuted', String(isMuted));
  }, [isMuted]);

  const toggleMute = () => setIsMuted(prev => !prev);

  const generateBackground = async () => {
    const apiKey = typeof process !== 'undefined' ? process.env?.API_KEY : undefined;
    if (!apiKey) return;

    setIsGeneratingBg(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
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
      console.warn("Background generation skipped or failed.");
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const startTutorial = () => {
    setTutorialStep(0);
    setGameState(prev => ({ ...prev, status: GameStatus.TUTORIAL }));
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

  const resetToMenu = () => {
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    setGameState(prev => ({
      ...prev,
      score: 0,
      lives: INITIAL_LIVES,
      level: 1,
      status: GameStatus.START,
      geminiMessage: ''
    }));
    setBubbles([]);
    setParticles([]);
    setFloatingTexts([]);
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

    const heartChance = gameState.lives === 1 ? 0.10 : 0.04;

    if (rand < heartChance && gameState.lives < MAX_LIVES) {
      type = BubbleType.HEART; color = 'rgba(244, 63, 94, 0.8)'; size = 70; points = 50;
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
        const pCount = b.type === BubbleType.GOLD ? 30 : (b.type === BubbleType.HEART ? 25 : 15);
        const pColor = b.type === BubbleType.HEART ? '#fda4af' : b.color;
        
        const newParticles = Array.from({ length: pCount }).map(() => ({
          id: Math.random(), x: cx, y: cy, vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15, color: pColor, life: 1.0
        }));
        setParticles(p => [...p, ...newParticles]);
        triggerShake(b.type === BubbleType.ARMORED ? 8 : 2);
        
        const floatingTxt = b.type === BubbleType.HEART ? "VIDA +1" : `+${b.points}`;
        const floatingClr = b.type === BubbleType.HEART ? '#f43f5e' : (b.type === BubbleType.GOLD ? '#facc15' : '#fff');
        createFloatingText(cx, cy, floatingTxt, floatingClr);
        
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
      setIsLoadingFeedback(true);
      setTimeout(() => {
        const msg = getLocalFeedback(gameState.score, gameState.level);
        setGameState(s => ({ ...s, geminiMessage: msg }));
        setIsLoadingFeedback(false);
      }, 800);
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

  const TutorialOverlay = () => {
    const steps = [
      {
        title: "¡Bienvenido a Bubble Master!",
        content: "El objetivo es simple: explota todas las burbujas antes de que lleguen a la superficie.",
        type: BubbleType.STANDARD,
        color: COLORS[0],
        icon: "👆"
      },
      {
        title: "Burbujas Especiales",
        content: "Algunas burbujas son más resistentes o rápidas. La burbuja dorada da puntos extra, ¡no la dejes ir!",
        type: BubbleType.GOLD,
        color: "rgba(250, 204, 21, 0.7)",
        icon: "✨"
      },
      {
        title: "Vidas y Salud",
        content: "Pierdes una vida por cada burbuja estándar que se escape. ¡Busca los corazones para recuperarte!",
        type: BubbleType.HEART,
        color: "rgba(244, 63, 94, 0.7)",
        icon: "❤️"
      },
      {
        title: "¿Listo para empezar?",
        content: "A medida que subas de nivel, las burbujas aparecerán más rápido. ¡Buena suerte!",
        type: BubbleType.ARMORED,
        color: "rgba(100, 116, 139, 0.8)",
        icon: "🚀"
      }
    ];

    const current = steps[tutorialStep];

    return (
      <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xl p-6">
        <div className="bg-[#1e293b]/80 border border-white/10 rounded-[3rem] p-8 md:p-12 max-w-lg w-full shadow-2xl flex flex-col items-center text-center animate-fade-in">
          <div className="w-24 h-24 rounded-full mb-6 flex items-center justify-center text-4xl bg-white/5 border border-white/10 shadow-inner relative overflow-hidden">
             <div className="absolute inset-0 opacity-40 animate-pulse" style={{ 
               background: current.type === BubbleType.GOLD ? 'radial-gradient(circle, #facc15, transparent)' : `radial-gradient(circle, ${current.color}, transparent)` 
             }}></div>
             <span className="relative z-10">{current.icon}</span>
          </div>
          
          <h2 className="text-3xl font-black italic mb-4 text-blue-400 uppercase tracking-tight">{current.title}</h2>
          <p className="text-slate-300 text-lg leading-relaxed mb-10">{current.content}</p>
          
          <div className="flex gap-2 mb-8">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i === tutorialStep ? 'bg-blue-500 w-6' : 'bg-white/20'}`}></div>
            ))}
          </div>

          <button 
            onClick={() => {
              if (tutorialStep < steps.length - 1) {
                setTutorialStep(tutorialStep + 1);
              } else {
                startGame();
              }
            }}
            className="w-full py-5 bg-white text-black rounded-2xl font-black text-xl hover:bg-blue-500 hover:text-white transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
          >
            {tutorialStep < steps.length - 1 ? 'CONTINUAR' : '¡A JUGAR!'}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-[#050510] text-white touch-none" style={{ transform: shakeIntensity > 0 ? `translate(${(Math.random()-0.5)*shakeIntensity}px, ${(Math.random()-0.5)*shakeIntensity}px)` : 'none' }}>
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a20] via-[#050510] to-[#000]">
        {gameState.backgroundUrl && (
          <div className="absolute inset-0 bg-cover bg-center animate-fade-in transition-opacity duration-1000 opacity-60" style={{ backgroundImage: `url(${gameState.backgroundUrl})` }} />
        )}
        <div className="absolute inset-0 bg-blue-900/10 mix-blend-overlay"></div>
      </div>

      <div className="absolute top-0 right-0 p-4 z-[60] flex gap-2">
        <button 
          onClick={toggleMute}
          aria-label={isMuted ? "Activar sonido" : "Silenciar sonido"}
          title={isMuted ? "Activar sonido" : "Silenciar"}
          className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 hover:bg-white/20 transition-all active:scale-90 shadow-lg"
        >
          {isMuted ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          )}
        </button>
      </div>

      {(gameState.status === GameStatus.PLAYING || gameState.status === GameStatus.PAUSED) && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
          <div className="bg-white/5 backdrop-blur-md p-4 rounded-3xl border border-white/10 text-center pointer-events-auto">
            <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Score</div>
            <div className="text-4xl font-black">{gameState.score}</div>
          </div>

          <div className="flex flex-col items-end gap-3 pointer-events-auto mr-12 md:mr-0">
            <div className="flex items-center gap-3">
              <button 
                onClick={gameState.status === GameStatus.PLAYING ? pauseGame : resumeGame}
                aria-label={gameState.status === GameStatus.PLAYING ? "Pausar juego" : "Reanudar juego"}
                title={gameState.status === GameStatus.PLAYING ? "Pausa" : "Reanudar"}
                className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 hover:bg-white/20 transition-all active:scale-90 pointer-events-auto shadow-lg"
              >
                {gameState.status === GameStatus.PLAYING ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
              
              <button 
                onClick={startGame}
                aria-label="Reiniciar partida"
                title="Reiniciar"
                className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 hover:bg-white/20 transition-all active:scale-90 pointer-events-auto shadow-lg"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              </button>

              <button 
                onClick={resetToMenu}
                aria-label="Restablecer todo al estado inicial"
                title="Restablecer"
                className="bg-red-500/10 backdrop-blur-md p-3 rounded-2xl border border-red-500/20 hover:bg-red-500/30 transition-all active:scale-90 pointer-events-auto shadow-lg group"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 group-hover:text-red-300"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
              </button>

              <div className="flex gap-2 bg-black/40 p-2 rounded-full border border-white/10 shadow-inner">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${i < gameState.lives ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]' : 'bg-white/5'}`} />
                ))}
              </div>
            </div>
            <div className="bg-blue-500 px-4 py-1 rounded-full text-[10px] font-black italic shadow-lg">LEVEL {gameState.level}</div>
          </div>
        </div>
      )}

      <div className="relative w-full h-full z-10">
        {bubbles.map(b => (
          <div 
            key={b.id} 
            onPointerDown={() => handlePop(b.id)} 
            className={`absolute rounded-full cursor-pointer transition-transform active:scale-125 ${b.type === BubbleType.HEART ? 'animate-pulse-heart' : ''}`} 
            style={{ 
              left: b.x, 
              top: b.y, 
              width: b.size, 
              height: b.size, 
              background: b.type === BubbleType.GOLD ? 'radial-gradient(circle at 30% 30%, #fff, #facc15 60%, #a16207)' : 
                         b.type === BubbleType.HEART ? 'radial-gradient(circle at 30% 30%, #fff, #f43f5e 60%, #9f1239)' : 
                         `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), ${b.color} 70%)`, 
              boxShadow: b.type === BubbleType.GOLD ? '0 0 25px rgba(250,204,21,0.5)' : 
                        b.type === BubbleType.HEART ? '0 0 20px rgba(244,63,94,0.4)' : 
                        'inset 0 0 10px rgba(255,255,255,0.3)', 
              border: b.type === BubbleType.ARMORED ? '3px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.2)' 
            }}
          >
            <div className="absolute top-[15%] left-[15%] w-[20%] h-[20%] bg-white/40 rounded-full blur-[1px]"></div>
            {b.type === BubbleType.ARMORED && b.health > 1 && <div className="absolute inset-0 flex items-center justify-center font-black text-white/40">{b.health}</div>}
            {b.type === BubbleType.HEART && <div className="absolute inset-0 flex items-center justify-center text-2xl drop-shadow-lg">❤️</div>}
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
              {[{t:'Standard', d:'1 Tap'}, {t:'Armored', d:'3 Taps'}, {t:'Speedy', d:'Fast'}, {t:'Heart', d:'+1 Vida'}].map((x,i) => (
                <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center">
                  <div className="text-blue-400 text-[10px] font-black uppercase mb-1">{x.t}</div>
                  <div className="text-slate-400 text-[10px]">{x.d}</div>
                </div>
              ))}
            </div>
            <button 
              onClick={startTutorial} 
              aria-label="Comenzar juego"
              className="px-16 py-6 bg-white text-black rounded-full font-black text-3xl hover:scale-105 active:scale-95 transition-all shadow-2xl hover:bg-blue-500 hover:text-white"
            >
              JUGAR AHORA
            </button>
          </div>
          <Footer />
        </div>
      )}

      {gameState.status === GameStatus.TUTORIAL && <TutorialOverlay />}

      {gameState.status === GameStatus.PAUSED && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 backdrop-blur-md p-8">
          <div className="bg-[#0f172a]/80 backdrop-blur-2xl p-10 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col items-center max-w-xs w-full">
            <h2 className="text-4xl font-black italic mb-8 tracking-tighter">PAUSA</h2>
            <div className="flex flex-col gap-4 w-full">
              <button 
                onClick={resumeGame}
                aria-label="Reanudar el juego"
                className="w-full py-5 bg-white text-black rounded-2xl font-black text-xl hover:bg-blue-500 hover:text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                REANUDAR
              </button>
              <button 
                onClick={startGame}
                aria-label="Reiniciar la partida actual"
                className="w-full py-4 bg-white/10 border border-white/10 rounded-2xl font-bold text-lg hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                REINICIAR
              </button>
              <button 
                onClick={resetToMenu}
                aria-label="Restablecer el juego por completo"
                className="w-full py-4 bg-red-600/20 border border-red-500/30 text-red-400 rounded-2xl font-black text-lg hover:bg-red-500 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                RESET TOTAL
              </button>
              <button 
                onClick={() => setGameState(s => ({ ...s, status: GameStatus.START }))}
                aria-label="Volver al menú principal"
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
              {isLoadingFeedback ? <div className="animate-pulse py-4 font-bold text-blue-300 uppercase tracking-tighter">Analizando...</div> : <p className="text-xl font-bold italic">"{gameState.geminiMessage}"</p>}
            </div>
            <div className="flex flex-col gap-4 w-full max-w-xs">
              <button 
                onClick={startGame} 
                aria-label="Jugar de nuevo"
                className="w-full py-5 bg-blue-600 rounded-2xl font-black text-xl hover:bg-blue-500 transition-all shadow-xl flex items-center justify-center gap-2"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                REINTENTAR
              </button>
              <button 
                onClick={resetToMenu} 
                className="py-2 text-red-500 hover:text-red-400 uppercase text-xs tracking-widest font-bold"
              >
                Restablecer Todo
              </button>
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
