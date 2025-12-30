// src/features/admin/ConfigGeralPage.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Grid, Group, Title, Text, Button, Badge, Table, Stack,
  TextInput, NumberInput, Select, Divider, ActionIcon, Tooltip, Switch, Loader, SegmentedControl
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supabase } from '../../lib/supabaseClient';
import {
  IconPlus, IconTrash, IconCheck, IconX
} from '@tabler/icons-react';
import { useEmpresaId } from '../../contexts/TenantContext';
import { fetchAliases } from '../../services/db';

type Centro = {
  id: number;
  codigo: string;
  ativo: boolean;
  desativado_desde: string | null;
  escopo: 'usinagem' | 'montagem';
  centro_pai_id: number | null;
  exibir_filhos: boolean; // <--- NOVO
};

type Meta = { id: number; centro_id: number; meta_horas: number; vigente_desde: string; vigente_ate: string | null };
type Alias = { id: number; alias_texto: string; centro_id: number; centro?: { id: number; codigo: string } | null; };

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export default function ConfigGeralPage() {
  const empresaId = useEmpresaId();

  const [loading, setLoading] = useState(true);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [centroSel, setCentroSel] = useState<string | null>(null);

  // Forms
  const [novoCentro, setNovoCentro] = useState('');
  const [novoEscopo, setNovoEscopo] = useState<'usinagem' | 'montagem'>('usinagem');
  const [novaMeta, setNovaMeta] = useState<number | string>('');
  const [vigenteDesde, setVigenteDesde] = useState<string>(isoToday());
  const [encerrarAnterior, setEncerrarAnterior] = useState(true);
  const [novoAlias, setNovoAlias] = useState('');
  const [centroAliasSel, setCentroAliasSel] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [centrosRes, metasRes, aliasesRes] = await Promise.all([
        supabase.from('centros').select('id,codigo,ativo,desativado_desde,escopo,centro_pai_id,exibir_filhos').eq('empresa_id', empresaId).order('codigo', { ascending: true }),
        supabase.from('metas_diarias').select('id,centro_id,meta_horas,vigente_desde,vigente_ate').eq('empresa_id', empresaId).order('vigente_desde', { ascending: false }),
        fetchAliases(empresaId),
      ]);

      if (centrosRes.error) throw centrosRes.error;

      const centros: Centro[] = (centrosRes.data ?? []).map((r: any) => ({
        id: Number(r.id),
        codigo: String(r.codigo),
        ativo: Boolean(r.ativo),
        desativado_desde: r.desativado_desde ?? null,
        escopo: r.escopo === 'montagem' ? 'montagem' : 'usinagem',
        centro_pai_id: r.centro_pai_id ? Number(r.centro_pai_id) : null,
        exibir_filhos: Boolean(r.exibir_filhos),
      }));

      // Metas e Aliases continuam igual...
      const metas = (metasRes.data ?? []).map((r: any) => ({ ...r, id: Number(r.id), centro_id: Number(r.centro_id), meta_horas: Number(r.meta_horas) }));

      setCentros(centros);
      setMetas(metas);
      setAliases(aliasesRes);

      if (!centroSel && centros.length) {
        const first = centros.find(x => x.ativo) ?? centros[0];
        if (first) setCentroSel(String(first.id));
      }
      if (!centroAliasSel && centros.length) {
        if (centros[0]) setCentroAliasSel(String(centros[0].id));
      }
    } catch (e: any) {
      notifications.show({ title: 'Erro', message: e.message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [empresaId]);

  const centrosFiltrados = useMemo(() => centros.filter((c) => mostrarInativos || c.ativo), [centros, mostrarInativos]);
  const paiOptions = useMemo(() => centros.map((c) => ({ value: String(c.id), label: c.codigo })), [centros]);
  const centroOptions = useMemo(() => centros.map((c) => ({ value: String(c.id), label: c.codigo })), [centros]);
  const metasDoCentroSel = useMemo(() => metas.filter((m) => m.centro_id === Number(centroSel)), [metas, centroSel]);
  const aliasesDoCentroSel = useMemo(() => aliases.filter((al) => al.centro_id === Number(centroSel)), [aliases, centroSel]);

  // Ações
  const criarCentro = async () => {
    if (!novoCentro.trim()) return;
    const { error } = await supabase.from('centros').insert({ codigo: novoCentro.trim(), ativo: true, escopo: novoEscopo, exibir_filhos: false, empresa_id: empresaId });
    if (!error) { setNovoCentro(''); await loadAll(); notifications.show({ title: 'Sucesso', message: 'Centro criado', color: 'green' }); }
  };

  const alterarEscopo = async (c: Centro, val: string) => {
    await supabase.from('centros').update({ escopo: val }).eq('id', c.id);
    loadAll();
  };

  const alterarPai = async (c: Centro, paiIdStr: string | null) => {
    const novoPai = paiIdStr ? Number(paiIdStr) : null;
    if (novoPai === c.id) return;
    await supabase.from('centros').update({ centro_pai_id: novoPai }).eq('id', c.id);
    loadAll();
  };

  const alterarExibirFilhos = async (c: Centro, val: boolean) => {
    await supabase.from('centros').update({ exibir_filhos: val }).eq('id', c.id);
    loadAll();
    notifications.show({ title: 'Regra Atualizada', message: val ? 'Filhos aparecerão como cards.' : 'Filhos ficarão ocultos (apenas no pai).', color: 'blue' });
  };

  const desativarCentro = async (c: Centro) => {
    await supabase.from('centros').update({ ativo: false, desativado_desde: isoToday() }).eq('id', c.id);
    loadAll();
  };
  const reativarCentro = async (c: Centro) => {
    await supabase.from('centros').update({ ativo: true, desativado_desde: null }).eq('id', c.id);
    loadAll();
  };

  // Metas
  const criarMeta = async () => {
    const id = Number(centroSel);
    if (!id || !novaMeta) return;
    if (encerrarAnterior) {
      const aberta = metas.find(m => m.centro_id === id && m.vigente_ate == null);
      if (aberta) {
        const d = new Date(vigenteDesde); d.setDate(d.getDate() - 1);
        await supabase.from('metas_diarias').update({ vigente_ate: d.toISOString().split('T')[0] }).eq('id', aberta.id);
      }
    }
    const { error } = await supabase.from('metas_diarias').insert({ centro_id: id, meta_horas: Number(novaMeta), vigente_desde: vigenteDesde, empresa_id: empresaId });
    if (!error) { setNovaMeta(''); await loadAll(); notifications.show({ title: 'Meta Criada', message: 'Sucesso', color: 'green' }); }
  };

  const encerrarMeta = async (m: Meta) => {
    await supabase.from('metas_diarias').update({ vigente_ate: isoToday() }).eq('id', m.id);
    loadAll();
  };

  // Aliases
  const criarAlias = async () => {
    const cid = Number(centroAliasSel);
    if (!novoAlias.trim() || !cid) return;
    const { error } = await supabase.from('centro_aliases').insert({ alias_texto: novoAlias.trim(), centro_id: cid });
    if (!error) { setNovoAlias(''); await loadAll(); notifications.show({ title: 'Alias Criado', message: 'Sucesso', color: 'green' }); }
  };
  const removerAlias = async (id: number) => {
    await supabase.from('centro_aliases').delete().eq('id', id);
    loadAll();
  };

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Configurações</Title>
        <Switch checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.currentTarget.checked)} label="Mostrar inativos" />
      </Group>

      {loading ? <Group justify="center"><Loader /></Group> : (
        <Grid gutter="lg">
          {/* COLUNA 1: CENTROS */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm"><Title order={4}>Centros</Title></Group>
              <Stack gap="xs" mb="md">
                <Group grow>
                  <TextInput placeholder="Nome (Ex: Montagem Geral)" value={novoCentro} onChange={(e) => setNovoCentro(e.currentTarget.value)} />
                  <Button leftSection={<IconPlus size={16} />} onClick={criarCentro}>Criar</Button>
                </Group>
                <SegmentedControl value={novoEscopo} onChange={(v: any) => setNovoEscopo(v)} data={[{ label: 'Usinagem', value: 'usinagem' }, { label: 'Montagem', value: 'montagem' }]} size="xs" fullWidth />
              </Stack>
              <Divider my="sm" />
              <Table highlightOnHover withTableBorder stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={20}></Table.Th>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Agrupador (Pai)</Table.Th>
                    <Table.Th>Detalhar?</Table.Th> {/* NOVO HEADER */}
                    <Table.Th>Escopo</Table.Th>
                    <Table.Th w={60}>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {centrosFiltrados.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td><input type="radio" checked={String(c.id) === centroSel} onChange={() => setCentroSel(String(c.id))} style={{ cursor: 'pointer' }} /></Table.Td>
                      <Table.Td><Text fw={500} size="sm">{c.codigo}</Text></Table.Td>
                      <Table.Td>
                        <Select variant="unstyled" size="xs" placeholder="-" clearable value={c.centro_pai_id ? String(c.centro_pai_id) : null} onChange={(val) => alterarPai(c, val)} data={paiOptions.filter(opt => opt.value !== String(c.id))} styles={{ input: { height: 24, fontSize: 12, color: c.centro_pai_id ? '#228be6' : 'gray' } }} />
                      </Table.Td>
                      {/* SWITCH EXIBIR FILHOS: Só aparece se o centro NÃO tiver pai (ou seja, ele pode SER um pai) */}
                      <Table.Td>
                        {!c.centro_pai_id && (
                          <Tooltip label="Se ativado, exibe os filhos como cards individuais TAMBÉM.">
                            <Switch size="xs" checked={c.exibir_filhos} onChange={(e) => alterarExibirFilhos(c, e.currentTarget.checked)} />
                          </Tooltip>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Select variant="unstyled" size="xs" value={c.escopo} onChange={(val) => val && alterarEscopo(c, val)} data={[{ value: 'usinagem', label: 'U' }, { value: 'montagem', label: 'M' }]} allowDeselect={false} styles={{ input: { height: 24, fontSize: 12, fontWeight: 600, color: c.escopo === 'usinagem' ? 'orange' : 'purple', width: 40 } }} />
                      </Table.Td>
                      <Table.Td>
                        {c.ativo ?
                          <Tooltip label="Desativar"><ActionIcon size="sm" variant="subtle" color="yellow" onClick={() => desativarCentro(c)}><IconX size={16} /></ActionIcon></Tooltip> :
                          <Tooltip label="Reativar"><ActionIcon size="sm" variant="subtle" color="green" onClick={() => reativarCentro(c)}><IconCheck size={16} /></ActionIcon></Tooltip>
                        }
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>

          {/* COLUNA 2: METAS */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm"><Title order={4}>Metas</Title><Select value={centroSel} onChange={setCentroSel} data={centroOptions} searchable placeholder="Selecione..." miw={180} size="xs" /></Group>
              <Stack gap="xs" mb="md">
                <Group grow align="end">
                  <NumberInput label="Nova meta (h/dia)" placeholder="Ex.: 24" min={0.01} decimalScale={2} value={novaMeta} onChange={(v) => setNovaMeta(Number(v) || '')} />
                  <TextInput label="Vigente desde" type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.currentTarget.value)} />
                </Group>
                <Group justify="space-between">
                  <Switch checked={encerrarAnterior} onChange={(e) => setEncerrarAnterior(e.currentTarget.checked)} label={<Text size="xs">Encerrar anterior</Text>} />
                  <Button size="xs" leftSection={<IconPlus size={14} />} onClick={criarMeta}>Adicionar</Button>
                </Group>
              </Stack>
              <Divider my="sm" />
              <Table highlightOnHover withTableBorder stickyHeader>
                <Table.Thead><Table.Tr><Table.Th>Meta</Table.Th><Table.Th>Desde</Table.Th><Table.Th>Até</Table.Th><Table.Th w={50}></Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {metasDoCentroSel.map(m => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{m.meta_horas.toFixed(2)}</Table.Td>
                      <Table.Td>{m.vigente_desde}</Table.Td>
                      <Table.Td>{m.vigente_ate ?? <Badge size="xs" color="green" variant="light">Atual</Badge>}</Table.Td>
                      <Table.Td>{!m.vigente_ate && <ActionIcon size="sm" color="yellow" variant="light" onClick={() => encerrarMeta(m)}><IconX size={14} /></ActionIcon>}</Table.Td>
                    </Table.Tr>
                  ))}
                  {metasDoCentroSel.length === 0 && <Table.Tr><Table.Td colSpan={4}>Sem metas.</Table.Td></Table.Tr>}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>

          {/* COLUNA 3: ALIASES */}
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Title order={4} mb="sm">Aliases</Title>
              <Stack gap="xs" mb="md">
                <TextInput label="Novo alias" value={novoAlias} onChange={(e) => setNovoAlias(e.currentTarget.value)} />
                <Select label="Vincula ao centro" value={centroAliasSel} onChange={setCentroAliasSel} data={centroOptions} searchable />
                <Button fullWidth leftSection={<IconPlus size={16} />} onClick={criarAlias}>Vincular</Button>
              </Stack>
              <Divider my="sm" />
              <Table highlightOnHover withTableBorder>
                <Table.Tbody>
                  {aliasesDoCentroSel.map(a => (
                    <Table.Tr key={a.id}><Table.Td>{a.alias_texto}</Table.Td><Table.Td w={40}><ActionIcon color="red" variant="light" size="sm" onClick={() => removerAlias(a.id)}><IconTrash size={14} /></ActionIcon></Table.Td></Table.Tr>
                  ))}
                  {aliasesDoCentroSel.length === 0 && <Table.Tr><Table.Td colSpan={2} c="dimmed">Vazio</Table.Td></Table.Tr>}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </div>
  );
}