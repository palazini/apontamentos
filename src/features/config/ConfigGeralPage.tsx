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
import { fetchAliases } from '../../services/db';

/* =========================
   Tipos
========================= */
type Centro = { 
  id: number; 
  codigo: string; 
  ativo: boolean; 
  desativado_desde: string | null;
  escopo: 'usinagem' | 'montagem';
  centro_pai_id: number | null; // <--- NOVO: HIERARQUIA
};

type Meta = { id: number; centro_id: number; meta_horas: number; vigente_desde: string; vigente_ate: string | null };
type Alias = {
  id: number;
  alias_texto: string;
  centro_id: number;
  centro?: { id: number; codigo: string } | null;
};

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export default function ConfigGeralPage() {
  /* =========================
      Estado base / filtros
  ========================= */
  const [loading, setLoading] = useState(true);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const [centroSel, setCentroSel] = useState<string | null>(null);

  /* =========================
      Formulários rápidos
  ========================= */
  // Centros
  const [novoCentro, setNovoCentro] = useState('');
  const [novoEscopo, setNovoEscopo] = useState<'usinagem' | 'montagem'>('usinagem');
  
  // Metas
  const [novaMeta, setNovaMeta] = useState<number | ''>('');
  const [vigenteDesde, setVigenteDesde] = useState<string>(isoToday());
  const [encerrarAnterior, setEncerrarAnterior] = useState(true);
  
  // Aliases
  const [novoAlias, setNovoAlias] = useState('');
  const [centroAliasSel, setCentroAliasSel] = useState<string | null>(null);

  /* =========================
      Loads
  ========================= */
  const loadAll = async () => {
    setLoading(true);
    try {
      const [centrosRes, metasRes, aliasesRes] = await Promise.all([
        supabase
          .from('centros')
          .select('id,codigo,ativo,desativado_desde,escopo,centro_pai_id') // <--- SELECT PAI
          .order('codigo', { ascending: true }),
        supabase
          .from('metas_diarias')
          .select('id,centro_id,meta_horas,vigente_desde,vigente_ate')
          .order('vigente_desde', { ascending: false }),
        fetchAliases(),
      ]);

      if (centrosRes.error) throw centrosRes.error;
      if (metasRes.error) throw metasRes.error;

      // Normaliza centros
      const centros: Centro[] = (centrosRes.data ?? []).map((r: any) => ({
        id: Number(r.id),
        codigo: String(r.codigo),
        ativo: Boolean(r.ativo),
        desativado_desde: r.desativado_desde ?? null,
        escopo: r.escopo === 'montagem' ? 'montagem' : 'usinagem',
        centro_pai_id: r.centro_pai_id ? Number(r.centro_pai_id) : null,
      }));

      const metas: Meta[] = (metasRes.data ?? []).map((r: any) => ({
        id: Number(r.id),
        centro_id: Number(r.centro_id),
        meta_horas: Number(r.meta_horas),
        vigente_desde: r.vigente_desde,
        vigente_ate: r.vigente_ate,
      }));

      setCentros(centros);
      setMetas(metas);
      setAliases(aliasesRes); 

      if (!centroSel && centros.length) {
        const firstActive = centros.find((x) => x.ativo) ?? centros[0];
        setCentroSel(String(firstActive.id));
      }
      if (!centroAliasSel && centros.length) {
        setCentroAliasSel(String(centros[0].id));
      }
    } catch (e: any) {
      console.error(e);
      notifications.show({ title: 'Erro ao carregar', message: e.message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  /* =========================
      Derivados
  ========================= */
  const centrosFiltrados = useMemo(
    () => centros.filter((c) => mostrarInativos || c.ativo),
    [centros, mostrarInativos]
  );

  // Opções para vincular pai (não pode ser ele mesmo, idealmente filtra recursão simples)
  const paiOptions = useMemo(
    () => centros.map((c) => ({ value: String(c.id), label: c.codigo })),
    [centros]
  );

  const centroOptions = useMemo(
    () => centros.map((c) => ({ value: String(c.id), label: `${c.codigo} (${c.escopo === 'montagem' ? 'M' : 'U'})` })),
    [centros]
  );

  const metasDoCentroSel = useMemo(() => {
    const id = Number(centroSel);
    return metas.filter((m) => m.centro_id === id).sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde) * -1);
  }, [metas, centroSel]);

  const aliasesDoCentroSel = useMemo(() => {
    const id = Number(centroSel);
    return aliases.filter((al) => al.centro_id === id);
  }, [aliases, centroSel]);

  /* =========================
      Ações
  ========================= */
  const criarCentro = async () => {
    const codigo = novoCentro.trim();
    if (!codigo) return;
    const { error } = await supabase.from('centros').insert({ 
        codigo, 
        ativo: true,
        escopo: novoEscopo 
    });
    if (error) {
      notifications.show({ title: 'Falha ao criar', message: error.message, color: 'red' });
      return;
    }
    setNovoCentro('');
    notifications.show({ title: 'Centro criado', message: codigo, color: 'green' });
    await loadAll();
  };

  const alterarEscopo = async (c: Centro, novoVal: string) => {
    const val = novoVal === 'montagem' ? 'montagem' : 'usinagem';
    const { error } = await supabase.from('centros').update({ escopo: val }).eq('id', c.id);
    if (!error) {
        await loadAll();
        notifications.show({ title: 'Escopo atualizado', message: `${c.codigo} agora é ${val}`, color: 'blue' });
    }
  };

  const alterarPai = async (c: Centro, paiIdStr: string | null) => {
    const novoPai = paiIdStr ? Number(paiIdStr) : null;
    if (novoPai === c.id) return; // Evita auto-referência básica

    const { error } = await supabase.from('centros').update({ centro_pai_id: novoPai }).eq('id', c.id);
    if (!error) {
        await loadAll();
        notifications.show({ title: 'Agrupamento atualizado', message: 'Vínculo salvo', color: 'blue' });
    } else {
        notifications.show({ title: 'Erro', message: error.message, color: 'red' });
    }
  };

  const desativarCentro = async (c: Centro) => {
    const { error } = await supabase.from('centros').update({ ativo: false, desativado_desde: isoToday() }).eq('id', c.id);
    if (!error) {
        await loadAll();
        notifications.show({ title: 'Centro desativado', message: c.codigo, color: 'yellow' });
    }
  };

  const reativarCentro = async (c: Centro) => {
    const { error } = await supabase.from('centros').update({ ativo: true, desativado_desde: null }).eq('id', c.id);
    if (!error) {
        await loadAll();
        notifications.show({ title: 'Centro reativado', message: c.codigo, color: 'green' });
    }
  };

  // Metas
  const criarMeta = async () => {
    const id = Number(centroSel);
    if (!id || novaMeta === '' || novaMeta <= 0) return;

    if (encerrarAnterior) {
      const aberta = metas.filter((m) => m.centro_id === id && m.vigente_ate == null)[0];
      if (aberta) {
        const d = new Date(vigenteDesde);
        d.setDate(d.getDate() - 1);
        const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
        await supabase.from('metas_diarias').update({ vigente_ate: `${y}-${mo}-${da}` }).eq('id', aberta.id);
      }
    }

    const { error } = await supabase.from('metas_diarias').insert({ centro_id: id, meta_horas: Number(novaMeta), vigente_desde: vigenteDesde });
    if (!error) {
        setNovaMeta('');
        setVigenteDesde(isoToday());
        notifications.show({ title: 'Meta criada', message: 'Sucesso', color: 'green' });
        await loadAll();
    }
  };

  const encerrarMeta = async (m: Meta) => {
    if (m.vigente_ate) return;
    await supabase.from('metas_diarias').update({ vigente_ate: isoToday() }).eq('id', m.id);
    await loadAll();
  };

  // Aliases
  const criarAlias = async () => {
    const alias = novoAlias.trim();
    const cid = Number(centroAliasSel);
    if (!alias || !cid) return;
    const { error } = await supabase.from('centro_aliases').insert({ alias_texto: alias, centro_id: cid });
    if (!error) {
        setNovoAlias('');
        notifications.show({ title: 'Alias adicionado', message: alias, color: 'green' });
        await loadAll();
    }
  };

  const removerAlias = async (id: number) => {
    await supabase.from('centro_aliases').delete().eq('id', id);
    await loadAll();
  };

  /* =========================
      Render
  ========================= */
  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Configurações</Title>
        <Switch checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.currentTarget.checked)} label="Mostrar inativos" />
      </Group>

      {loading ? (
        <Group justify="center" mt="xl"><Loader /></Group>
      ) : (
        <Grid gutter="lg">
          {/* ========== CENTROS ========== */}
          <Grid.Col span={{ base: 12, md: 5 }}> 
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Title order={4} m={0}>Centros de Trabalho</Title>
              </Group>

              <Stack gap="xs" mb="md">
                <Group grow>
                    <TextInput placeholder="Nome (Ex: Montagem Geral)" value={novoCentro} onChange={(e) => setNovoCentro(e.currentTarget.value)} />
                     <Button leftSection={<IconPlus size={16} />} onClick={criarCentro}>Criar</Button>
                </Group>
                <SegmentedControl 
                    value={novoEscopo}
                    onChange={(val: any) => setNovoEscopo(val)}
                    data={[{ label: 'Usinagem', value: 'usinagem' }, { label: 'Montagem', value: 'montagem' }]}
                    size="xs" fullWidth
                />
              </Stack>

              <Divider my="sm" />

              <Table highlightOnHover withTableBorder stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 20 }}></Table.Th>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Agrupador (Pai)</Table.Th>
                    <Table.Th>Escopo</Table.Th>
                    <Table.Th style={{ width: 60 }}>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {centrosFiltrados.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <input type="radio" name="sel-centro" checked={String(c.id) === centroSel} onChange={() => setCentroSel(String(c.id))} style={{ cursor: 'pointer' }} />
                      </Table.Td>
                      
                      <Table.Td><Text fw={500} size="sm">{c.codigo}</Text></Table.Td>
                      
                      {/* Coluna Agrupador (Pai) */}
                      <Table.Td>
                         <Select 
                            variant="unstyled" size="xs" placeholder="Nenhum (Individual)" clearable
                            value={c.centro_pai_id ? String(c.centro_pai_id) : null}
                            onChange={(val) => alterarPai(c, val)}
                            data={paiOptions.filter(opt => opt.value !== String(c.id))} // Não mostra ele mesmo
                            styles={{ input: { height: 24, minHeight: 24, fontSize: 12, color: c.centro_pai_id ? '#228be6' : 'gray' } }}
                         />
                      </Table.Td>

                      <Table.Td>
                         <Select 
                            variant="unstyled" size="xs" value={c.escopo} onChange={(val) => val && alterarEscopo(c, val)}
                            data={[{ value: 'usinagem', label: 'U' }, { value: 'montagem', label: 'M' }]} allowDeselect={false}
                            styles={{ input: { height: 24, minHeight: 24, fontSize: 12, width: 40, fontWeight: 600, color: c.escopo === 'usinagem' ? 'orange' : 'purple' } }}
                         />
                      </Table.Td>

                      <Table.Td>
                        <Group gap={4}>
                          {c.ativo ? (
                            <Tooltip label="Desativar"><ActionIcon size="sm" variant="subtle" color="yellow" onClick={() => desativarCentro(c)}><IconX size={16} /></ActionIcon></Tooltip>
                          ) : (
                            <Tooltip label="Reativar"><ActionIcon size="sm" variant="subtle" color="green" onClick={() => reativarCentro(c)}><IconCheck size={16} /></ActionIcon></Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>

          {/* ========== METAS ========== */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Title order={4} m={0}>Metas</Title>
                <Select value={centroSel} onChange={setCentroSel} data={centroOptions} searchable placeholder="Selecione..." miw={180} size="xs" />
              </Group>

              <Stack gap="xs" mb="md">
                <Text size="xs" c="dimmed">Para agrupar, crie um centro "Pai" (ex: Montagem Geral), defina a meta nele e vincule os filhos na tabela ao lado.</Text>
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
                <Table.Thead>
                  <Table.Tr><Table.Th>Meta (h)</Table.Th><Table.Th>Desde</Table.Th><Table.Th>Até</Table.Th><Table.Th style={{ width: 50 }}></Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {metasDoCentroSel.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{(+m.meta_horas).toFixed(2)}</Table.Td>
                      <Table.Td>{m.vigente_desde}</Table.Td>
                      <Table.Td>{m.vigente_ate ?? <Badge size="xs" variant="light" color="green">Atual</Badge>}</Table.Td>
                      <Table.Td>
                        {!m.vigente_ate && <ActionIcon size="sm" variant="light" color="yellow" onClick={() => encerrarMeta(m)}><IconX size={14} /></ActionIcon>}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {metasDoCentroSel.length === 0 && <Table.Tr><Table.Td colSpan={4}>Sem metas.</Table.Td></Table.Tr>}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>

          {/* ========== ALIASES ========== */}
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Title order={4} m={0}>Aliases</Title>
              </Group>
              <Stack gap="xs" mb="md">
                  <TextInput label="Novo alias (Excel)" placeholder='Ex.: CE-PINT' value={novoAlias} onChange={(e) => setNovoAlias(e.currentTarget.value)} />
                  <Select label="Vincula ao centro" value={centroAliasSel} onChange={setCentroAliasSel} data={centroOptions} searchable />
                  <Button fullWidth leftSection={<IconPlus size={16} />} onClick={criarAlias}>Vincular</Button>
              </Stack>
              <Divider my="sm" />
              <Title order={6} mb="xs">Deste centro</Title>
              <Table highlightOnHover withTableBorder stickyHeader>
                <Table.Thead>
                  <Table.Tr><Table.Th>Alias</Table.Th><Table.Th style={{ width: 50 }}></Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {aliasesDoCentroSel.map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td style={{ wordBreak: 'break-all', fontSize: 13 }}>{a.alias_texto}</Table.Td>
                      <Table.Td><ActionIcon size="sm" variant="light" color="red" onClick={() => removerAlias(a.id)}><IconTrash size={14} /></ActionIcon></Table.Td>
                    </Table.Tr>
                  ))}
                  {aliasesDoCentroSel.length === 0 && <Table.Tr><Table.Td colSpan={2}><Text c="dimmed" size="xs">Vazio</Text></Table.Td></Table.Tr>}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </div>
  );
}