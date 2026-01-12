
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BubbleData, GameStatus, GameState, Particle, BubbleType, FloatingText } from './types';
import { getGeminiFeedback } from './services/geminiService';
import { GoogleGenAI } from "@google/genai";

const COLORS = [
  'rgba(147, 197, 253, 0.5)', // Blue
  'rgba(249, 168, 212, 0.5)', // Pink
  'rgba(167, 243, 208, 0.5)', // Green
  'rgba(253, 230, 138, 0.5)', // Yellow
  'rgba(196, 181, 253, 0.5)', // Purple
];

const INITIAL_LIVES = 3;
const MAX_LIVES = 5;
const SPAWN_INTERVAL = 800;

const BGM_URL = 'https://cdn.pixabay.com/audio/2022/01/21/audio_1919830504.mp3';
const POP_SFX_URL = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';
const HIT_SFX_URL = 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState & { backgroundUrl?: string }>({
    score: 0,
    lives: INITIAL_LIVES,
    level: 1,
    status: GameStatus.START,
    geminiMessage: '',
    backgroundUrl: ''
  });

  const [bubbles, setBubbles] = useState<BubbleData[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const gameLoopRef = useRef<number>();
  const lastSpawnRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const popSfxRef = useRef<HTMLAudioElement | null>(null);
  const hitSfxRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    bgmRef.current = new Audio(BGM_URL);
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.3;

    popSfxRef.current = new Audio(POP_SFX_URL);
    popSfxRef.current.volume = 0.5;

    hitSfxRef.current = new Audio(HIT_SFX_URL);
    hitSfxRef.current.volume = 0.4;

    return () => {
      bgmRef.current?.pause();
      bgmRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (bgmRef.current) bgmRef.current.muted = isMuted;
    if (popSfxRef.current) popSfxRef.current.muted = isMuted;
    if (hitSfxRef.current) hitSfxRef.current.muted = isMuted;
  }, [isMuted]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const triggerShake = (intensity: number) => {
    setShakeIntensity(intensity);
    setTimeout(() => setShakeIntensity(0), 200);
  };

  const createFloatingText = (x: number, y: number, text: string, color: string) => {
    const newText: FloatingText = {
      id: Date.now() + Math.random(),
      x,
      y,
      text,
      color,
      life: 1.0
    };
    setFloatingTexts(prev => [...prev, newText]);
  };

  const generateBackground = async () => {
    setIsGeneratingBg(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: "A breathtaking, immersive underwater bioluminescent coral reef scene, magical atmosphere, vibrant neon colors, cinematic lighting, 4k resolution, artistic style, high detail" }]
        },
        config: {
          imageConfig: { aspectRatio: "9:16" }
        }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64 = part.inlineData.data;
          setGameState(prev => ({ ...prev, backgroundUrl: `data:image/png;base64,${base64}` }));
          break;
        }
      }
    } catch (error) {
      console.error("Error generating background:", error);
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const startGame = async () => {
    bgmRef.current?.play().catch(e => console.log("Audio play blocked", e));

    if (!gameState.backgroundUrl) {
      await generateBackground();
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
  };

  const createBubble = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    
    const rand = Math.random();
    let type = BubbleType.STANDARD;
    let size = Math.random() * 40 + 50;
    let health = 1;
    let speedMult = 1;
    let color = COLORS[Math.floor(Math.random() * COLORS.length)];
    let points = 100;

    if (rand < 0.05 && gameState.lives < MAX_LIVES) {
      type = BubbleType.HEART;
      color = 'rgba(244, 63, 94, 0.7)';
      size = 60;
    } else if (rand < 0.12) {
      type = BubbleType.GOLD;
      color = 'rgba(250, 204, 21, 0.7)';
      size = 50;
      points = 500;
    } else if (rand < 0.25) {
      type = BubbleType.SPEEDY;
      color = 'rgba(56, 189, 248, 0.7)';
      size = 40;
      speedMult = 2.5;
      points = 250;
    } else if (rand < 0.40) {
      type = BubbleType.ARMORED;
      color = 'rgba(100, 116, 139, 0.8)';
      size = 80;
      health = 3;
      speedMult = 0.6;
      points = 400;
    }

    const newBubble: BubbleData = {
      id: Date.now() + Math.random(),
      x: Math.random() * (clientWidth - size),
      y: clientHeight + size,
      size,
      speed: (Math.random() * 2 + 1.2) * (1 + gameState.level * 0.1) * speedMult,
      color,
      points,
      isPopping: false,
      type,
      health,
      maxHealth: health
    };
    setBubbles(prev => [...prev, newBubble]);
  }, [gameState.level, gameState.lives]);

  const createParticles = (x: number, y: number, color: string, count: number = 12) => {
    const newParticles: Particle[] = Array.from({ length: count }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10 + 5;
      return {
        id: Math.random(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 1.0
      };
    });
    setParticles(prev => [...prev, ...newParticles]);
  };

  const handlePop = (id: number) => {
    if (gameState.status !== GameStatus.PLAYING) return;
    
    setBubbles(prev => {
      const bubbleIndex = prev.findIndex(b => b.id === id);
      if (bubbleIndex === -1) return prev;
      
      const bubble = prev[bubbleIndex];
      const newHealth = bubble.health - 1;
      const centerX = bubble.x + bubble.size / 2;
      const centerY = bubble.y + bubble.size / 2;

      if (newHealth <= 0) {
        if (popSfxRef.current) {
          popSfxRef.current.currentTime = 0;
          popSfxRef.current.play().catch(() => {});
        }

        const particleCount = bubble.type === BubbleType.GOLD ? 30 : bubble.type === BubbleType.ARMORED ? 20 : 15;
        createParticles(centerX, centerY, bubble.color, particleCount);
        
        // Visual effects for popping
        triggerShake(bubble.type === BubbleType.ARMORED ? 8 : bubble.type === BubbleType.GOLD ? 5 : 2);
        
        let bonusText = `+${bubble.points}`;
        let textColor = bubble.type === BubbleType.GOLD ? '#facc15' : bubble.type === BubbleType.HEART ? '#f43f5e' : '#ffffff';
        
        if (bubble.type === BubbleType.HEART) bonusText = "VIDA +1";
        createFloatingText(centerX, centerY, bonusText, textColor);

        setGameState(s => {
          let extraLives = 0;
          if (bubble.type === BubbleType.HEART) extraLives = 1;
          
          return { 
            ...s, 
            score: s.score + bubble.points,
            level: Math.floor((s.score + bubble.points) / 1200) + 1,
            lives: Math.min(MAX_LIVES, s.lives + extraLives)
          };
        });

        return prev.filter(b => b.id !== id);
      } else {
        if (hitSfxRef.current) {
          hitSfxRef.current.currentTime = 0;
          hitSfxRef.current.play().catch(() => {});
        }
        // Hit effect
        createParticles(centerX, centerY, 'rgba(255,255,255,0.7)', 6);
        triggerShake(2);
        
        const nextBubbles = [...prev];
        nextBubbles[bubbleIndex] = { ...bubble, health: newHealth };
        return nextBubbles;
      }
    });
  };

  const gameLoop = useCallback((time: number) => {
    if (gameState.status !== GameStatus.PLAYING) return;

    const currentInterval = Math.max(120, SPAWN_INTERVAL - (gameState.level * 45));
    if (time - lastSpawnRef.current > currentInterval) {
      createBubble();
      lastSpawnRef.current = time;
    }

    setBubbles(prev => {
      const updated = prev.map(b => ({ ...b, y: b.y - b.speed }));
      const missed = updated.filter(b => b.y < -b.size);
      if (missed.length > 0) {
        setGameState(s => {
          const livesToSubtract = missed.filter(m => m.type !== BubbleType.HEART && m.type !== BubbleType.GOLD).length;
          const newLives = s.lives - livesToSubtract;
          if (livesToSubtract > 0) triggerShake(15);
          if (newLives <= 0) return { ...s, lives: 0, status: GameStatus.GAMEOVER };
          return { ...s, lives: Math.max(0, newLives) };
        });
      }
      return updated.filter(b => b.y >= -b.size);
    });

    setParticles(prev => 
      prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.1, // Slight gravity
          life: p.life - 0.02
        }))
        .filter(p => p.life > 0)
    );

    setFloatingTexts(prev =>
      prev
        .map(t => ({
          ...t,
          y: t.y - 1.5,
          life: t.life - 0.015
        }))
        .filter(t => t.life > 0)
    );

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameState.status, gameState.level, createBubble]);

  useEffect(() => {
    if (gameState.status === GameStatus.PLAYING) {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    } else if (gameState.status === GameStatus.GAMEOVER) {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      setIsLoading(true);
      getGeminiFeedback(gameState.score, gameState.level).then(msg => {
        setGameState(s => ({ ...s, geminiMessage: msg }));
        setIsLoading(false);
      });
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState.status, gameLoop]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-black text-white font-sans touch-none transition-transform duration-75"
      style={{
        transform: shakeIntensity > 0 ? `translate(${(Math.random() - 0.5) * shakeIntensity}px, ${(Math.random() - 0.5) * shakeIntensity}px)` : 'none'
      }}
    >
      {/* Background */}
      {gameState.backgroundUrl ? (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{ backgroundImage: `url(${gameState.backgroundUrl})` }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"></div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-slate-900 overflow-hidden">
           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] animate-pulse"></div>
           <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[150px] animate-pulse delay-700"></div>
        </div>
      )}

      {/* Control Sonido */}
      <button 
        onClick={toggleMute}
        className="absolute top-6 right-6 z-50 p-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 hover:bg-white/20 transition-all active:scale-90"
      >
        {isMuted ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        )}
      </button>

      {/* HUD */}
      {gameState.status === GameStatus.PLAYING && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-10 pointer-events-none">
          <div className="bg-white/10 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/20 shadow-2xl">
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300 font-bold mb-1 text-center">Score</p>
            <p className="text-4xl font-black text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]">{gameState.score}</p>
          </div>
          <div className="flex flex-col items-end gap-3 pr-12">
            <div className="flex gap-2 bg-black/20 backdrop-blur-md p-2 rounded-full border border-white/10">
              {Array.from({ length: MAX_LIVES }).map((_, i) => (
                <div 
                  key={i} 
                  className={`w-5 h-5 rounded-full transition-all duration-500 shadow-lg ${i < gameState.lives ? 'bg-gradient-to-tr from-red-500 to-pink-400 scale-100' : 'bg-slate-800 scale-75 opacity-20'}`}
                />
              ))}
            </div>
            <div className="bg-blue-600/80 backdrop-blur-md px-5 py-1.5 rounded-full border border-white/20 shadow-lg">
              <p className="text-xs font-black tracking-widest uppercase italic">Level {gameState.level}</p>
            </div>
          </div>
        </div>
      )}

      {/* Bubbles */}
      <div className="relative w-full h-full">
        {bubbles.map(bubble => {
          return (
            <div
              key={bubble.id}
              onPointerDown={() => handlePop(bubble.id)}
              className={`absolute rounded-full cursor-pointer group active:scale-110 transition-all duration-75 ${bubble.type === BubbleType.GOLD ? 'animate-pulse' : ''}`}
              style={{
                left: bubble.x,
                top: bubble.y,
                width: bubble.size,
                height: bubble.size,
                background: bubble.type === BubbleType.GOLD 
                  ? `radial-gradient(circle at 30% 30%, #fff 0%, #facc15 60%, #a16207 100%)`
                  : `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, ${bubble.color} 70%, rgba(0,0,0,0.2) 100%)`,
                boxShadow: bubble.type === BubbleType.GOLD 
                  ? '0 0 30px rgba(250, 204, 21, 0.6)' 
                  : `0 0 20px rgba(255,255,255,0.1), inset 0 0 15px rgba(255,255,255,0.2)`,
                border: bubble.type === BubbleType.ARMORED 
                  ? `${4 * (bubble.health / bubble.maxHealth)}px solid rgba(255,255,255,0.6)` 
                  : '1px solid rgba(255,255,255,0.3)',
                filter: bubble.type === BubbleType.SPEEDY ? 'skewX(-10deg)' : 'none'
              }}
            >
              <div className="absolute top-[15%] left-[15%] w-[25%] h-[25%] bg-white/40 rounded-full blur-[1px]"></div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
                {bubble.type === BubbleType.HEART && <span className="text-2xl drop-shadow-lg">❤️</span>}
                {bubble.type === BubbleType.ARMORED && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: bubble.maxHealth }).map((_, i) => (
                      <div key={i} className={`w-2 h-2 rounded-full ${i < bubble.health ? 'bg-white shadow-sm' : 'bg-black/40'}`} />
                    ))}
                  </div>
                )}
                {bubble.type === BubbleType.SPEEDY && <span className="text-xl italic font-black text-white/40">>></span>}
                {bubble.type === BubbleType.GOLD && <span className="text-2xl animate-bounce">✨</span>}
              </div>
            </div>
          );
        })}

        {/* Partículas */}
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              width: 10 * p.life,
              height: 10 * p.life,
              background: p.color,
              opacity: p.life,
              boxShadow: `0 0 ${15 * p.life}px ${p.color}`,
              filter: 'blur(1px)'
            }}
          />
        ))}

        {/* Floating Text */}
        {floatingTexts.map(t => (
          <div
            key={t.id}
            className="absolute pointer-events-none font-black text-xl italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
            style={{
              left: t.x,
              top: t.y,
              color: t.color,
              opacity: t.life,
              transform: `scale(${1 + (1 - t.life) * 0.5}) translateY(${(1 - t.life) * -20}px)`,
              whiteSpace: 'nowrap'
            }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Overlays */}
      {(gameState.status === GameStatus.START || isGeneratingBg) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-2xl z-50 p-8 text-center">
          {isGeneratingBg ? (
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
              <p className="text-xl font-bold text-blue-300 animate-pulse tracking-widest uppercase">Generando Escenario...</p>
            </div>
          ) : (
            <>
              <div className="relative mb-8">
                <h1 className="text-7xl font-black italic tracking-tighter bg-gradient-to-b from-white to-blue-400 bg-clip-text text-transparent drop-shadow-[0_10px_30px_rgba(59,130,246,0.5)]">
                  BUBBLE<br/>MASTER
                </h1>
                <div className="absolute -top-4 -right-4 bg-yellow-400 text-black px-3 py-1 rounded-lg text-xs font-black rotate-12 shadow-xl">EXTRA VISUALS</div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-10 text-left max-w-sm">
                 <div className="bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                   <p className="text-xs text-blue-300 font-bold uppercase mb-1">Standard</p>
                   <p className="text-[10px] text-slate-400">Normal, 1 toque.</p>
                 </div>
                 <div className="bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                   <p className="text-xs text-amber-300 font-bold uppercase mb-1">Armored</p>
                   <p className="text-[10px] text-slate-400">Pesada, 3 toques.</p>
                 </div>
                 <div className="bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                   <p className="text-xs text-sky-400 font-bold uppercase mb-1">Speedy</p>
                   <p className="text-[10px] text-slate-400">Muy rápida, bonus pts.</p>
                 </div>
                 <div className="bg-white/5 p-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                   <p className="text-xs text-pink-400 font-bold uppercase mb-1">Heart</p>
                   <p className="text-[10px] text-slate-400">Rara, +1 vida.</p>
                 </div>
              </div>
              <button 
                onClick={startGame}
                className="group relative px-16 py-6 bg-white text-black rounded-full font-black text-2xl hover:bg-blue-500 hover:text-white transition-all hover:scale-105 active:scale-95 shadow-[0_20px_50px_rgba(255,255,255,0.2)]"
              >
                EMPEZAR AVENTURA
              </button>
            </>
          )}
        </div>
      )}

      {gameState.status === GameStatus.GAMEOVER && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-3xl z-50 p-8 text-center">
          <h2 className="text-2xl font-black mb-2 text-red-500 uppercase tracking-[0.3em]">Misión Fallida</h2>
          <div className="my-10">
            <p className="text-slate-400 uppercase tracking-widest text-xs mb-2">Puntuación Final</p>
            <p className="text-8xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">{gameState.score}</p>
          </div>

          <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 mb-12 max-w-sm w-full relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
            <p className="text-[10px] text-blue-400 font-black uppercase mb-4 tracking-[0.2em]">Resumen de la IA</p>
            {isLoading ? (
              <div className="flex gap-2 justify-center py-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-3 h-3 bg-blue-500 rounded-full animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }}></div>
                ))}
              </div>
            ) : (
              <p className="text-xl font-medium leading-tight text-white/90 italic">"{gameState.geminiMessage}"</p>
            )}
          </div>

          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button 
              onClick={startGame}
              className="w-full py-5 bg-blue-600 rounded-2xl font-black text-xl hover:bg-blue-500 transition-all hover:scale-105 active:scale-95 shadow-xl"
            >
              INTENTAR DE NUEVO
            </button>
            <button 
              onClick={() => setGameState(s => ({ ...s, status: GameStatus.START }))}
              className="py-3 text-slate-500 font-bold hover:text-white transition-colors uppercase text-xs tracking-widest"
            >
              Menu Principal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
