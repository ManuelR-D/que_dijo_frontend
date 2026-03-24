import { Law, Senator } from './types';
import laws2025Json from '../public/data/laws_2025.json';
import laws2026Json from '../public/data/laws_2026.json';
import legislators2025Json from '../public/data/legislators_2025.json';
import legislators2026Json from '../public/data/legislators_2026.json';

export const SENATORS: Record<string, Senator> = {
  ...(legislators2025Json as Record<string, Senator>),
  ...(legislators2026Json as Record<string, Senator>),
};

export const LAWS: Law[] = [
  ...(laws2025Json as Law[]),
  ...(laws2026Json as Law[]),
].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

// Intervention data loaded lazily to keep initial bundle small
type InterventionData = Record<string, Record<string, { summary: string; transcript: string; excerpt: string; repName: string }>>;

// Strip trailing "Posición: ...", "Postura: ...", etc. from AI summaries
const STANCE_TAIL_RE = /\s*Pos(?:ición|tura)\s*:.+$/i;
function cleanSummary(text: string): string {
  return text.replace(STANCE_TAIL_RE, '').replace(/\s+$/, '');
}

function cleanInterventions(data: InterventionData): InterventionData {
  for (const voteId of Object.keys(data)) {
    for (const senId of Object.keys(data[voteId])) {
      const entry = data[voteId][senId];
      if (entry.summary) entry.summary = cleanSummary(entry.summary);
    }
  }
  return data;
}

let _interventions: InterventionData | null = null;
let _interventionsPromise: Promise<InterventionData> | null = null;

export function getInterventions(): InterventionData {
  return _interventions || {};
}

export async function loadInterventions(): Promise<InterventionData> {
  if (_interventions) return _interventions;
  if (!_interventionsPromise) {
    _interventionsPromise = Promise.all([
      fetch('./data/interventions_2025.json').then(r => r.json()),
      fetch('./data/interventions_2026.json').then(r => r.ok ? r.json() : {}),
    ]).then(([data2025, data2026]: InterventionData[]) => {
      _interventions = cleanInterventions({ ...data2025, ...data2026 });
      return _interventions;
    });
  }
  return _interventionsPromise;
}

// Bloc president IDs per year — used for featured quotes and leader summaries
export const BLOC_PRESIDENTS_BY_YEAR: Record<string, string[]> = {
  '2025': [
    '2025_274', // MAYANS - Unión por la Patria
    '2025_34',  // ATAUCHE - La Libertad Avanza
    '2025_254', // LOUSTEAU - UCR
    '2025_188', // GOERLING LARA - Frente PRO
    '2025_458', // ZAMORA - Frente Cívico por Santiago
    '2025_284', // MOISES - Convicción Federal
    '2025_421', // TERENZI - Despierta Chubut
  ],
  '2026': [
    '2026_52',  // BULLRICH - La Libertad Avanza (Oficialismo)
    '2026_189', // MAYANS - Fuerza Patria (Principal Oposición)
    '2026_316', // VISCHI - UCR
    '2026_127', // GOERLING LARA - Frente PRO
    '2026_90',  // ESPÍNOLA - Impulso País (Aliados)
  ],
};
