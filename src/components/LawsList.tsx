import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ChevronRight, Calendar, MessageCircle, MessageSquare, Flame, ArrowUpDown, Trophy, CheckCircle2, XCircle } from 'lucide-react';
import { Law, Vote, Senator, Intervention, VoteOption } from '../types';
import { SENATORS, getInterventions, BLOC_PRESIDENTS_BY_YEAR } from '../data';

const ALL_BLOC_PRESIDENT_IDS = new Set(Object.values(BLOC_PRESIDENTS_BY_YEAR).flat());

function getBlocPresidentsForLaw(law: Law): string[] {
  const year = law.date?.slice(0, 4) || '2025';
  return BLOC_PRESIDENTS_BY_YEAR[year] || BLOC_PRESIDENTS_BY_YEAR['2025'];
}

type FeaturedCandidate = { senator: typeof SENATORS[string]; quote: string; vote?: VoteOption; voteId: string };

function getSenatorVote(law: Law, senatorId: string): VoteOption | undefined {
  for (const vote of law.votes) {
    const entry = vote.interventions?.find(i => i.senatorId === senatorId);
    if (entry) return entry.vote;
  }
  return undefined;
}

function getFeaturedCandidates(law: Law): FeaturedCandidate[] {
  const interventions = getInterventions();
  const presidents = getBlocPresidentsForLaw(law);
  const candidates: FeaturedCandidate[] = [];
  const seen = new Set<string>();
  for (const vote of law.votes) {
    const voteInterventions = interventions[vote.id];
    if (!voteInterventions) continue;
    for (const presId of presidents) {
      if (seen.has(presId)) continue;
      const data = voteInterventions[presId];
      const senator = SENATORS[presId];
      if (data?.excerpt && senator?.imageUrl) {
        candidates.push({ senator, quote: data.excerpt, vote: getSenatorVote(law, presId), voteId: vote.id });
        seen.add(presId);
      }
    }
  }
  if (candidates.length > 0) return candidates;
  // Fallback: first senator with excerpt and photo
  for (const vote of law.votes) {
    const voteInterventions = interventions[vote.id];
    if (!voteInterventions) continue;
    for (const [senatorId, data] of Object.entries(voteInterventions)) {
      const senator = SENATORS[senatorId];
      if (senator?.imageUrl && data.excerpt) {
        return [{ senator, quote: data.excerpt, vote: getSenatorVote(law, senatorId), voteId: vote.id }];
      }
    }
  }
  return [];
}

function FeaturedQuote({ candidates, onClickQuote }: { candidates: FeaturedCandidate[]; onClickQuote?: (candidate: FeaturedCandidate) => void }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * candidates.length));
  useEffect(() => {
    if (candidates.length <= 1) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % candidates.length), 7000);
    return () => clearInterval(timer);
  }, [candidates.length]);
  const featured = candidates[index];
  if (!featured) return null;
  const borderColor = featured.vote === 'Afirmativo' ? 'border-emerald-500'
    : featured.vote === 'Negativo' ? 'border-rose-500'
    : 'border-slate-200';
  const bgBubble = featured.vote === 'Afirmativo' ? 'bg-emerald-50'
    : featured.vote === 'Negativo' ? 'bg-rose-50'
    : 'bg-slate-50';
  const arrowColor = featured.vote === 'Afirmativo' ? 'border-r-emerald-500'
    : featured.vote === 'Negativo' ? 'border-r-rose-500'
    : 'border-r-slate-200';
  const arrowInner = featured.vote === 'Afirmativo' ? 'border-r-emerald-50'
    : featured.vote === 'Negativo' ? 'border-r-rose-50'
    : 'border-r-slate-50';
  const handleClick = (e: React.MouseEvent) => {
    if (onClickQuote) {
      e.stopPropagation();
      onClickQuote(featured);
    }
  };

  return (
    <div className="mt-4 flex items-start gap-3 pt-4 border-t border-slate-100 min-w-0" onClick={handleClick}>
      <AnimatePresence mode="wait">
        <motion.div
          key={featured.senator.id}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.3 }}
          className="flex items-start gap-3 flex-1 min-w-0"
        >
          <img
            src={featured.senator.imageUrl}
            alt={featured.senator.name}
            className={`w-10 h-10 rounded-full object-cover border-2 ${borderColor} flex-shrink-0`}
          />
          <div className={`relative ${bgBubble} rounded-xl px-4 py-2.5 flex-1 min-w-0 border ${borderColor} overflow-hidden`}>
            <div className={`absolute -left-[9px] top-3 w-0 h-0 border-t-[6px] border-t-transparent ${arrowColor} border-r-[8px] border-b-[6px] border-b-transparent`}></div>
            <div className={`absolute -left-[7px] top-3 w-0 h-0 border-t-[6px] border-t-transparent ${arrowInner} border-r-[8px] border-b-[6px] border-b-transparent`}></div>
            <p className="text-sm text-slate-600 italic">"{featured.quote}"</p>
            <p className="text-sm text-slate-400 mt-1 font-medium truncate">{featured.senator.name} - {featured.senator.party}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

interface LawsListProps {
  laws: Law[];
  onSelectLaw: (law: Law) => void;
  onSelectIntervention: (law: Law, vote: Vote, senator: Senator, intervention: Intervention) => void;
  interventionsLoaded?: boolean;
}

type SortMode = 'date' | 'interventions';

function getInterventionCount(law: Law): number {
  const interventions = getInterventions();
  const uniqueSenators = new Set<string>();
  for (const vote of law.votes) {
    const vi = interventions[vote.id];
    if (vi) {
      for (const senatorId of Object.keys(vi)) {
        uniqueSenators.add(senatorId);
      }
    }
  }
  return uniqueSenators.size;
}

export function LawsList({ laws, onSelectLaw, onSelectIntervention, interventionsLoaded }: LawsListProps) {
  const handleQuoteClick = useCallback((law: Law, candidate: FeaturedCandidate) => {
    const vote = law.votes.find(v => v.id === candidate.voteId);
    if (!vote) return;
    const interventions = getInterventions();
    const basicIntervention = vote.interventions.find(i => i.senatorId === candidate.senator.id);
    const realData = interventions[vote.id]?.[candidate.senator.id];
    const intervention: Intervention = basicIntervention
      ? realData ? { ...basicIntervention, summary: realData.summary, transcript: realData.transcript } : basicIntervention
      : { senatorId: candidate.senator.id, voteId: vote.id, vote: candidate.vote || 'Ausente', summary: realData?.summary, transcript: realData?.transcript };
    onSelectIntervention(law, vote, candidate.senator, intervention);
  }, [onSelectIntervention]);

  const [sortMode, setSortMode] = useState<SortMode>('date');

  const { sortedLaws, hotLawIds, top3Laws2026, latest3Approved, latest3Rejected } = useMemo(() => {
    const withCounts = laws.map(law => ({ law, count: getInterventionCount(law) }));
    // Top 10 by intervention count
    const topIds = new Set(
      [...withCounts].sort((a, b) => b.count - a.count).slice(0, 10).filter(x => x.count > 0).map(x => x.law.id)
    );
    const sorted = sortMode === 'interventions'
      ? [...withCounts].sort((a, b) => b.count - a.count).map(x => x.law)
      : laws;
    // Top 3 most debated laws of 2026
    const top3 = withCounts
      .filter(x => x.law.date?.startsWith('2026') && x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(x => ({ law: x.law, count: x.count }));
    // Latest 3 approved / rejected (by date, most recent first)
    const latest3Approved = laws
      .filter(l => l.status === 'Aprobada')
      .slice(0, 3);
    const latest3Rejected = laws
      .filter(l => l.status === 'Rechazada')
      .slice(0, 3);
    return { sortedLaws: sorted, hotLawIds: topIds, top3Laws2026: top3, latest3Approved, latest3Rejected };
  }, [laws, sortMode, interventionsLoaded]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Top 3 Most Debated Laws of 2026 */}
      {top3Laws2026.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-6 h-6 text-amber-500" />
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Top 3 leyes más debatidas del 2026</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {top3Laws2026.map(({ law, count }, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
              const ringColor = idx === 0 ? 'ring-amber-400' : idx === 1 ? 'ring-slate-400' : 'ring-amber-700';
              const bgGradient = idx === 0 ? 'from-amber-50 to-white' : idx === 1 ? 'from-slate-50 to-white' : 'from-orange-50 to-white';
              const candidates = getFeaturedCandidates(law);
              return (
                <div
                  key={law.id}
                  onClick={() => onSelectLaw(law)}
                  className={`group relative bg-gradient-to-br ${bgGradient} rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md ring-2 ${ringColor} transition-all cursor-pointer overflow-hidden`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{medal}</span>
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                      law.status === 'Aprobada' ? 'bg-emerald-100 text-emerald-700' :
                      law.status === 'Rechazada' ? 'bg-rose-100 text-rose-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {law.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">
                    {law.title}
                  </h3>
                  <p className="text-slate-500 text-sm line-clamp-2 mb-3">{law.description}</p>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-indigo-600 font-medium">
                      <MessageSquare className="w-4 h-4 mr-1" />
                      {count} intervenciones
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                  </div>
                  {candidates.length > 0 && <FeaturedQuote candidates={candidates} onClickQuote={(c) => handleQuoteClick(law, c)} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Latest approved & rejected */}
      {(latest3Approved.length > 0 || latest3Rejected.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2 mb-10">
          {/* Approved */}
          {latest3Approved.length > 0 && (
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-slate-900">Últimas 3 leyes aprobadas</h2>
              </div>
              <div className="space-y-3">
                {latest3Approved.map(law => {
                  const candidates = getFeaturedCandidates(law);
                  return (
                    <div
                      key={law.id}
                      onClick={() => onSelectLaw(law)}
                      className="group bg-white rounded-xl p-4 border border-emerald-200 hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-2">{law.title}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(law.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 flex-shrink-0" />
                      </div>
                      {candidates.length > 0 && <FeaturedQuote candidates={candidates} onClickQuote={(c) => handleQuoteClick(law, c)} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* Rejected */}
          {latest3Rejected.length > 0 && (
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-5 h-5 text-rose-500" />
                <h2 className="text-lg font-bold text-slate-900">Últimas 3 leyes rechazadas</h2>
              </div>
              <div className="space-y-3">
                {latest3Rejected.map(law => {
                  const candidates = getFeaturedCandidates(law);
                  return (
                    <div
                      key={law.id}
                      onClick={() => onSelectLaw(law)}
                      className="group bg-white rounded-xl p-4 border border-rose-200 hover:border-rose-400 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                          <XCircle className="w-4 h-4 text-rose-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-rose-700 transition-colors line-clamp-2">{law.title}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">{new Date(law.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-rose-500 flex-shrink-0" />
                      </div>
                      {candidates.length > 0 && <FeaturedQuote candidates={candidates} onClickQuote={(c) => handleQuoteClick(law, c)} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Últimas Leyes Debatidas</h1>
          <p className="text-slate-500 mt-2">Seguimiento de la actividad legislativa en el Senado de la Nación.</p>
        </div>
        <button
          onClick={() => setSortMode(m => m === 'date' ? 'interventions' : 'date')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-colors"
        >
          <ArrowUpDown className="w-4 h-4" />
          {sortMode === 'date' ? 'Cronológico' : 'Más debatidas'}
        </button>
      </div>

      <div className="grid gap-4">
        {sortedLaws.map((law) => {
          const candidates = getFeaturedCandidates(law);
          const interventionCount = getInterventionCount(law);
          const isHot = hotLawIds.has(law.id);
          return (
          <div
            key={law.id}
            onClick={() => onSelectLaw(law)}
            className="group bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    law.status === 'Aprobada' ? 'bg-emerald-100 text-emerald-700' :
                    law.status === 'Rechazada' ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {law.status}
                  </span>
                  <div className="flex items-center text-slate-400 text-sm">
                    <Calendar className="w-4 h-4 mr-1" />
                    {new Date(law.date).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  {interventionCount > 0 && (
                    <div className="flex items-center text-indigo-600 text-sm">
                      <MessageSquare className="w-4 h-4 mr-1" />
                      {interventionCount} intervenciones
                      {isHot && <Flame className="w-5 h-5 ml-1 text-red-500" />}
                    </div>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">
                  {law.title}
                </h2>
                <p className="text-slate-600 line-clamp-2">
                  {law.description}
                </p>
              </div>
              <div className="ml-4 sm:ml-6 flex-shrink-0 hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 group-hover:bg-indigo-50 transition-colors">
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
              </div>
            </div>

            {candidates.length > 0 && <FeaturedQuote candidates={candidates} onClickQuote={(c) => handleQuoteClick(law, c)} />}
          </div>
          );
        })}
      </div>
    </motion.div>
  );
}
