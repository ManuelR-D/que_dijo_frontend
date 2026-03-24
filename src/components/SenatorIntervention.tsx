import { motion } from 'motion/react';
import { ArrowLeft, Quote, CheckCircle2, XCircle, MinusCircle, HelpCircle, MessageSquare, ExternalLink } from 'lucide-react';
import { Senator, Intervention, Vote } from '../types';
import { SenatorAvatar } from './SenatorAvatar';

function comoVotoUrl(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return `https://comovoto.dev.ar/?leg=${encodeURIComponent(normalized)}`;
}

interface SenatorInterventionProps {
  senator: Senator;
  intervention?: Intervention;
  vote: Vote;
  onBack: () => void;
  backLabel?: string;
}

export function SenatorIntervention({ senator, intervention, vote, onBack, backLabel }: SenatorInterventionProps) {
  const getVoteBadge = (voteOption: string | undefined) => {
    switch (voteOption) {
      case 'Afirmativo': return <span className="px-3 py-1.5 text-sm font-medium rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4"/> Afirmativo</span>;
      case 'Negativo': return <span className="px-3 py-1.5 text-sm font-medium rounded-full bg-rose-100 text-rose-700 flex items-center gap-1.5"><XCircle className="w-4 h-4"/> Negativo</span>;
      case 'Abstención': return <span className="px-3 py-1.5 text-sm font-medium rounded-full bg-amber-100 text-amber-700 flex items-center gap-1.5"><MinusCircle className="w-4 h-4"/> Abstención</span>;
      case 'Ausente': return <span className="px-3 py-1.5 text-sm font-medium rounded-full bg-slate-100 text-slate-700 flex items-center gap-1.5"><HelpCircle className="w-4 h-4"/> Ausente</span>;
      default: return <span className="px-3 py-1.5 text-sm font-medium rounded-full bg-slate-50 text-slate-400 flex items-center gap-1.5"><HelpCircle className="w-4 h-4"/> Sin registro</span>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6 max-w-4xl mx-auto"
    >
      <button
        onClick={onBack}
        className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        {backLabel || 'Volver a la votación'}
      </button>

      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
        {/* Header Profile */}
        <div className="bg-slate-50 p-8 border-b border-slate-200 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <SenatorAvatar
            src={senator.imageUrl}
            name={senator.name}
            className="w-32 h-32 border-4 border-white shadow-md text-3xl"
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{senator.name}</h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-slate-600 mb-4">
              <span className="font-medium">{senator.party}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
              <span>{senator.province}</span>
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
            <div className="inline-flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-sm text-slate-500 font-medium">Voto en {vote.title}:</span>
              {getVoteBadge(intervention?.vote)}
            </div>
            <a
              href={comoVotoUrl(senator.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              <img src="favicon_como_voto.svg" alt="" className="w-5 h-5" />
              Ver historial completo en ComoVoto
            </a>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {intervention ? (
            <div className="space-y-10">
              {intervention.summary && (
                <section>
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Resumen de la intervención</h2>
                  <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                    <p className="text-lg text-slate-800 leading-relaxed font-medium">
                      {intervention.summary}
                    </p>
                  </div>
                </section>
              )}

              {intervention.transcript && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Transcripción textual</h2>
                    <a
                      href="https://www.senado.gob.ar/parlamentario/sesiones/busquedaTac"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 font-medium transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ver taquigráfica
                    </a>
                  </div>
                  <div className="relative">
                    <Quote className="absolute -top-3 -left-4 w-10 h-10 text-slate-100 rotate-180" />
                    <blockquote className="relative z-10 pl-6 border-l-4 border-indigo-200 text-slate-600 text-lg leading-relaxed italic">
                      "{intervention.transcript}"
                    </blockquote>
                  </div>
                </section>
              )}

              {!intervention.summary && !intervention.transcript && (
                <div className="text-center py-8">
                  <p className="text-slate-500">Voto registrado. No hay transcripción disponible para esta intervención.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-1">Sin intervención registrada</h3>
              <p className="text-slate-500">El senador no hizo uso de la palabra durante el debate de esta votación.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
