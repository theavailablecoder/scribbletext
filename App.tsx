
import React, { useState, useCallback, useEffect } from 'react';
import DrawingCanvas from './components/DrawingCanvas';
import WordLibrary from './components/WordLibrary';
import { geminiService, Suggestion, CreditsInfo, KeyStatus } from './services/geminiService';

interface HistoryEntry {
  id: string;
  text: string;
  timestamp: number;
}

const App: React.FC = () => {
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [clearCount, setClearCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // New states for suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentRecognizedText, setCurrentRecognizedText] = useState<string>('');
  
  // Credits state
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  
  // API Key status
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  
  // Word Library state
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Fetch credits and key status on load
  useEffect(() => {
    loadCredits();
    
    // Refresh credits every minute
    const interval = setInterval(loadCredits, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadCredits = async () => {
    const info = await geminiService.getCredits();
    setCredits(info);
    
    const keys = geminiService.getKeyStatus();
    setKeyStatus(keys);
  };

  const handleCanvasChange = useCallback((imageData: string) => {
    setCurrentImage(imageData);
  }, []);

  const addToHistory = (text: string) => {
    setHistory(prev => [{
      id: Date.now().toString(),
      text,
      timestamp: Date.now()
    }, ...prev]);
    setSuggestions([]);
    setShowSuggestions(false);
    setCurrentRecognizedText('');
    handleClear();
  };

  const handleClear = () => {
    setClearCount(prev => prev + 1);
    setCurrentImage(null);
    setError(null);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleConvert = async () => {
    if (!currentImage) return;
    
    // Check if credits available
    const hasCredits = await geminiService.hasCredits();
    if (!hasCredits) {
      setError("Daily credit limit reached! Credits reset at midnight.");
      return;
    }
    
    setIsRecognizing(true);
    setError(null);
    try {
      const result = await geminiService.recognizeHandwriting(currentImage);
      
      // Use a credit after successful AI call
      const updatedCredits = await geminiService.useCredit();
      setCredits(updatedCredits);
      
      if (result.recognizedText) {
        setCurrentRecognizedText(result.recognizedText);
        
        // If we have suggestions, show them
        if (result.suggestions && result.suggestions.length > 0) {
          // Add the current recognized text to suggestions if not already there
          const allSuggestions = [...result.suggestions];
          const hasCurrentText = allSuggestions.some(s => s.text === result.recognizedText);
          
          if (!hasCurrentText) {
            allSuggestions.unshift({
              text: result.recognizedText,
              usage_count: 1,
              is_manual: false
            });
          }
          
          setSuggestions(allSuggestions);
          setShowSuggestions(true);
        } else {
          // No suggestions, add directly to history
          addToHistory(result.recognizedText);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recognition failed");
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleSelectSuggestion = (text: string) => {
    addToHistory(text);
  };

  const handleSkipSuggestions = () => {
    if (currentRecognizedText) {
      addToHistory(currentRecognizedText);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      
      // Auto-add to manual words (confirmed by user)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        await fetch(`${apiUrl}/text/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        });
      } catch (error) {
        // Silent fail - don't block clipboard operation
      }
    } catch (error) {
      // Clipboard copy failed silently
    }
  };

  const deleteEntry = (id: string) => {
    setHistory(prev => prev.filter(entry => entry.id !== id));
  };

  const [confirmClear, setConfirmClear] = useState(false);

  const clearHistory = () => {
    if (confirmClear) {
      setHistory([]);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      // Reset after 3 seconds if not confirmed
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar - Precision Mode & Status */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-lg z-10 shrink-0">
        {/* Header/Logo */}
        <div className="p-8 border-b border-slate-100">
           <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">
            Scribble<span className="text-indigo-600">Pure</span>
           </h1>
           <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
             <i className="fa-solid fa-shapes mr-1"></i>
             Visual Precision
           </p>
        </div>

        {/* Stats & Status */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* Active Mode Card */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
            
            <div className="flex items-center gap-3 mb-4">
               <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
               <span className="text-xs font-bold uppercase tracking-widest text-slate-400">System Active</span>
            </div>

            <div className="space-y-4">
               {/* Credits */}
               {credits && (
                  <div className="flex items-center justify-between">
                     <span className="text-sm text-slate-400 font-medium">Credits</span>
                     <div className={`text-xl font-black ${
                       credits.remaining > 500 ? 'text-green-400' : 'text-amber-400'
                     }`}>
                        {credits.remaining}<span className="text-slate-600 text-sm">/{credits.limit}</span>
                     </div>
                  </div>
               )}

               {/* Key Status */}
               {keyStatus && keyStatus.totalKeys > 1 && (
                 <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between text-xs">
                       <span className="text-slate-400">API Key</span>
                       <span className="font-bold text-indigo-300">
                         {keyStatus.currentKey} of {keyStatus.totalKeys}
                       </span>
                    </div>
                 </div>
               )}
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-2">
            <button 
              onClick={() => setIsLibraryOpen(true)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-amber-50 text-amber-900 font-bold border-2 border-amber-100 hover:border-amber-300 hover:bg-amber-100 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center text-amber-700 group-hover:scale-110 transition-transform">
                <i className="fa-solid fa-book"></i>
              </div>
              <div className="text-left">
                <div className="text-sm">Word Library</div>
                <div className="text-[10px] text-amber-600/70 font-bold uppercase tracking-wider">
                  Approved Words
                </div>
              </div>
            </button>
          </nav>
        </div>

        {/* Footer Stats */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
           <div className="flex items-center justify-between text-sm font-bold text-slate-500">
              <span>Session Clips</span>
              <span className="bg-slate-200 px-2 py-1 rounded-lg text-slate-700">
                {history.length}
              </span>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-8 lg:p-12">
           <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
             
             {/* Drawing Canvas Section (Left/Top) */}
             <div className="lg:col-span-7 space-y-6">
                <div className="bg-white rounded-[2rem] shadow-xl p-3 overflow-hidden border border-slate-200 relative group">
                  <div className="h-[500px] w-full bg-slate-50 rounded-2xl">
                    <DrawingCanvas onCanvasChange={handleCanvasChange} clearTrigger={clearCount} />
                  </div>
                  <div className="absolute top-6 left-6 pointer-events-none opacity-5 group-hover:opacity-10 transition-opacity">
                     <i className="fa-solid fa-paintbrush text-5xl text-slate-900"></i>
                  </div>
                </div>

                {/* Canvas Controls */}
                <div className="flex gap-4">
                  <button
                    onClick={handleClear}
                    className="flex-1 py-4 bg-white text-slate-700 font-bold rounded-2xl border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
                  >
                    <i className="fa-solid fa-rotate mr-2"></i> Clear
                  </button>
                  <button
                    onClick={handleConvert}
                    disabled={isRecognizing || !currentImage}
                    className={`flex-[2] py-4 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                      isRecognizing || !currentImage ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                    }`}
                  >
                    {isRecognizing ? (
                       <>
                         <div className="animate-spin h-5 w-5 border-3 border-white border-t-transparent rounded-full"></div>
                         Mapping Strokes...
                       </>
                    ) : (
                      <>
                        <i className="fa-solid fa-plus"></i>
                        Add to History
                      </>
                    )}
                  </button>
                </div>

                {/* Messages */}
                {error && (
                  <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3 animate-fadeIn">
                     <i className="fa-solid fa-circle-exclamation"></i>
                     <span className="font-bold text-sm">{error}</span>
                  </div>
                )}
             </div>

             {/* Output & Suggestions (Right/Bottom) */}
             <div className="lg:col-span-5 space-y-8">
               {/* Suggestions Panel */}
               {showSuggestions && suggestions.length > 0 && (
                 <div className="bg-white rounded-[2rem] shadow-2xl p-6 border border-indigo-200 animate-fadeIn relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200 rounded-full blur-3xl opacity-20 -z-10"></div>
                   
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                       <i className="fa-solid fa-lightbulb text-amber-500"></i>
                       Variations
                     </h3>
                     <button 
                       onClick={handleSkipSuggestions}
                       className="text-xs font-bold text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors"
                     >
                       Skip
                     </button>
                   </div>
                   
                   <p className="text-sm text-slate-500 mb-4 pb-4 border-b border-slate-100">
                     AI recognized: <strong className="text-indigo-600 text-lg ml-1 font-devanagari">{currentRecognizedText}</strong>
                   </p>
                   
                   <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1 custom-scrollbar">
                     {suggestions.map((suggestion, index) => (
                       <button
                         key={index}
                         onClick={() => handleSelectSuggestion(suggestion.text)}
                         className={`p-4 rounded-2xl border-2 transition-all hover:scale-105 active:scale-95 text-left relative overflow-hidden ${
                           suggestion.is_manual 
                             ? 'border-amber-200 bg-amber-50/50 hover:border-amber-400' 
                             : 'border-slate-100 bg-slate-50 hover:border-indigo-400 hover:shadow-md'
                         }`}
                       >
                         <div className="text-2xl font-devanagari text-slate-900 mb-2 truncate">
                           {suggestion.text}
                         </div>
                         <div className="flex items-center justify-between">
                            {suggestion.is_manual && (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Manual
                              </span>
                            )}
                            <span className="text-xs font-bold text-slate-400">
                              {suggestion.usage_count}x
                            </span>
                         </div>
                       </button>
                     ))}
                   </div>
                 </div>
               )}

               {/* History Feed */}
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                       <i className="fa-solid fa-clock-rotate-left text-slate-400"></i>
                       Recent Clips
                    </h2>
                    {history.length > 0 && (
                      <button 
                        onClick={clearHistory}
                        className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                          confirmClear 
                            ? 'text-red-600 bg-red-100 px-2 py-1 rounded-lg' 
                            : 'text-red-400 hover:text-red-600'
                        }`}
                      >
                        {confirmClear ? 'Click to Confirm' : 'Clear All'}
                      </button>
                    )}
                 </div>
                 
                 <div className="space-y-3 pb-20">
                   {history.length === 0 ? (
                     <div className="h-64 border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400">
                        <i className="fa-solid fa-pen-nib text-4xl mb-4 opacity-30"></i>
                        <p className="font-bold">Ready to scribble</p>
                     </div>
                   ) : (
                     history.map((entry) => (
                       <div key={entry.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group flex items-start gap-4 animate-slideIn">
                          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 font-devanagari text-xl">
                            {entry.text.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-2xl font-devanagari text-slate-900 mb-1 break-words leading-relaxed">
                              {entry.text}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-lg">
                                {new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </span>
                              
                              <div className="flex gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => copyToClipboard(entry.text, entry.id)}
                                  className={`p-2 rounded-lg transition-all ${copiedId === entry.id ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400 hover:bg-indigo-100 hover:text-indigo-600'}`}
                                >
                                  <i className={`fa-solid ${copiedId === entry.id ? 'fa-check' : 'fa-copy'}`}></i>
                                </button>
                                <button 
                                  onClick={() => deleteEntry(entry.id)}
                                  className="p-2 bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 rounded-lg transition-all"
                                >
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                       </div>
                     ))
                   )}
                 </div>
               </div>
             </div>
           </div>
        </div>
      </main>

      <WordLibrary isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
    </div>
  );
};

export default App;
