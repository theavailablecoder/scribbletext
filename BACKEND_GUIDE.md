# Backend Caching System - Quick Start Guide

## 🚀 Getting Started

Your handwriting recognition app now has a backend caching system that stores recognized text and retrieves it instantly for duplicate drawings!

### Start the Application

You need to run **both** the backend server and frontend:

**Terminal 1 - Backend Server:**
```bash
npm run server
```

**Terminal 2 - Frontend App:**
```bash
npm run dev
```

## ✨ How It Works

1. **First time you draw something**: 
   - The app calls Gemini AI (takes 2-5 seconds)
   - Result is saved to the database
   
2. **Draw the same thing again**:
   - App checks the database first
   - Returns cached result instantly (<100ms)
   - No AI call needed = faster & cheaper!

## 📊 Check Cache Stats

Visit this URL while the backend is running:
```
http://localhost:3001/api/stats
```

## 💡 Tips

- The backend server must be running for caching to work
- If backend is down, the app still works - it just calls AI every time
- Database file is stored in `server/recognition_cache.db`
- Watch the browser console for cache hit/miss messages

## 🎯 Testing the Cache

1. Start both servers (backend + frontend)
2. Draw some text on the canvas
3. Click "Add to History" - watch console: "🤖 Cache miss, calling AI..."
4. Clear the canvas
5. Draw the **exact same** thing again
6. Click "Add to History" - watch console: "✅ Cache hit! Returning cached result"
7. Notice how much faster the second request is!

Enjoy your faster, more efficient handwriting recognition app! 🎉
