import { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'
import { getRandomWord as getGlobalRandomWord } from './words'

interface DomainStatus {
  word: string;
  status: 'loading' | 'available' | 'taken' | 'aftermarket' | 'waiting' | 'error';
  id: number;
  attempt: number;
  waitSeconds: number;
}

interface FavoriteItem {
  word: string;
  status: 'available' | 'taken' | 'aftermarket';
}

const BATCH_SIZE = 10;

const NATURAL_PREFIXES = [
  'get', 'go', 'try', 'my', 'the', 'hello', 'join', 'pure', 'simply', 'meta', 'flow', 'open', 'aura', 'nova', 'zen'
];

const NATURAL_SUFFIXES = [
  'hq', 'app', 'labs', 'studio', 'hub', 'flow', 'ly', 'ify', 'base', 'plus', 'pro', 'mind', 'core', 'link', 'next'
];

const TICKER_DOMAINS_1 = [
  'getnexus.com', 'boostly.app', 'metacore.io', 'zenflow.com', 'novahub.net',
  'purely.com', 'flowbase.co', 'openmind.app', 'aurastudios.com', 'simplynext.io',
  'getorbit.com', 'cloudly.app', 'pixelmind.io', 'fluxhq.com', 'nexusflow.net'
];

const TICKER_DOMAINS_2 = [
  'tryswift.com', 'helloaura.net', 'joinflux.app', 'myzenith.com', 'thepeak.io',
  'brightlink.com', 'grandpixel.net', 'supernova.app', 'hypercloud.io', 'ultraspark.com',
  'swifthub.io', 'auraworks.net', 'fluxlabs.app', 'zenithhq.com', 'peakflow.io'
];

const fetchDomainStatus = async (word: string, onRetry: (attempt: number, status: DomainStatus['status'], wait: number) => void): Promise<DomainStatus['status']> => {
  const domain = `${word.toLowerCase()}.com`;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://rdap.verisign.com/com/v1/domain/${domain}`);
      
      if (response.status === 200) return 'taken';
      if (response.status === 404) return 'available';
      if (response.status === 429) {
        const wait = attempt * 2;
        onRetry(attempt, 'waiting', wait);
        await new Promise(resolve => setTimeout(resolve, wait * 1000));
        continue;
      }
    } catch (err) {
      if (attempt === 3) return 'error';
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return 'error';
};

// Bulletproof Audio System
let audioCtx: AudioContext | null = null;
let audioGain: GainNode | null = null;

const initAudio = () => {
  if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    audioGain = audioCtx.createGain();
    audioGain.gain.value = 0.7; // Brighter volume
    audioGain.connect(audioCtx.destination);
    console.log("Audio system initialized, state:", audioCtx.state);
  } catch (e) {
    console.error("AudioContext initialization failed", e);
  }
  return audioCtx;
};

const ensureAudioContextRunning = async () => {
  const ctx = initAudio();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(e => console.error("Resume failed", e));
    console.log("AudioContext resumed, new state:", ctx.state);
  }
  return ctx.state === 'running';
};

const playResultSound = async (status: DomainStatus['status']) => {
  const isRunning = await ensureAudioContextRunning();
  if (!isRunning || !audioCtx || !audioGain) {
    console.warn("Audio not ready for result sound");
    return;
  }

  const now = audioCtx.currentTime;
  const playTime = now + 0.05;

  if (status === 'available') {
    // Triumphant C-major arpeggio: C4, E4, G4, C5
    const freqs = [261.63, 329.63, 392.00, 523.25];
    freqs.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, playTime + (i * 0.1));
      g.gain.setValueAtTime(0, playTime + (i * 0.1));
      g.gain.linearRampToValueAtTime(0.2, playTime + (i * 0.1) + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, playTime + (i * 0.1) + 0.5);
      osc.connect(g);
      g.connect(audioGain!);
      osc.start(playTime + (i * 0.1));
      osc.stop(playTime + (i * 0.1) + 0.5);
    });
  } else if (status === 'taken' || status === 'aftermarket') {
    // Clearer, audible neutral-negative sound
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, playTime);
    osc.frequency.exponentialRampToValueAtTime(150, playTime + 0.2);
    g.gain.setValueAtTime(0, playTime);
    g.gain.linearRampToValueAtTime(0.2, playTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, playTime + 0.3);
    osc.connect(g);
    g.connect(audioGain);
    osc.start(playTime);
    osc.stop(playTime + 0.3);
  } else if (status === 'error') {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, playTime);
    g.gain.setValueAtTime(0, playTime);
    g.gain.linearRampToValueAtTime(0.1, playTime + 0.05);
    g.gain.linearRampToValueAtTime(0, playTime + 0.25);
    osc.connect(g);
    g.connect(audioGain);
    osc.start(playTime);
    osc.stop(playTime + 0.25);
  }
};


const ScrollingNumber = ({ value }: { value: number }) => {
  const [prevValue, setPrevValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (value !== prevValue) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setPrevValue(value);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  return (
    <div className="stat-number-wrapper">
      <div className={`stat-scroll-container ${isAnimating ? 'animate' : ''}`}>
        <span className="stat-number-old">{prevValue}</span>
        <span className="stat-number-new">{value}</span>
      </div>
    </div>
  );
};

interface SessionStats {
  available: number;
  taken: number;
  aftermarket: number;
  premium: number;
}

function App() {
  const [view, setView] = useState<'main' | 'explore'>('main')
  const [domains, setDomains] = useState<DomainStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [inputVal, setInputVal] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [favTab, setFavTab] = useState<'saved' | 'trash'>('saved')
  const [copiedId, setCopiedId] = useState<string | number | null>(null)
  const [manualResult, setManualResult] = useState<DomainStatus | null>(null)
  const [favChecking, setFavChecking] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const unlock = async () => {
      const isRunning = await ensureAudioContextRunning();
      if (isRunning) {
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
        console.log("Audio system fully unlocked and running");
      }
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const [sessionStats, setSessionStats] = useState<SessionStats>(() => {
    const saved = localStorage.getItem('domain-session-stats');
    if (saved) return JSON.parse(saved);
    return {
      available: 0,
      taken: 0,
      aftermarket: 0,
      premium: 0
    };
  });

  useEffect(() => {
    localStorage.setItem('domain-session-stats', JSON.stringify(sessionStats));
  }, [sessionStats]);

  // Simulate live global activity
  useEffect(() => {
    if (view !== 'main') return;
    
    const tick = () => {
      const categories = ['available', 'taken', 'aftermarket', 'premium'] as const;
      const randomCat = categories[Math.floor(Math.random() * categories.length)];
      
      setSessionStats((prev: SessionStats) => ({
        ...prev,
        [randomCat]: prev[randomCat] + 1
      }));
      
      const nextTick = 500 + Math.random() * 2000;
      timer = setTimeout(tick, nextTick);
    };

    let timer = setTimeout(tick, 1000);
    return () => clearTimeout(timer);
  }, [view]);

  const countedDomains = useRef<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('domain-counted-domains');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) countedDomains.current = new Set(parsed);
      } catch (e) { console.error(e); }
    }
  }, []);

  const idCounter = useRef(0)
  const observerTarget = useRef(null)
  const usedWords = useRef<Set<string>>(new Set())

  const updateSessionStats = useCallback((word: string, status: string) => {
    const domain = word.toLowerCase();
    if (countedDomains.current.has(domain)) return;

    countedDomains.current.add(domain);
    localStorage.setItem('domain-counted-domains', JSON.stringify(Array.from(countedDomains.current)));

    setSessionStats((prev: SessionStats) => ({
      ...prev,
      [status]: (prev[status as keyof typeof prev] || 0) + 1
    }));
  }, []);

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
    if (finalStatus === 'available' || finalStatus === 'taken' || finalStatus === 'aftermarket') {
      updateSessionStats(word, finalStatus);
    }
    playResultSound(finalStatus);
  }, [updateSessionStats]);

  const getNaturalCombination = (word: string) => {
    const usePrefix = Math.random() > 0.5
    return usePrefix 
      ? `${NATURAL_PREFIXES[Math.floor(Math.random() * NATURAL_PREFIXES.length)]}${word}`
      : `${word}${NATURAL_SUFFIXES[Math.floor(Math.random() * NATURAL_SUFFIXES.length)]}`;
  }

  const generateBatch = useCallback(async (baseWord: string) => {
    if (isLoading || !baseWord) return;
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
      if (entries[0].isIntersecting && keyword && !isLoading && domains.length > 0) generateBatch(keyword);
    }, { threshold: 1.0 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [keyword, isLoading, generateBatch, domains.length]);

  const resetAll = () => {
    setKeyword('');
    setDomains([]);
    setInputVal('');
    setManualResult(null);
    usedWords.current.clear();
    idCounter.current = 0;
    setView('main');
  }

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    handleManualCheck(e);
  }

  const handleManualCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    
    const word = inputVal.trim().replace(/\.com$/i, '');
    
    setManualResult({ 
      word, 
      status: 'loading', 
      id: -1, 
      attempt: 0, 
      waitSeconds: 0 
    });

    const finalStatus = await fetchDomainStatus(word, (currentAttempt, currentStatus, waitSecs) => {
      setManualResult(prev => prev ? { 
        ...prev, 
        attempt: currentAttempt, 
        status: currentStatus, 
        waitSeconds: waitSecs 
      } : null);
    });
    
    setManualResult(prev => prev ? { ...prev, status: finalStatus } : null);
    if (finalStatus === 'available' || finalStatus === 'taken' || finalStatus === 'aftermarket') {
      updateSessionStats(word, finalStatus);
    }
    playResultSound(finalStatus);
  }

  const handleRandomDomain = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const randomWord = getGlobalRandomWord();
    const randomDomain = getNaturalCombination(randomWord);
    setInputVal(randomDomain);
    setManualResult(null);
  }

  const handleExploreIdeas = () => {
    setKeyword('');
    setDomains([]);
    setManualResult(null);
    usedWords.current.clear();
    idCounter.current = 0;
    setView('explore');
  }

  const handleRandomKeyword = () => {
    const randomWord = getGlobalRandomWord();
    setKeyword(randomWord);
    setDomains([]);
    setManualResult(null);
    usedWords.current.clear();
    idCounter.current = 0;
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
    if (status === 'available' || status === 'taken' || status === 'aftermarket') {
      const setter = isTrash ? setTrash : setFavorites;
      setter(prev => prev.map(item => item.word === word ? { ...item, status } : item))
      playResultSound(status);
    }
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

  const handleCopy = async (e: React.MouseEvent, id: string | number, text: string) => {
    e.stopPropagation();
    e.preventDefault();
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

  const handleLogoClick = () => {
    setView('main');
    resetAll();
  };

  const isFavorited = (word: string) => !!favorites.find(f => f.word === word)

  return (
    <div className="app-dark">
      <nav className="top-nav">
        <div className="logo" onClick={handleLogoClick}>
          DomainExplorer
        </div>
        <div className="nav-actions">
          <button className={`btn-fav-toggle ${favorites.length > 0 ? 'active' : ''}`} onClick={() => { setShowFavorites(!showFavorites); setView('main'); }}>
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
                              <span 
                                className={`copy-icon-fav ${copiedId === fav.word ? 'copied' : ''}`} 
                                onClick={(e) => handleCopy(e, fav.word, fav.word)}
                                title="Copy Domain"
                              >
                                {copiedId === fav.word ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                  </svg>
                                )}
                              </span>
                              <span className={`refresh-icon ${favChecking[fav.word] ? 'spinning' : ''}`} onClick={() => checkSingleFav(fav.word, false)} title="Refresh">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 4v6h-6"></path>
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                              </span>
                              <span className="remove-icon" onClick={() => toggleFavorite(fav.word)} title="Move to Trash">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#ff4444" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                              </span>
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
                              <span 
                                className={`copy-icon-fav ${copiedId === item.word ? 'copied' : ''}`} 
                                onClick={(e) => handleCopy(e, item.word, item.word)}
                                title="Copy Domain"
                              >
                                {copiedId === item.word ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                  </svg>
                                )}
                              </span>
                              <span className={`refresh-icon ${favChecking[item.word] ? 'spinning' : ''}`} onClick={() => checkSingleFav(item.word, true)} title="Refresh">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 4v6h-6"></path>
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                </svg>
                              </span>
                              <span className="restore-icon" title="Restore" onClick={() => restoreFromTrash(item.word)}>↺</span>
                              <span className="delete-icon" title="Permanent Delete" onClick={() => removeFromTrash(item.word)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                              </span>
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

          {view === 'main' ? (
            <div className="hero-section">
              <header className="hero-header">
                <h1>Find your next <span className="text-accent">domain</span>.</h1>
                <p>Instant availability checks with natural suggestions.</p>
              </header>

              <form className="hero-search" onSubmit={handleStart}>
                <div className={`input-container wide ${manualResult ? manualResult.status : ''}`}>
                  <input 
                    type="text" 
                    placeholder="Enter a keyword or full domain..." 
                    value={inputVal}
                    onChange={(e) => {
                      setInputVal(e.target.value);
                      if (manualResult) setManualResult(null);
                    }}
                    autoFocus
                  />
                  {inputVal && (
                    <div className="input-actions">
                      <button 
                        type="button" 
                        className={`btn-heart-input ${isFavorited(inputVal.trim().replace(/\.com$/i, '')) ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const word = inputVal.trim().replace(/\.com$/i, '');
                          toggleFavorite(word, (manualResult?.status as FavoriteItem['status']) || 'available');
                        }}
                        title="Favorite"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited(inputVal.trim().replace(/\.com$/i, '')) ? "#ff4444" : "none"} stroke={isFavorited(inputVal.trim().replace(/\.com$/i, '')) ? "#ff4444" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                      </button>

                      <button 
                        type="button" 
                        className={`btn-copy-input ${copiedId === -10 ? 'copied' : ''}`} 
                        onClick={(e) => {
                          e.stopPropagation();
                          const fullDomain = `${inputVal.trim().replace(/\.com$/i, '').toLowerCase()}.com`;
                          navigator.clipboard.writeText(fullDomain);
                          setCopiedId(-10);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        title="Copy Domain"
                      >
                        {copiedId === -10 ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </button>

                      <button type="button" className="btn-clear" onClick={() => { setInputVal(''); setManualResult(null); }} title="Clear">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  )}
                  <button type="button" className="btn-icon-random" onClick={(e) => handleRandomDomain(e)} title="Random Domain">
                    🎲
                  </button>
                </div>
                <button type="submit" className="btn-check-main" disabled={!inputVal.trim() || manualResult?.status === 'loading'}>
                  {manualResult?.status === 'loading' ? '...' : 'Check'}
                </button>
              </form>

              <div className="stats-section">
                <div className="stat-card available">
                  <ScrollingNumber value={sessionStats.available} />
                  <span className="stat-label">Available</span>
                </div>
                <div className="stat-card taken">
                  <ScrollingNumber value={sessionStats.taken} />
                  <span className="stat-label">Taken</span>
                </div>
                <div className="stat-card premium">
                  <ScrollingNumber value={sessionStats.premium} />
                  <span className="stat-label">Premium</span>
                </div>
                <div className="stat-card aftermarket">
                  <ScrollingNumber value={sessionStats.aftermarket} />
                  <span className="stat-label">Aftermarket</span>
                </div>
              </div>

              <div className="explore-promo">
                <div className="promo-card">
                  <h2 className="explore-heading">Explore Infinite Domain Possibilities</h2>
                  <p className="promo-description">
                    Not sure where to begin? Dive into our discovery engine. Generate unique keywords, 
                    discover trending niches, and find the perfect brandable domain for your next big project.
                  </p>
                  <button className="btn-primary btn-explore-main" onClick={handleExploreIdeas}>
                    Explore Ideas
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '0.5rem' }}>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </button>
                  <p className="promo-footer">Let us suggest keywords and check availability for you.</p>
                </div>
              </div>

              <div className="domain-ticker-section">
                <div className="ticker-wrapper">
                  <div className="ticker-row ticker-left">
                    <div className="ticker-group">
                      {TICKER_DOMAINS_1.map(d => <span key={d}>{d}</span>)}
                      {TICKER_DOMAINS_1.map(d => <span key={`dup-${d}`}>{d}</span>)}
                    </div>
                  </div>
                </div>
                <div className="ticker-wrapper">
                  <div className="ticker-row ticker-right">
                    <div className="ticker-group">
                      {TICKER_DOMAINS_2.map(d => <span key={d}>{d}</span>)}
                      {TICKER_DOMAINS_2.map(d => <span key={`dup-${d}`}>{d}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="streaming-controls">
                <div className="explore-input-group">
                  <input 
                    type="text" 
                    placeholder="Type keyword..." 
                    value={keyword}
                    onChange={(e) => {
                      setKeyword(e.target.value);
                      if (domains.length > 0) {
                        setDomains([]);
                        usedWords.current.clear();
                        idCounter.current = 0;
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && keyword && !isLoading) generateBatch(keyword);
                    }}
                  />
                  <div className="explore-actions">
                    {keyword && (
                      <button 
                        type="button" 
                        className="btn-clear-explore" 
                        onClick={() => {
                          setKeyword('');
                          setDomains([]);
                          usedWords.current.clear();
                          idCounter.current = 0;
                        }} 
                        title="Clear"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                    <button className="btn-random-inline" onClick={handleRandomKeyword} title="Random Keyword">🎲</button>
                    <button 
                      className="btn-explore-icon" 
                      onClick={() => keyword && generateBatch(keyword)} 
                      disabled={isLoading || !keyword}
                      title="Explore Suggestions"
                    >
                      {isLoading ? (
                        <div className="loading-spinner"></div>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"></circle>
                          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
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
                              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited(item.word) ? "#ff4444" : "none"} stroke={isFavorited(item.word) ? "#ff4444" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.84-8.84 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                              </svg>
                            </button>

                            <button 
                              className={`btn-copy ${copiedId === item.id ? 'copied' : ''}`} 
                              onClick={(e) => handleCopy(e, item.id, item.word)}
                              title="Copy Domain"
                            >
                              {copiedId === item.id ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
