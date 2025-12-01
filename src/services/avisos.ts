import { supabase } from '../lib/supabaseClient';

export type AvisoTV = {
    id: number;
    titulo: string;
    mensagem: string;
    tipo: 'info' | 'alerta' | 'sucesso' | 'aviso';
    escopo: 'geral' | 'usinagem' | 'montagem';
    exibir_como: 'ticker' | 'slide' | 'apresentacao';
    valido_de: string;
    valido_ate: string;
    arquivo_url?: string | null;
    pagina_atual?: number | null;
    ativo: boolean;
};

export async function fetchAvisosAtivos(escopoAtual: string = 'geral'): Promise<AvisoTV[]> {
    const now = new Date().toISOString();

    let query = supabase
        .from('avisos_tv')
        .select('*')
        .eq('ativo', true)
        .lte('valido_de', now)
        .gte('valido_ate', now);

    // Se o painel for específico, traz 'geral' + específico. Se for geral, traz tudo (ou só geral, depende da regra).
    // Regra sugerida: Painel 'Usinagem' vê avisos 'Geral' + 'Usinagem'.
    if (escopoAtual !== 'geral') {
        query = query.in('escopo', ['geral', escopoAtual]);
    } else {
        // Painel Geral vê tudo ou só geral? Vamos deixar ver tudo por enquanto para o gestor monitorar
        // Ou filtrar só geral. Vamos filtrar só geral para não poluir.
        query = query.eq('escopo', 'geral');
    }

    const { data, error } = await query.order('criado_em', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AvisoTV[];
}

// Busca todos para o Admin
export async function fetchTodosAvisos(): Promise<AvisoTV[]> {
    const { data, error } = await supabase
        .from('avisos_tv')
        .select('*')
        .order('criado_em', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AvisoTV[];
}

export async function createAviso(aviso: Omit<AvisoTV, 'id' | 'ativo'>) {
    const { error } = await supabase.from('avisos_tv').insert([{ ...aviso, ativo: true }]);
    if (error) throw error;
}

export async function toggleAviso(id: number, statusAtual: boolean) {
    const { error } = await supabase.from('avisos_tv').update({ ativo: !statusAtual }).eq('id', id);
    if (error) throw error;
}

export async function deleteAviso(id: number) {
    const { error } = await supabase.from('avisos_tv').delete().eq('id', id);
    if (error) throw error;
}
