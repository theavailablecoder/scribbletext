import { GoogleGenAI } from "@google/genai";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// API Key Management
const API_KEYS = [
  import.meta.env.VITE_API_KEY_1,
  import.meta.env.VITE_API_KEY_2,
  import.meta.env.VITE_API_KEY_3,
  import.meta.env.VITE_API_KEY_4,
].filter(key => key && key.trim() !== ''); // Filter out empty keys

let currentKeyIndex = parseInt(import.meta.env.VITE_STARTING_KEY || '1') - 1;

export interface Suggestion {
  text: string;
  usage_count: number;
  is_manual: boolean;
}

export interface RecognitionResult {
  recognizedText: string;
  suggestions: Suggestion[];
}

export interface CreditsInfo {
  used: number;
  remaining: number;
  limit: number;
  date: string;
  percentage_used: number;
}

export interface KeyStatus {
  currentKey: number;
  totalKeys: number;
  allKeysExhausted: boolean;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private exhaustedKeys: Set<number> = new Set();

  constructor() {
    this.initializeAI();
  }

  private initializeAI() {
    const apiKey = API_KEYS[currentKeyIndex] || import.meta.env.VITE_API_KEY_1;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Rotate to the next available API key
   * Returns true if successful, false if all keys exhausted
   */
  private rotateToNextKey(): boolean {
    // Mark current key as exhausted
    this.exhaustedKeys.add(currentKeyIndex);
    
    // Try to find next available key
    for (let i = 0; i < API_KEYS.length; i++) {
      const nextIndex = (currentKeyIndex + 1 + i) % API_KEYS.length;
      if (!this.exhaustedKeys.has(nextIndex)) {
        currentKeyIndex = nextIndex;
        this.initializeAI();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get current key status
   */
  getKeyStatus(): KeyStatus {
    return {
      currentKey: currentKeyIndex + 1,
      totalKeys: API_KEYS.length,
      allKeysExhausted: this.exhaustedKeys.size >= API_KEYS.length
    };
  }

  /**
   * Reset exhausted keys (call at midnight or manually)
   */
  resetExhaustedKeys() {
    this.exhaustedKeys.clear();
    currentKeyIndex = 0;
    this.initializeAI();
  }

  /**
   * Helper: Add timeout to any promise
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Get suggestions for a recognized text
   */
  async getSuggestions(recognizedText: string): Promise<Suggestion[]> {
    try {
      const response = await this.withTimeout(
        fetch(`${BACKEND_URL}/text/suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recognizedText }),
        }),
        5000,
        "Suggestions API timed out"
      );
      const data = await response.json();
      return data.suggestions || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Save recognized text and get suggestions
   */
  private async saveAndGetSuggestions(recognizedText: string): Promise<Suggestion[]> {
    try {
      const response = await this.withTimeout(
        fetch(`${BACKEND_URL}/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recognizedText }),
        }),
        5000,
        "Save API timed out"
      );
      const data = await response.json();
      return data.suggestions || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    const msg = error?.message?.toLowerCase() || '';
    return msg.includes('429') || 
           msg.includes('quota') || 
           msg.includes('rate limit') || 
           msg.includes('exhausted');
  }

  /**
   * Recognize handwriting and return text with suggestions
   */
  async recognizeHandwriting(base64Image: string): Promise<RecognitionResult> {
    // Check if all keys are exhausted before trying
    if (this.exhaustedKeys.size >= API_KEYS.length) {
      throw new Error("All API keys exhausted! Try again tomorrow.");
    }

    try {
      
      const response = await this.withTimeout(
        this.ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64Image.split(",")[1],
                },
              },
              {
                text: `TRANSCRIPTION TASK: Hyper-literal Devanagari conversion. Focus on visual geometry over dictionary spelling.

GOAL: Convert the user's hand-drawn strokes into the exact digital equivalent. Do not add vertical lines or extra characters that the user didn't draw.

STRICT RULES:
1. HALF-FORMS (e.g., half-Sa): 
   - If the user draws a letter WITHOUT its vertical bar (Pai), you MUST return the sequence: [Consonant + Halant (्) + ZWJ (U+200D)].
   - Example: A half-Sa (स्) drawn without a vertical line should be 'स' + '्' + ZWJ.
   - This prevents the digital font from adding a vertical line and hides the diagonal tail.

2. BOOK-STYLE HALANT RULE:
   - If a consonant with halant is visually separate from the following consonant (drawn as separate shapes), you MUST prevent ligature formation by outputting: [Consonant + Halant + ZWJ + Next Consonant].
   - Example: For विश्व where श् and व are drawn separately:
     * Correct output: व + ि + श + ् + ZWJ + व
     * DO NOT collapse into: श्व or विश्व (without ZWJ)
   - This rule overrides Unicode normalization and applies to ALL cases (श्व, क्य, त्र, स्त, etc.) where halant-consonants are visually distinct.
   - **STRICT RULE**: Always prefer the VISUAL HALF-FORM (using ZWJ) over the fused ligature.
   - Example: 'Unnat' (उन्नत) -> Must be: U+0909 U+0928 U+094D U+200D U+0928 U+0924 (Using ZWJ to show Half-Na explicitly).

3. NO AUTOMATIC LIGATURES: 
   - Even if the user draws strokes connected, do not return the fused glyph (like न्न).
   - ALWAYS return the sequence that renders as [Half-Form] + [Full Form].
   - Valid Output Examples: न्‍न (Half-N+N), त्‍त (Half-T+T), द्‍द (Half-D+D).
   - Invalid Output: न्न (Ligature), त्त (Ligature).

4. NO DOTTED CIRCLES: 
   - Always ensure vowel matras (ि, ी, etc.) follow a consonant. 
   - Correct sequence: [Consonant] + [Matra].
   - If a matra appears to be spanning multiple characters (like in 'शिच' spanning to 'च'), ensure the matra follows the cluster: [Sh + Halant + ZWJ + Ch + i].

5. NO EXTRA "T" LINES: In words like 'Stri', if the 't' isn't drawn as a clear vertical bar, do not use a Unicode sequence that forces a bar to appear.

6. EXACT MAPPING: If a stroke looks like a partial glyph, find the Unicode combination (using ZWJ and Halants) that represents only that partial shape.

Return ONLY the resulting string.`,
              },
            ],
          },
          config: {
            temperature: 0,
            topP: 0.1,
            topK: 1,
          },
        }),
        45000,
        "AI Generation timed out (45s)"
      );

      const text = response.text?.trim() || "";
      
      // Save to cache and get suggestions
      let suggestions: Suggestion[] = [];
      if (text) {
        suggestions = await this.saveAndGetSuggestions(text);
      }
      
      return {
        recognizedText: text,
        suggestions
      };
    } catch (error: any) {
      console.error("Gemini recognition error:", error);
      
      // Check if it's a rate limit error
      if (this.isRateLimitError(error)) {
        
        // Try to rotate to next key
        if (this.rotateToNextKey()) {
          // Retry with new key
          return this.recognizeHandwriting(base64Image);
        } else {
          throw new Error("All API keys exhausted! Daily limits reached on all keys. Try again tomorrow.");
        }
      }
      
      throw new Error(error.message || "Recognition failed. Please try again.");
    }
  }

  /**
   * Get current credits info
   */
  async getCredits(): Promise<CreditsInfo> {
    try {
      const response = await this.withTimeout(
        fetch(`${BACKEND_URL}/credits`),
        5000,
        "Credits API timed out"
      );
      return await response.json();
    } catch (error) {
      return {
        used: 0,
        remaining: 1500,
        limit: 1500,
        date: new Date().toISOString().split('T')[0],
        percentage_used: 0
      };
    }
  }

  /**
   * Use one credit (call after AI request)
   */
  async useCredit(): Promise<CreditsInfo> {
    try {
      const response = await this.withTimeout(
        fetch(`${BACKEND_URL}/credits/use`, { method: 'POST' }),
        5000,
        "Use credit API timed out"
      );
      const data = await response.json();
      return data.credits;
    } catch (error) {
      return this.getCredits();
    }
  }

  /**
   * Check if credits available before making AI call
   */
  async hasCredits(): Promise<boolean> {
    try {
      const response = await this.withTimeout(
        fetch(`${BACKEND_URL}/credits/check`), 
        5000,
        "Check credits API timed out"
      );
      const data = await response.json();
      return data.available;
    } catch (error) {
      return true; // Default to allowing if check fails
    }
  }
}

export const geminiService = new GeminiService();
