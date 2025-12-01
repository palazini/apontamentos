import { supabase } from '../lib/supabaseClient';

export type FuncionarioMeta = {
    id: number;
    matricula: string;
    nome: string;
    meta_diaria_horas: number;
    ativo: boolean;
};

export type FuncionarioDia = {
    data_wip: string;     // 'YYYY-MM-DD'
    matricula: string;
    produzido_h: number;
};

export type FuncionarioMes = {
    ano_mes: string;      // 'YYYY-MM-01'
    matricula: string;
    produzido_h: number;
};

export type FuncDia = { data_wip: string; matricula: string; produzido_h: number };
export type RankItem = { matricula: string; horas: number };
export type FuncCentroDia = { data_wip: string; centro_id: number; produzido_h: number };

export async function fetchFuncionarios(): Promise<string[]> {
    const { data, error } = await supabase
        .from('v_funcionarios')
        .select('matricula')
        .order('matricula', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => String(r.matricula));
}

export async function fetchFuncionarioRange(matricula: string, startISO: string, endISO: string): Promise<FuncDia[]> {
    const { data, error } = await supabase
        .from('v_funcionario_por_dia')
        .select('data_wip, matricula, produzido_h')
        .eq('matricula', matricula)
        .gte('data_wip', startISO)
        .lte('data_wip', endISO)
        .order('data_wip', { ascending: true });
    if (error) throw error;
    return (data ?? []) as FuncDia[];
}

export async function fetchRankingFuncionarios(startISO: string, endISO: string, limit = 10): Promise<RankItem[]> {
    const { data, error } = await supabase
        .from('v_funcionario_por_dia')
        .select('matricula, produzido_h')
        .gte('data_wip', startISO)
        .lte('data_wip', endISO);

    if (error) throw error;

    const acc = new Map<string, number>();
    for (const r of (data ?? []) as FuncDia[]) {
        acc.set(r.matricula, (acc.get(r.matricula) ?? 0) + Number(r.produzido_h));
    }
    return [...acc.entries()]
        .map(([matricula, horas]) => ({ matricula, horas: +horas.toFixed(2) }))
        .sort((a, b) => b.horas - a.horas)
        .slice(0, limit);
}

export async function fetchFuncionarioCentroRange(
    matricula: string,
    startISO: string,
    endISO: string
): Promise<FuncCentroDia[]> {
    const { data, error } = await supabase
        .from('v_funcionario_centro_por_dia')
        .select('data_wip, centro_id, produzido_h')
        .eq('matricula', matricula)
        .gte('data_wip', startISO)
        .lte('data_wip', endISO)
        .order('data_wip', { ascending: true });

    if (error) throw error;
    return (data ?? []) as FuncCentroDia[];
}

export async function fetchFuncionariosMeta(): Promise<FuncionarioMeta[]> {
    const { data, error } = await supabase
        .from('funcionarios_meta')
        .select('id, matricula, nome, meta_diaria_horas, ativo')
        .order('matricula', { ascending: true });

    if (error) throw error;
    return (data ?? []) as FuncionarioMeta[];
}

export async function upsertFuncionarioMeta(payload: {
    id?: number;
    matricula: string;
    nome: string;
    meta_diaria_horas: number;
    ativo?: boolean;
}): Promise<void> {
    const row = {
        ...payload,
        ativo: payload.ativo ?? true,
    };

    const { error } = await supabase
        .from('funcionarios_meta')
        .upsert(row, { onConflict: 'matricula' });

    if (error) throw error;
}

export async function fetchFuncionariosDia(dataISO: string): Promise<FuncionarioDia[]> {
    const { data, error } = await supabase
        .from('v_funcionario_por_dia')
        .select('data_wip, matricula, produzido_h')
        .eq('data_wip', dataISO);

    if (error) throw error;
    return (data ?? []) as FuncionarioDia[];
}

export async function fetchFuncionariosMes(anoMesISO: string): Promise<FuncionarioMes[]> {
    // anoMesISO = '2025-11-01' (primeiro dia do mês)
    const { data, error } = await supabase
        .from('v_funcionario_por_mes')
        .select('ano_mes, matricula, produzido_h')
        .eq('ano_mes', anoMesISO);

    if (error) throw error;
    return (data ?? []) as FuncionarioMes[];
}
