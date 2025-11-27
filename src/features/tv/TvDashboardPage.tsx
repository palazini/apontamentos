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
  ThemeIcon,
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
  Cell,
  LabelList,
} from 'recharts';
import {
  IconChevronLeft,
  IconChevronRight,
  IconMaximize,
  IconMinimize,
  IconTrendingUp,
  IconClock,
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
  ader_dia: number | null; 
  pct_meta_dia: number | null; 

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

/* ========= label customizado das colunas (Otimizado para TV) ========= */
function FactoryBarLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (value == null) return null;

  // Se a coluna for muito baixa, esconde para não sobrepor o eixo
  if (!height || height < 20) return null;

  const text = Number(value).toFixed(1); 

  return (
    <text
      x={x + width / 2}
      y={y - 10} // Subi um pouco mais para dar respiro
      textAnchor="middle"
      fontSize={16} // Aumentei para leitura de longe
      fontWeight={700}
      fill="#374151"
      style={{ pointerEvents: 'none' }}
    >
      {text}
    </text>
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
  
  // REMOVIDO: horaRefLabel pois não estava sendo usado na interface
  
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
        }
        return;
      }

      const diaRef = isoToLocalDate(lastDayIso);
      const diaRefLocal = startOfDayLocal(diaRef);
      
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
        }
      } else if (!cancelledRef.current) {
        setLastUpdateText('Sem dados');
      }

      // contexto do dia
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

      // ⬇️ BUSCA DADOS
      const [metaTotal, metasAtuaisAll, fabRange, centrosSmart] =
        await Promise.all([
          fetchMetaTotalAtual(),
          fetchMetasAtuais(),
          fetchFabricaRange(toISO(startSerie), toISO(diaRefLocal)),
          fetchCentrosSmart(),
        ]);

      const metaDiaTotal = Number(metaTotal) || 0;

      // série da fábrica
      const dias = daysBetween(startSerie, diaRefLocal);
      const fabMap = new Map<string, number>();
      fabRange.forEach((r: any) => {
        fabMap.set(r.data_wip, Number(r.produzido_h) || 0);
      });

      const serieFactory: FactoryDayRow[] = [];
      for (const iso of dias) {
        if (isSundayISO(iso)) continue; 
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

      // ⬇️ CENTROS ATIVOS
      const ativosSet = new Set<number>();
      (centrosSmart as CentroSmart[]).forEach((c) => {
        if (isCentroAtivoNoDia(c, diaRefLocal)) ativosSet.add(c.id);
      });

      const metasAtuais = (metasAtuaisAll as VMetaAtual[]).filter((m) =>
        ativosSet.has(m.centro_id)
      );

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
          if (isSundayISO(r.data_wip)) return;
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

  useEffect(() => {
    cancelledRef.current = false;
    loadData();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('tv-uploads-kiosk')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'upload_dia_ativo' },
        () => { loadData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  useEffect(() => {
    const id = window.setInterval(() => { loadData(); }, 60000);
    return () => window.clearInterval(id);
  }, [loadData]);

  const resumo = useMemo(() => {
    if (!centrosPerf.length) {
      return {
        metaMes: 0, realMes: 0, aderMes: null as number | null,
        metaDia: 0, realDia: 0, esperadoDia: 0, aderDia: null as number | null,
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

  const centrosOrdenados = useMemo(
    () =>
      [...centrosPerf].sort((a, b) => {
        const pa = a.ader_dia ?? -Infinity;
        const pb = b.ader_dia ?? -Infinity;
        return pb - pa;
      }),
    [centrosPerf]
  );

  const centroPages = useMemo(
    () => chunk(centrosOrdenados, 8),
    [centrosOrdenados]
  );

  const totalSlides = 1 + Math.max(centroPages.length, 1);

  useEffect(() => {
    if (!totalSlides) return;
    const id = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % totalSlides);
    }, 15000); 
    return () => window.clearInterval(id);
  }, [totalSlides]);

  const goPrev = () => setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  const goNext = () => setActiveSlide((prev) => (prev + 1) % totalSlides);

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
        {/* Cabeçalho */}
        <Group justify="space-between" align="center">
          <Group gap="sm" align="center">
            <ThemeIcon size="lg" radius="md" color="blue" variant="light">
               <IconTrendingUp size={20} />
            </ThemeIcon>
            <Title order={2}>Painel de Produção - Usinagem</Title>
          </Group>

          <Group gap="lg" align="center">
            {/* KPI CHIPS MÊS */}
            <Card padding="xs" radius="md" withBorder shadow="xs" bg="white">
               <Group gap="xs">
                 <Text size="xs" fw={700} c="dimmed">MÊS</Text>
                 <Badge variant="light" color="gray" size="lg">Meta: {formatNum(resumo.metaMes)}h</Badge>
                 <Badge variant="filled" color="blue" size="lg">Real: {formatNum(resumo.realMes)}h</Badge>
                 <Badge variant="filled" color={perfColor(resumo.aderMes)} size="lg">
                    {resumo.aderMes == null ? '-' : `${formatNum(resumo.aderMes, 1)}%`}
                 </Badge>
               </Group>
            </Card>

            {/* KPI CHIPS DIA */}
            <Card padding="xs" radius="md" withBorder shadow="xs" bg="white">
               <Group gap="xs">
                 <Text size="xs" fw={700} c="dimmed">DIA</Text>
                 <Badge variant="light" color="gray" size="lg">Meta: {formatNum(resumo.metaDia)}h</Badge>
                 <Badge variant="outline" color="blue" size="lg">Real: {formatNum(resumo.realDia)}h</Badge>
                 <Badge variant="outline" color={perfColor(resumo.aderDia)} size="lg">
                    {resumo.aderDia == null ? '-' : `${formatNum(resumo.aderDia, 1)}%`}
                 </Badge>
               </Group>
            </Card>

            {/* STATUS DE ATUALIZAÇÃO - AGORA DESTACADO */}
            <Card padding="sm" radius="md" withBorder shadow="sm" bg="gray.1">
                <Group gap="sm">
                  <ThemeIcon size="lg" radius="xl" color="teal" variant="filled">
                     <IconClock size={20} />
                  </ThemeIcon>
                  <Stack gap={0}>
                     <Text size="xs" c="dimmed" fw={700} tt="uppercase">Atualizado em</Text>
                     <Text size="lg" fw={900} c="dark">{lastUpdateText}</Text>
                  </Stack>
                </Group>
            </Card>

            <ActionIcon variant="subtle" color="gray" onClick={toggleFullscreen}>
              {isFullscreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
            </ActionIcon>
          </Group>
        </Group>

        {/* Área Principal */}
        <Card
          withBorder
          shadow="sm"
          radius="lg"
          padding="lg"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {loading ? (
            <Group justify="center" align="center" style={{ height: '100%' }}>
              <Loader size="xl" />
            </Group>
          ) : (
            <>
              {/* Paginação */}
              <Group justify="space-between" mb="xs" align="center">
                <Group gap="xs" align="center">
                   {/* Navegação Manual */}
                   <ActionIcon variant="light" radius="xl" onClick={goPrev} size="lg">
                     <IconChevronLeft size={18} />
                   </ActionIcon>
                   
                   <Group gap={6}>
                    {Array.from({ length: totalSlides }).map((_, idx) => (
                      <ActionIcon
                        key={idx}
                        radius="xl"
                        size="sm"
                        variant={idx === activeSlide ? 'filled' : 'light'}
                        color={idx === activeSlide ? 'blue' : 'gray'}
                        onClick={() => setActiveSlide(idx)}
                      />
                    ))}
                   </Group>

                   <ActionIcon variant="light" radius="xl" onClick={goNext} size="lg">
                     <IconChevronRight size={18} />
                   </ActionIcon>
                </Group>
                
                {/* Indicador do Slide Atual */}
                <Text fw={600} c="dimmed" size="sm">
                    {activeSlide === 0 ? "Visão Geral da Fábrica" : `Máquinas - Pág ${activeSlide} de ${centroPages.length}`}
                </Text>
              </Group>

              {/* Slide Content */}
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

/* ========= Slide 1 – Fábrica ========= */
function SlideFactory({ dias }: { dias: FactoryDayRow[] }) {
  if (!dias.length) {
    return (
      <Group justify="center" align="center" style={{ height: '100%' }}>
        <Text c="dimmed" size="lg">Sem dados recentes para exibir.</Text>
      </Group>
    );
  }

  return (
    <Stack gap="md" style={{ height: '100%' }}>
      <Group justify="space-between" align="center">
        <Title order={3}>Produção Diária (Últimos 14 dias)</Title>
        <Group>
            <Badge size="lg" variant="dot" color="orange">Dia Útil</Badge>
            <Badge size="lg" variant="dot" color="blue">Sábado</Badge>
        </Group>
      </Group>

      {/* Gráfico */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dias} margin={{ top: 30, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
            <XAxis 
                dataKey="label" 
                tick={{ fontSize: 14, fontWeight: 500 }} 
                tickMargin={10}
            />
            {/* Eixo Y oculto para limpar visual */}
            <YAxis hide /> 
            <ReTooltip content={<FactoryTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }}/>
            
            <Bar
              dataKey="produzido"
              name="Produzido (h)"
              radius={[6, 6, 0, 0]}
              isAnimationActive={true}
            >
              {dias.map((d, i) => (
                <Cell key={i} fill={d.isSaturday ? '#3b82f6' : '#f97316'} />
              ))}
              <LabelList dataKey="produzido" content={<FactoryBarLabel />} />
            </Bar>
            
            <Line
              type="monotone"
              dataKey="meta"
              name="Meta diária (h)"
              stroke="#1f2937"
              strokeDasharray="5 5"
              dot={false}
              strokeWidth={3}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Grid de Resumo estilo "Data Table Cards" */}
      <SimpleGrid cols={Math.min(dias.length, 7)} spacing="sm" mt="xs">
        {dias.slice(-7).map((d) => ( // Mostra apenas os ultimos 7 cards embaixo pra não ficar pequeno
          <Card 
            key={d.iso} 
            padding="sm" 
            radius="md" 
            withBorder 
            style={{ borderTop: `4px solid var(--mantine-color-${perfColor(d.pct)}-filled)` }}
          >
            <Stack gap={2} align="center">
              <Text size="sm" fw={700} c="dimmed">
                {d.label}
              </Text>
              <Text size="xl" fw={800}>
                {d.produzido.toFixed(0)}h
              </Text>
              <Badge variant="light" size="sm" color={perfColor(d.pct)}>
                {d.pct.toFixed(0)}%
              </Badge>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

/* ========= Slide 2+ – Máquinas (MODO TV / KIOSK) ========= */
function SlideMaquinas({ page, isFuture }: { page: CentroPerf[]; isFuture: boolean }) {
  if (!page.length) {
    return (
      <Group justify="center" align="center" style={{ height: '100%' }}>
        <Text c="dimmed" size="xl">Nenhuma máquina com meta cadastrada.</Text>
      </Group>
    );
  }

  return (
    <Stack gap="md" style={{ height: '100%' }}>
      <Group justify="space-between" align="center">
        <Title order={2}>Performance por Máquina • Visão do Dia</Title>
      </Group>

      <SimpleGrid
        cols={4}
        spacing="md"
        verticalSpacing="md"
        style={{ flex: 1, minHeight: 0 }}
      >
        {page.map((c) => {
          const pctEsperado = c.esperado_dia > 0 ? (c.real_dia / c.esperado_dia) * 100 : 0;
          const pctMeta = c.meta_dia > 0 ? (c.real_dia / c.meta_dia) * 100 : 0;
          const cor = perfColor(c.ader_dia);

          return (
            <Card
              key={c.centro_id}
              withBorder
              radius="lg"
              padding="lg" // Aumentado padding interno
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <Stack gap="md" style={{ height: '100%' }}>
                
                {/* 1. Cabeçalho: Nome Grande + Badge Grande */}
                <Group justify="space-between" align="flex-start">
                  <Text fw={900} size="xl" style={{ fontSize: '1.5rem' }}>{c.codigo}</Text>
                  {isFuture ? (
                    <Badge variant="light" color="gray" size="lg">FUTURO</Badge>
                  ) : (
                    <Badge color={cor} variant="filled" size="xl">
                      {c.ader_dia == null ? '-' : `${formatNum(c.ader_dia, 0)}%`}
                    </Badge>
                  )}
                </Group>

                {/* 2. Centro: Gráfico + Valores GIGANTES */}
                <Group gap="md" align="center" style={{ flex: 1 }} wrap="nowrap">
                  <RingProgress
                    size={130} // Levemente maior
                    thickness={14} // Mais espesso
                    roundCaps
                    sections={[{ value: clamp(c.ader_dia ?? 0, 0, 200), color: perfColor(c.ader_dia) }]}
                    label={
                        <Text ta="center" size="md" fw={900} c={cor}>
                           {c.ader_dia ? `${c.ader_dia.toFixed(0)}%` : '-'}
                        </Text>
                    }
                  />
                  
                  {/* Bloco de texto otimizado para TV */}
                  <Stack gap={4} style={{ minWidth: 0 }}>
                     <Text size="sm" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: '0.5px' }}>
                        Produzido
                     </Text>
                     
                     {/* NÚMERO GIGANTE PARA LEITURA DISTANTE */}
                     <Text fw={900} style={{ fontSize: '2.6rem', lineHeight: 1, color: '#1f2937' }}>
                        {formatNum(c.real_dia)}h
                     </Text>
                     
                     {/* Metas secundárias com fonte legível (não miúda) */}
                     <Stack gap={2} mt={6}>
                        <Group gap={6} align="baseline">
                           <Text size="sm" c="dimmed" fw={600}>Esperado:</Text>
                           <Text size="md" fw={800} c="dimmed">{formatNum(c.esperado_dia)}h</Text>
                        </Group>
                        <Group gap={6} align="baseline">
                           <Text size="sm" c="dimmed" fw={600}>Meta Dia:</Text>
                           <Text size="md" fw={800} c="dimmed">{formatNum(c.meta_dia)}h</Text>
                        </Group>
                     </Stack>
                  </Stack>
                </Group>

                {/* 3. Barras Inferiores grossas (size="xl") */}
                <Stack gap="sm">
                  <Stack gap={2}>
                    <Group justify="space-between">
                       <Text size="sm" fw={700} c="dimmed">Progresso vs Esperado</Text>
                       <Text size="sm" fw={800}>{clamp(pctEsperado).toFixed(0)}%</Text>
                    </Group>
                    <Progress 
                        size="xl" // Barra Grossa
                        radius="md" 
                        value={clamp(pctEsperado)} 
                        color={perfColor(pctEsperado)} 
                        striped 
                        animated={pctEsperado < 100} 
                    />
                  </Stack>
                  
                  <Stack gap={2}>
                    <Group justify="space-between">
                       <Text size="sm" fw={700} c="dimmed">Progresso vs Meta</Text>
                       <Text size="sm" fw={800}>{clamp(pctMeta).toFixed(0)}%</Text>
                    </Group>
                    <Progress 
                        size="xl" // Barra Grossa
                        radius="md" 
                        value={clamp(pctMeta)} 
                        color="blue" 
                    />
                  </Stack>
                </Stack>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}