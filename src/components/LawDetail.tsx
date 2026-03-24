import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, HelpCircle, ChevronRight, MessageSquare, Users, Sparkles } from 'lucide-react';
import { Law, Vote, Senator, Intervention, VoteOption } from '../types';
import { getInterventions, SENATORS, BLOC_PRESIDENTS_BY_YEAR } from '../data';
import { SenatorAvatar } from './SenatorAvatar';

interface BlocLeaderSummary {
  senatorId: string;
  voteId: string;
  name: string;
  party: string;
  imageUrl: string;
  vote: VoteOption | undefined;
  summary: string;
}

function getBlocLeaderSummaries(law: Law, interventions: ReturnType<typeof getInterventions>): BlocLeaderSummary[] {
  const result = new Map<string, BlocLeaderSummary>();
  const year = law.date?.slice(0, 4) || '2025';
  const presidents = new Set(BLOC_PRESIDENTS_BY_YEAR[year] || BLOC_PRESIDENTS_BY_YEAR['2025'] || []);

  // Helper to build a summary entry
  const buildEntry = (senatorId: string, data: { summary: string }, vote: Vote): BlocLeaderSummary | null => {
    const senator = SENATORS[senatorId];
    if (!senator) return null;
    const basicIntervention = vote.interventions.find(i => i.senatorId === senatorId);
    return {
      senatorId,
      voteId: vote.id,
      name: senator.name,
      party: senator.party,
      imageUrl: senator.imageUrl,
      vote: basicIntervention?.vote,
      summary: data.summary,
    };
  };

  // First pass: prioritize bloc presidents
  for (const vote of law.votes) {
    const voteInterventions = interventions[vote.id];
    if (!voteInterventions) continue;
    for (const presId of presidents) {
      if (result.has(presId)) continue;
      const data = voteInterventions[presId];
      if (!data?.summary) continue;
      const entry = buildEntry(presId, data, vote);
      if (entry) result.set(presId, entry);
    }
  }

  // Second pass: fill remaining parties with any senator who has a summary
  const seenParties = new Set(Array.from(result.values()).map(e => e.party));
  for (const vote of law.votes) {
    const voteInterventions = interventions[vote.id];
    if (!voteInterventions) continue;
    for (const [senatorId, data] of Object.entries(voteInterventions)) {
      if (!data.summary) continue;
      const senator = SENATORS[senatorId];
      if (!senator || seenParties.has(senator.party)) continue;
      const entry = buildEntry(senatorId, data, vote);
      if (entry) {
        result.set(senatorId, entry);
        seenParties.add(senator.party);
      }
    }
  }

  return Array.from(result.values());
}

const VOTE_BADGE: Record<string, string> = {
  'Afirmativo': 'bg-emerald-200 text-emerald-800',
  'Negativo': 'bg-rose-200 text-rose-800',
  'Abstención': 'bg-amber-200 text-amber-800',
  'Ausente': 'bg-slate-200 text-slate-600',
};

const VOTE_CARD_BG: Record<string, string> = {
  'Afirmativo': 'bg-emerald-50 border-emerald-200',
  'Negativo': 'bg-rose-50 border-rose-200',
  'Abstención': 'bg-amber-50 border-amber-200',
  'Ausente': 'bg-slate-50 border-slate-200',
};

interface LawDetailProps {
  law: Law;
  onBack: () => void;
  onSelectVote: (vote: Vote) => void;
  onSelectSenator?: (vote: Vote, senator: Senator, intervention: Intervention) => void;
}

export function LawDetail({ law, onBack, onSelectVote, onSelectSenator }: LawDetailProps) {
  const interventions = getInterventions();
  const blocSummaries = useMemo(() => getBlocLeaderSummaries(law, interventions), [law, interventions]);

  const handleBlocClick = (bs: BlocLeaderSummary) => {
    if (!onSelectSenator) return;
    const vote = law.votes.find(v => v.id === bs.voteId);
    if (!vote) return;
    const senator = SENATORS[bs.senatorId];
    if (!senator) return;
    const basicIntervention = vote.interventions.find(i => i.senatorId === bs.senatorId);
    const realData = interventions[vote.id]?.[bs.senatorId];
    const intervention: Intervention = basicIntervention
      ? realData ? { ...basicIntervention, summary: realData.summary, transcript: realData.transcript } : basicIntervention
      : { senatorId: bs.senatorId, voteId: vote.id, vote: bs.vote || 'Ausente', summary: realData?.summary, transcript: realData?.transcript };
    onSelectSenator(vote, senator, intervention);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <button
        onClick={onBack}
        className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Volver al listado
      </button>

      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm border border-slate-200 overflow-hidden">
        <div className="mb-6">
          <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full mb-4 ${
            law.status === 'Aprobada' ? 'bg-emerald-100 text-emerald-700' :
            law.status === 'Rechazada' ? 'bg-rose-100 text-rose-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {law.status}
          </span>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">{law.title}</h1>
          <p className="text-slate-600 text-lg leading-relaxed">{law.description}</p>
        </div>

        {blocSummaries.length > 0 && (
          <div className="mt-8 mb-10">
            <h2 className="text-xl font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              ¿Qué dijeron los representantes de los bloques?
            </h2>
            <p className="text-xs text-slate-400 mb-5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Resúmenes generados con IA a partir de las transcripciones
            </p>
            <div className="grid gap-4">
              {blocSummaries.map((bs) => (
                <div
                  key={bs.senatorId}
                  onClick={() => handleBlocClick(bs)}
                  className={`rounded-2xl border p-3 sm:p-5 overflow-hidden cursor-pointer hover:shadow-md transition-all ${bs.vote ? VOTE_CARD_BG[bs.vote] || 'bg-slate-50 border-slate-200' : 'bg-slate-50 border-slate-200'}`}
                >                  <div className="flex items-center gap-2 sm:gap-3 mb-3">
                    <SenatorAvatar
                      src={bs.imageUrl}
                      name={bs.name}
                      className="w-9 h-9 sm:w-10 sm:h-10 border border-slate-200 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 text-sm truncate">{bs.name}</div>
                      <div className="text-xs text-slate-500 truncate">{bs.party}</div>
                    </div>
                    {bs.vote && (
                      <span className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-full flex-shrink-0 ${VOTE_BADGE[bs.vote] || 'bg-slate-200 text-slate-600'}`}>
                        {bs.vote}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed line-clamp-4 break-words">{bs.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Votaciones asociadas</h2>
          <div className="grid gap-4">
            {law.votes.map((vote) => (
              <div
                key={vote.id}
                onClick={() => onSelectVote(vote)}
                className="group flex items-center justify-between gap-3 p-3 sm:p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors text-sm sm:text-base">{vote.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-sm text-slate-500">
                    <span className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-1 text-emerald-500" /> {vote.summary.afirmativo}</span>
                    <span className="flex items-center"><XCircle className="w-4 h-4 mr-1 text-rose-500" /> {vote.summary.negativo}</span>
                    <span className="flex items-center"><MinusCircle className="w-4 h-4 mr-1 text-amber-500" /> {vote.summary.abstencion}</span>
                    {vote.summary.ausente > 0 && (
                      <span className="flex items-center text-slate-400"><HelpCircle className="w-4 h-4 mr-1" /> {vote.summary.ausente} aus.</span>
                    )}
                    {interventions[vote.id] && (
                      <span className="flex items-center text-indigo-600"><MessageSquare className="w-4 h-4 mr-1" /> {Object.keys(interventions[vote.id]).length}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                  <span className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-full ${
                    vote.result === 'Aprobado' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {vote.result}
                  </span>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 hidden sm:block" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
