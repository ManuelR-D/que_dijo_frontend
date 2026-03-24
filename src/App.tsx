import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { Landmark } from 'lucide-react';
import { LAWS, SENATORS, getInterventions, loadInterventions } from './data';
import { Law, Vote, Senator, Intervention } from './types';
import { LawsList } from './components/LawsList';
import { LawDetail } from './components/LawDetail';
import { VoteDetail } from './components/VoteDetail';
import { SenatorIntervention } from './components/SenatorIntervention';
import { TranscriptSearch } from './components/TranscriptSearch';

type ViewState = 'laws' | 'lawDetail' | 'voteDetail' | 'senatorDetail' | 'search';

// --- Hash-based routing helpers ---

function buildHash(view: ViewState, lawId?: string, voteId?: string, senatorId?: string): string {
  if (view === 'search') return '#/buscar';
  // search with params is handled separately via buildSearchHash

  if (view === 'senatorDetail' && lawId && voteId && senatorId)
    return `#/ley/${lawId}/votacion/${voteId}/senador/${senatorId}`;
  if (view === 'voteDetail' && lawId && voteId)
    return `#/ley/${lawId}/votacion/${voteId}`;
  if (view === 'lawDetail' && lawId)
    return `#/ley/${lawId}`;
  return '#/';
}

function buildSearchHash(query?: string, lawId?: string): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (lawId) params.set('ley', lawId);
  const qs = params.toString();
  return qs ? `#/buscar?${qs}` : '#/buscar';
}

interface ResolvedRoute {
  view: ViewState;
  law: Law | null;
  vote: Vote | null;
  senatorState: { senator: Senator; intervention?: Intervention } | null;
  searchQuery?: string;
  searchLawId?: string;
}

function resolveHash(hash: string): ResolvedRoute {
  const path = hash.replace(/^#\/?/, '');
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'buscar' || path.startsWith('buscar')) {
    const qsIdx = path.indexOf('?');
    const params = qsIdx >= 0 ? new URLSearchParams(path.slice(qsIdx + 1)) : new URLSearchParams();
    return {
      view: 'search', law: null, vote: null, senatorState: null,
      searchQuery: params.get('q') || undefined,
      searchLawId: params.get('ley') || undefined,
    };
  }

  // /ley/{lawId}/votacion/{voteId}/senador/{senatorId}
  // parts: ['ley', lawId, 'votacion', voteId, 'senador', senatorId]
  const lawId = parts[0] === 'ley' ? parts[1] : undefined;
  const voteId = parts[2] === 'votacion' ? parts[3] : undefined;
  const senatorId = parts[4] === 'senador' ? parts[5] : undefined;

  const law = lawId ? LAWS.find(l => l.id === lawId) ?? null : null;
  const vote = law && voteId ? law.votes.find(v => v.id === voteId) ?? null : null;

  let senatorState: ResolvedRoute['senatorState'] = null;
  if (vote && senatorId) {
    const senator = SENATORS[senatorId];
    if (senator) {
      const interventions = getInterventions();
      const basicIntervention = vote.interventions.find(i => i.senatorId === senatorId);
      const realData = interventions[vote.id]?.[senatorId];
      const intervention = basicIntervention
        ? realData ? { ...basicIntervention, summary: realData.summary, transcript: realData.transcript } : basicIntervention
        : undefined;
      senatorState = { senator, intervention };
    }
  }

  const view: ViewState = senatorState ? 'senatorDetail'
    : vote ? 'voteDetail'
    : law ? 'lawDetail'
    : 'laws';

  return { view, law, vote, senatorState };
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('laws');
  const [selectedLaw, setSelectedLaw] = useState<Law | null>(null);
  const [selectedVote, setSelectedVote] = useState<Vote | null>(null);
  const [selectedSenator, setSelectedSenator] = useState<{ senator: Senator; intervention?: Intervention } | null>(null);
  const [interventionsLoaded, setInterventionsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | undefined>();
  const [searchLawId, setSearchLawId] = useState<string | undefined>();
  const [cameFromSearch, setCameFromSearch] = useState(false);

  // Apply a resolved route to component state
  const applyRoute = useCallback((route: ResolvedRoute) => {
    setCurrentView(route.view);
    setSelectedLaw(route.law);
    setSelectedVote(route.vote);
    setSelectedSenator(route.senatorState);
    if (route.view === 'search') {
      setSearchQuery(route.searchQuery);
      setSearchLawId(route.searchLawId);
    }
  }, []);

  // On mount: load interventions then resolve initial hash
  useEffect(() => {
    loadInterventions().then(() => {
      setInterventionsLoaded(true);
      // Re-resolve after interventions are available (needed for senator detail deep-links)
      const route = resolveHash(window.location.hash);
      if (route.view !== 'laws') applyRoute(route);
    });
    // Also resolve immediately for views that don't need interventions
    const initial = resolveHash(window.location.hash);
    if (initial.view !== 'laws' || window.location.hash) applyRoute(initial);
  }, [applyRoute]);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const route = resolveHash(window.location.hash);
      applyRoute(route);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [applyRoute]);

  // Navigate by pushing hash (triggers hashchange → applyRoute)
  const navigate = useCallback((view: ViewState, law?: Law | null, vote?: Vote | null, senatorId?: string) => {
    const hash = buildHash(view, law?.id, vote?.id, senatorId);
    window.location.hash = hash;
    // hashchange listener will update state & scroll
  }, []);

  const handleSelectLaw = (law: Law) => {
    navigate('lawDetail', law);
  };

  const handleSelectVote = (vote: Vote) => {
    navigate('voteDetail', selectedLaw, vote);
  };

  const handleSelectSenator = (senator: Senator, intervention?: Intervention) => {
    setSelectedSenator({ senator, intervention });
    setCameFromSearch(false);
    navigate('senatorDetail', selectedLaw, selectedVote, senator.id);
  };

  const handleBackToLaws = () => {
    navigate('laws');
  };

  const handleBackToLawDetail = () => {
    navigate('lawDetail', selectedLaw);
  };

  const handleBackFromSenator = () => {
    if (cameFromSearch) {
      setCameFromSearch(false);
      const hash = buildSearchHash(searchQuery, searchLawId);
      window.location.hash = hash;
    } else {
      navigate('voteDetail', selectedLaw, selectedVote);
    }
  };

  const handleSearchResult = (law: Law, vote: Vote, senator: Senator, intervention: Intervention) => {
    setSelectedLaw(law);
    setSelectedVote(vote);
    setSelectedSenator({ senator, intervention });
    setCameFromSearch(true);
    navigate('senatorDetail', law, vote, senator.id);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => navigate('laws')}
          >
            <div className="p-2 rounded-xl transition-colors">
              <img src="/favicon.png" alt="¿Qué dijo?" className="w-10 h-10" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">¿Qué dijo?</span>
          </div>
          <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium text-slate-500">
            <button onClick={() => navigate('laws')} className={`transition-colors ${currentView !== 'search' ? 'text-indigo-600' : 'hover:text-slate-900'}`}>Leyes</button>
            <button onClick={() => navigate('search')} className={`transition-colors ${currentView === 'search' ? 'text-indigo-600' : 'hover:text-slate-900'}`}>Buscador</button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <AnimatePresence mode="wait">
          {currentView === 'laws' && (
            <LawsList 
              key="laws" 
              laws={LAWS} 
              onSelectLaw={handleSelectLaw}
              onSelectIntervention={handleSearchResult}
              interventionsLoaded={interventionsLoaded}
            />
          )}
          
          {currentView === 'lawDetail' && selectedLaw && (
            <LawDetail 
              key="lawDetail" 
              law={selectedLaw} 
              onBack={handleBackToLaws} 
              onSelectVote={handleSelectVote}
              onSelectSenator={(vote, senator, intervention) => {
                setSelectedSenator({ senator, intervention });
                navigate('senatorDetail', selectedLaw, vote, senator.id);
              }}
            />
          )}

          {currentView === 'voteDetail' && selectedVote && (
            <VoteDetail 
              key="voteDetail" 
              vote={selectedVote} 
              onBack={handleBackToLawDetail} 
              onSelectSenator={handleSelectSenator} 
            />
          )}

          {currentView === 'senatorDetail' && selectedSenator && selectedVote && (
            <SenatorIntervention 
              key="senatorDetail" 
              senator={selectedSenator.senator} 
              intervention={selectedSenator.intervention} 
              vote={selectedVote}
              onBack={handleBackFromSenator}
              backLabel={cameFromSearch ? 'Volver al buscador' : undefined} 
            />
          )}

          {currentView === 'search' && (
            <TranscriptSearch
              key="search"
              laws={LAWS}
              onSelectResult={handleSearchResult}
              initialQuery={searchQuery}
              initialLawId={searchLawId}
              onSearchChange={(q, lawId) => {
                setSearchQuery(q || undefined);
                setSearchLawId(lawId || undefined);
                if (!window.location.hash.startsWith('#/buscar')) return;
                const hash = buildSearchHash(q, lawId);
                history.replaceState(null, '', hash);
              }}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
