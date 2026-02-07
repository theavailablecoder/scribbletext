import { createClient } from '@libsql/client';
import 'dotenv/config';

// Initialize Turso client
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize database tables
async function initDatabase() {
  // Create table with support for variations
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recognized_texts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recognized_text TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_used INTEGER NOT NULL,
      usage_count INTEGER DEFAULT 1,
      is_manual BOOLEAN DEFAULT 0
    )
  `);
  
  // Create API usage tracking table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      api_calls INTEGER DEFAULT 0,
      last_reset INTEGER NOT NULL
    )
  `);
  
  // Create index for faster searches
  await db.execute('CREATE INDEX IF NOT EXISTS idx_recognized_text ON recognized_texts(recognized_text)');
  
  return db;
}

/**
 * Get all variations of a text (exact matches)
 * @param {string} recognizedText - The recognized text
 * @returns {array} - All matching texts with usage stats
 */
export async function getSimilarTexts(recognizedText) {
  const result = await db.execute({
    sql: 'SELECT DISTINCT recognized_text, SUM(usage_count) as total_usage, is_manual FROM recognized_texts WHERE recognized_text = ? GROUP BY recognized_text ORDER BY total_usage DESC',
    args: [recognizedText]
  });
  
  return result.rows.map(row => ({
    text: row.recognized_text,
    usage_count: row.total_usage,
    is_manual: row.is_manual === 1
  }));
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Get suggestions based on recognized text
 * Returns variations plus similar manual entries using fuzzy matching
 * @param {string} recognizedText - The recognized text
 * @returns {array} - Suggested texts
 */
export async function getSuggestions(recognizedText) {
  if (!recognizedText) return [];
  
  const firstChar = recognizedText.charAt(0);
  
  // Get ALL words starting with the same first character
  const result = await db.execute({
    sql: `SELECT recognized_text, SUM(usage_count) as total_usage, MAX(is_manual) as is_manual 
     FROM recognized_texts 
     WHERE recognized_text LIKE ? 
     GROUP BY recognized_text`,
    args: [`${firstChar}%`]
  });
  
  let candidates = result.rows.map(row => ({
    text: row.recognized_text,
    usage_count: row.total_usage,
    is_manual: row.is_manual === 1
  }));
  
  // Add Levenshtein distance to each candidate
  candidates = candidates.map(item => {
    const distance = levenshtein(recognizedText, item.text);
    const maxLength = Math.max(recognizedText.length, item.text.length);
    const similarity = 1 - (distance / maxLength);
    
    return {
      ...item,
      distance,
      similarity,
      score: similarity * 10 
             + (item.is_manual ? 2 : 0) 
             + Math.min(item.usage_count, 5) * 0.1
    };
  });
  
  // Sort by score (descending) and take top 10
  return candidates
    .filter(item => item.similarity > 0.3 || item.text.startsWith(recognizedText.substring(0, 2)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ text, usage_count, is_manual }) => ({ text, usage_count, is_manual }));
}

/**
 * Save recognized text (allows duplicates for variations)
 * @param {string} recognizedText - The recognized text
 * @param {boolean} isManual - Whether this is a manual entry
 * @returns {object} - Saved record
 */
export async function saveRecognizedText(recognizedText, isManual = false) {
  const timestamp = Date.now();
  
  // Always insert (allow variations)
  const result = await db.execute({
    sql: 'INSERT INTO recognized_texts (recognized_text, first_seen, last_used, usage_count, is_manual) VALUES (?, ?, ?, 1, ?)',
    args: [recognizedText, timestamp, timestamp, isManual ? 1 : 0]
  });
  
  // Get the inserted record
  const insertedResult = await db.execute({
    sql: 'SELECT * FROM recognized_texts WHERE id = ?',
    args: [result.lastInsertRowid]
  });
  
  if (insertedResult.rows.length > 0) {
    const row = insertedResult.rows[0];
    return {
      id: row.id,
      recognized_text: row.recognized_text,
      first_seen: row.first_seen,
      last_used: row.last_used,
      usage_count: row.usage_count,
      is_manual: row.is_manual === 1
    };
  }
  
  return null;
}

/**
 * Add word manually (for seeding vocabulary)
 * @param {string} text - The text to add
 * @returns {object} - Saved record
 */
export async function addManualWord(text) {
  return saveRecognizedText(text, true);
}

/**
 * Seed database with common words
 * @param {array} words - Array of words to add
 */
export async function seedWords(words) {
  const result = await db.execute('SELECT DISTINCT recognized_text FROM recognized_texts WHERE is_manual = 1');
  const existing = new Set(result.rows.map(row => row.recognized_text));
  
  let added = 0;
  for (const word of words) {
    if (!existing.has(word)) {
      await addManualWord(word);
      added++;
    }
  }
  
  return added;
}

/**
 * Get all manual/approved words for the library
 * @returns {array} - List of words
 */
export async function getLibraryWords() {
  try {
    const result = await db.execute(`
      SELECT DISTINCT recognized_text as text, 
             SUM(usage_count) as usage_count,
             MIN(first_seen) as first_seen
      FROM recognized_texts 
      WHERE is_manual = 1 
      GROUP BY recognized_text 
      ORDER BY usage_count DESC, recognized_text ASC
    `);
    
    return result.rows.map(row => ({
      text: row.text,
      usage_count: row.usage_count,
      first_seen: row.first_seen
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Get all recognized texts
 * @returns {array} - All records
 */
export async function getAllRecognizedTexts() {
  const result = await db.execute('SELECT * FROM recognized_texts ORDER BY last_used DESC');
  
  return result.rows.map(row => ({
    id: row.id,
    recognized_text: row.recognized_text,
    first_seen: row.first_seen,
    last_used: row.last_used,
    usage_count: row.usage_count,
    is_manual: row.is_manual === 1
  }));
}

/**
 * Get statistics
 * @returns {object} - Database statistics
 */
export async function getStats() {
  const result = await db.execute(`
    SELECT 
      COUNT(DISTINCT recognized_text) as unique_words,
      COUNT(*) as total_entries,
      SUM(CASE WHEN is_manual = 1 THEN 1 ELSE 0 END) as manual_words,
      SUM(usage_count) as total_uses
    FROM recognized_texts
  `);
  
  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      unique_words: row.unique_words || 0,
      total_entries: row.total_entries || 0,
      manual_words: row.manual_words || 0,
      total_recognitions: row.total_uses || 0
    };
  }
  
  return {
    unique_words: 0,
    total_entries: 0,
    manual_words: 0,
    total_recognitions: 0
  };
}

// ============ CREDIT TRACKING FUNCTIONS ============

const DAILY_CREDIT_LIMIT = 1500; // Free tier limit

/**
 * Get today's date string (YYYY-MM-DD)
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Get current credits info
 * @returns {object} - Credits info with used, remaining, limit
 */
export async function getCreditsInfo() {
  const today = getTodayDate();
  
  const result = await db.execute({
    sql: 'SELECT api_calls FROM api_usage WHERE date = ?',
    args: [today]
  });
  
  let used = 0;
  if (result.rows.length > 0) {
    used = result.rows[0].api_calls;
  }
  
  return {
    used: used,
    remaining: Math.max(0, DAILY_CREDIT_LIMIT - used),
    limit: DAILY_CREDIT_LIMIT,
    date: today,
    percentage_used: Math.round((used / DAILY_CREDIT_LIMIT) * 100)
  };
}

/**
 * Increment API usage count
 * @returns {object} - Updated credits info
 */
export async function incrementApiUsage() {
  const today = getTodayDate();
  const timestamp = Date.now();
  
  // Check if today's record exists
  const result = await db.execute({
    sql: 'SELECT id, api_calls FROM api_usage WHERE date = ?',
    args: [today]
  });
  
  if (result.rows.length > 0) {
    // Update existing record
    await db.execute({
      sql: 'UPDATE api_usage SET api_calls = api_calls + 1 WHERE date = ?',
      args: [today]
    });
  } else {
    // Create new record for today
    await db.execute({
      sql: 'INSERT INTO api_usage (date, api_calls, last_reset) VALUES (?, 1, ?)',
      args: [today, timestamp]
    });
  }
  
  return getCreditsInfo();
}

/**
 * Check if there are credits remaining
 * @returns {boolean} - True if credits available
 */
export async function hasCreditsRemaining() {
  const info = await getCreditsInfo();
  return info.remaining > 0;
}

/**
 * Reset daily credits (called automatically when date changes)
 */
export async function resetDailyCredits() {
  const today = getTodayDate();
  const timestamp = Date.now();
  
  await db.execute({
    sql: 'INSERT OR REPLACE INTO api_usage (date, api_calls, last_reset) VALUES (?, 0, ?)',
    args: [today, timestamp]
  });
}

/**
 * Delete a word from the library
 * @param {string} text - The word to delete
 * @returns {boolean} - Success status
 */
export async function deleteWord(text) {
  try {
    await db.execute({
      sql: 'DELETE FROM recognized_texts WHERE recognized_text = ?',
      args: [text]
    });
    return true;
  } catch (error) {
    return false;
  }
}

export { initDatabase };
