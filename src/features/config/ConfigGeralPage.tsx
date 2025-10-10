// src/features/admin/ConfigGeralPage.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Grid, Group, Title, Text, Button, Badge, Table, Stack,
  TextInput, NumberInput, Select, Divider, ActionIcon, Tooltip, Switch, Loader
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supabase } from '../../lib/supabaseClient';
import {
  IconPlus, IconTrash, IconEdit, IconCheck, IconX,
} from '@tabler/icons-react';

/* =========================
   Tipos simples (espelham seu schema)
========================= */
type Centro = { id: number; codigo: string; ativo: boolean; desativado_desde: string | null };
type Meta = { id: number; centro_id: number; meta_horas: number; vigente_desde: string; vigente_ate: string | null };
type Alias = { id: number; alias_texto: string; centro_id: number; centro?: { codigo: string } };

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

  // seleção p/ colunas do meio e direita
  const [centroSel, setCentroSel] = useState<string | null>(null);

  /* =========================
     Formulários rápidos
  ========================= */
  // Centros
  const [novoCentro, setNovoCentro] = useState('');
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
      const [c, m, a] = await Promise.all([
        supabase.from('centros').select('id,codigo,ativo,desativado_desde').order('codigo', { ascending: true }),
        supabase.from('metas_diarias').select('id,centro_id,meta_horas,vigente_desde,vigente_ate').order('vigente_desde', { ascending: false }),
        supabase.from('centro_aliases').select('id,alias_texto,centro_id, centro:centros(id,codigo)').order('alias_texto', { ascending: true }),
      ]);

      if (c.error) throw c.error;
      if (m.error) throw m.error;
      if (a.error) throw a.error;

      setCentros((c.data ?? []) as Centro[]);
      setMetas((m.data ?? []) as Meta[]);
      setAliases((a.data ?? []) as Alias[]);

      // default da seleção
      if (!centroSel && (c.data ?? []).length) {
        const firstActive = (c.data as Centro[]).find((x) => x.ativo);
        setCentroSel(String((firstActive ?? (c.data as Centro[])[0]).id));
      }
      if (!centroAliasSel && (c.data ?? []).length) {
        const first = (c.data as Centro[])[0];
        setCentroAliasSel(String(first.id));
      }
    } catch (e: any) {
      console.error(e);
      notifications.show({ title: 'Erro ao carregar', message: e.message ?? String(e), color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  /* =========================
     Derivados
  ========================= */
  const centrosFiltrados = useMemo(
    () => centros.filter((c) => mostrarInativos || c.ativo),
    [centros, mostrarInativos]
  );

  const centroOptions = useMemo(
    () => centros.map((c) => ({ value: String(c.id), label: c.codigo })),
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
     Ações: Centros
  ========================= */
  const criarCentro = async () => {
    const codigo = novoCentro.trim();
    if (!codigo) return;
    const { error } = await supabase.from('centros').insert({ codigo, ativo: true });
    if (error) {
      notifications.show({ title: 'Falha ao criar', message: error.message, color: 'red' });
      return;
    }
    setNovoCentro('');
    notifications.show({ title: 'Centro criado', message: codigo, color: 'green' });
    await loadAll();
  };

  const desativarCentro = async (c: Centro, data?: string) => {
    const dataCorte = data || isoToday();
    const { error } = await supabase
      .from('centros')
      .update({ ativo: false, desativado_desde: dataCorte })
      .eq('id', c.id);
    if (error) {
      notifications.show({ title: 'Falha ao desativar', message: error.message, color: 'red' });
      return;
    }
    notifications.show({ title: 'Centro desativado', message: `${c.codigo} a partir de ${dataCorte}`, color: 'yellow' });
    await loadAll();
  };

  const reativarCentro = async (c: Centro) => {
    const { error } = await supabase
      .from('centros')
      .update({ ativo: true, desativado_desde: null })
      .eq('id', c.id);
    if (error) {
      notifications.show({ title: 'Falha ao reativar', message: error.message, color: 'red' });
      return;
    }
    notifications.show({ title: 'Centro reativado', message: c.codigo, color: 'green' });
    await loadAll();
  };

  /* =========================
     Ações: Metas
  ========================= */
  const criarMeta = async () => {
    const id = Number(centroSel);
    if (!id || novaMeta === '' || novaMeta <= 0) {
      notifications.show({ title: 'Preencha os campos', message: 'Centro, meta (> 0) e data.', color: 'yellow' });
      return;
    }

    // encerrar meta aberta anterior (se houver)
    if (encerrarAnterior) {
      const aberta = metas
        .filter((m) => m.centro_id === id && m.vigente_ate == null)
        .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0];

      if (aberta) {
        // encerra no dia anterior à nova (simples e prático)
        const d = new Date(vigenteDesde);
        d.setDate(d.getDate() - 1);
        const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
        const encerraEm = `${y}-${mo}-${da}`;

        const { error: e1 } = await supabase
          .from('metas_diarias')
          .update({ vigente_ate: encerraEm })
          .eq('id', aberta.id);
        if (e1) {
          notifications.show({ title: 'Não foi possível encerrar meta anterior', message: e1.message, color: 'red' });
          return;
        }
      }
    }

    const { error } = await supabase
      .from('metas_diarias')
      .insert({ centro_id: id, meta_horas: Number(novaMeta), vigente_desde: vigenteDesde });
    if (error) {
      notifications.show({ title: 'Falha ao criar meta', message: error.message, color: 'red' });
      return;
    }
    setNovaMeta('');
    setVigenteDesde(isoToday());
    notifications.show({ title: 'Meta criada', message: 'Meta vigente adicionada', color: 'green' });
    await loadAll();
  };

  const encerrarMeta = async (m: Meta) => {
    if (m.vigente_ate) return;
    const hoje = isoToday();
    const { error } = await supabase.from('metas_diarias').update({ vigente_ate: hoje }).eq('id', m.id);
    if (error) {
      notifications.show({ title: 'Falha ao encerrar meta', message: error.message, color: 'red' });
      return;
    }
    notifications.show({ title: 'Meta encerrada', message: `Encerrada em ${hoje}`, color: 'yellow' });
    await loadAll();
  };

  /* =========================
     Ações: Aliases
  ========================= */
  const criarAlias = async () => {
    const alias = novoAlias.trim();
    const cid = Number(centroAliasSel);
    if (!alias || !cid) {
      notifications.show({ title: 'Preencha os campos', message: 'Alias e Centro.', color: 'yellow' });
      return;
    }
    const { error } = await supabase.from('centro_aliases').insert({ alias_texto: alias, centro_id: cid });
    if (error) {
      notifications.show({ title: 'Falha ao adicionar alias', message: error.message, color: 'red' });
      return;
    }
    setNovoAlias('');
    notifications.show({ title: 'Alias adicionado', message: alias, color: 'green' });
    await loadAll();
  };

  const removerAlias = async (id: number) => {
    const { error } = await supabase.from('centro_aliases').delete().eq('id', id);
    if (error) {
      notifications.show({ title: 'Falha ao remover alias', message: error.message, color: 'red' });
      return;
    }
    notifications.show({ title: 'Alias removido', message: '', color: 'yellow' });
    await loadAll();
  };

  /* =========================
     Render
  ========================= */
  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Configurações — Centros, Metas e Mapeamentos</Title>
        <Group>
          <Switch
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.currentTarget.checked)}
            label="Mostrar centros inativos"
          />
        </Group>
      </Group>

      {loading ? (
        <Group justify="center" mt="xl"><Loader /></Group>
      ) : (
        <Grid gutter="lg">
          {/* ===================== Coluna 1: Centros ===================== */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Title order={4} m={0}>Centros</Title>
              </Group>

              <Stack gap="xs" mb="md">
                <Group align="end" grow>
                  <TextInput
                    label="Novo centro"
                    placeholder="Ex.: Pintura"
                    value={novoCentro}
                    onChange={(e) => setNovoCentro(e.currentTarget.value)}
                  />
                  <Button leftSection={<IconPlus size={16} />} onClick={criarCentro}>
                    Adicionar
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                  Dica: ao desativar um centro, os dados antigos permanecem; os próximos cálculos param de considerá-lo.
                </Text>
              </Stack>

              <Divider my="sm" />

              <Table highlightOnHover withTableBorder stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 28 }}></Table.Th>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Desativado desde</Table.Th>
                    <Table.Th style={{ width: 160 }}>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {centrosFiltrados.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <input
                          type="radio"
                          name="sel-centro"
                          checked={String(c.id) === centroSel}
                          onChange={() => setCentroSel(String(c.id))}
                          style={{ cursor: 'pointer' }}
                          title="Selecionar para ver metas e aliases"
                        />
                      </Table.Td>
                      <Table.Td>{c.codigo}</Table.Td>
                      <Table.Td>
                        {c.ativo ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge>}
                      </Table.Td>
                      <Table.Td>{c.desativado_desde ?? '-'}</Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {c.ativo ? (
                            <Tooltip label="Desativar a partir de hoje">
                              <Button size="xs" variant="light" color="yellow"
                                leftSection={<IconX size={14} />}
                                onClick={() => desativarCentro(c)}
                              >
                                Desativar
                              </Button>
                            </Tooltip>
                          ) : (
                            <Tooltip label="Reativar centro">
                              <Button size="xs" variant="light" color="green"
                                leftSection={<IconCheck size={14} />}
                                onClick={() => reativarCentro(c)}
                              >
                                Ativar
                              </Button>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {centrosFiltrados.length === 0 && (
                    <Table.Tr><Table.Td colSpan={5}>Nenhum centro.</Table.Td></Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>

          {/* ===================== Coluna 2: Metas do centro selecionado ===================== */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Title order={4} m={0}>Metas</Title>
                <Select
                  value={centroSel}
                  onChange={setCentroSel}
                  data={centroOptions}
                  searchable
                  placeholder="Selecionar centro"
                  miw={220}
                />
              </Group>

              <Stack gap="xs" mb="md">
                <Group grow align="end">
                  <NumberInput
                    label="Nova meta (h/dia)"
                    placeholder="Ex.: 24"
                    min={0.01}
                    decimalScale={2}
                    thousandSeparator="."
                    decimalSeparator=","
                    value={novaMeta}
                    onChange={(v) => setNovaMeta(Number(v) || '')}
                  />
                  <TextInput
                    label="Vigente desde"
                    type="date"
                    value={vigenteDesde}
                    onChange={(e) => setVigenteDesde(e.currentTarget.value)}
                  />
                </Group>
                <Group justify="space-between">
                  <Switch
                    checked={encerrarAnterior}
                    onChange={(e) => setEncerrarAnterior(e.currentTarget.checked)}
                    label="Encerrar automaticamente a meta anterior (dia anterior)"
                  />
                  <Button leftSection={<IconPlus size={16} />} onClick={criarMeta}>
                    Adicionar meta
                  </Button>
                </Group>
              </Stack>

              <Divider my="sm" />

              <Table highlightOnHover withTableBorder stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Meta (h)</Table.Th>
                    <Table.Th>Desde</Table.Th>
                    <Table.Th>Até</Table.Th>
                    <Table.Th style={{ width: 120 }}>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {metasDoCentroSel.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{(+m.meta_horas).toFixed(2)}</Table.Td>
                      <Table.Td>{m.vigente_desde}</Table.Td>
                      <Table.Td>{m.vigente_ate ?? <Badge variant="light" color="green">Vigente</Badge>}</Table.Td>
                      <Table.Td>
                        {!m.vigente_ate && (
                          <Tooltip label="Encerrar hoje">
                            <ActionIcon variant="light" color="yellow" onClick={() => encerrarMeta(m)}>
                              <IconX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {metasDoCentroSel.length === 0 && (
                    <Table.Tr><Table.Td colSpan={4}>Sem metas para este centro.</Table.Td></Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>

          {/* ===================== Coluna 3: Aliases (mapeamentos) ===================== */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm">
                <Title order={4} m={0}>Mapeamentos (Aliases)</Title>
              </Group>

              <Stack gap="xs" mb="md">
                <Group grow align="end">
                  <TextInput
                    label="Novo alias"
                    placeholder='Ex.: CE-PINT'
                    value={novoAlias}
                    onChange={(e) => setNovoAlias(e.currentTarget.value)}
                  />
                  <Select
                    label="Centro destino"
                    value={centroAliasSel}
                    onChange={setCentroAliasSel}
                    data={centroOptions}
                    searchable
                  />
                  <Button leftSection={<IconPlus size={16} />} onClick={criarAlias}>
                    Adicionar
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                  Observação: aliases duplicados são ignorados; remova se estiver errado.
                </Text>
              </Stack>

              <Divider my="sm" />

              <Title order={6} mb="xs">Aliases do centro selecionado</Title>
              <Table highlightOnHover withTableBorder stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Alias</Table.Th>
                    <Table.Th style={{ width: 120 }}>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {aliasesDoCentroSel.map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td>{a.alias_texto}</Table.Td>
                      <Table.Td>
                        <ActionIcon variant="light" color="red" onClick={() => removerAlias(a.id)} title="Remover">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {aliasesDoCentroSel.length === 0 && (
                    <Table.Tr><Table.Td colSpan={2}>Nenhum alias para este centro.</Table.Td></Table.Tr>
                  )}
                </Table.Tbody>
              </Table>

              <Divider my="md" />
              <Title order={6} mb="xs">Todos os aliases</Title>
              <Table highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Alias</Table.Th>
                    <Table.Th>Centro</Table.Th>
                    <Table.Th style={{ width: 80 }}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {aliases.map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td>{a.alias_texto}</Table.Td>
                      <Table.Td>{a.centro?.codigo ?? '-'}</Table.Td>
                      <Table.Td>
                        <ActionIcon variant="light" color="red" onClick={() => removerAlias(a.id)} title="Remover">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {aliases.length === 0 && (
                    <Table.Tr><Table.Td colSpan={3}>Nenhum mapeamento cadastrado.</Table.Td></Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </div>
  );
}
