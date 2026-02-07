import express from 'express';
import cors from 'cors';
import { 
  initDatabase, 
  saveRecognizedText, 
  getSuggestions, 
  getStats, 
  getAllRecognizedTexts,
  seedWords,
  addManualWord,
  getCreditsInfo,
  incrementApiUsage,
  hasCreditsRemaining,
  getLibraryWords,
  deleteWord
} from './database.js';
import { commonWords } from './seedWords.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database before starting server
await initDatabase();

// Seed common words on startup
await seedWords(commonWords);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Get all recognized texts
app.get('/api/texts', async (req, res) => {
  try {
    const texts = await getAllRecognizedTexts();
    res.json({ texts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve texts' });
  }
});

// Get suggestions for recognized text
app.post('/api/text/suggestions', async (req, res) => {
  try {
    const { recognizedText } = req.body;
    
    if (!recognizedText) {
      return res.status(400).json({ error: 'recognizedText is required' });
    }
    
    const suggestions = await getSuggestions(recognizedText);
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// Save new recognized text
app.post('/api/text', async (req, res) => {
  try {
    const { recognizedText } = req.body;
    
    if (!recognizedText) {
      return res.status(400).json({ error: 'recognizedText is required' });
    }
    
    const result = await saveRecognizedText(recognizedText, false);
    
    // Get suggestions for this text
    const suggestions = await getSuggestions(recognizedText);
    
    res.json({
      success: true,
      data: result,
      suggestions: suggestions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save text' });
  }
});

// Add manual word (for users to add their own words)
app.post('/api/text/manual', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    
    const result = await addManualWord(text);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add manual word' });
  }
});

// Confirm copied text (auto-add to manual words)
app.post('/api/text/confirm', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    
    // Add as manual word (marked as user-confirmed)
    const result = await addManualWord(text);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm word' });
  }
});

// Delete word from library
app.delete('/api/library/words/:text', async (req, res) => {
  try {
    const { text } = req.params;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const success = await deleteWord(text);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to delete word' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete word' });
  }
});

// Get all manual/approved words for library
app.get('/api/library/words', async (req, res) => {
  try {
    const words = await getLibraryWords();
    
    res.json({
      success: true,
      count: words.length,
      words: words
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch library words' });
  }
});

// Get credits info
app.get('/api/credits', async (req, res) => {
  try {
    const credits = await getCreditsInfo();
    res.json(credits);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get credits info' });
  }
});

// Increment API usage (called by frontend after each AI call)
app.post('/api/credits/use', async (req, res) => {
  try {
    // Check if credits available
    const hasCredits = await hasCreditsRemaining();
    if (!hasCredits) {
      const credits = await getCreditsInfo();
      return res.status(429).json({ 
        error: 'Daily credit limit reached',
        credits
      });
    }
    
    const credits = await incrementApiUsage();
    res.json({
      success: true,
      credits
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update credits' });
  }
});

// Check if credits available (before making API call)
app.get('/api/credits/check', async (req, res) => {
  try {
    const available = await hasCreditsRemaining();
    const credits = await getCreditsInfo();
    res.json({
      available,
      credits
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check credits' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
