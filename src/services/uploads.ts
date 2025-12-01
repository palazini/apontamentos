import { supabase } from '../lib/supabaseClient';

export type VUploadDia = {
    data_wip: string;
    upload_id: number;
    nome_arquivo: string;
    enviado_em: string;
    linhas: number;
    horas_total: number;
    ativo: boolean | null;
};

export type UploadHeader = {
    data_wip: string;
    upload_id: number;
    nome_arquivo: string;
    enviado_em: string;
    linhas: number;
    horas_total: number;
    ativo: boolean | null;
};

export type UploadLinha = {
    centro_id: number;
    horas_somadas: number;
};

export type UploadFuncLinha = {
    matricula: string;
    centro_id: number;
    horas_somadas: number;
};

export type PainelUltimoUpload = {
    data_wip: string;   // 'YYYY-MM-DD'
    enviado_em: string; // timestamptz
};

export async function fetchUploadsPorDia(dateISO: string): Promise<VUploadDia[]> {
    const { data, error } = await supabase
        .from('v_uploads_por_dia')
        .select('data_wip, upload_id, nome_arquivo, enviado_em, linhas, horas_total, ativo')
        .eq('data_wip', dateISO)
        .order('enviado_em', { ascending: false });
    if (error) throw error;
    return (data ?? []) as VUploadDia[];
}

export async function setUploadAtivo(dateISO: string, uploadId: number) {
    // mantém a convenção do seu backend: registrar ativo por data
    const { error } = await supabase
        .from('upload_dia_ativo')
        .upsert({ data_wip: dateISO, upload_id: uploadId }, { onConflict: 'data_wip' });
    if (error) throw error;
}

export async function fetchPainelUltimoUpload(): Promise<PainelUltimoUpload | null> {
    const { data, error } = await supabase
        .from('v_uploads_por_dia')
        .select('data_wip, enviado_em')
        .eq('ativo', true)
        .order('data_wip', { ascending: false })
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return (data as PainelUltimoUpload) ?? null;
}

export async function fetchUploadHeader(dataISO: string, uploadId: number): Promise<UploadHeader | null> {
    const { data, error } = await supabase
        .from('v_uploads_por_dia')
        .select('data_wip, upload_id, nome_arquivo, enviado_em, linhas, horas_total, ativo')
        .eq('data_wip', dataISO)
        .eq('upload_id', uploadId)
        .maybeSingle();
    if (error) throw error;
    return (data as UploadHeader) ?? null;
}

export async function fetchUploadLinhas(dataISO: string, uploadId: number): Promise<UploadLinha[]> {
    const { data, error } = await supabase
        .from('totais_diarios')
        .select('centro_id, horas_somadas')
        .eq('data_wip', dataISO)
        .eq('upload_id_origem', uploadId)
        .order('horas_somadas', { ascending: false });
    if (error) throw error;
    return (data ?? []) as UploadLinha[];
}

export async function fetchUploadLinhasFuncionarios(dateISO: string, uploadId: number): Promise<UploadFuncLinha[]> {
    const { data, error } = await supabase
        .from('totais_func_diarios')
        .select('matricula, centro_id, horas_somadas')
        .eq('data_wip', dateISO)
        .eq('upload_id_origem', uploadId)
        .order('horas_somadas', { ascending: false });

    if (error) throw error;
    return (data ?? []) as UploadFuncLinha[];
}
