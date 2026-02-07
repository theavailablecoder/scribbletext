import React, { useState, useEffect } from 'react';

interface Word {
  text: string;
  usage_count: number;
  first_seen: number;
}

interface WordLibraryProps {
  isOpen: boolean;
  onClose: () => void;
}

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const WordLibrary: React.FC<WordLibraryProps> = ({ isOpen, onClose }) => {
  const [words, setWords] = useState<Word[]>([]);
  const [filteredWords, setFilteredWords] = useState<Word[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch words when library opens
  useEffect(() => {
    if (isOpen) {
      fetchWords();
    }
  }, [isOpen]);

  // Filter words based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredWords(words);
    } else {
      const filtered = words.filter(word =>
        word.text.includes(searchQuery)
      );
      setFilteredWords(filtered);
    }
  }, [searchQuery, words]);

  const fetchWords = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/library/words`);
      const data = await response.json();
      if (data.success) {
        setWords(data.words);
        setFilteredWords(data.words);
      }
    } catch (error) {
      console.error('Failed to fetch library words:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyWord = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const deleteWord = async (text: string) => {
    // First click: show confirmation
    if (deleteConfirm !== text) {
      setDeleteConfirm(text);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }
    
    // Second click: delete
    setDeleteConfirm(null);

    try {
      const response = await fetch(`${BACKEND_URL}/library/words/${encodeURIComponent(text)}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setWords(prev => prev.filter(w => w.text !== text));
        setFilteredWords(prev => prev.filter(w => w.text !== text));
      } else {
        setErrorMessage('Failed to delete word');
        setTimeout(() => setErrorMessage(null), 3000);
      }
    } catch (error) {
      setErrorMessage('Error deleting word');
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 z-50 overflow-hidden flex flex-col">
      {/* Error Toast */}
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fadeIn">
          {errorMessage}
        </div>
      )}
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-indigo-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <i className="fa-solid fa-book text-3xl text-white"></i>
              </div>
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">Word Library</h1>
                <p className="text-slate-600 font-medium">Your complete vocabulary collection</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl border-2 border-slate-200 hover:border-slate-300 transition-all shadow-sm"
            >
              <i className="fa-solid fa-arrow-left mr-2"></i>
              Back to App
            </button>
          </div>

          {/* Search & Stats Row */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <i className="fa-solid fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
              <input
                type="text"
                placeholder="Search your vocabulary..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-white border-2 border-indigo-200 rounded-2xl focus:border-indigo-400 focus:outline-none text-lg font-devanagari shadow-sm"
              />
            </div>
            <div className="flex items-center gap-3 px-6 py-4 bg-white rounded-2xl border-2 border-indigo-200 shadow-sm">
              <i className="fa-solid fa-list-check text-indigo-600 text-xl"></i>
              <div>
                <div className="text-2xl font-black text-slate-900">{filteredWords.length}</div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Words</div>
              </div>
            </div>
            <button
              onClick={fetchWords}
              disabled={isLoading}
              className="px-6 py-4 bg-white hover:bg-indigo-50 text-indigo-600 font-bold rounded-2xl border-2 border-indigo-200 hover:border-indigo-400 transition-all shadow-sm disabled:opacity-50"
            >
              <i className={`fa-solid fa-rotate mr-2 ${isLoading ? 'animate-spin' : ''}`}></i>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="animate-spin h-16 w-16 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-600 font-bold">Loading your vocabulary...</p>
              </div>
            </div>
          ) : filteredWords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 bg-white rounded-3xl border-2 border-dashed border-slate-200">
              <i className="fa-solid fa-book-open text-6xl text-slate-300 mb-6"></i>
              <h3 className="text-2xl font-black text-slate-800 mb-2">
                {searchQuery ? 'No words found' : 'Your library is empty'}
              </h3>
              <p className="text-slate-500 font-medium mb-6 max-w-md text-center">
                {searchQuery 
                  ? `No words match "${searchQuery}". Try a different search.`
                  : 'Start by copying words from your history. They will automatically appear here!'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg transition-all"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredWords.map((word, index) => (
                <button
                  key={index}
                  onClick={() => copyWord(word.text)}
                  className="group bg-white hover:bg-gradient-to-br hover:from-amber-50 hover:to-orange-50 border-2 border-slate-200 hover:border-amber-300 rounded-2xl p-6 transition-all hover:shadow-xl hover:scale-105 active:scale-95 flex flex-col items-center justify-between min-h-[160px]"
                >
                  {/* Word */}
                  <div className="w-full">
                    <div className="text-4xl font-devanagari text-slate-900 mb-4 text-center leading-relaxed break-words w-full">
                      {word.text}
                    </div>
                  </div>

                  {/* Badge & Count */}
                  <div className="w-full flex items-center justify-between gap-2 mb-3 mt-auto">
                    <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0">
                      Manual
                    </span>
                    <span className="text-slate-500 font-bold text-sm shrink-0">
                      {word.usage_count}x
                    </span>
                  </div>

                  {/* Copy Status & Delete */}
                  <div className="w-full flex items-center gap-2 pt-3 border-t border-slate-100 mt-auto">
                    <div className="flex-1">
                      {copiedText === word.text ? (
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <i className="fa-solid fa-check"></i>
                          <span className="text-xs font-bold uppercase">Copied!</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-slate-400 group-hover:text-indigo-600">
                          <i className="fa-solid fa-copy"></i>
                          <span className="text-xs font-bold uppercase">Copy</span>
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWord(word.text);
                      }}
                      className={`p-2 rounded-lg transition-colors ${
                        deleteConfirm === word.text 
                          ? 'text-red-500 bg-red-100' 
                          : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                      }`}
                      title={deleteConfirm === word.text ? 'Click again to confirm' : 'Delete word'}
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default WordLibrary;
