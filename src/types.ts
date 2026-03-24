export type VoteOption = 'Afirmativo' | 'Negativo' | 'Abstención' | 'Ausente';

export interface Senator {
  id: string;
  name: string;
  party: string;
  province: string;
  imageUrl: string;
}

export interface Intervention {
  senatorId: string;
  voteId: string;
  vote: VoteOption;
  summary?: string;
  transcript?: string;
}

export interface Vote {
  id: string;
  lawId: string;
  title: string;
  date: string;
  result: 'Aprobado' | 'Rechazado';
  url?: string;
  summary: {
    afirmativo: number;
    negativo: number;
    abstencion: number;
    ausente: number;
  };
  interventions: Intervention[];
}

export interface Law {
  id: string;
  title: string;
  description: string;
  date: string;
  status: 'Aprobada' | 'Rechazada' | 'En Tratamiento';
  chamber?: string;
  votes: Vote[];
}
