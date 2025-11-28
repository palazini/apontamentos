// src/features/dia/DashboardDia.tsx
import { useEffect, useMemo, useState } from 'react';
import { DateInput, TimeInput } from '@mantine/dates';
import {
  Card, Group, Text, SimpleGrid, Badge, Loader, Title, Grid, Progress, SegmentedControl
} from '@mantine/core';
import { fracDiaLogico } from '../../utils/time';
import {
  fetchMetasAtuais,
  fetchTotaisAtivosPorDia,
  fetchCentrosSmart,
  type VMetaAtual,
  type VTtotalAtivo,
  type CentroSmart,
} from '../../services/db';

/* -------------------- Tipos -------------------- */
type LinhaCentro = {
  centro_id: number;
  centro: string;
  produzido_h: number;
  meta_h: number;
  esperado_h: number;
  aderencia_pct: number | null;
  desvio_h: number;
  is_parent: boolean; 
};

// Extensão local para garantir acesso aos campos novos caso o type importado não esteja atualizado
type CentroFull = CentroSmart & {
    escopo?: string;
    centro_pai_id?: number | null;
    exibir_filhos?: boolean;
};

/* -------------------- Helpers -------------------- */
function colorFor(pct: number): 'red' | 'yellow' | 'green' {
  if (pct < 80) return 'red';
  if (pct <= 100) return 'yellow';
  return 'green';
}
function clamp(v: number, min = 0, max = 200) { return Math.max(min, Math.min(max, v)); }

function toISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function parseLocalDateString(input: string | null | undefined): Date | null {
  if (!input) return null;
  let s = input.trim();
  const t = s.indexOf('T');
  if (t >= 0) s = s.slice(0, t);

  let m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  return null; 
}

function ymd(d: Date) { return [d.getFullYear(), d.getMonth(), d.getDate()] as const; }
function isSameLocalDay(a: Date, b: Date) {
  const [ay, am, ad] = ymd(a); const [by, bm, bd] = ymd(b);
  return ay === by && am === bm && ad === bd;
}
function isPastLocalDay(d: Date) {
  const today = new Date();
  const [y, m, day] = ymd(d);
  const [ty, tm, td] = ymd(today);
  if (y < ty) return true;
  if (y > ty) return false;
  if (m < tm) return true;
  if (m > tm) return false;
  return day < td;
}

function isCentroAtivoNoDia(c: CentroFull, dataWip: Date): boolean {
  if (c.ativo === false) return false;

  if (c.desativado_desde) {
    const d = parseLocalDateString(c.desativado_desde);
    if (d && !Number.isNaN(d.getTime())) {
      return dataWip.getTime() < new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
  }
  return true;
}

/* -------------------- Página -------------------- */
export default function DashboardDia() {
  const [hora, setHora] = useState<string>(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [dataWip, setDataWip] = useState<Date | null>(null);
  const [scope, setScope] = useState<string>('usinagem');

  const [metas, setMetas] = useState<VMetaAtual[] | null>(null);
  const [centros, setCentros] = useState<CentroFull[] | null>(null);
  const [totais, setTotais] = useState<VTtotalAtivo[] | null>(null);
  const [loading, setLoading] = useState(true);

  const isPast = dataWip ? isPastLocalDay(dataWip) : false;
  const isToday = dataWip ? isSameLocalDay(dataWip, new Date()) : false;
  const isFuture = dataWip ? !isPast && !isToday : false;

  useEffect(() => {
    if (!dataWip || !isPast) return;
    if (hora === '00:44') return;
    setHora('00:44');
  }, [dataWip?.getTime(), isPast, hora]);

  const handleDataWipChange = (value: unknown) => {
    if (!value) { setDataWip(null); return; }
    let d: Date | null = null;
    if (value instanceof Date) d = value;
    else if (typeof value === 'string') d = parseLocalDateString(value);
    else if ((value as any)?.toDate instanceof Function) d = (value as any).toDate();
    if (!d || Number.isNaN(d.getTime())) return;
    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    setDataWip(normalized);
  };

  const frac = isPast ? 1 : isFuture ? 0 : fracDiaLogico(hora);

  useEffect(() => { (async () => {
    try {
      const [m, c] = await Promise.all([fetchMetasAtuais(), fetchCentrosSmart()]);
      setMetas(m);
      setCentros(c as CentroFull[]);
    } catch (e) {
      console.error(e);
    }
  })(); }, []);

  useEffect(() => {
    if (dataWip) return;
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setDataWip(todayLocal);
  }, [dataWip]);

  useEffect(() => { (async () => {
    if (!dataWip) return;
    setLoading(true);
    try {
      const iso = toISO(new Date(dataWip.getFullYear(), dataWip.getMonth(), dataWip.getDate()));
      const t = await fetchTotaisAtivosPorDia(iso);
      setTotais(t);
    } catch (e) {
      console.error(e); setTotais([]);
    } finally { setLoading(false); }
  })(); }, [dataWip?.getTime()]);

  // Lógica Principal de Agregação e Filtragem
  const linhas: LinhaCentro[] = useMemo(() => {
    if (!metas || !totais || !centros || !dataWip) return [];

    const centrosMap = new Map<number, CentroFull>();
    const parentToChildren = new Map<number, number[]>();

    centros.forEach(c => {
        centrosMap.set(c.id, c);
        if (c.centro_pai_id) {
            const list = parentToChildren.get(c.centro_pai_id) ?? [];
            list.push(c.id);
            parentToChildren.set(c.centro_pai_id, list);
        }
    });

    const prodById = new Map<number, number>();
    totais.forEach(t => prodById.set(t.centro_id, Number(t.horas_somadas)));

    const metaById = new Map<number, number>();
    metas.forEach(m => metaById.set(m.centro_id, Number(m.meta_horas)));

    const rows: LinhaCentro[] = [];
    const processedIds = new Set<number>();

    const sortedCentros = [...centros].sort((a, b) => a.codigo.localeCompare(b.codigo));

    for (const c of sortedCentros) {
        if (processedIds.has(c.id)) continue;
        if (!isCentroAtivoNoDia(c, dataWip)) continue;

        // Filtro de Escopo
        const cScope = c.escopo || 'usinagem';
        const matchesScope = scope === 'geral' || cScope === scope;
        
        // Hierarquia
        const isParent = parentToChildren.has(c.id);
        const parent = c.centro_pai_id ? centrosMap.get(c.centro_pai_id) : null;

        let shouldShow = false;
        if (isParent) {
            if (matchesScope) shouldShow = true;
        } else if (parent) {
            if (parent.exibir_filhos) {
                 const parentScope = parent.escopo || 'usinagem';
                 const effectiveScope = matchesScope || (scope === parentScope);
                 if (effectiveScope) shouldShow = true;
            }
        } else {
            if (matchesScope) shouldShow = true;
        }

        if (!shouldShow) continue;

        // Cálculo de Valores
        let produzido = 0;
        if (isParent) {
            const children = parentToChildren.get(c.id) ?? [];
            produzido = (prodById.get(c.id) ?? 0); 
            children.forEach(childId => {
                produzido += (prodById.get(childId) ?? 0);
            });
        } else {
            produzido = prodById.get(c.id) ?? 0;
        }

        const meta = metaById.get(c.id) ?? 0;
        const esperado = +(meta * frac).toFixed(2);
        
        let aderenciaPct: number | null = null;
        if (!isFuture) {
            if (esperado > 0) aderenciaPct = (produzido / esperado) * 100;
            else if (isPast && meta > 0) aderenciaPct = (produzido / meta) * 100;
            else aderenciaPct = 0;
        }

        rows.push({
            centro_id: c.id,
            centro: c.codigo,
            produzido_h: +produzido.toFixed(2),
            meta_h: +meta.toFixed(2),
            esperado_h: esperado,
            aderencia_pct: aderenciaPct !== null ? +aderenciaPct.toFixed(2) : null,
            desvio_h: +(produzido - esperado).toFixed(2),
            is_parent: isParent
        });
        
        processedIds.add(c.id);
    }

    return rows.sort((a, b) => (a.aderencia_pct ?? 0) - (b.aderencia_pct ?? 0));
  }, [metas, totais, centros, frac, isFuture, isPast, dataWip, scope]);

  // KPI fábrica
  const fabrica = useMemo(() => {
    const parentIdsInList = new Set(linhas.filter(l => l.is_parent).map(l => l.centro_id));
    const linhasParaSoma = linhas.filter(l => {
        if (l.is_parent) return true;
        if (!centros) return true;
        const c = centros.find(x => x.id === l.centro_id);
        if (c?.centro_pai_id && parentIdsInList.has(c.centro_pai_id)) return false;
        return true;
    });

    const prod = linhasParaSoma.reduce((s, r) => s + r.produzido_h, 0);
    const meta = linhasParaSoma.reduce((s, r) => s + r.meta_h, 0);
    const esperado = linhasParaSoma.reduce((s, r) => s + r.esperado_h, 0);

    let aderenciaPct: number | null = null;
    if (!isFuture) {
      if (esperado > 0) aderenciaPct = (prod / esperado) * 100;
      else if (isPast && meta > 0) aderenciaPct = (prod / meta) * 100;
      else aderenciaPct = 0;
    }

    const projEod = frac > 0 ? prod / frac : 0;
    const gapEod  = +(projEod - meta).toFixed(2);

    return {
      produzido_h: +prod.toFixed(2),
      meta_h: +meta.toFixed(2),
      esperado_h: +esperado.toFixed(2),
      aderencia_pct: aderenciaPct !== null ? +aderenciaPct.toFixed(2) : null,
      projEod_h: +projEod.toFixed(2),
      gapEod_h: gapEod,
    };
  }, [linhas, isFuture, isPast, frac, centros]);

  return (
    <div>
      <Group justify="space-between" align="center" mb="md">
         <Title order={2}>Visão do dia</Title>
         <SegmentedControl
            value={scope}
            onChange={setScope}
            data={[
                { label: 'Geral', value: 'geral' },
                { label: 'Usinagem', value: 'usinagem' },
                { label: 'Montagem', value: 'montagem' },
            ]}
         />
      </Group>

      <Grid gutter="md" mb="lg">
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <DateInput
            label="Data do WIP"
            value={dataWip}
            onChange={handleDataWipChange}
            valueFormat="DD/MM/YYYY"
            locale="pt-BR"
            dateParser={(s) => parseLocalDateString(s) ?? new Date()}
            placeholder="Selecione a data"
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <TimeInput
            label="Hora de referência (05:30 → 00:44)"
            value={hora}
            onChange={(e) => setHora(e.currentTarget.value)}
            disabled={isPast || isFuture}
            description={
              isPast ? 'Dia concluído — usando janela completa'
                : isFuture ? 'Dia futuro — aguardando início'
                : undefined
            }
          />
        </Grid.Col>

        {/* CARD DE TOTAL (LAYOUT RESTAURADO) */}
        <Grid.Col span={{ base: 12, md: 12, lg: 4 }}>
          <Card withBorder shadow="sm" radius="lg" padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Total {scope === 'geral' ? 'Fábrica' : scope === 'usinagem' ? 'Usinagem' : 'Montagem'}</Text>
              <Group gap="xs">
                {isPast && <Badge variant="light" color="gray">Dia completo</Badge>}
                {isFuture ? (
                  <Badge variant="light" color="gray">FUTURO</Badge>
                ) : (
                  <Badge color={colorFor((fabrica.aderencia_pct ?? 0))}>
                    {`${((fabrica.aderencia_pct ?? 0)).toFixed(2)}%`}
                  </Badge>
                )}
              </Group>
            </Group>

            <Text size="sm">Produzido: <b>{fabrica.produzido_h.toFixed(2)} h</b></Text>
            <Text size="sm">Esperado: <b>{fabrica.esperado_h.toFixed(2)} h</b></Text>
            <Text size="sm">Meta diária: <b>{fabrica.meta_h.toFixed(2)} h</b></Text>

            {/* Progresso vs esperado agora */}
            <Text size="xs" c="dimmed" mt="xs">Progresso vs esperado</Text>
            <Progress
              size="sm"
              value={clamp(fabrica.esperado_h > 0 ? (fabrica.produzido_h / fabrica.esperado_h) * 100 : 0)}
              color={colorFor(
                fabrica.esperado_h > 0 ? (fabrica.produzido_h / fabrica.esperado_h) * 100 : 0
              )}
              striped
            />

            {/* Projeção do dia */}
            <Group gap="sm" mt="xs">
              <Badge variant="dot">Projeção: {fabrica.projEod_h.toFixed(2)} h</Badge>
              <Badge color={fabrica.gapEod_h >= 0 ? 'green' : 'red'} variant="light">
                Gap vs meta: {fabrica.gapEod_h >= 0 ? '+' : ''}{fabrica.gapEod_h.toFixed(2)} h
              </Badge>
            </Group>
          </Card>
        </Grid.Col>
      </Grid>

      {loading ? (
        <Group><Loader size="sm" /><Text size="sm">Carregando...</Text></Group>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {linhas.map((r) => {
            const pctEsperado = r.esperado_h > 0 ? (r.produzido_h / r.esperado_h) * 100 : 0;
            const pctMeta = r.meta_h > 0 ? (r.produzido_h / r.meta_h) * 100 : 0;
            const cor = colorFor(r.aderencia_pct ?? 0);

            return (
              <Card key={r.centro_id} withBorder shadow="sm" radius="lg" padding="md">
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>{r.centro}</Text>
                  {isFuture ? (
                    <Badge variant="light" color="gray">FUTURO</Badge>
                  ) : (
                    <Badge color={cor}>{`${((r.aderencia_pct ?? 0)).toFixed(2)}%`}</Badge>
                  )}
                </Group>

                <Text size="sm">Produzido: <b>{r.produzido_h.toFixed(2)} h</b></Text>
                <Text size="sm">Esperado: <b>{r.esperado_h.toFixed(2)} h</b></Text>
                <Text size="sm">Meta diária: <b>{r.meta_h.toFixed(2)} h</b></Text>
                <Text size="sm">Desvio: <b>{r.desvio_h.toFixed(2)} h</b></Text>

                {/* Barras de progresso dual */}
                <Text size="xs" c="dimmed" mt="xs">vs esperado</Text>
                <Progress size="sm" value={clamp(pctEsperado)} color={colorFor(pctEsperado)} striped />

                <Text size="xs" c="dimmed" mt={6}>vs meta do dia</Text>
                <Progress size="sm" value={clamp(pctMeta)} color="var(--mantine-primary-color-filled)" />

                <Group justify="space-between" mt="sm">
                  <Badge variant="dot">{pctEsperado.toFixed(0)}% esp.</Badge>
                  <Badge variant="dot">{pctMeta.toFixed(0)}% meta</Badge>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </div>
  );
}