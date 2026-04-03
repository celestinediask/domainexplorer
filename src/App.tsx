import { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'
import { getRandomWord as getGlobalRandomWord } from './words'

interface DomainStatus {
  word: string;
  status: 'loading' | 'available' | 'taken' | 'aftermarket' | 'error' | 'waiting';
  id: number;
  attempt: number;
  waitSeconds: number;
}

interface FavoriteItem {
  word: string;
  status: 'available' | 'aftermarket' | 'taken' | 'error';
}

const NATURAL_SUFFIXES = [
  "app", "hub", "ly", "ify", "lab", "hq", "base", "site", "web", "net", 
  "cloud", "box", "flow", "pulse", "spark", "logic", "sync", "mind",
  "zone", "labs", "studio", "pro", "plus", "link", "io", "ai", "tech",
  "data", "space", "vault", "core", "node", "grid", "wave", "rift",
  "bit", "byte", "line", "path", "way", "port", "gate", "link", "deck",
  "base", "dock", "bay", "side", "edge", "view", "vision", "scope",
  "spot", "mark", "point", "key", "root", "seed", "grow", "rise"
];

const NATURAL_PREFIXES = [
  "get", "try", "go", "my", "the", "join", "pure", "swift", "open",
  "smart", "fast", "neo", "ultra", "mega", "hyper", "prime", "vibe",
  "pixel", "echo", "nova", "stellar", "quantum", "alpha", "flux",
  "meta", "peak", "zen", "top", "pro", "easy", "just", "real", "true",
  "bold", "cool", "epic", "wild", "blue", "dark", "light", "bright",
  "clear", "soft", "hard", "solid", "power", "super", "grand", "urban"
];

const BATCH_SIZE = 4;
const RETRY_WAIT = 3;

const fetchDomainStatus = async (
  word: string, 
  onStateChange: (attempt: number, status: DomainStatus['status'], waitSeconds: number) => void
): Promise<'available' | 'taken' | 'aftermarket' | 'error'> => {
  const domain = `${word.toLowerCase()}.com`;

  for (let tryIdx = 0; tryIdx <= 3; tryIdx++) {
    onStateChange(tryIdx, 'loading', 0);
    try {
      const response = await fetch(`https://rdap.org/domain/${domain}`, { cache: 'no-cache' });
      if (response.status === 404) {
        try {
          const data = await response.json();
          const jsonStr = JSON.stringify(data).toLowerCase();
          if (jsonStr.includes('premium') || jsonStr.includes('reserved')) return 'aftermarket';
        } catch { /* ignore */ }
        return 'available';
      }
      if (response.ok || response.status === 302) {
        try {
          const data = await response.json();
          const jsonStr = JSON.stringify(data).toLowerCase();
          const isAftermarket = [
            'premium', 'aftermarket', 'for sale', 'marketplace', 
            'sedo', 'afternic', 'buy now', 'enquire', 'reserved',
            'atom.com', 'squadhelp', 'brandpa', 'brandbucket', 'dan.com',
            'hugedomains', 'buythisdomain', 'domainbroker',
            'internettraffic', 'buy.', 'sell.', 'parking', 'parked',
            'namesilo', 'uniregistry', 'bodis', 'dynadot'
          ].some(term => jsonStr.includes(term));
          if (isAftermarket) return 'aftermarket';
        } catch { /* ignore */ }
        return 'taken';
      }
    } catch (err) {
      console.error(`Try ${tryIdx} failed:`, err);
    }

    if (tryIdx < 3) {
      for (let i = RETRY_WAIT; i > 0; i--) {
        onStateChange(tryIdx, 'waiting', i);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } else {
      for (let i = RETRY_WAIT; i > 0; i--) {
        onStateChange(tryIdx, 'waiting', i);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return 'error';
};

function App() {
  const [domains, setDomains] = useState<DomainStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [inputVal, setInputVal] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [favTab, setFavTab] = useState<'saved' | 'trash'>('saved')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [favChecking, setFavChecking] = useState<Record<string, boolean>>({})
  
  const idCounter = useRef(0)
  const observerTarget = useRef(null)
  const usedWords = useRef<Set<string>>(new Set())

  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    const saved = localStorage.getItem('domain-favorites')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return parsed.map((item: string | FavoriteItem) => 
      typeof item === 'string' ? { word: item, status: 'available' } : item
    )
  })

  const [trash, setTrash] = useState<FavoriteItem[]>(() => {
    const saved = localStorage.getItem('domain-trash')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return parsed.map((item: string | FavoriteItem) => 
      typeof item === 'string' ? { word: item, status: 'available' } : item
    )
  })

  useEffect(() => {
    localStorage.setItem('domain-favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    localStorage.setItem('domain-trash', JSON.stringify(trash))
  }, [trash])

  const checkAvailability = useCallback(async (id: number, word: string) => {
    const finalStatus = await fetchDomainStatus(word, (currentAttempt, currentStatus, waitSecs) => {
      setDomains(prev => prev.map(d => d.id === id ? { 
        ...d, 
        attempt: currentAttempt, 
        status: currentStatus,
        waitSeconds: waitSecs 
      } : d));
    });
    setDomains(prev => prev.map(d => d.id === id ? { ...d, status: finalStatus } : d));
  }, []);

  const getNaturalCombination = (word: string) => {
    const usePrefix = Math.random() > 0.5
    return usePrefix 
      ? `${NATURAL_PREFIXES[Math.floor(Math.random() * NATURAL_PREFIXES.length)]}${word}`
      : `${word}${NATURAL_SUFFIXES[Math.floor(Math.random() * NATURAL_SUFFIXES.length)]}`;
  }

  const generateBatch = useCallback(async (baseWord: string) => {
    if (isLoading) return;
    const uniqueWords: string[] = [];
    let attempts = 0;
    while (uniqueWords.length < BATCH_SIZE && attempts < 200) {
      const candidate = getNaturalCombination(baseWord);
      if (!usedWords.current.has(candidate.toLowerCase())) {
        usedWords.current.add(candidate.toLowerCase());
        uniqueWords.push(candidate);
      }
      attempts++;
    }
    if (uniqueWords.length === 0) return;
    
    setIsLoading(true);
    const newBatch = uniqueWords.map(word => ({ 
      word, 
      status: 'loading' as const, 
      id: idCounter.current++,
      attempt: 0,
      waitSeconds: 0
    }));
    setDomains(prev => [...prev, ...newBatch]);

    await Promise.all(newBatch.map(async (item, index) => {
      await new Promise(resolve => setTimeout(resolve, index * 200));
      await checkAvailability(item.id, item.word);
    }));
    
    setIsLoading(false);
  }, [isLoading, checkAvailability]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && keyword && !isLoading) generateBatch(keyword);
    }, { threshold: 1.0 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [keyword, isLoading, generateBatch]);

  const resetAll = () => {
    setKeyword('');
    setDomains([]);
    setInputVal('');
    usedWords.current.clear();
    idCounter.current = 0;
  }

  const startWithKeyword = (val: string) => {
    setKeyword(val);
    setDomains([]);
    usedWords.current.clear();
    idCounter.current = 0;
    generateBatch(val);
  }

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) startWithKeyword(inputVal.trim());
  }

  const handleRandom = () => {
    const randomWord = getGlobalRandomWord();
    setInputVal(randomWord);
  }

  const toggleFavorite = (domain: string, status: FavoriteItem['status'] = 'available') => {
    const existing = favorites.find(f => f.word === domain)
    if (existing) {
      setFavorites(prev => prev.filter(f => f.word !== domain))
      if (!trash.find(t => t.word === domain)) {
        setTrash(prev => [{ word: domain, status: existing.status }, ...prev].slice(0, 50))
      }
    } else {
      setFavorites(prev => [...prev, { word: domain, status }])
      setTrash(prev => prev.filter(item => item.word !== domain))
    }
  }

  const checkSingleFav = async (word: string, isTrash: boolean) => {
    setFavChecking(prev => ({ ...prev, [word]: true }))
    const status = await fetchDomainStatus(word, () => {});
    const setter = isTrash ? setTrash : setFavorites;
    setter(prev => prev.map(item => item.word === word ? { ...item, status } : item))
    setFavChecking(prev => ({ ...prev, [word]: false }))
  }

  const removeFromTrash = (domain: string) => {
    setTrash(prev => prev.filter(t => t.word !== domain))
  }

  const restoreFromTrash = (domain: string) => {
    const item = trash.find(t => t.word === domain)
    if (item) {
      setTrash(prev => prev.filter(t => t.word !== domain))
      if (!favorites.find(f => f.word === domain)) {
        setFavorites(prev => [...prev, item])
      }
    }
  }

  const handleCopy = async (e: React.MouseEvent, id: number, text: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${text.toLowerCase()}.com`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 5000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  }

  const handleManualRetry = (id: number, word: string) => {
    checkAvailability(id, word);
  }

  const isFavorited = (word: string) => !!favorites.find(f => f.word === word)

  return (
    <div className="app-dark">
      <nav className="top-nav">
        <div className="logo" onClick={resetAll}>
          DomainExplorer
        </div>
        <div className="nav-actions">
          <button className={`btn-fav-toggle ${favorites.length > 0 ? 'active' : ''}`} onClick={() => setShowFavorites(!showFavorites)}>
            <span className="heart">❤</span>
            <span className="count">{favorites.length}</span>
          </button>
        </div>
      </nav>

      <div className="container wide">
        <main>
          {showFavorites && (
            <div className="favorites-overlay" onClick={() => setShowFavorites(false)}>
              <div className="favorites-content" onClick={e => e.stopPropagation()}>
                <div className="fav-header-tabs">
                  <div className="tabs-list">
                    <button className={`tab-btn ${favTab === 'saved' ? 'active' : ''}`} onClick={() => setFavTab('saved')}>
                      Saved ({favorites.length})
                    </button>
                    <button className={`tab-btn ${favTab === 'trash' ? 'active' : ''}`} onClick={() => setFavTab('trash')}>
                      Trash ({trash.length})
                    </button>
                  </div>
                  <button className="btn-close" onClick={() => setShowFavorites(false)}>✕</button>
                </div>
                
                <div className="fav-scroll-area">
                  {favTab === 'saved' ? (
                    favorites.length === 0 ? <p className="empty-msg">No saved domains yet</p> : (
                      <div className="favorites-grid">
                        {favorites.map(fav => (
                          <div key={fav.word} className="fav-item no-remove">
                            <span className={`fav-name ${fav.status}`}>{fav.word}.com</span>
                            <div className="fav-actions">
                              <span className={`refresh-icon ${favChecking[fav.word] ? 'spinning' : ''}`} onClick={() => checkSingleFav(fav.word, false)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 4v6h-6"></path>
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                              </span>
                              <span className="remove-icon" onClick={() => toggleFavorite(fav.word)}>✕</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    trash.length === 0 ? <p className="empty-msg">Trash is empty</p> : (
                      <div className="favorites-grid">
                        {trash.map(item => (
                          <div key={item.word} className="fav-item trashed">
                            <span className={`fav-name ${item.status}`}>{item.word}.com</span>
                            <div className="trash-actions">
                              <span className={`refresh-icon ${favChecking[item.word] ? 'spinning' : ''}`} onClick={() => checkSingleFav(item.word, true)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 4v6h-6"></path>
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                              </span>
                              <span className="restore-icon" title="Restore" onClick={() => restoreFromTrash(item.word)}>↺</span>
                              <span className="delete-icon" title="Permanent Delete" onClick={() => removeFromTrash(item.word)}>✕</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {!keyword ? (
            <div className="hero-section">
              <header className="hero-header">
                <h1>Find your next <span className="text-accent">domain</span>.</h1>
                <p>Instant availability checks with natural suggestions.</p>
              </header>
              <form className="hero-search" onSubmit={handleStart}>
                <div className="input-container">
                  <input 
                    type="text" 
                    placeholder="Enter a keyword..." 
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    autoFocus
                  />
                  <button type="button" className="btn-icon-random" onClick={handleRandom} title="Random Keyword">
                    🎲
                  </button>
                </div>
                <div className="hero-buttons">
                  <button type="submit" className="btn-primary" disabled={!inputVal.trim()}>Explore Domains</button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="streaming-controls">
                <div className="current-keyword">
                  Keyword: <span>{keyword}</span>
                </div>
                <button className="btn-secondary" onClick={resetAll}>
                  New Search
                </button>
              </div>

              <div className="domain-grid">
                {domains.map((item) => (
                  <div 
                    key={item.id} 
                    className={`domain-card mini ${item.status}`}
                    onClick={() => (item.status === 'available' || item.status === 'aftermarket' || item.status === 'taken') && toggleFavorite(item.word, item.status as FavoriteItem['status'])}
                  >
                    <div className="card-content">
                      <div className="domain-info">
                        <span className={`domain-name ${item.status}`}>
                          {item.word.toLowerCase()}.com
                        </span>
                        {item.attempt > 0 && (item.status === 'loading' || item.status === 'waiting') && (
                          <span className="retry-badge">
                            {item.status === 'waiting' 
                              ? `${item.waitSeconds}s (${item.attempt}/3)` 
                              : `(${item.attempt}/3)`}
                          </span>
                        )}
                      </div>
                      
                      <div className="status-indicator">
                        {(item.status === 'loading' || item.status === 'waiting') ? (
                          <div className={`loading-spinner ${item.status === 'waiting' ? 'paused' : ''}`}></div>
                        ) : (
                          <>
                            {item.status === 'error' && (
                              <button 
                                className="btn-retry" 
                                onClick={(e) => { e.stopPropagation(); handleManualRetry(item.id, item.word); }}
                                title="Retry Check"
                              >
                                <svg width="16" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 4v6h-6"></path>
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                              </button>
                            )}
                            
                            <button 
                              className={`btn-heart ${isFavorited(item.word) ? 'active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(item.word, item.status as FavoriteItem['status']); }}
                              title="Favorite"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited(item.word) ? "#ef4444" : "none"} stroke={isFavorited(item.word) ? "#ef4444" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                              </svg>
                            </button>

                            <button 
                              className={`btn-copy ${copiedId === item.id ? 'copied' : ''}`} 
                              onClick={(e) => handleCopy(e, item.id, item.word)}
                              title="Copy Domain"
                            >
                              {copiedId === item.id ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div ref={observerTarget} className="scroll-sentinel">
                {isLoading && <div className="batch-loader"><div className="spinner"></div></div>}
              </div>
            </>
          )}
        </main>
      </div>
      <footer>
        <p>Saved favorites & trash are persistent in browser memory.</p>
      </footer>
    </div>
  )
}

export default App
