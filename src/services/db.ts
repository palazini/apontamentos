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

export type Centro = {
  id: number;
  codigo: string;
  ativo: boolean;
  desativado_desde: string | null;
  escopo: 'usinagem' | 'montagem';
};
export type Alias = {
   id: number;
   alias_texto: string;
   centro_id: number;
   centro?: { id: number; codigo: string } | null;
};

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
export type CentroDia = { 
  data_wip: string; 
  centro_id: number; 
  produzido_h: number; 
  data_referencia?: string | null;
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

export type PainelUltimoUpload = {
  data_wip: string;   // 'YYYY-MM-DD'
  enviado_em: string; // timestamptz
};

export type PainelMaquinaResumo = {
  data_wip: string;             // 'YYYY-MM-DD'
  ano_mes: string;              // 'YYYY-MM-01'
  centro_id: number;
  codigo: string;
  meta_diaria_horas: number;
  produzido_dia_horas: number;
  produzido_mes_horas: number;
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

/* ===== Centros & Aliases ===== */
export async function fetchCentros(): Promise<Centro[]> {
  const { data, error } = await supabase
    .from('centros')
    .select('id,codigo,ativo,desativado_desde,escopo')
    .order('codigo', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Centro[];
}

export async function createCentro(codigo: string, escopo: 'usinagem' | 'montagem' = 'usinagem'): Promise<number> {
  const { data, error } = await supabase
    .from('centros')
    .insert({ 
        codigo: codigo.trim(), 
        ativo: true,
        escopo: escopo
    })
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

  // Garante objeto (ou null), nunca array
  const normalized: Alias[] = (data ?? []).map((r: any) => {
    const c = r.centro;
    const centroObj = Array.isArray(c)
      ? (c[0] ? { id: Number(c[0].id), codigo: String(c[0].codigo) } : null)
      : (c ? { id: Number(c.id), codigo: String(c.codigo) } : null);
    return {
      id: Number(r.id),
      alias_texto: String(r.alias_texto),
      centro_id: Number(r.centro_id),
      centro: centroObj,
    };
  });
  return normalized;
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

// Ela busca o snapshot do último upload VÁLIDO do dia.
export async function fetchEstadoAnterior(dataWip: string) {
  // 1. Achar qual era o upload ativo antes do atual
  const { data: uploadAntigo } = await supabase
    .from('upload_dia_ativo')
    .select('upload_id')
    .eq('data_wip', dataWip)
    .single();

  if (!uploadAntigo) return new Map<number, { horas: number; ref: string }>();

  // 2. Pegar os totais daquele upload
  const { data: totais } = await supabase
    .from('totais_diarios')
    .select('centro_id, horas_somadas, data_referencia')
    .eq('upload_id_origem', uploadAntigo.upload_id);

  const mapa = new Map<number, { horas: number; ref: string }>();
  
  if (totais) {
    totais.forEach((t: any) => {
      // Garante que temos uma ref, se for null usa data atual como fallback seguro
      const ref = t.data_referencia || new Date().toISOString();
      mapa.set(t.centro_id, { 
        horas: Number(t.horas_somadas), 
        ref: ref 
      });
    });
  }
  
  return mapa;
}

export async function fetchCentroSeriesRange(centroIds: number[], startISO: string, endISO: string): Promise<CentroDia[]> {
  if (!centroIds.length) return [];
  const { data, error } = await supabase
    .from('v_centro_por_dia')
    .select('data_wip, centro_id, produzido_h, data_referencia') 
    .in('centro_id', centroIds)
    .gte('data_wip', startISO)
    .lte('data_wip', endISO)
    .order('data_wip', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CentroDia[];
}

export async function fetchPainelMaquinasResumo(
  diaISO: string,
  anoMesISO: string
): Promise<PainelMaquinaResumo[]> {
  let query = supabase
    .from('v_painel_maquinas_resumo')
    .select('data_wip, ano_mes, centro_id, codigo, meta_diaria_horas, produzido_dia_horas, produzido_mes_horas')
    .eq('data_wip', diaISO);

  if (anoMesISO) {
    query = query.eq('ano_mes', anoMesISO);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PainelMaquinaResumo[];
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

export type CentroSmart = {
  id: number;
  codigo: string;
  ativo?: boolean;
  desativado_desde?: string | null;
  escopo?: 'usinagem' | 'montagem';
};

export async function fetchCentrosSmart(): Promise<CentroSmart[]> {
  const tryNew = await supabase
    .from('centros')
    .select('id,codigo,desativado_desde,ativo,escopo') // <--- Add escopo
    .order('codigo', { ascending: true });
    
  if (!tryNew.error) return (tryNew.data ?? []) as CentroSmart[];

  // fallback legado (caso a coluna não exista, mas você já rodou o SQL)
  if (tryNew.error?.code === 'PGRST204') {
    const { data, error } = await supabase.from('centros').select('id,codigo,ativo').order('codigo', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((x: any) => ({ ...x, desativado_desde: null, escopo: 'usinagem' })) as CentroSmart[];
  }
  throw tryNew.error;
}

export async function desativarCentro(centro_id: number, desdeISO: string): Promise<void> {
  // modo novo
  const up = await supabase.from('centros').update({ desativado_desde: desdeISO }).eq('id', centro_id);
  if (!up.error) return;

  // fallback: coluna não existe → seta ativo=false (legado)
  if (up.error?.code === 'PGRST204') {
    const { error } = await supabase.from('centros').update({ ativo: false }).eq('id', centro_id);
    if (error) throw error;
    return;
  }

  throw up.error;
}

export async function reativarCentro(centro_id: number): Promise<void> {
  // modo novo
  const up = await supabase.from('centros').update({ desativado_desde: null }).eq('id', centro_id);
  if (!up.error) return;

  // fallback: legado
  if (up.error?.code === 'PGRST204') {
    const { error } = await supabase.from('centros').update({ ativo: true }).eq('id', centro_id);
    if (error) throw error;
    return;
  }

  throw up.error;
}

export type FuncDia  = { data_wip: string; matricula: string; produzido_h: number };
export type RankItem = { matricula: string; horas: number };

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

export type FuncCentroDia = { data_wip: string; centro_id: number; produzido_h: number };

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

export async function fetchCentrosDict(): Promise<Record<number, string>> {
  const { data, error } = await supabase.from('centros').select('id,codigo');
  if (error) throw error;
  const dict: Record<number, string> = {};
  (data ?? []).forEach((r: any) => (dict[Number(r.id)] = String(r.codigo)));
  return dict;
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
