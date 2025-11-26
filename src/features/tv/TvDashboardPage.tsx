// src/features/tv/TvDashboardPage.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Progress,
  RingProgress,
} from '@mantine/core';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
  Cell,
} from 'recharts';
import {
  IconChevronLeft,
  IconChevronRight,
  IconMaximize,
  IconMinimize,
} from '@tabler/icons-react';

import {
  fetchMetaTotalAtual,
  fetchMetasAtuais,
  fetchFabricaRange,
  fetchCentroSeriesRange,
  fetchUltimoDiaComDados,
  fetchUploadsPorDia,
  fetchCentrosSmart,
  type VMetaAtual,
  type VUploadDia,
  type CentroSmart,
} from '../../services/db';
import { supabase } from '../../lib/supabaseClient';
import { fracDiaLogico } from '../../utils/time';

/* ========= helpers de data ========= */
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function isoToLocalDate(iso: string) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(y, m - 1, d);
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

function isSundayISO(iso: string) {
  return isoToLocalDate(iso).getDay() === 0;
}
function isSaturdayISO(iso: string) {
  return isoToLocalDate(iso).getDay() === 6;
}

function countDaysExcludingSundays(start: Date, end: Date) {
  let count = 0;
  for (let d = startOfDayLocal(start); d <= end; d = addDays(d, 1)) {
    if (d.getDay() !== 0) count += 1;
  }
  return count;
}

function shortBR(iso: string) {
  const d = isoToLocalDate(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// mesmo parse da página "Visão do dia"
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

/** Centro ativo no dia do WIP?
 *  - Se ativo === false → inativo
 *  - Se desativado_desde !== null:
 *      * ativo SE dataWip < desativado_desde
 *      * inativo SE dataWip >= desativado_desde
 *  - Caso contrário, ativo.
 */
function isCentroAtivoNoDia(c: CentroSmart, dataWip: Date): boolean {
  if (c.ativo === false) return false;

  if (c.desativado_desde) {
    const d = parseLocalDateString(c.desativado_desde);
    if (d && !Number.isNaN(d.getTime())) {
      const corte = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return dataWip.getTime() < corte;
    }
  }
  return true;
}

/* ========= tipos locais ========= */
type FactoryDayRow = {
  iso: string;
  label: string;
  produzido: number;
  meta: number;
  pct: number;
  isSaturday: boolean;
};

type CentroPerf = {
  centro_id: number;
  codigo: string;

  meta_dia: number;
  meta_mes: number;

  real_dia: number;
  real_mes: number;

  // novo: cálculo “modo Visão do dia”
  esperado_dia: number;
  desvio_dia: number;
  ader_dia: number | null; // produzido / esperado (ou meta cheia em dia passado)
  pct_meta_dia: number | null; // produzido / meta_dia

  // ainda usamos o mês só para o RESUMO do cabeçalho
  ader_mes: number | null;
};

/* ========= helpers gerais ========= */
const formatNum = (v: number, dec = 2) =>
  Number.isFinite(v) ? v.toFixed(dec) : '-';

const perfColor = (p: number | null | undefined) => {
  if (p == null || !Number.isFinite(p)) return 'gray';
  if (p < 80) return 'red';
  if (p <= 100) return 'yellow.7';
  return 'green';
};

function clamp(v: number, min = 0, max = 200) {
  return Math.max(min, Math.min(max, v));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/* ========= tooltip dos gráficos ========= */
function FactoryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: any) => x.dataKey === 'produzido')?.value ?? 0;
  const m = payload.find((x: any) => x.dataKey === 'meta')?.value ?? 0;
  const diff = p - m;
  const pct = m > 0 ? (p / m) * 100 : 100;

  return (
    <Card shadow="sm" padding="xs" radius="md" withBorder>
      <Text fw={600} mb={4}>
        {label}
      </Text>
      <Text size="xs">
        Produzido: <b>{p.toFixed(2)} h</b>
      </Text>
      <Text size="xs">
        Meta: <b>{m.toFixed(2)} h</b>
      </Text>
      <Text size="xs">
        Diferença:{' '}
        <b style={{ color: diff >= 0 ? '#16a34a' : '#ef4444' }}>
          {diff >= 0 ? '+' : ''}
          {diff.toFixed(2)} h
        </b>
      </Text>
      <Text size="xs">
        Aderência: <b>{pct.toFixed(1)}%</b>
      </Text>
    </Card>
  );
}

/* ========= componente principal ========= */
export default function TvDashboardPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [factoryDays, setFactoryDays] = useState<FactoryDayRow[]>([]);
  const [centrosPerf, setCentrosPerf] = useState<CentroPerf[]>([]);
  const [lastUpdateText, setLastUpdateText] = useState<string>('–');
  const [horaRefLabel, setHoraRefLabel] = useState<string>('–:–');
  const [contextDia, setContextDia] = useState<{
    isPast: boolean;
    isToday: boolean;
    isFuture: boolean;
    frac: number;
  }>({ isPast: false, isToday: false, isFuture: false, frac: 0 });

  const [activeSlide, setActiveSlide] = useState(0);

  const cancelledRef = useRef(false);

  // full screen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const loadData = useCallback(async () => {
    cancelledRef.current = false;
    try {
      setLoading(true);

      const lastDayIso = await fetchUltimoDiaComDados();
      if (!lastDayIso) {
        if (!cancelledRef.current) {
          setFactoryDays([]);
          setCentrosPerf([]);
          setLastUpdateText('Sem dados');
          setHoraRefLabel('–:–');
        }
        return;
      }

      const diaRef = isoToLocalDate(lastDayIso);
      const diaRefLocal = startOfDayLocal(diaRef);
      //if (!cancelledRef.current) setRefDate(diaRefLocal);

      // pega uploads do último dia e acha o ATIVO (ou o mais recente)
      const uploadsDia: VUploadDia[] = await fetchUploadsPorDia(lastDayIso);
      let ativo =
        uploadsDia.find((u) => u.ativo) ??
        uploadsDia
          .slice()
          .sort(
            (a, b) =>
              new Date(a.enviado_em).getTime() -
              new Date(b.enviado_em).getTime()
          )
          .at(-1) ??
        null;

      let horaRef = '00:44';
      if (ativo) {
        const dt = new Date(ativo.enviado_em);
        const dataStr = dt.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        });
        const horaStr = dt.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        horaRef = horaStr;
        if (!cancelledRef.current) {
          setLastUpdateText(`${dataStr} • ${horaStr}`);
          setHoraRefLabel(horaStr);
        }
      } else if (!cancelledRef.current) {
        setLastUpdateText('Sem dados');
        setHoraRefLabel('–:–');
      }

      // contexto do dia (igual Visão do dia)
      const todayLocal = startOfDayLocal(new Date());
      const isPast = diaRefLocal < todayLocal;
      const isToday = diaRefLocal.getTime() === todayLocal.getTime();
      const isFuture = !isPast && !isToday;
      const frac = isPast ? 1 : isFuture ? 0 : fracDiaLogico(horaRef);

      if (!cancelledRef.current) {
        setContextDia({ isPast, isToday, isFuture, frac });
      }

      const startMes = new Date(
        diaRefLocal.getFullYear(),
        diaRefLocal.getMonth(),
        1
      );
      const diasCorridosMes = countDaysExcludingSundays(startMes, diaRefLocal);

      const startSerie = addDays(diaRefLocal, -13); // últimos ~14 dias

      // ⬇️ AGORA BUSCA TAMBÉM OS CENTROS
      const [metaTotal, metasAtuaisAll, fabRange, centrosSmart] =
        await Promise.all([
          fetchMetaTotalAtual(),
          fetchMetasAtuais(),
          fetchFabricaRange(toISO(startSerie), toISO(diaRefLocal)),
          fetchCentrosSmart(),
        ]);

      const metaDiaTotal = Number(metaTotal) || 0;

      // série da fábrica (removendo domingos, destacando sábados)
      const dias = daysBetween(startSerie, diaRefLocal);
      const fabMap = new Map<string, number>();
      fabRange.forEach((r: any) => {
        fabMap.set(r.data_wip, Number(r.produzido_h) || 0);
      });

      const serieFactory: FactoryDayRow[] = [];
      for (const iso of dias) {
        if (isSundayISO(iso)) continue; // remove domingo do gráfico
        const prod = +(fabMap.get(iso) ?? 0).toFixed(2);
        const pct = metaDiaTotal > 0 ? (prod / metaDiaTotal) * 100 : 100;
        serieFactory.push({
          iso,
          label: shortBR(iso),
          produzido: prod,
          meta: metaDiaTotal,
          pct,
          isSaturday: isSaturdayISO(iso),
        });
      }

      // ⬇️ MONTA CONJUNTO DE CENTROS ATIVOS NO DIA
      const ativosSet = new Set<number>();
      (centrosSmart as CentroSmart[]).forEach((c) => {
        if (isCentroAtivoNoDia(c, diaRefLocal)) ativosSet.add(c.id);
      });

      // metas apenas dos centros ATIVOS
      const metasAtuais = (metasAtuaisAll as VMetaAtual[]).filter((m) =>
        ativosSet.has(m.centro_id)
      );

      // performance por centro (máquina) – mês inteiro e dia de referência
      const metasByCentro = new Map<
        number,
        { metaDia: number; codigo: string }
      >();
      metasAtuais.forEach((m) => {
        metasByCentro.set(m.centro_id, {
          metaDia: Number(m.meta_horas) || 0,
          codigo: m.centro,
        });
      });

      const centroIds = metasAtuais.map((m) => m.centro_id);
      let centrosPerfCalc: CentroPerf[] = [];

      if (centroIds.length) {
        const series = await fetchCentroSeriesRange(
          centroIds,
          toISO(startMes),
          toISO(diaRefLocal)
        );

        const prodMesByCentro = new Map<number, number>();
        const prodDiaByCentro = new Map<number, number>();

        series.forEach((r: any) => {
          if (isSundayISO(r.data_wip)) return; // ignora domingos
          const cid = r.centro_id as number;
          const val = Number(r.produzido_h) || 0;

          prodMesByCentro.set(cid, (prodMesByCentro.get(cid) ?? 0) + val);

          if (r.data_wip === lastDayIso) {
            prodDiaByCentro.set(cid, (prodDiaByCentro.get(cid) ?? 0) + val);
          }
        });

        centrosPerfCalc = centroIds.map((cid) => {
          const metaInfo = metasByCentro.get(cid);
          const metaDia = metaInfo?.metaDia ?? 0;
          const codigo = metaInfo?.codigo ?? `#${cid}`;

          const metaMes = metaDia * diasCorridosMes;
          const realMes = prodMesByCentro.get(cid) ?? 0;
          const realDia = prodDiaByCentro.get(cid) ?? 0;

          const esperado = +(metaDia * frac).toFixed(2);

          let aderDia: number | null = null;
          if (!isFuture) {
            if (esperado > 0) {
              aderDia = (realDia / esperado) * 100;
            } else if (isPast && metaDia > 0) {
              aderDia = (realDia / metaDia) * 100;
            } else {
              aderDia = 0;
            }
          }

          const aderMes =
            metaMes > 0 ? (realMes / metaMes) * 100 : null;
          const pctMetaDia =
            metaDia > 0 ? (realDia / metaDia) * 100 : null;

          return {
            centro_id: cid,
            codigo,
            meta_dia: +metaDia.toFixed(2),
            meta_mes: +metaMes.toFixed(2),
            real_dia: +realDia.toFixed(2),
            real_mes: +realMes.toFixed(2),
            esperado_dia: esperado,
            desvio_dia: +(realDia - esperado).toFixed(2),
            ader_dia: aderDia !== null ? +aderDia.toFixed(2) : null,
            pct_meta_dia:
              pctMetaDia !== null ? +pctMetaDia.toFixed(2) : null,
            ader_mes: aderMes !== null ? +aderMes.toFixed(2) : null,
          };
        });
      }

      if (!cancelledRef.current) {
        setFactoryDays(serieFactory);
        setCentrosPerf(centrosPerfCalc);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  // 1) primeiro carregamento
  useEffect(() => {
    cancelledRef.current = false;
    loadData();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadData]);

  // 2) Realtime: sempre que mudar upload_dia_ativo, recarrega painel
  useEffect(() => {
    const channel = supabase
      .channel('tv-uploads-kiosk')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'upload_dia_ativo',
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // 3) Fallback: recarrega o painel periodicamente (modo TV)
  useEffect(() => {
    const id = window.setInterval(() => {
      loadData();
    }, 60000); // 60.000 ms = 1 minuto

    return () => window.clearInterval(id);
  }, [loadData]);

  // resumo de mês e dia da fábrica a partir dos centros
  const resumo = useMemo(() => {
    if (!centrosPerf.length) {
      return {
        metaMes: 0,
        realMes: 0,
        aderMes: null as number | null,
        metaDia: 0,
        realDia: 0,
        esperadoDia: 0,
        aderDia: null as number | null,
      };
    }
    const metaMes = centrosPerf.reduce((s, c) => s + c.meta_mes, 0);
    const realMes = centrosPerf.reduce((s, c) => s + c.real_mes, 0);
    const metaDia = centrosPerf.reduce((s, c) => s + c.meta_dia, 0);
    const realDia = centrosPerf.reduce((s, c) => s + c.real_dia, 0);
    const esperadoDia = centrosPerf.reduce((s, c) => s + c.esperado_dia, 0);

    const aderMes = metaMes > 0 ? (realMes / metaMes) * 100 : null;

    let aderDia: number | null = null;
    if (!contextDia.isFuture) {
      if (esperadoDia > 0) {
        aderDia = (realDia / esperadoDia) * 100;
      } else if (contextDia.isPast && metaDia > 0) {
        aderDia = (realDia / metaDia) * 100;
      } else {
        aderDia = 0;
      }
    }

    return { metaMes, realMes, aderMes, metaDia, realDia, esperadoDia, aderDia };
  }, [centrosPerf, contextDia]);

  // slides das máquinas – quebrados em páginas (8 por tela)
  const centrosOrdenados = useMemo(
    () =>
      [...centrosPerf].sort((a, b) => {
        const pa = a.ader_dia ?? -Infinity;
        const pb = b.ader_dia ?? -Infinity;
        return pb - pa; // melhor aderência do dia primeiro
      }),
    [centrosPerf]
  );

  const centroPages = useMemo(
    () => chunk(centrosOrdenados, 8),
    [centrosOrdenados]
  );

  const totalSlides = 1 + Math.max(centroPages.length, 1); // 1 fábrica + N máquinas

  // autoplay de slides
  useEffect(() => {
    if (!totalSlides) return;
    const id = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % totalSlides);
    }, 15000); // 15s por slide
    return () => window.clearInterval(id);
  }, [totalSlides]);

  const goPrev = () =>
    setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  const goNext = () =>
    setActiveSlide((prev) => (prev + 1) % totalSlides);

  /* ========= render ========= */
  return (
    <div
      ref={rootRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: '#f5f5f7',
        padding: '16px 24px',
        boxSizing: 'border-box',
      }}
    >
      <Stack h="100%" gap="sm">
        {/* Cabeçalho enxuto */}
        <Group justify="space-between" align="center">
          <Group gap="sm" align="center">
            <Title order={2}>Painel de Produção - Usinagem</Title>
          </Group>

          <Group gap="lg" align="center">
            {/* visão geral MÊS / DIA */}
            <Group gap="xs">
              <Badge variant="filled" color="violet">
                MÊS • Meta: {formatNum(resumo.metaMes)} h
              </Badge>
              <Badge variant="filled" color="blue">
                MÊS • Real: {formatNum(resumo.realMes)} h
              </Badge>
              <Badge
                variant="filled"
                color={perfColor(resumo.aderMes)}
              >
                MÊS • Ader.:{' '}
                {resumo.aderMes == null
                  ? '-'
                  : `${formatNum(resumo.aderMes, 1)}%`}
              </Badge>
            </Group>

            <Group gap="xs">
              <Badge variant="outline" color="violet">
                DIA • Meta: {formatNum(resumo.metaDia)} h
              </Badge>
              <Badge variant="outline" color="blue">
                DIA • Esperado: {formatNum(resumo.esperadoDia)} h
              </Badge>
              <Badge variant="outline" color="blue">
                DIA • Real: {formatNum(resumo.realDia)} h
              </Badge>
              <Badge
                variant="outline"
                color={perfColor(resumo.aderDia)}
              >
                DIA • Ader.:{' '}
                {resumo.aderDia == null
                  ? '-'
                  : `${formatNum(resumo.aderDia, 1)}%`}
              </Badge>
            </Group>

            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">
                Última atualização
              </Text>
              <Text fw={700} size="lg">
                {lastUpdateText}
              </Text>
              <Text size="xs" c="dimmed">
                Aderência do dia considera meta até {horaRefLabel}
              </Text>
            </Stack>

            <ActionIcon
              variant="light"
              radius="xl"
              size="lg"
              onClick={toggleFullscreen}
              aria-label="Tela cheia"
            >
              {isFullscreen ? (
                <IconMinimize size={18} />
              ) : (
                <IconMaximize size={18} />
              )}
            </ActionIcon>
          </Group>
        </Group>

        {/* Cartão principal com slides */}
        <Card
          withBorder
          shadow="sm"
          radius="lg"
          padding="lg"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {loading ? (
            <Group justify="center" align="center" style={{ height: '100%' }}>
              <Loader />
            </Group>
          ) : (
            <>
              {/* topo do card: navegação de slides */}
              <Group justify="space-between" mb="xs" align="center">
                <Group gap="xs" align="center">
                  <ActionIcon
                    variant="light"
                    radius="xl"
                    onClick={goPrev}
                    aria-label="Slide anterior"
                    size="md"
                  >
                    <IconChevronLeft size={16} />
                  </ActionIcon>
                  <Group gap={4}>
                    {Array.from({ length: totalSlides }).map((_, idx) => (
                      <ActionIcon
                        key={idx}
                        radius="xl"
                        size="xs"
                        variant={idx === activeSlide ? 'filled' : 'outline'}
                        color={idx === activeSlide ? 'blue' : 'gray'}
                        onClick={() => setActiveSlide(idx)}
                      />
                    ))}
                  </Group>
                  <ActionIcon
                    variant="light"
                    radius="xl"
                    onClick={goNext}
                    aria-label="Próximo slide"
                    size="md"
                  >
                    <IconChevronRight size={16} />
                  </ActionIcon>
                </Group>
              </Group>

              {/* conteúdo dos slides */}
              <div style={{ flex: 1, minHeight: 0 }}>
                {activeSlide === 0 ? (
                  <SlideFactory dias={factoryDays} />
                ) : (
                  <SlideMaquinas
                    page={centroPages[activeSlide - 1] ?? []}
                    isFuture={contextDia.isFuture}
                  />
                )}
              </div>
            </>
          )}
        </Card>
      </Stack>
    </div>
  );
}

/* ========= Slide 1 – Fábrica (gráfico diário) ========= */
function SlideFactory({ dias }: { dias: FactoryDayRow[] }) {
  if (!dias.length) {
    return (
      <Group justify="center" align="center" style={{ height: '100%' }}>
        <Text c="dimmed">Sem dados recentes para exibir.</Text>
      </Group>
    );
  }

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <Group justify="space-between" align="center">
        <Title order={3}>Fábrica • Últimos dias</Title>
        <Badge variant="outline" color="blue">
          Sábados em azul
        </Badge>
      </Group>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dias}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <ReTooltip content={<FactoryTooltip />} />
            <Legend />
            <Bar
              dataKey="produzido"
              name="Produzido (h)"
              radius={[8, 8, 0, 0]}
            >
              {dias.map((d, i) => (
                <Cell key={i} fill={d.isSaturday ? '#0ea5e9' : '#f97316'} />
              ))}
            </Bar>
            <Line
              type="linear"
              dataKey="meta"
              name="Meta diária (h)"
              stroke="#111827"
              strokeDasharray="6 6"
              dot={false}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Stack>
  );
}

/* ========= Slides de Máquinas (somente DIA) ========= */

function SlideMaquinas({
  page,
  isFuture,
}: {
  page: CentroPerf[];
  isFuture: boolean;
}) {
  if (!page.length) {
    return (
      <Group justify="center" align="center" style={{ height: '100%' }}>
        <Text c="dimmed">Nenhuma máquina com meta cadastrada.</Text>
      </Group>
    );
  }

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <Group justify="space-between" align="center">
        <Title order={3}>Máquinas • Visão do dia</Title>
      </Group>

      <SimpleGrid
        cols={4}
        spacing="md"
        verticalSpacing="md"
        style={{ flex: 1, minHeight: 0 }}
      >
        {page.map((c) => {
          const pctEsperado =
            c.esperado_dia > 0 ? (c.real_dia / c.esperado_dia) * 100 : 0;
          const pctMeta =
            c.meta_dia > 0 ? (c.real_dia / c.meta_dia) * 100 : 0;
          const cor = perfColor(c.ader_dia);

          return (
            <Card
              key={c.centro_id}
              withBorder
              radius="lg"
              padding="md"
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Stack gap="xs" style={{ height: '100%' }}>
                {/* topo: identificação + badge de aderência */}
                <Group justify="space-between" align="flex-start">
                  <Text fw={700}>{c.codigo}</Text>
                  {isFuture ? (
                    <Badge variant="light" color="gray" size="sm">
                      FUTURO
                    </Badge>
                  ) : (
                    <Badge color={cor} size="sm">
                      {c.ader_dia == null
                        ? '-'
                        : `${formatNum(c.ader_dia, 1)}%`}
                    </Badge>
                  )}
                </Group>

                {/* centro: anel com a % do dia */}
                <Stack
                  gap="xs"
                  align="center"
                  style={{ flex: 1, minHeight: 0 }}
                >
                  <RingProgress
                    size={120}
                    thickness={12}
                    roundCaps
                    sections={[
                      {
                        value: clamp(c.ader_dia ?? 0, 0, 200),
                        color: perfColor(c.ader_dia),
                      },
                    ]}
                    label={
                      <Stack gap={0} align="center">
                        <Text size="xs" c="dimmed">
                          Hoje
                        </Text>
                        <Text
                          fw={800}
                          size="lg"
                          style={{ lineHeight: 1 }}
                          c={cor}
                        >
                          {c.ader_dia == null
                            ? '-'
                            : `${formatNum(c.ader_dia, 1)}%`}
                        </Text>
                      </Stack>
                    }
                  />

                  <Text size="xs" c="dimmed">
                    vs meta até agora ({formatNum(c.esperado_dia, 2)} h)
                  </Text>
                </Stack>

                {/* base: números + barras, igual Visão do dia */}
                <Stack gap={4}>
                  <Text size="xs">
                    Produzido: <b>{formatNum(c.real_dia)} h</b>
                  </Text>
                  <Text size="xs">
                    Esperado até agora:{' '}
                    <b>{formatNum(c.esperado_dia)} h</b>
                  </Text>
                  <Text size="xs">
                    Meta diária: <b>{formatNum(c.meta_dia)} h</b>
                  </Text>
                  <Text size="xs">
                    Desvio: <b>{formatNum(c.desvio_dia)} h</b>
                  </Text>

                  <Text size="xs" c="dimmed">
                    vs esperado
                  </Text>
                  <Progress
                    size="sm"
                    value={clamp(pctEsperado)}
                    color={perfColor(pctEsperado)}
                    striped
                  />

                  <Text size="xs" c="dimmed" mt={4}>
                    vs meta do dia
                  </Text>
                  <Progress
                    size="sm"
                    value={clamp(pctMeta)}
                    color="var(--mantine-primary-color-filled)"
                  />

                  <Group justify="space-between" mt="xs">
                    <Badge variant="dot">
                      {clamp(pctEsperado).toFixed(0)}% esp.
                    </Badge>
                    <Badge variant="dot">
                      {clamp(pctMeta).toFixed(0)}% meta
                    </Badge>
                  </Group>
                </Stack>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
