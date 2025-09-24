import { useEffect, useMemo, useState } from 'react';
import { DateInput, TimeInput } from '@mantine/dates';
import { Card, Group, Text, SimpleGrid, Badge, Loader, Title, Grid } from '@mantine/core';
import { fracDiaLogico } from '../../utils/time';
import {
  fetchMetasAtuais,
  fetchTotaisAtivosPorDia,
  type VMetaAtual,
  type VTtotalAtivo,
} from '../../services/db';

type LinhaCentro = {
  centro_id: number;
  centro: string;
  produzido_h: number;
  meta_h: number;
  esperado_h: number;
  aderencia_pct: number | null;
  desvio_h: number;
};

function colorFor(pct: number): 'red' | 'yellow' | 'green' {
  if (pct < 80) return 'red';
  if (pct <= 100) return 'yellow';
  return 'green';
}

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

  return null; // nao usar Date.parse (evita shift por UTC)
}

// compara datas pelo calendario local (ignora horas)
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

export default function DashboardDia() {
  const [hora, setHora] = useState<string>(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [dataWip, setDataWip] = useState<Date | null>(null);
  const [metas, setMetas] = useState<VMetaAtual[] | null>(null);
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
    if (!value) {
      setDataWip(null);
      return;
    }

    let d: Date | null = null;
    if (value instanceof Date) d = value;
    else if (typeof value === 'string') d = parseLocalDateString(value);
    else if ((value as any)?.toDate instanceof Function) d = (value as any).toDate();

    if (!d || Number.isNaN(d.getTime())) return;

    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    setDataWip(normalized);
  };

  // fracao do dia para calculo do 'esperado'
  const frac = isPast ? 1 : isFuture ? 0 : fracDiaLogico(hora);

  // carregar metas 1x
  useEffect(() => {
    (async () => {
      try {
        const m = await fetchMetasAtuais();
        setMetas(m);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // default do dia: sempre HOJE (no calendario local)
  useEffect(() => {
    if (dataWip) return;
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setDataWip(todayLocal);
  }, [dataWip]);

  // buscar totais sempre que data mudar
  useEffect(() => {
    (async () => {
      if (!dataWip) return;
      setLoading(true);
      try {
        const iso = toISO(new Date(dataWip.getFullYear(), dataWip.getMonth(), dataWip.getDate()));
        const t = await fetchTotaisAtivosPorDia(iso);
        setTotais(t);
      } catch (e) {
        console.error(e);
        setTotais([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataWip?.getTime()]);

  const linhas: LinhaCentro[] = useMemo(() => {
    if (!metas || !totais) return [];
    const prodById = new Map<number, number>();
    for (const t of totais) {
      prodById.set(t.centro_id, (prodById.get(t.centro_id) ?? 0) + Number(t.horas_somadas));
    }

    const rows: LinhaCentro[] = [];
    for (const m of metas) {
      const metaDiaria = Number(m.meta_horas);
      const produzido = prodById.get(m.centro_id) ?? 0;
      const esperado = +(metaDiaria * frac).toFixed(2);

      let aderenciaPct: number | null = null;
      if (!isFuture) {
        if (esperado > 0) {
          aderenciaPct = (produzido / esperado) * 100;
        } else if (isPast && metaDiaria > 0) {
          aderenciaPct = (produzido / metaDiaria) * 100;
        } else {
          aderenciaPct = 0;
        }
      }

      rows.push({
        centro_id: m.centro_id,
        centro: m.centro,
        produzido_h: +produzido.toFixed(2),
        meta_h: +metaDiaria.toFixed(2),
        esperado_h: esperado,
        aderencia_pct: aderenciaPct !== null ? +aderenciaPct.toFixed(2) : null,
        desvio_h: +(produzido - esperado).toFixed(2),
      });
    }
    rows.sort((a, b) => (a.aderencia_pct ?? 0) - (b.aderencia_pct ?? 0));
    return rows;
  }, [metas, totais, frac, isFuture, isPast]);

  const fabrica = useMemo(() => {
    const prod = linhas.reduce((s, r) => s + r.produzido_h, 0);
    const meta = linhas.reduce((s, r) => s + r.meta_h, 0);
    const esperado = linhas.reduce((s, r) => s + r.esperado_h, 0);

    let aderenciaPct: number | null = null;
    if (!isFuture) {
      if (esperado > 0) {
        aderenciaPct = (prod / esperado) * 100;
      } else if (isPast && meta > 0) {
        aderenciaPct = (prod / meta) * 100;
      } else {
        aderenciaPct = 0;
      }
    }

    return {
      produzido_h: +prod.toFixed(2),
      meta_h: +meta.toFixed(2),
      esperado_h: +esperado.toFixed(2),
      aderencia_pct: aderenciaPct !== null ? +aderenciaPct.toFixed(2) : null,
      desvio_h: +(prod - esperado).toFixed(2),
    };
  }, [linhas, isFuture, isPast]);

  return (
    <div>
      <Title order={2} mb="sm">Visao do Dia</Title>

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
            label="Hora de referencia (05:30 -> 00:44)"
            value={hora}
            onChange={(e) => setHora(e.currentTarget.value)}
            disabled={isPast || isFuture}
            description={
              isPast
                ? 'Dia concluido - usando janela completa'
                : isFuture
                  ? 'Dia futuro - aguardando inicio'
                  : undefined
            }
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 12, lg: 4 }}>
          <Card withBorder shadow="sm" radius="lg" padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Fabrica</Text>
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
            <Text size="sm">Meta diaria: <b>{fabrica.meta_h.toFixed(2)} h</b></Text>
            <Text size="sm">Desvio: <b>{fabrica.desvio_h.toFixed(2)} h</b></Text>
          </Card>
        </Grid.Col>
      </Grid>


      {loading ? (
        <Group><Loader size="sm" /><Text size="sm">Carregando...</Text></Group>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {linhas.map((r) => (
            <Card key={r.centro_id} withBorder shadow="sm" radius="lg" padding="md">
              <Group justify="space-between" mb="xs">
                <Text fw={600}>{r.centro}</Text>
                {isFuture ? (
                  <Badge variant="light" color="gray">FUTURO</Badge>
                ) : (
                  <Badge color={colorFor((r.aderencia_pct ?? 0))}>
                    {`${((r.aderencia_pct ?? 0)).toFixed(2)}%`}
                  </Badge>
                )}
              </Group>
              <Text size="sm">Produzido: <b>{r.produzido_h.toFixed(2)} h</b></Text>
              <Text size="sm">Esperado: <b>{r.esperado_h.toFixed(2)} h</b></Text>
              <Text size="sm">Meta diaria: <b>{r.meta_h.toFixed(2)} h</b></Text>
              <Text size="sm">Desvio: <b>{r.desvio_h.toFixed(2)} h</b></Text>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </div>
  );
}
