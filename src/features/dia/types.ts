import type { CentroSmart } from '../../services/db';

export type LinhaCentro = {
    centro_id: number;
    centro: string;
    produzido_h: number;
    meta_h: number;
    esperado_h: number;
    aderencia_pct: number | null;
    desvio_h: number;
    is_parent: boolean;
};

// Extensão local para garantir acesso aos campos novos caso o type importado não esteja atualizado
export type CentroFull = CentroSmart & {
    escopo?: string;
    centro_pai_id?: number | null;
    exibir_filhos?: boolean;
};

export type FabricaData = {
    produzido_h: number;
    meta_h: number;
    esperado_h: number;
    aderencia_pct: number | null;
    projEod_h: number;
    gapEod_h: number;
};
