import { supabase } from '../lib/supabaseClient';

export type VMetaAtual = {
    centro_id: number;
    centro: string;
    meta_horas: number;
};

export type VTtotalAtivo = {
    data_wip: string;     // 'YYYY-MM-DD'
    centro_id: number;
    horas_somadas: number;
};

export async function fetchMetasAtuais(): Promise<VMetaAtual[]> {
    const { data, error } = await supabase
        .from('v_metas_atuais')
        .select('centro_id, centro, meta_horas');
    if (error) throw error;
    return (data ?? []) as VMetaAtual[];
}

export async function fetchTotaisAtivosPorDia(dateISO: string): Promise<VTtotalAtivo[]> {
    const { data, error } = await supabase
        .from('v_totais_ativos')
        .select('data_wip, centro_id, horas_somadas')
        .eq('data_wip', dateISO);
    if (error) throw error;
    return (data ?? []) as VTtotalAtivo[];
}

export async function fetchUltimoDiaComDados(): Promise<string | null> {
    const { data, error } = await supabase
        .from('v_totais_ativos')
        .select('data_wip')
        .order('data_wip', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (data?.data_wip) return data.data_wip;

    // Fallback opcional:
    const { data: up } = await supabase
        .from('uploads')
        .select('data_wip')
        .order('data_wip', { ascending: false })
        .limit(1)
        .maybeSingle();

    return up?.data_wip ?? null;
}

export async function insertMeta(centro_id: number, meta_horas: number, vigente_desde?: string) {
    const payload = { centro_id, meta_horas, vigente_desde };
    const { error } = await supabase.from('metas_diarias').insert(payload);
    if (error) throw error;
}

export async function fetchMetaTotalAtual(): Promise<number> {
    const { data, error } = await supabase
        .from('v_meta_total_atual')
        .select('meta_diaria_total')
        .single();
    if (error) throw error;
    return Number(data?.meta_diaria_total ?? 0);
}
