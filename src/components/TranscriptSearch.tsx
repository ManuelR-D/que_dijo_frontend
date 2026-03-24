import { useState, useMemo, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { Search, MessageSquare, ChevronRight, X, Filter } from 'lucide-react';
import { Law, Vote, Senator, Intervention } from '../types';
import { SENATORS, getInterventions } from '../data';
import { SenatorAvatar } from './SenatorAvatar';

interface SearchResult {
  senator: Senator;
  law: Law;
  vote: Vote;
  intervention: Intervention;
  matchField: 'transcript' | 'summary';
  snippet: string;
}

function buildSnippet(text: string, query: string, radius = 80): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = '';
  if (start > 0) snippet += '…';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '…';
  return snippet;
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part)
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
      : part
  );
}

interface TranscriptSearchProps {
  laws: Law[];
  onSelectResult: (law: Law, vote: Vote, senator: Senator, intervention: Intervention) => void;
  initialQuery?: string;
  initialLawId?: string;
  onSearchChange?: (query: string, lawId: string) => void;
}

export function TranscriptSearch({ laws, onSelectResult, initialQuery, initialLawId, onSearchChange }: TranscriptSearchProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery || '');
  const [selectedLawId, setSelectedLawId] = useState(initialLawId || '');
  const [lawFilterText, setLawFilterText] = useState(() => {
    if (!initialLawId) return '';
    const law = laws.find(l => l.id === initialLawId);
    return law?.title || '';
  });
  const [lawDropdownOpen, setLawDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lawDropdownRef = useRef<HTMLDivElement>(null);
  const lawListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (lawDropdownRef.current && !lawDropdownRef.current.contains(e.target as Node)) {
        setLawDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredLawOptions = useMemo(() => {
    const text = lawFilterText.toLowerCase().trim();
    if (!text) return laws;
    return laws.filter(l => l.title.toLowerCase().includes(text));
  }, [laws, lawFilterText]);

  // Reset highlight when options change
  useEffect(() => { setHighlightedIdx(-1); }, [filteredLawOptions]);

  // Sync search state to URL
  useEffect(() => {
    onSearchChange?.(debouncedQuery, selectedLawId);
  }, [debouncedQuery, selectedLawId, onSearchChange]);

  const selectLawOption = (idx: number) => {
    if (idx < 0) {
      setSelectedLawId(''); setLawFilterText('');
    } else {
      const law = filteredLawOptions[idx];
      if (law) { setSelectedLawId(law.id); setLawFilterText(law.title); }
    }
    setLawDropdownOpen(false);
  };

  const handleLawKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!lawDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setLawDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }
    const total = filteredLawOptions.length; // -1 = "Todas", 0..total-1 = laws
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, total - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectLawOption(highlightedIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setLawDropdownOpen(false);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (!lawDropdownOpen || !lawListRef.current) return;
    // idx -1 is the first <li> ("Todas"), 0 is second, etc.
    const child = lawListRef.current.children[highlightedIdx + 1] as HTMLElement | undefined;
    child?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, lawDropdownOpen]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(value), 300);
  }, []);

  // Build voteId → { law, vote } lookup once
  const voteIndex = useMemo(() => {
    const map = new Map<string, { law: Law; vote: Vote }>();
    for (const law of laws) {
      for (const vote of law.votes) {
        map.set(vote.id, { law, vote });
      }
    }
    return map;
  }, [laws]);

  // Set of valid voteIds for the selected law filter
  const filteredVoteIds = useMemo(() => {
    if (!selectedLawId) return null;
    const law = laws.find(l => l.id === selectedLawId);
    if (!law) return null;
    return new Set(law.votes.map(v => v.id));
  }, [selectedLawId, laws]);

  const results = useMemo((): SearchResult[] => {
    const q = debouncedQuery.trim();
    if (q.length < 3) return [];
    const interventions = getInterventions();
    const hits: SearchResult[] = [];
    const MAX = 50;

    for (const [voteId, senators] of Object.entries(interventions)) {
      if (filteredVoteIds && !filteredVoteIds.has(voteId)) continue;
      const ctx = voteIndex.get(voteId);
      if (!ctx) continue;
      for (const [senatorId, data] of Object.entries(senators)) {
        if (hits.length >= MAX) break;
        const senator = SENATORS[senatorId];
        if (!senator) continue;

        const basicIntervention = ctx.vote.interventions.find(i => i.senatorId === senatorId);
        const intervention: Intervention = basicIntervention
          ? { ...basicIntervention, summary: data.summary, transcript: data.transcript }
          : { senatorId, voteId, vote: 'Ausente', summary: data.summary, transcript: data.transcript };

        if (data.transcript && data.transcript.toLowerCase().includes(q.toLowerCase())) {
          hits.push({
            senator, law: ctx.law, vote: ctx.vote, intervention,
            matchField: 'transcript',
            snippet: buildSnippet(data.transcript, q),
          });
        } else if (data.summary && data.summary.toLowerCase().includes(q.toLowerCase())) {
          hits.push({
            senator, law: ctx.law, vote: ctx.vote, intervention,
            matchField: 'summary',
            snippet: buildSnippet(data.summary, q),
          });
        }
      }
      if (hits.length >= MAX) break;
    }
    return hits;
  }, [debouncedQuery, voteIndex, filteredVoteIds]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Buscador de transcripciones</h1>
        <p className="text-slate-500">Buscá en todas las intervenciones de los senadores durante los debates parlamentarios.</p>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar en transcripciones… (mínimo 3 caracteres)"
          className="block w-full pl-12 pr-10 py-4 border border-slate-200 rounded-2xl text-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors shadow-sm"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          autoFocus
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setDebouncedQuery(''); }}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="relative flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="relative w-full" ref={lawDropdownRef}>
          <input
            type="text"
            value={lawFilterText}
            onChange={(e) => { setLawFilterText(e.target.value); setLawDropdownOpen(true); }}
            onFocus={() => setLawDropdownOpen(true)}
            onKeyDown={handleLawKeyDown}
            placeholder="Todas las leyes"
            className="block w-full py-2 px-3 pr-8 border border-slate-200 rounded-xl bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
          {selectedLawId && (
            <button
              onClick={() => { setSelectedLawId(''); setLawFilterText(''); }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {lawDropdownOpen && (
            <ul ref={lawListRef} className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg text-sm">
              <li
                onClick={() => selectLawOption(-1)}
                className={`px-3 py-2 cursor-pointer text-slate-500 italic ${highlightedIdx === -1 ? 'bg-indigo-100' : 'hover:bg-indigo-50'}`}
              >
                Todas las leyes
              </li>
              {filteredLawOptions.map((law, i) => (
                <li
                  key={law.id}
                  onClick={() => selectLawOption(i)}
                  className={`px-3 py-2 cursor-pointer text-slate-700 truncate ${highlightedIdx === i ? 'bg-indigo-100' : 'hover:bg-indigo-50'}`}
                >
                  {law.title}
                </li>
              ))}
              {filteredLawOptions.length === 0 && (
                <li className="px-3 py-2 text-slate-400 italic">Sin resultados</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {debouncedQuery.length >= 3 && (
        <div className="text-sm text-slate-500">
          {results.length === 0 ? 'No se encontraron resultados.' : `${results.length}${results.length === 50 ? '+' : ''} resultado${results.length !== 1 ? 's' : ''}`}
        </div>
      )}

      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={`${r.vote.id}-${r.senator.id}-${i}`}
            onClick={() => onSelectResult(r.law, r.vote, r.senator, r.intervention)}
            className="group bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <SenatorAvatar
                src={r.senator.imageUrl}
                name={r.senator.name}
                className="w-10 h-10 border border-slate-200 flex-shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors">{r.senator.name}</span>
                  <span className="text-xs text-slate-400">{r.senator.party}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {r.matchField === 'transcript' ? 'Transcripción' : 'Resumen'}
                  </span>
                </div>
                <div className="text-xs text-indigo-600 font-medium mt-0.5 truncate">{r.law.title} — {r.vote.title}</div>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed line-clamp-3">
                  {highlightMatch(r.snippet, debouncedQuery)}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 flex-shrink-0 mt-1" />
            </div>
          </div>
        ))}
      </div>

      {debouncedQuery.length > 0 && debouncedQuery.length < 3 && (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">Escribí al menos 3 caracteres para buscar.</p>
        </div>
      )}

      {!debouncedQuery && (
        <div className="text-center py-12">
          <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">Ingresá un término para buscar en las transcripciones de los debates.</p>
        </div>
      )}
    </motion.div>
  );
}
