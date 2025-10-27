// src/features/rendimento/RendimentoPage.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Group, Title, Select, Button, Badge, Text, Grid, Table, Loader,
} from '@mantine/core';
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
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';

/* =========================
   Helpers
========================= */
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

/* =========================
   Página
========================= */
export default function RendimentoPage() {
  // Dia único
  const [dia, setDia] = useState<Date | null>(new Date());

  // Lookups
  const [funcList, setFuncList] = useState<string[]>([]);
  const [centrosDict, setCentrosDict] = useState<Record<number, string>>({});

  // Filtros
  const [funcSel, setFuncSel] = useState<string | null>(null);

  // Dados
  const [ranking, setRanking] = useState<RankItem[]>([]);
  const [detalhe, setDetalhe] = useState<{ centro_id: number; codigo: string; horas: number }[]>([]);

  // UI
  const [loading, setLoading] = useState(false);
  const [loadingLookups, setLoadingLookups] = useState(true);

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
        setDia(lastISO ? isoToDate(lastISO) : new Date());
      } finally {
        setLoadingLookups(false);
      }
    })();
  }, []);

  /* =========================
     Aplicar (carrega dados do dia)
  ========================= */
  const aplicar = async () => {
    if (!dia) return;
    setLoading(true);
    try {
      const iso = toISO(dia);

      // Ranking do próprio dia (top 10)
      const rk = await fetchRankingFuncionarios(iso, iso, 10);
      setRanking(rk);

      // Detalhe por matrícula (horas por centro no dia)
      if (funcSel) {
        const rows = await fetchFuncionarioCentroRange(funcSel, iso, iso);
        const ag = new Map<number, number>();
        for (const r of rows) {
          ag.set(r.centro_id, (ag.get(r.centro_id) ?? 0) + Number(r.produzido_h));
        }
        const det = [...ag.entries()]
          .map(([centro_id, horas]) => ({
            centro_id,
            codigo: centrosDict[centro_id] ?? String(centro_id),
            horas: +horas.toFixed(2),
          }))
          .sort((a, b) => b.horas - a.horas);
        setDetalhe(det);
      } else {
        setDetalhe([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Aplica ao trocar dia ou matrícula
  useEffect(() => {
    aplicar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia?.getTime(), funcSel]);

  const totalSel = useMemo(() => sum(detalhe.map((d) => d.horas)).toFixed(2), [detalhe]);

  /* =========================
     Render
  ========================= */
  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Rendimento — Funcionários (por dia)</Title>
        {funcSel && detalhe.length > 0 && (
          <Badge variant="light">Total {dia ? toISO(dia) : ''}: {totalSel} h</Badge>
        )}
      </Group>

      <Card withBorder shadow="sm" radius="lg" p="md" mb="lg">
        <Group gap="lg" align="end" wrap="wrap">
          <DatePickerInput
            label="Dia"
            placeholder="Selecione"
            value={dia ?? undefined}
            // handler tolerante (algumas versões tipam como string|null)
            onChange={(v: any) => {
              if (v instanceof Date) return setDia(v);
              setDia(parseLocalDateString(v));
            }}
            valueFormat="DD/MM/YYYY"
            locale="pt-BR"
          />
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
          <Button onClick={aplicar} disabled={loading || loadingLookups}>
            {loading ? 'Carregando...' : 'Aplicar'}
          </Button>
        </Group>
      </Card>

      {loadingLookups ? (
        <Group justify="center" mt="xl"><Loader /></Group>
      ) : (
        <Grid gutter="lg">
          {/* Ranking do dia */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Title order={4} mb="sm">Top 10 — Horas no dia</Title>
              {ranking.length === 0 ? (
                <Text c="dimmed">Sem dados para o dia selecionado.</Text>
              ) : (
                <Table highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Matrícula</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Horas</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {ranking.map((r) => (
                      <Table.Tr key={r.matricula}>
                        <Table.Td>{r.matricula}</Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>{r.horas.toFixed(2)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Grid.Col>

          {/* Detalhe por matrícula (horas por centro no dia) */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card withBorder shadow="sm" radius="lg" p="lg">
              <Title order={4} mb="sm">
                {funcSel ? `Detalhe — ${funcSel} (por centro)` : 'Selecione uma matrícula para ver o detalhe'}
              </Title>

              {!funcSel ? (
                <Text c="dimmed">Escolha uma matrícula para ver as horas por centro neste dia.</Text>
              ) : detalhe.length === 0 ? (
                <Text c="dimmed">Sem dados para a matrícula no dia.</Text>
              ) : (
                <>
                  <div style={{ height: 320, marginBottom: 16 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={detalhe.map((d) => ({ centro: d.codigo, horas: d.horas }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="centro" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="horas" name="Horas" />
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
