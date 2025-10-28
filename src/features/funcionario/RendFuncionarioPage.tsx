// src/features/rendimento/RendimentoPage.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Group, Title, Select, Button, Badge, Text, Grid, Table, Loader,
  SegmentedControl, TextInput, Pagination, rem,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates';
import {
  fetchFuncionarios,
  fetchRankingFuncionarios,
  fetchFuncionarioCentroRange,
  fetchCentrosDict,
  fetchUltimoDiaComDados,
  type RankItem,
} from '../../services/db';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
} from 'recharts';
import { IconArrowsSort, IconChevronDown, IconChevronUp, IconSearch } from '@tabler/icons-react';

/* =========================
   Configs e Helpers
========================= */
const MAX_ROWS = 2000;
type Modo = 'dia' | 'intervalo';

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function isoToDate(iso: string) {
  return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}
function parseLocalDateString(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/yyyy
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);   // yyyy-mm-dd
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}
function addDays(d: Date, delta: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + delta);
  return nd;
}
function diffDays(a: Date, b: Date) {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((A - B) / (1000 * 60 * 60 * 24));
}

type SortBy = 'matricula' | 'horas' | 'delta';
type SortDir = 'asc' | 'desc';

/* =========================
   Página
========================= */
export default function RendimentoPage() {
  // Modo de filtro: dia único ou intervalo
  const [modo, setModo] = useState<Modo>('dia');

  // Datas
  const [dia, setDia] = useState<Date | null>(new Date());
  const [range, setRange] = useState<[Date | null, Date | null]>([null, null]);

  // Lookups
  const [funcList, setFuncList] = useState<string[]>([]);
  const [centrosDict, setCentrosDict] = useState<Record<number, string>>({});

  // Filtros
  const [funcSel, setFuncSel] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [perPage, setPerPage] = useState<string | null>('20');

  // Dados brutos
  const [ranking, setRanking] = useState<RankItem[]>([]);
  const [rankingPrevMap, setRankingPrevMap] = useState<Map<string, number>>(new Map());
  const [detalhe, setDetalhe] = useState<{ centro_id: number; codigo: string; horas: number }[]>([]);

  // UI
  const [loading, setLoading] = useState(false);
  const [loadingLookups, setLoadingLookups] = useState(true);

  // Ordenação e paginação do ranking
  const [sortBy, setSortBy] = useState<SortBy>('horas');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  /* =========================
     Cargas iniciais
  ========================= */
  useEffect(() => {
    (async () => {
      setLoadingLookups(true);
      try {
        const [funcs, centros, lastISO] = await Promise.all([
          fetchFuncionarios(),
          fetchCentrosDict(),
          fetchUltimoDiaComDados(),
        ]);
        setFuncList(funcs);
        setCentrosDict(centros);
        const last = lastISO ? isoToDate(lastISO) : new Date();
        setDia(last);
        setRange([last, last]);
      } finally {
        setLoadingLookups(false);
      }
    })();
  }, []);

  /* =========================
     Função principal: aplicar filtros e carregar dados
  ========================= */
  const aplicar = async () => {
    // Definir período
    let start: Date | null = null;
    let end: Date | null = null;

    if (modo === 'dia') {
      start = dia;
      end = dia;
    } else {
      start = range?.[0] ?? null;
      end = range?.[1] ?? null;
    }
    if (!start || !end) return;

    setLoading(true);
    try {
      const startISO = toISO(start);
      const endISO = toISO(end);

      // 1) Ranking do período (todos, com limite alto)
      const rk = await fetchRankingFuncionarios(startISO, endISO, MAX_ROWS);
      setRanking(rk);

      // 2) Ranking do período anterior para calcular Δ
      //    - Dia: período anterior = dia - 1
      //    - Intervalo: tamanho igual imediatamente anterior
      let prevStart: Date;
      let prevEnd: Date;
      if (modo === 'dia') {
        prevStart = addDays(start, -1);
        prevEnd = addDays(start, -1);
      } else {
        const daysSpan = Math.abs(diffDays(end, start)) + 1;
        prevEnd = addDays(start, -1);
        prevStart = addDays(prevEnd, -(daysSpan - 1));
      }
      const prevStartISO = toISO(prevStart);
      const prevEndISO = toISO(prevEnd);
      const rkPrev = await fetchRankingFuncionarios(prevStartISO, prevEndISO, MAX_ROWS);
      const prevMap = new Map<string, number>();
      for (const r of rkPrev) prevMap.set(r.matricula, r.horas);
      setRankingPrevMap(prevMap);

      // 3) Detalhe por matrícula (horas por centro no período)
      if (funcSel) {
        const rows = await fetchFuncionarioCentroRange(funcSel, startISO, endISO);
        const ag = new Map<number, number>();
        for (const r of rows) {
          ag.set(r.centro_id, (ag.get(r.centro_id) ?? 0) + Number(r.produzido_h));
        }
        const det = [...ag.entries()]
          .map(([centro_id, horas]) => ({
            centro_id,
            codigo: centrosDict[centro_id] ?? String(centro_id),
            horas: +Number(horas).toFixed(2),
          }))
          .sort((a, b) => b.horas - a.horas);
        setDetalhe(det);
      } else {
        setDetalhe([]);
      }

      // Reset da paginação ao aplicar
      setPage(1);
    } finally {
      setLoading(false);
    }
  };

  // Aplica ao trocar entrada de data/matrícula/modo
  useEffect(() => {
    aplicar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, dia?.getTime(), range?.[0]?.getTime(), range?.[1]?.getTime(), funcSel]);

  /* =========================
     Derivados
  ========================= */
  // Adiciona delta ao ranking
  type RankView = RankItem & { delta?: number | null; deltaPct?: number | null };
  const rankingWithDelta: RankView[] = useMemo(() => {
    return ranking.map((r) => {
      const prev = rankingPrevMap.get(r.matricula);
      if (prev === undefined) return { ...r, delta: null, deltaPct: null };
      const delta = r.horas - prev;
      const deltaPct = prev > 0 ? (delta / prev) : null;
      return { ...r, delta, deltaPct };
    });
  }, [ranking, rankingPrevMap]);

  // Filtro de pesquisa (por matrícula)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rankingWithDelta;
    return rankingWithDelta.filter((r) => r.matricula.toLowerCase().includes(q));
  }, [rankingWithDelta, search]);

  // Ordenação
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'matricula') {
        cmp = a.matricula.localeCompare(b.matricula, 'pt-BR', { numeric: true });
      } else if (sortBy === 'horas') {
        cmp = a.horas - b.horas;
      } else if (sortBy === 'delta') {
        const ad = a.delta ?? -Infinity;
        const bd = b.delta ?? -Infinity;
        cmp = ad - bd;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  // Paginação
  const per = Number(perPage ?? '20');
  const totalPages = Math.max(1, Math.ceil(sorted.length / per));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (pageSafe - 1) * per;
    return sorted.slice(start, start + per);
  }, [sorted, pageSafe, per]);

  // Resumo do período
  const totalHoras = useMemo(() => sum(sorted.map((r) => r.horas)), [sorted]);
  const totalFuncs = sorted.length;
  const mediaHoras = totalFuncs > 0 ? totalHoras / totalFuncs : 0;

  const periodoLabel = useMemo(() => {
    if (modo === 'dia') return dia ? toISO(dia) : '';
    const [s, e] = range;
    return s && e ? `${toISO(s)} a ${toISO(e)}` : '';
  }, [modo, dia, range]);

  const top3Centros = useMemo(() => detalhe.slice(0, 3), [detalhe]);

  /* =========================
     UI Helpers
  ========================= */
  const SortIcon = ({ col }: { col: SortBy }) => {
    if (sortBy !== col) return <IconArrowsSort size={16} />;
    return sortDir === 'asc' ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />;
  };
  const onToggleSort = (col: SortBy) => {
    if (col === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'matricula' ? 'asc' : 'desc');
    }
  };

  /* =========================
     Render
  ========================= */
  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Rendimento — Funcionários</Title>
        {periodoLabel && (
          <Badge variant="light">Período: {periodoLabel}</Badge>
        )}
      </Group>

      {/* Filtros */}
      <Card withBorder shadow="sm" radius="lg" p="md" mb="lg">
        <Group gap="lg" align="end" wrap="wrap">
          <SegmentedControl
            value={modo}
            onChange={(v) => setModo(v as Modo)}
            data={[
              { label: 'Dia', value: 'dia' },
              { label: 'Intervalo', value: 'intervalo' },
            ]}
          />

          {modo === 'dia' ? (
            <DatePickerInput
              label="Dia"
              placeholder="Selecione"
              value={dia ?? undefined}
              onChange={(v: any) => {
                if (v instanceof Date) return setDia(v);
                setDia(parseLocalDateString(v));
              }}
              valueFormat="DD/MM/YYYY"
              locale="pt-BR"
            />
          ) : (
            <DatePickerInput
              type="range"
              label="Intervalo"
              placeholder="Selecione o período"
              value={range as any}
              onChange={(v: any) => {
                if (Array.isArray(v)) {
                  const [s, e] = v;
                  setRange([
                    s instanceof Date ? s : (s ? parseLocalDateString(s) : null),
                    e instanceof Date ? e : (e ? parseLocalDateString(e) : null),
                  ]);
                }
              }}
              valueFormat="DD/MM/YYYY"
              locale="pt-BR"
              clearable
            />
          )}

          <Select
            label="Matrícula (detalhe por centro)"
            placeholder="(opcional)"
            data={funcList.map((m) => ({ value: m, label: m }))}
            value={funcSel}
            onChange={setFuncSel}
            searchable
            clearable
            nothingFoundMessage="Sem dados"
          />

          <TextInput
            label="Pesquisar no ranking"
            placeholder="Filtrar por matrícula…"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />

          <Select
            label="Itens por página"
            value={perPage}
            onChange={setPerPage}
            data={['10', '20', '50', '100']}
          />

          <Button onClick={aplicar} disabled={loading || loadingLookups}>
            {loading ? 'Carregando...' : 'Aplicar'}
          </Button>
        </Group>
      </Card>

      {loadingLookups ? (
        <Group justify="center" mt="xl"><Loader /></Group>
      ) : (
        <Grid gutter="lg">
          {/* Dashboard do período */}
          <Grid.Col span={{ base: 12 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg" mb="lg">
              <Group justify="space-between" align="center" mb="sm">
                <Title order={4}>Resumo do período</Title>
                <Group gap="md">
                  <Badge size="lg" variant="dot">Total horas: {totalHoras.toFixed(2)} h</Badge>
                  <Badge size="lg" variant="dot">Funcionários: {totalFuncs}</Badge>
                  <Badge size="lg" variant="dot">Média/func: {mediaHoras.toFixed(2)} h</Badge>
                </Group>
              </Group>
              <Text c="dimmed" size="sm">
                Dica: clique nos cabeçalhos do ranking para ordenar; use pesquisa para filtrar por matrícula.
              </Text>
            </Card>
          </Grid.Col>

          {/* Ranking completo */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Group justify="space-between" mb="sm" align="center">
                <Title order={4}>Ranking do período</Title>
                <Text c="dimmed" size="sm">
                  Exibindo {pageRows.length} de {sorted.length} registros
                </Text>
              </Group>

              {sorted.length === 0 ? (
                <Text c="dimmed">Sem dados para o período selecionado.</Text>
              ) : (
                <>
                  <Table highlightOnHover withTableBorder stickyHeader striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th style={{ width: rem(72), minWidth: rem(72) }}>Pos</Table.Th>
                        <Table.Th onClick={() => onToggleSort('matricula')} style={{ cursor: 'pointer' }}>
                          <Group gap={6}>
                            Matrícula <SortIcon col="matricula" />
                          </Group>
                        </Table.Th>
                        <Table.Th onClick={() => onToggleSort('horas')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                          <Group justify="flex-end" gap={6}>
                            Horas <SortIcon col="horas" />
                          </Group>
                        </Table.Th>
                        <Table.Th onClick={() => onToggleSort('delta')} style={{ textAlign: 'right', cursor: 'pointer' }}>
                          <Group justify="flex-end" gap={6}>
                            Δ vs período anterior <SortIcon col="delta" />
                          </Group>
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {pageRows.map((r, idx) => {
                        const globalPos = (pageSafe - 1) * per + idx + 1;
                        const isTop = globalPos <= 3;
                        const delta = r.delta;
                        const deltaPct = r.deltaPct;
                        const isSelected = funcSel === r.matricula;

                        return (
                          <Table.Tr
                            key={r.matricula}
                            onClick={() => setFuncSel(r.matricula)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') setFuncSel(r.matricula);
                            }}
                            tabIndex={0}
                            role="button"
                            style={{
                              cursor: 'pointer',
                              // leve realce quando selecionado (funciona bem em light mode)
                              backgroundColor: isSelected ? 'rgba(0,0,0,0.04)' : undefined,
                            }}
                          >
                            <Table.Td>
                              <Badge color={isTop ? 'teal' : 'gray'} variant={isTop ? 'filled' : 'light'}>
                                {globalPos}
                              </Badge>
                            </Table.Td>

                            <Table.Td>
                              <Group gap="xs">
                                <Text fw={500} c={isSelected ? 'blue' : undefined}>{r.matricula}</Text>
                                {isSelected && <Badge variant="light">selecionado</Badge>}
                              </Group>
                            </Table.Td>

                            <Table.Td style={{ textAlign: 'right' }}>
                              {r.horas.toFixed(2)}
                            </Table.Td>

                            <Table.Td style={{ textAlign: 'right' }}>
                              {delta == null ? (
                                <Text c="dimmed">—</Text>
                              ) : (
                                <Group justify="flex-end" gap={6} wrap="nowrap">
                                  <Text c={delta >= 0 ? 'teal' : 'red'}>
                                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)} h
                                  </Text>
                                  <Text c="dimmed" size="sm">
                                    {deltaPct == null ? '' : `(${(deltaPct * 100).toFixed(0)}%)`}
                                  </Text>
                                </Group>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>

                  <Group justify="space-between" mt="md">
                    <Text c="dimmed" size="sm">
                      Página {pageSafe} de {totalPages}
                    </Text>
                    <Pagination value={pageSafe} onChange={setPage} total={totalPages} />
                  </Group>
                </>
              )}
            </Card>
          </Grid.Col>

          {/* Detalhe por matrícula (horas por centro no período) */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Title order={4} mb="sm">
                {funcSel ? `Detalhe — ${funcSel} (por centro)` : 'Selecione uma matrícula na lista para ver o detalhe'}
              </Title>

              {!funcSel ? (
                <Text c="dimmed">Clique em um item para selecionar uma matrícula ou use o seletor nos filtros.</Text>
              ) : detalhe.length === 0 ? (
                <Text c="dimmed">Sem dados para a matrícula no período.</Text>
              ) : (
                <>
                  <Group mb="xs" gap="md">
                    <Badge variant="light">Total no período: {sum(detalhe.map((d) => d.horas)).toFixed(2)} h</Badge>
                    {top3Centros.length > 0 && (
                      <Group gap={6}>
                        <Text size="sm" c="dimmed">Top 3 centros:</Text>
                        {top3Centros.map((c) => (
                          <Badge key={c.centro_id} variant="dot">{c.codigo}</Badge>
                        ))}
                      </Group>
                    )}
                  </Group>

                  <div style={{ height: 320, marginBottom: 16 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={detalhe.map((d) => ({ centro: d.codigo, horas: d.horas }))}
                        barCategoryGap="22%"
                      >
                        <CartesianGrid stroke="var(--mantine-color-gray-3)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="centro"
                          tick={{ fill: 'var(--mantine-color-dimmed)' }}
                          axisLine={{ stroke: 'var(--mantine-color-gray-4)' }}
                          tickLine={{ stroke: 'var(--mantine-color-gray-4)' }}
                        />
                        <YAxis
                          tick={{ fill: 'var(--mantine-color-dimmed)' }}
                          axisLine={{ stroke: 'var(--mantine-color-gray-4)' }}
                          tickLine={{ stroke: 'var(--mantine-color-gray-4)' }}
                        />
                        <RTooltip
                          formatter={(v: number) => [`${Number(v).toFixed(2)} h`, 'Horas']}
                          labelStyle={{ fontWeight: 600 }}
                          contentStyle={{
                            background: 'var(--mantine-color-body)',
                            border: '1px solid var(--mantine-color-gray-3)',
                            borderRadius: 8,
                            color: 'var(--mantine-color-text)',
                          }}
                        />
                        <Bar
                          dataKey="horas"
                          name="Horas"
                          fill="var(--mantine-primary-color-filled)"
                          stroke="var(--mantine-primary-color-filled)"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <Table highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Centro</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>Horas</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {detalhe.map((d) => (
                        <Table.Tr key={d.centro_id}>
                          <Table.Td>{d.codigo}</Table.Td>
                          <Table.Td style={{ textAlign: 'right' }}>{d.horas.toFixed(2)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </>
              )}
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </div>
  );
}
