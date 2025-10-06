// src/services/db.ts
import { supabase } from '../lib/supabaseClient';

/* ===== Tipos ===== */
export type VTtotalAtivo = {
  data_wip: string;     // 'YYYY-MM-DD'
  centro_id: number;
  horas_somadas: number;
};

export type VMetaAtual = {
  centro_id: number;
  centro: string;
  meta_horas: number;
};

export type Centro = { id: number; codigo: string; ativo: boolean };
export type Alias = { id: number; alias_texto: string; centro_id: number; centro?: { codigo: string } };

export type VUploadDia = {
  data_wip: string;
  upload_id: number;
  nome_arquivo: string;
  enviado_em: string;
  linhas: number;
  horas_total: number;
  ativo: boolean | null;
};

export type FabricaDia = { data_wip: string; produzido_h: number };
export type CentroDia  = { data_wip: string; centro_id: number; produzido_h: number };

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

/* ===== Metas & Totais (visões) ===== */
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
  return data?.data_wip ?? null;
}

/* ===== Centros & Aliases ===== */
export async function fetchCentros(): Promise<Centro[]> {
  const { data, error } = await supabase
    .from('centros')
    .select('id,codigo,ativo')
    .order('codigo', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Centro[];
}

export async function createCentro(codigo: string): Promise<number> {
  const { data, error } = await supabase
    .from('centros')
    .insert({ codigo: codigo.trim(), ativo: true })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as number;
}

export async function insertMeta(centro_id: number, meta_horas: number, vigente_desde?: string) {
  const payload = { centro_id, meta_horas, vigente_desde };
  const { error } = await supabase.from('metas_diarias').insert(payload);
  if (error) throw error;
}

export async function fetchAliases(): Promise<Alias[]> {
  const { data, error } = await supabase
    .from('centro_aliases')
    .select('id, alias_texto, centro_id, centro:centros(id, codigo)')
    .order('alias_texto', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function addAlias(alias_texto: string, centro_id: number) {
  const { error } = await supabase.from('centro_aliases').insert({ alias_texto: alias_texto.trim(), centro_id });
  if (error) throw error;
}

export async function deleteAlias(id: number) {
  const { error } = await supabase.from('centro_aliases').delete().eq('id', id);
  if (error) throw error;
}

/* ===== Uploads (lista por dia / ativação) ===== */
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

/* ===== Séries (gráficos) ===== */
export async function fetchFabricaRange(startISO: string, endISO: string): Promise<FabricaDia[]> {
  const { data, error } = await supabase
    .from('v_fabrica_por_dia')
    .select('data_wip, produzido_h')
    .gte('data_wip', startISO)
    .lte('data_wip', endISO)
    .order('data_wip', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FabricaDia[];
}

export async function fetchCentroSeriesRange(centroIds: number[], startISO: string, endISO: string): Promise<CentroDia[]> {
  if (!centroIds.length) return [];
  const { data, error } = await supabase
    .from('v_centro_por_dia')
    .select('data_wip, centro_id, produzido_h')
    .in('centro_id', centroIds)
    .gte('data_wip', startISO)
    .lte('data_wip', endISO)
    .order('data_wip', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CentroDia[];
}

export async function fetchMetaTotalAtual(): Promise<number> {
  const { data, error } = await supabase
    .from('v_meta_total_atual')
    .select('meta_diaria_total')
    .single();
  if (error) throw error;
  return Number(data?.meta_diaria_total ?? 0);
}

/* ===== Detalhe do upload ===== */
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
