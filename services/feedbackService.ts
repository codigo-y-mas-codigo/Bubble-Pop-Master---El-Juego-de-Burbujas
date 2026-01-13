
/**
 * Servicio de feedback local para Bubble Master.
 * Proporciona mensajes motivadores basados en el desempeño del jugador.
 */

const FEEDBACK_MESSAGES = {
  LOW: [
    "¡Ánimo! El océano es grande, sigue practicando.",
    "Unas pocas burbujas se escaparon, ¡pero la próxima será mejor!",
    "Calentando motores... ¡Inténtalo de nuevo!",
    "¡No te rindas! Cada burbuja cuenta."
  ],
  MEDIUM: [
    "¡Buen ritmo! Estás empezando a dominar las corrientes.",
    "¡Nada mal! Tus reflejos están mejorando notablemente.",
    "¡Sigue así! Estás cerca de convertirte en un experto.",
    "¡Excelente esfuerzo! El puntaje sube como la espuma."
  ],
  HIGH: [
    "¡Increíble! Eres un verdadero cazador de burbujas.",
    "¡Wow! Tus dedos se mueven más rápido que la luz.",
    "¡Impresionante! Has dejado el océano impecable.",
    "¡Dominio total! Estás en la zona."
  ],
  EPIC: [
    "¡LEGENDARIO! Las burbujas te temen. Eres el Bubble Master.",
    "¡Récord absoluto! Has alcanzado la maestría suprema.",
    "¡Simplemente perfecto! Eres una leyenda del pop.",
    "¡Dios de las burbujas! Tu nombre será recordado."
  ]
};

export const getLocalFeedback = (score: number, level: number): string => {
  let category: keyof typeof FEEDBACK_MESSAGES = 'LOW';

  if (score > 10000) category = 'EPIC';
  else if (score > 5000) category = 'HIGH';
  else if (score > 1500) category = 'MEDIUM';

  const messages = FEEDBACK_MESSAGES[category];
  const randomIndex = Math.floor(Math.random() * messages.length);
  
  return messages[randomIndex];
};
