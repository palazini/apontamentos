import { useEffect, useMemo, useState } from 'react';
import {
  Card, Group, Title, Text, SegmentedControl, Select, Button, Badge,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconDownload } from '@tabler/icons-react';
import {
  fetchCentros,
  fetchMetasAtuais,
  fetchMetaTotalAtual,
  fetchFabricaRange,
  fetchCentroSeriesRange,
  type Centro,
  type VMetaAtual,
} from '../../services/db';
import { ResponsiveContainer, BarChart, Bar, Line, ComposedChart,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Cell } from 'recharts';
import type { DatesRangeValue } from '@mantine/dates';

type ChartType = 'bar' | 'line';
type ScopeType = 'fabrica' | 'centro';
type DayRow = { iso: string; label: string; produzido: number; meta: number; acima?: number | null; abaixo?: number | null };

function toISO(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function addDays(d: Date, delta: number) {
  const nd = new Date(d); nd.setDate(d.getDate() + delta); return nd;
}
function daysBetween(a: Date, b: Date): string[] {
  const res: string[] = [];
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  for (let d = start; d <= end; d = addDays(d, 1)) res.push(toISO(d));
  return res;
}
function shortBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
}

function colorFor(pct: number) {
  if (pct < 80) return '#ef4444';
  if (pct <= 100) return '#f59e0b';
  return '#16a34a';
}

export default function GraficosPage() {
  // Filtros
  const [range, setRange] = useState<[Date | null, Date | null]>(() => {
    const end = new Date();
    const start = addDays(end, -6);
    return [start, end];
  });
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [scope, setScope] = useState<ScopeType>('fabrica');
  const [centros, setCentros] = useState<Centro[]>([]);
  const [metas, setMetas] = useState<VMetaAtual[]>([]);
  const [metaTotal, setMetaTotal] = useState<number>(0);
  const [centroSel, setCentroSel] = useState<string | null>(null);

  // Dados da série
  const [data, setData] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const exportCsv = () => {
    if (!data.length || !range[0] || !range[1]) return;
    const titulo = scope === 'fabrica' ? 'Fabrica' : `Centro_${centroSel ?? ''}`;
    const head = ['Data','Produzido(h)','Meta(h)','Aderencia(%)'];
    const rows = data.map((r) => {
      const pct = r.meta > 0 ? (r.produzido / r.meta) * 100 : 100;
      return [r.iso, r.produzido.toFixed(2), r.meta.toFixed(2), pct.toFixed(2)];
    });
    const csv = [head.join(';'), ...rows.map((a) => a.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titulo}_${toISO(range[0]!)}_a_${toISO(range[1]!)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Carregar opções (centros/metas/meta total)
  useEffect(() => {
    (async () => {
      const [c, m, mt] = await Promise.all([
        fetchCentros(),
        fetchMetasAtuais(),
        fetchMetaTotalAtual(),
      ]);
      const ativos = c.filter((x) => x.ativo);
      setCentros(ativos);
      setMetas(m);
      setMetaTotal(mt);
      // default: primeiro centro ativo
      if (!centroSel && ativos.length) setCentroSel(String(ativos[0].id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metaByCentro = useMemo(() => new Map(metas.map((mm) => [mm.centro_id, Number(mm.meta_horas)])), [metas]);

  // Buscar dados conforme filtros
  const aplicar = async () => {
    const [start, end] = range;
    if (!start || !end) return;

    setLoading(true);
    try {
      const dias = daysBetween(start, end);

      if (scope === 'fabrica') {
        // Fábrica: usa metaTotal e série consolidada
        const fab = await fetchFabricaRange(toISO(start), toISO(end));
        const map = new Map(fab.map((r) => [r.data_wip, Number(r.produzido_h)]));
        const rows: DayRow[] = dias.map((d) => {
          const prod = +(map.get(d) ?? 0).toFixed(2);
          const meta = +metaTotal.toFixed(2);
          return {
            iso: d,
            label: shortBR(d),
            produzido: prod,
            meta,
            acima: prod >= meta ? prod : null,
            abaixo: prod < meta ? prod : null,
          };
        });
        setData(rows);
      } else {
        // Centro: usa meta do centro selecionado
        const id = Number(centroSel);
        if (!id) { setData([]); setLoading(false); return; }
        const meta = +(metaByCentro.get(id) ?? 0);
        const rowsRaw = await fetchCentroSeriesRange([id], toISO(start), toISO(end));
        const map = new Map(rowsRaw.map((r) => [r.data_wip, Number(r.produzido_h)]));
        const rows: DayRow[] = dias.map((d) => {
          const prod = +(map.get(d) ?? 0).toFixed(2);
          return {
            iso: d,
            label: shortBR(d),
            produzido: prod,
            meta,
            acima: prod >= meta ? prod : null,
            abaixo: prod < meta ? prod : null,
          };
        });
        setData(rows);
      }
    } finally {
      setLoading(false);
    }
  };

  // aplicar no primeiro render e quando filtros mudarem
  useEffect(() => { aplicar(); /* eslint-disable-next-line */ }, [scope, centroSel, chartType]);
  useEffect(() => { aplicar(); /* eslint-disable-next-line */ }, [range[0]?.getTime(), range[1]?.getTime(), metaTotal]);

  // KPIs simples
  const kpis = useMemo(() => {
    if (!data.length) return null;
    const totalProd = data.reduce((s, r) => s + r.produzido, 0);
    const totalMeta = data.reduce((s, r) => s + r.meta, 0);
    const aderencia = totalMeta > 0 ? (totalProd / totalMeta) * 100 : 100;
    return {
      totalProd: +totalProd.toFixed(2),
      totalMeta: +totalMeta.toFixed(2),
      aderencia: +aderencia.toFixed(2),
    };
  }, [data]);

  const centroOptions = useMemo(
    () => centros.map((c) => ({ value: String(c.id), label: c.codigo })),
    [centros]
  );

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Gráficos</Title>
        {kpis && (
          <Group gap="xs">
            <Badge variant="light">Produzido: {kpis.totalProd} h</Badge>
            <Badge variant="light">Meta: {kpis.totalMeta} h</Badge>
            <Badge color={kpis.aderencia < 80 ? 'red' : kpis.aderencia <= 100 ? 'yellow' : 'green'}>
              Aderência: {kpis.aderencia}%
            </Badge>
          </Group>
        )}
      </Group>

      <Card withBorder shadow="sm" radius="lg" p="md" mb="lg">
        <Group gap="lg" align="end" wrap="wrap">
          <DatePickerInput
            type="range"
            label="Período"
            placeholder="Selecione o intervalo"
            value={range}
            onChange={(val: DatesRangeValue) => {
              const a = Array.isArray(val) ? val[0] : null;
              const b = Array.isArray(val) ? val[1] : null;
              setRange([
                a instanceof Date ? a : (a ? new Date(a as any) : null),
                b instanceof Date ? b : (b ? new Date(b as any) : null),
              ]);
            }}
          />
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
              miw={260}
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
        ) : !data.length ? (
          <Text c="dimmed">Sem dados para o periodo/selecao.</Text>
        ) : chartType === 'bar' ? (
          <div style={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <ReferenceLine y={data[0].meta} label="Meta" />
                <Bar dataKey="produzido" name="Produzido">
                  {data.map((r, i) => {
                    const pct = r.meta > 0 ? (r.produzido / r.meta) * 100 : 100;
                    return <Cell key={i} fill={colorFor(pct)} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <ReferenceLine y={data[0].meta} label="Meta" />
                <Line type="monotone" dataKey="acima" name="Acima da meta" dot={false} stroke="#16a34a" />
                <Line type="monotone" dataKey="abaixo" name="Abaixo da meta" dot={false} stroke="#ef4444" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
