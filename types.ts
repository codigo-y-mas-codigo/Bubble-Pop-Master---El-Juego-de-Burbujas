
export enum BubbleType {
  STANDARD = 'STANDARD',
  SPEEDY = 'SPEEDY',
  ARMORED = 'ARMORED',
  HEART = 'HEART',
  GOLD = 'GOLD'
}

export interface BubbleData {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  color: string;
  points: number;
  isPopping: boolean;
  type: BubbleType;
  health: number;
  maxHealth: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export enum GameStatus {
  START = 'START',
  PLAYING = 'PLAYING',
  GAMEOVER = 'GAMEOVER'
}

export interface GameState {
  score: number;
  lives: number;
  level: number;
  status: GameStatus;
  geminiMessage: string;
}
