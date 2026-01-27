// src/features/graficos/GraficosPage.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Card,
  Group,
  Title,
  Text,
  SegmentedControl,
  Select,
  Button,
  Badge,
  Stack,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import type { DatesRangeValue } from '@mantine/dates';
import { IconDownload } from '@tabler/icons-react';
import { useEmpresaId } from '../../contexts/TenantContext';
import {
  fetchCentros,
  fetchMetasAtuais,
  fetchMetaTotalAtual,
  fetchFabricaRange,
  fetchCentroSeriesRange,
  type Centro,
  type VMetaAtual,
} from '../../services/db';
import { isSaturdayISO } from '../tv/utils';
import {
  ResponsiveContainer,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
} from 'recharts';

type ChartType = 'bar' | 'line';
type ScopeType = 'fabrica' | 'centro';
type DayRow = {
  iso: string;
  label: string;
  produzido: number;
  meta: number;
  pct: number;
  diff: number;
};

/* ---------- helpers ---------- */
function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toSafeDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as any)?.toDate === 'function') {
    const d = (v as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v as any);
    return !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function addDays(d: Date, delta: number) {
  const nd = new Date(d);
  nd.setDate(d.getDate() + delta);
  return startOfDayLocal(nd);
}

function daysBetween(a: Date, b: Date): string[] {
  const res: string[] = [];
  const start = startOfDayLocal(a);
  const end = startOfDayLocal(b);
  for (let d = start; d <= end; d = addDays(d, 1)) res.push(toISO(d));
  return res;
}

/** Parse local (evita o bug do "YYYY-MM-DD" como UTC) */
function isoToLocalDate(iso: string) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(y, m - 1, d); // local, sem shift de fuso
}

function shortBR(iso: string) {
  const d = isoToLocalDate(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function colorFor(pct: number) {
  if (pct < 80) return '#ef4444';
  if (pct <= 100) return '#f59e0b';
  return '#16a34a';
}

function isSundayISO(iso: string) {
  return isoToLocalDate(iso).getDay() === 0;
}

/* tooltip */
function TooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: any) => x.dataKey === 'produzido')?.value ?? 0;
  const m = payload.find((x: any) => x.dataKey === 'meta')?.value ?? 0;
  const diff = p - m;
  const pct = m > 0 ? (p / m) * 100 : 100;
  return (
    <Card shadow="sm" padding="xs" radius="md" withBorder>
      <Text fw={600} mb={4}>{label}</Text>
      <Text size="sm">Produzido: <b>{p.toFixed(2)} h</b></Text>
      <Text size="sm">Meta: <b>{m.toFixed(2)} h</b></Text>
      <Text size="sm">Diferença: <b style={{ color: diff >= 0 ? '#16a34a' : '#ef4444' }}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(2)} h
      </b></Text>
      <Text size="sm">Aderência: <b>{pct.toFixed(2)}%</b></Text>
    </Card>
  );
}

/* ---------- page ---------- */
export default function GraficosPage() {
  const empresaId = useEmpresaId();

  const [range, setRange] = useState<[Date | null, Date | null]>(() => {
    const end = startOfDayLocal(new Date());
    const start = addDays(end, -6);
    return [start, end];
  });
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [scope, setScope] = useState<ScopeType>('fabrica');
  const [centros, setCentros] = useState<Centro[]>([]);
  const [metas, setMetas] = useState<VMetaAtual[]>([]);
  const [metaTotal, setMetaTotal] = useState<number>(0);
  const [centroSel, setCentroSel] = useState<string | null>(null);

  const [data, setData] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const [c, m, mt] = await Promise.all([
        fetchCentros(empresaId),
        fetchMetasAtuais(empresaId),
        fetchMetaTotalAtual(empresaId),
      ]);
      const ativos = c.filter((x) => x.ativo);
      setCentros(ativos);
      setMetas(m);
      setMetaTotal(mt);
      if (!centroSel && ativos.length) setCentroSel(String(ativos[0].id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const metaByCentro = useMemo(
    () => new Map(metas.map((mm) => [mm.centro_id, Number(mm.meta_horas)])),
    [metas]
  );

  const setQuickRange = useCallback((kind: '7d' | '15d' | '30d' | 'mesAtual') => {
    const today = startOfDayLocal(new Date());
    if (kind === 'mesAtual') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setRange([start, today]);
      return;
    }
    const days = kind === '7d' ? 6 : kind === '15d' ? 14 : 29;
    const start = addDays(today, -days);
    setRange([start, today]);
  }, []);

  const aplicar = useCallback(async () => {
    const [start, end] = range;
    if (!start || !end) return;

    setLoading(true);
    try {
      const dias = daysBetween(start, end);

      if (scope === 'fabrica') {
        const fab = await fetchFabricaRange(empresaId, toISO(start), toISO(end));
        const map = new Map(fab.map((r) => [r.data_wip, Number(r.produzido_h)]));
        const rows: DayRow[] = dias.map((d) => {
          const prod = +(map.get(d) ?? 0).toFixed(2);

          // Lógica de Sábado: Meta = 0
          const isSaturday = isSaturdayISO(d);
          const meta = isSaturday ? 0 : +metaTotal.toFixed(2);

          const pct = meta > 0 ? (prod / meta) * 100 : (prod > 0 ? 100 : 0);
          return {
            iso: d,
            label: shortBR(d),
            produzido: prod,
            meta,
            pct,
            diff: +(prod - meta).toFixed(2),
          };
        });
        setData(rows);
      } else {
        const id = Number(centroSel);
        if (!id) {
          setData([]);
          setLoading(false);
          return;
        }
        const metaStandard = +(metaByCentro.get(id) ?? 0);
        const rowsRaw = await fetchCentroSeriesRange(empresaId, [id], toISO(start), toISO(end));
        const map = new Map(rowsRaw.map((r) => [r.data_wip, Number(r.produzido_h)]));
        const rows: DayRow[] = dias.map((d) => {
          const prod = +(map.get(d) ?? 0).toFixed(2);

          // Lógica de Sábado: Meta = 0
          const isSaturday = isSaturdayISO(d);
          const meta = isSaturday ? 0 : metaStandard;

          const pct = meta > 0 ? (prod / meta) * 100 : (prod > 0 ? 100 : 0);
          return {
            iso: d,
            label: shortBR(d),
            produzido: prod,
            meta,
            pct,
            diff: +(prod - meta).toFixed(2),
          };
        });
        setData(rows);
      }
    } finally {
      setLoading(false);
    }
  }, [range, scope, centroSel, metaTotal, metaByCentro, empresaId]);

  useEffect(() => {
    aplicar();
  }, [aplicar]);

  /* Sempre ignorar domingos nos KPIs e gráficos */
  const chartData = useMemo(
    () => data.filter((r) => !isSundayISO(r.iso)),
    [data]
  );

  const rowsForKpi = useMemo(
    () => data.filter((r) => !isSundayISO(r.iso)),
    [data]
  );

  const sundayRows = useMemo(
    () => data.filter((r) => isSundayISO(r.iso)),
    [data]
  );

  const kpis = useMemo(() => {
    if (!rowsForKpi.length) return null;
    const totalProd = rowsForKpi.reduce((s, r) => s + r.produzido, 0);
    const totalMeta = rowsForKpi.reduce((s, r) => s + r.meta, 0);
    const aderencia = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 100;
    return {
      totalProd: +totalProd.toFixed(2),
      totalMeta: +totalMeta.toFixed(2),
      aderencia: +aderencia.toFixed(2),
    };
  }, [rowsForKpi]);

  const yMax = useMemo(() => {
    const mx = Math.max(0, ...chartData.map((r) => Math.max(r.produzido, r.meta)));
    if (!Number.isFinite(mx) || mx === 0) return 10;
    return Math.ceil(mx * 1.15);
  }, [chartData]);

  const exportCsv = () => {
    if (!data.length || !range[0] || !range[1]) return;
    const titulo = scope === 'fabrica' ? 'Fabrica' : `Centro_${centroSel ?? ''}`;
    const head = ['Data', 'Produzido(h)', 'Meta(h)', 'Diferença(h)', 'Aderencia(%)'];
    const rows = data.map((r) => [
      r.iso,
      r.produzido.toFixed(2),
      r.meta.toFixed(2),
      r.diff.toFixed(2),
      r.pct.toFixed(2),
    ]);
    const csv = [head.join(';'), ...rows.map((a) => a.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titulo}_${toISO(range[0]!)}_a_${toISO(range[1]!)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const centroOptions = useMemo(
    () => centros.map((c) => ({ value: String(c.id), label: c.codigo })),
    [centros]
  );

  const handleRangeChange = (val: DatesRangeValue) => {
    // Mantine pode mandar null ou array com tipos variados
    const a0 = Array.isArray(val) ? val[0] : null;
    const b0 = Array.isArray(val) ? val[1] : null;

    const a = toSafeDate(a0);
    const b = toSafeDate(b0);

    let start = a ? startOfDayLocal(a) : null;
    let end = b ? startOfDayLocal(b) : null;

    // Se o usuário clicar o fim antes do início, inverte
    if (start && end && start.getTime() > end.getTime()) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    setRange([start, end]);
  };

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Gráficos</Title>
        {kpis && (
          <Group gap="xs" wrap="wrap">
            <Badge variant="light">Produzido: {kpis.totalProd} h</Badge>
            <Badge variant="light">Meta: {kpis.totalMeta} h</Badge>
            <Badge
              color={
                kpis.aderencia < 80
                  ? 'red'
                  : kpis.aderencia <= 100
                    ? 'yellow'
                    : 'green'
              }
            >
              Aderência: {kpis.aderencia}%
            </Badge>
            <Badge variant="outline" color="gray">
              Domingos ignorados nos KPIs e gráficos
            </Badge>
          </Group>
        )}
      </Group>

      <Card withBorder shadow="sm" radius="lg" p="md" mb="lg">
        <Group gap="lg" align="end" wrap="wrap">
          <Stack gap={6}>
            <DatePickerInput
              type="range"
              label="Período"
              placeholder="Selecione o intervalo"
              value={range}
              onChange={handleRangeChange}
              valueFormat="DD/MM/YYYY"
              allowSingleDateInRange
              locale="pt-BR"
              firstDayOfWeek={1}
              maxDate={new Date()}
            />
            <Group gap={6}>
              <Button size="xs" variant="subtle" onClick={() => setQuickRange('7d')}>
                Últimos 7d
              </Button>
              <Button size="xs" variant="subtle" onClick={() => setQuickRange('15d')}>
                15d
              </Button>
              <Button size="xs" variant="subtle" onClick={() => setQuickRange('30d')}>
                30d
              </Button>
              <Button size="xs" variant="subtle" onClick={() => setQuickRange('mesAtual')}>
                Mês atual
              </Button>
            </Group>
          </Stack>

          <SegmentedControl
            value={scope}
            onChange={(v) => setScope(v as ScopeType)}
            data={[
              { label: 'Fábrica', value: 'fabrica' },
              { label: 'Máquina', value: 'centro' },
            ]}
          />

          {scope === 'centro' && (
            <Select
              label="Máquina"
              data={centroOptions}
              value={centroSel}
              onChange={setCentroSel}
              searchable
              miw={240}
            />
          )}

          <SegmentedControl
            value={chartType}
            onChange={(v) => setChartType(v as ChartType)}
            data={[
              { label: 'Colunas por dia', value: 'bar' },
              { label: 'Tendência', value: 'line' },
            ]}
          />

          <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportCsv}>
            Exportar CSV
          </Button>
          <Button onClick={aplicar}>Aplicar</Button>
        </Group>
      </Card>

      <Card withBorder shadow="sm" radius="lg" p="lg">
        {loading ? (
          <Text c="dimmed">Carregando...</Text>
        ) : !chartData.length ? (
          <Text c="dimmed">
            Sem dados (ou apenas domingos) para o período/seleção.
          </Text>
        ) : chartType === 'bar' ? (
          <>
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, yMax]} />
                  <Tooltip content={<TooltipContent />} />
                  <Legend />
                  <Bar
                    dataKey="produzido"
                    name="Produzido (h)"
                    radius={[6, 6, 0, 0]}
                  >
                    {chartData.map((r, i) => (
                      <Cell key={i} fill={colorFor(r.pct)} />
                    ))}
                  </Bar>
                  <Line
                    type="linear"
                    dataKey="meta"
                    name="Meta (h)"
                    stroke="#1f2937"
                    strokeDasharray="6 6"
                    dot={false}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <>
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, yMax]} />
                  <Tooltip content={<TooltipContent />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="produzido"
                    name="Produzido (h)"
                    dot={false}
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
                  <Line
                    type="linear"
                    dataKey="meta"
                    name="Meta (h)"
                    dot={false}
                    stroke="#1f2937"
                    strokeDasharray="6 6"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {sundayRows.length > 0 && (
          <Text size="xs" c="dimmed" mt="xs">
            {sundayRows.length} domingo(s) foram ignorados nos gráficos e KPIs,
            mas continuam presentes na exportação CSV.
          </Text>
        )}
      </Card>
    </div>
  );
}
