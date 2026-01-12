
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
  
  const gameLoopRef = useRef<number>();
  const lastSpawnRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const popSfxRef = useRef<HTMLAudioElement | null>(null);
  const hitSfxRef = useRef<HTMLAudioElement | null>(null);

  // Cargar récord histórico al iniciar
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
        triggerShake(bubble.type === BubbleType.ARMORED ? 8 : bubble.type === BubbleType.GOLD ? 5 : 2);
        
        let bonusText = `+${bubble.points}`;
        let textColor = bubble.type === BubbleType.GOLD ? '#facc15' : bubble.type === BubbleType.HEART ? '#f43f5e' : '#ffffff';
        
        if (bubble.type === BubbleType.HEART) bonusText = "VIDA +1";
        createFloatingText(centerX, centerY, bonusText, textColor);

        setGameState(s => {
          let extraLives = 0;
          if (bubble.type === BubbleType.HEART) extraLives = 1;
          const newScore = s.score + bubble.points;
          
          return { 
            ...s, 
            score: newScore,
            level: Math.floor(newScore / 1200) + 1,
            lives: Math.min(MAX_LIVES, s.lives + extraLives)
          };
        });

        return prev.filter(b => b.id !== id);
      } else {
        if (hitSfxRef.current) {
          hitSfxRef.current.currentTime = 0;
          hitSfxRef.current.play().catch(() => {});
        }
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
          vy: p.vy + 0.1,
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
      
      // Actualizar récord
      if (gameState.score > gameState.highScore) {
        localStorage.setItem('bubblePopHighScore', gameState.score.toString());
        setGameState(prev => ({ ...prev, highScore: gameState.score }));
      }

      setIsLoading(true);
      getGeminiFeedback(gameState.score, gameState.level).then(msg => {
        setGameState(s => ({ ...s, geminiMessage: msg }));
        setIsLoading(false);
      });
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState.status, gameLoop, gameState.score, gameState.highScore]);

  // Componente Footer Reutilizable
  const Footer = () => (
    <footer className="mt-auto py-6 w-full flex flex-col items-center gap-2 z-[70]">
      <div className="flex items-center gap-4 text-slate-400 text-xs font-medium uppercase tracking-[0.2em]">
        <a 
          href="https://github.com/codigo-y-mas-codigo/Bubble-Pop-Master---El-Juego-de-Burbujas" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:text-white transition-colors flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          Repositorio
        </a>
        <span className="opacity-30">•</span>
        <a 
          href="https://luisangelmacielp.vercel.app/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:text-blue-400 transition-colors flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/10"
        >
          Desarrollado por <span className="text-white font-bold">Luis Angel Maciel</span>
        </a>
      </div>
    </footer>
  );

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-black text-white font-sans touch-none transition-transform duration-75"
      style={{
        transform: shakeIntensity > 0 ? `translate(${(Math.random() - 0.5) * shakeIntensity}px, ${(Math.random() - 0.5) * shakeIntensity}px)` : 'none'
      }}
    >
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        {gameState.backgroundUrl ? (
          <div 
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
            style={{ backgroundImage: `url(${gameState.backgroundUrl})` }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"></div>
          </div>
        ) : (
          <div className="absolute inset-0 bg-[#0a0a1a] overflow-hidden">
             <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
             <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[150px] animate-pulse delay-700"></div>
          </div>
        )}
      </div>

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

      {/* HUD de Juego Activo */}
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

      {/* Entidades del Juego */}
      <div className="relative w-full h-full z-10">
        {bubbles.map(bubble => (
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
              {bubble.type === BubbleType.GOLD && <span className="text-2xl animate-bounce">✨</span>}
            </div>
          </div>
        ))}

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
              filter: 'blur(1px)'
            }}
          />
        ))}

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
            }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Pantalla de Inicio / Landing Page */}
      {gameState.status === GameStatus.START && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-between p-6 bg-slate-950/40 backdrop-blur-lg overflow-y-auto">
          {isGeneratingBg ? (
            <div className="m-auto text-center">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <p className="text-blue-300 font-bold tracking-widest animate-pulse">CREANDO MUNDO SUBMARINO...</p>
            </div>
          ) : (
            <>
              <div className="w-full max-w-4xl flex flex-col items-center mt-auto mb-auto py-12">
                <div className="text-center mb-12">
                  <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-blue-500 drop-shadow-[0_10px_40px_rgba(59,130,246,0.6)]">
                    BUBBLE<br/>MASTER
                  </h1>
                  <div className="inline-block mt-4 bg-yellow-400 text-black px-4 py-1 rounded-full text-sm font-black tracking-widest shadow-xl">
                    {gameState.highScore > 0 ? `HIGH SCORE: ${gameState.highScore}` : 'NUEVO JUEGO'}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12">
                  {[
                    { type: 'Standard', desc: '1 toque, 100 pts', color: 'blue-400' },
                    { type: 'Armored', desc: '3 toques, 400 pts', color: 'amber-400' },
                    { type: 'Speedy', desc: 'Rápida, 250 pts', color: 'sky-400' },
                    { type: 'Heart', desc: 'Extra Vida', color: 'rose-400' }
                  ].map((item, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-3xl backdrop-blur-md hover:bg-white/10 transition-colors text-center">
                      <p className={`text-${item.color} text-xs font-black uppercase mb-1`}>{item.type}</p>
                      <p className="text-slate-400 text-[10px] leading-tight">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={startGame}
                  className="relative px-20 py-6 bg-white text-black rounded-full font-black text-2xl md:text-3xl hover:bg-blue-500 hover:text-white transition-all hover:scale-105 active:scale-95 shadow-[0_20px_60px_rgba(59,130,246,0.4)]"
                >
                  EXPLOTAR BURBUJAS
                </button>
                
                <p className="mt-8 text-slate-500 text-xs font-medium uppercase tracking-[0.3em]">Toca la pantalla para jugar</p>
              </div>

              <Footer />
            </>
          )}
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.status === GameStatus.GAMEOVER && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-between bg-black/90 backdrop-blur-2xl p-8 text-center overflow-y-auto">
          <div className="w-full flex flex-col items-center mt-auto mb-auto py-8">
            <div className="mb-10">
              <h2 className="text-red-500 text-sm font-black tracking-[0.5em] uppercase mb-4">Fin de la Partida</h2>
              <p className="text-8xl md:text-9xl font-black text-white">{gameState.score}</p>
              <p className="text-slate-500 text-xs mt-2">PUNTUACIÓN FINAL</p>
            </div>

            <div className="w-full max-w-sm bg-white/5 border border-white/10 p-6 rounded-[2.5rem] mb-12 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-3">Mensaje de Gemini</p>
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce mx-1"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce mx-1 delay-75"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce mx-1 delay-150"></div>
                </div>
              ) : (
                <p className="text-lg font-bold italic text-white/90">"{gameState.geminiMessage}"</p>
              )}
            </div>

            <div className="flex flex-col gap-4 w-full max-w-xs">
              <button 
                onClick={startGame}
                className="w-full py-5 bg-blue-600 rounded-2xl font-black text-xl hover:bg-blue-500 transition-all hover:scale-105 shadow-lg"
              >
                REINTENTAR
              </button>
              <button 
                onClick={() => setGameState(s => ({ ...s, status: GameStatus.START }))}
                className="py-3 text-slate-500 font-bold hover:text-white uppercase text-xs tracking-widest"
              >
                VOLVER AL INICIO
              </button>
            </div>
          </div>

          <Footer />
        </div>
      )}
    </div>
  );
};

export default App;
