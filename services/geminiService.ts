
import { GoogleGenAI } from "@google/genai";

/**
 * getGeminiFeedback uses Gemini 3 Flash to provide motivational feedback
 * based on the user's score and level.
 */
export const getGeminiFeedback = async (score: number, level: number): Promise<string> => {
  try {
    // Initialize GoogleGenAI with the API key from environment variables
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `El jugador ha terminado una partida del juego 'Bubble Pop Master'.
      Puntuación final: ${score}
      Nivel alcanzado: ${level}
      Provee un mensaje corto (máximo 15 palabras), divertido y motivador en español sobre su desempeño. 
      Usa un tono épico o sarcástico dependiendo de si la puntuación es alta o baja.`,
      config: {
        temperature: 0.8,
        topP: 0.9,
      }
    });
    // Access response.text property directly (not a method)
    return response.text || "¡Buen intento! Sigue explotando burbujas.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "¡Increíble partida! ¿Listo para otra?";
  }
};
