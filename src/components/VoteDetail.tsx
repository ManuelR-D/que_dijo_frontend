import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, HelpCircle, Search, MessageSquare, UserX, ExternalLink } from 'lucide-react';
import { Vote, Senator, Intervention } from '../types';
import { SENATORS, getInterventions } from '../data';
import { SenatorAvatar } from './SenatorAvatar';
import { useState } from 'react';

interface VoteDetailProps {
  vote: Vote;
  onBack: () => void;
  onSelectSenator: (senator: Senator, intervention: Intervention | undefined) => void;
}

export function VoteDetail({ vote, onBack, onSelectSenator }: VoteDetailProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const interventions = getInterventions();

  // Build list from vote participants to avoid duplicates across years
  const voteSenators = vote.interventions
    .map(i => SENATORS[i.senatorId])
    .filter((s): s is Senator => !!s);

  const filteredSenators = voteSenators.filter(senator => 
    senator.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    senator.party.toLowerCase().includes(searchTerm.toLowerCase()) ||
    senator.province.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    const aHas = interventions[vote.id]?.[a.id] ? 0 : 1;
    const bHas = interventions[vote.id]?.[b.id] ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return a.name.localeCompare(b.name);
  });

  const getVoteForSenator = (senatorId: string) => {
    const basicIntervention = vote.interventions.find(i => i.senatorId === senatorId);
    if (!basicIntervention) return undefined;
    // Enrich with real intervention data if available
    const realData = interventions[vote.id]?.[senatorId];
    if (realData) {
      return { ...basicIntervention, summary: realData.summary, transcript: realData.transcript };
    }
    return basicIntervention;
  };

  const hasRealIntervention = (senatorId: string) => {
    return !!interventions[vote.id]?.[senatorId];
  };

  const getExcerpt = (senatorId: string) => {
    const data = interventions[vote.id]?.[senatorId];
    if (!data?.excerpt) return '';
    const text = data.excerpt.slice(0, 80);
    return text.length < data.excerpt.length ? text.trimEnd() + '…' : text;
  };

  const getVoteIcon = (voteOption: string | undefined) => {
    switch (voteOption) {
      case 'Afirmativo': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'Negativo': return <XCircle className="w-5 h-5 text-rose-500" />;
      case 'Abstención': return <MinusCircle className="w-5 h-5 text-amber-500" />;
      case 'Ausente': return <HelpCircle className="w-5 h-5 text-slate-400" />;
      default: return <HelpCircle className="w-5 h-5 text-slate-200" />;
    }
  };

  const getRowBg = (voteOption: string | undefined) => {
    switch (voteOption) {
      case 'Afirmativo': return 'bg-emerald-50 md:bg-transparent';
      case 'Negativo': return 'bg-rose-50 md:bg-transparent';
      case 'Abstención': return 'bg-amber-50 md:bg-transparent';
      case 'Ausente': return 'bg-slate-50 md:bg-transparent';
      default: return 'md:bg-transparent';
    }
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
        Volver a la ley
      </button>

      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{vote.title}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{new Date(vote.date).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className={`font-medium ${vote.result === 'Aprobado' ? 'text-emerald-600' : 'text-rose-600'}`}>
                Resultado: {vote.result}
              </span>
            </div>
            {vote.url && (
              <a
                href={vote.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Ver acta de votación en el Senado
              </a>
            )}
          </div>

          <div className="grid grid-cols-4 gap-0 p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="text-center px-1 sm:px-4 border-r border-slate-200">
              <div className="text-xl sm:text-2xl font-bold text-emerald-600">{vote.summary.afirmativo}</div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">A favor</div>
            </div>
            <div className="text-center px-1 sm:px-4 border-r border-slate-200">
              <div className="text-xl sm:text-2xl font-bold text-rose-600">{vote.summary.negativo}</div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">En contra</div>
            </div>
            <div className="text-center px-1 sm:px-4 border-r border-slate-200">
              <div className="text-xl sm:text-2xl font-bold text-amber-600">{vote.summary.abstencion}</div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Abst.</div>
            </div>
            <div className="text-center px-1 sm:px-4">
              <div className="text-xl sm:text-2xl font-bold text-slate-400">{vote.summary.ausente}</div>
              <div className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider">Ausentes</div>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar senador, partido o provincia..."
            className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-y-auto max-h-[600px] border border-slate-200 rounded-2xl">
          <table className="w-full table-fixed divide-y divide-slate-200">
            <colgroup>
              <col className="w-[45%] md:w-[30%]" />
              <col className="w-[55%] md:w-[37%]" />
              <col className="hidden md:table-column md:w-[8%]" />
              <col className="hidden md:table-column md:w-[25%]" />
            </colgroup>
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Senador</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Intervención</th>
                <th scope="col" className="hidden md:table-cell px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Voto</th>
                <th scope="col" className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bloque / Provincia</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredSenators.map((senator) => {
                const intervention = getVoteForSenator(senator.id);
                return (
                  <tr 
                    key={senator.id} 
                    onClick={() => onSelectSenator(senator, intervention)}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer group ${getRowBg(intervention?.vote)}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center min-w-0">
                        <div className="flex-shrink-0 h-9 w-9">
                          <SenatorAvatar src={senator.imageUrl} name={senator.name} className="h-9 w-9 border border-slate-200" />
                        </div>
                        <div className="ml-3 truncate">
                          <div className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{senator.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {hasRealIntervention(senator.id) ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MessageSquare className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                          <span className="text-slate-500 line-clamp-2 italic text-xs">
                            {getExcerpt(senator.id)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300"><MessageSquare className="w-4 h-4" /></span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-center">
                      {getVoteIcon(intervention?.vote)}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
                      <div className="text-sm text-slate-900 truncate">{senator.party}</div>
                      <div className="text-sm text-slate-500 truncate">{senator.province}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredSenators.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              No se encontraron senadores que coincidan con la búsqueda.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
