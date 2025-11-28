// src/features/tv/TvDashboardPage.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Button,
  ScrollArea,
  Divider,
  Center,
  Image,
  Transition,
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
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowMerge,
  IconPin,
} from '@tabler/icons-react';

import {
  fetchMetasAtuais,
  fetchCentroSeriesRange,
  fetchUltimoDiaComDados,
  fetchUploadsPorDia,
  type VUploadDia,
} from '../../services/db';
import { supabase } from '../../lib/supabaseClient';
import { fracDiaLogico } from '../../utils/time';

/* ========= Debug Time Helper ========= */
function getNow() {
  const debugDate = localStorage.getItem('TV_DEBUG_DATE'); 
  if (debugDate) {
    const d = new Date(debugDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

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

function isCentroAtivoNoDia(c: any, dataWip: Date): boolean {
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

function extractTime(isoOrDate: string | Date | null): string {
  if (!isoOrDate) return '00:00';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '00:00';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

type Contribuinte = {
  codigo: string;
  real: number;
  is_stale: boolean;
  last_ref: string;
};

type CentroPerf = {
  centro_id: number;
  codigo: string;
  is_parent: boolean;
  has_parent: boolean;
  pinned: boolean;

  meta_dia: number;
  meta_mes: number;

  real_dia: number;
  real_mes: number;

  esperado_dia: number;
  desvio_dia: number;
  ader_dia: number | null; 
  pct_meta_dia: number | null; 
  ader_mes: number | null;
  
  is_stale: boolean;     
  last_ref_time: string;

  contribuintes: Contribuinte[];
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
      <Text fw={600} mb={4}>{label}</Text>
      <Text size="xs">Produzido: <b>{p.toFixed(2)} h</b></Text>
      <Text size="xs">Meta: <b>{m.toFixed(2)} h</b></Text>
      <Text size="xs">Diferença: <b style={{ color: diff >= 0 ? '#16a34a' : '#ef4444' }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} h</b></Text>
      <Text size="xs">Aderência: <b>{pct.toFixed(1)}%</b></Text>
    </Card>
  );
}

function FactoryBarLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (value == null) return null;
  if (!height || height < 20) return null;
  const text = Number(value).toFixed(1); 
  return (
    <text x={x + width / 2} y={y - 10} textAnchor="middle" fontSize={16} fontWeight={700} fill="#374151" style={{ pointerEvents: 'none' }}>
      {text}
    </text>
  );
}

/* ========= componente principal ========= */
export default function TvDashboardPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { scope } = useParams(); 
  const navigate = useNavigate();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [factoryDays, setFactoryDays] = useState<FactoryDayRow[]>([]);
  const [centrosPerf, setCentrosPerf] = useState<CentroPerf[]>([]);
  const [lastUpdateText, setLastUpdateText] = useState<string>('–');
  
  const [contextDia, setContextDia] = useState<{
    isPast: boolean;
    isToday: boolean;
    isFuture: boolean;
    frac: number;
  }>({ isPast: false, isToday: false, isFuture: false, frac: 0 });

  const [activeSlide, setActiveSlide] = useState(0);
  const cancelledRef = useRef(false);

  const tituloPainel = useMemo(() => {
    if (scope === 'montagem') return 'Painel de Montagem';
    if (scope === 'usinagem') return 'Painel de Usinagem';
    return 'Painel Geral de Produção';
  }, [scope]);

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
        uploadsDia.slice().sort((a, b) => new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime()).at(-1) ??
        null;

      let horaRefGlobal = '00:00';
      let dataRefGlobalObj = getNow();

      if (ativo) {
        const dt = new Date(ativo.enviado_em);
        if (!localStorage.getItem('TV_DEBUG_DATE')) {
             dataRefGlobalObj = dt;
        }
        const dataStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const horaStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        horaRefGlobal = horaStr;
        if (!cancelledRef.current) setLastUpdateText(`${dataStr} • ${horaStr}`);
      } else if (!cancelledRef.current) {
        setLastUpdateText('Sem dados');
      }

      const todayLocal = startOfDayLocal(getNow());
      const isPast = diaRefLocal < todayLocal;
      const isToday = diaRefLocal.getTime() === todayLocal.getTime();
      const isFuture = !isPast && !isToday;
      const fracGlobal = isPast ? 1 : isFuture ? 0 : fracDiaLogico(horaRefGlobal);

      if (!cancelledRef.current) {
        setContextDia({ isPast, isToday, isFuture, frac: fracGlobal });
      }

      const startMes = new Date(diaRefLocal.getFullYear(), diaRefLocal.getMonth(), 1);
      const diasCorridosMes = countDaysExcludingSundays(startMes, diaRefLocal);
      const startSerie = addDays(diaRefLocal, -13); 

      // 1. BUSCAR CENTROS
      const { data: centrosRaw } = await supabase
        .from('centros')
        .select('id, codigo, ativo, desativado_desde, escopo, centro_pai_id, exibir_filhos')
        .order('codigo');
      
      const centrosAll = centrosRaw ?? [];
      const metasAtuaisAll = await fetchMetasAtuais();

      // 2. FILTRAGEM E HIERARQUIA
      const centrosMap = new Map<number, typeof centrosAll[0]>();
      centrosAll.forEach(c => centrosMap.set(c.id, c));

      const idsParaBuscarDados = new Set<number>();
      const idsCards = new Set<number>();
      const parentToChildren = new Map<number, number[]>();

      centrosAll.forEach((c) => {
         let belongsToScope = false;
         if (!scope || scope === 'geral') belongsToScope = true;
         else if (c.escopo === scope) belongsToScope = true;
         
         const pai = c.centro_pai_id ? centrosMap.get(c.centro_pai_id) : null;
         
         if (isCentroAtivoNoDia(c, diaRefLocal)) {
             if (pai) {
                 // É filho. 
                 const parentInScope = !scope || scope === 'geral' || pai.escopo === scope;
                 
                 if (belongsToScope || parentInScope) {
                     idsParaBuscarDados.add(c.id);
                     
                     // Pai vira card (se estiver no escopo)
                     if (parentInScope) {
                        idsCards.add(pai.id);
                     }

                     const list = parentToChildren.get(pai.id) ?? [];
                     list.push(c.id);
                     parentToChildren.set(pai.id, list);

                     // Se Pai manda exibir e Filho está no contexto, Filho vira card
                     if (pai.exibir_filhos && parentInScope) {
                         idsCards.add(c.id);
                     }
                 }
             } else {
                 // É standalone ou é um Pai
                 if (belongsToScope) {
                     idsParaBuscarDados.add(c.id);
                     idsCards.add(c.id);
                 }
             }
         }
      });

      // Busca dados
      let fullHistory: any[] = [];
      if (idsParaBuscarDados.size > 0) {
          fullHistory = await fetchCentroSeriesRange(
              Array.from(idsParaBuscarDados), 
              toISO(startSerie < startMes ? startSerie : startMes), 
              toISO(diaRefLocal)
          );
      }

      // --- 4. CALCULAR PERFORMANCE ---
      const perfCalculada: CentroPerf[] = [];
      const cardIdsArr = Array.from(idsCards);

      const metasMap = new Map<number, number>();
      (metasAtuaisAll as any[]).forEach(m => metasMap.set(m.centro_id, Number(m.meta_horas)));

      const historyAgregadoGlobal = new Map<string, number>(); 

      cardIdsArr.forEach(cardId => {
          const centroCard = centrosMap.get(cardId);
          if (!centroCard) return;

          const isParent = parentToChildren.has(cardId);
          const hasParent = !!centroCard.centro_pai_id;
          
          // Fixação: Só fixa se for pai, tiver a flag E estiver no escopo específico
          const isPinned = !!centroCard.exibir_filhos && isParent && (scope === centroCard.escopo);

          const childrenIds = parentToChildren.get(cardId) ?? [cardId];

          const metaDia = metasMap.get(cardId) ?? 0;
          const metaMes = metaDia * diasCorridosMes;

          let realDia = 0;
          let realMes = 0;
          let maxRefTimeMs = 0;
          let lastRefStr = horaRefGlobal;
          const contribuintesList: Contribuinte[] = [];

          childrenIds.forEach(childId => {
              const childCode = centrosMap.get(childId)?.codigo ?? '?';
              let childRealDia = 0;
              let childLastRef = horaRefGlobal;
              let childIsStale = false;

              const hist = fullHistory.filter(h => h.centro_id === childId);
              hist.forEach(h => {
                  const val = Number(h.produzido_h) || 0;
                  if (h.data_wip >= toISO(startMes) && h.data_wip <= toISO(diaRefLocal)) realMes += val;
                  if (h.data_wip === toISO(diaRefLocal)) {
                      realDia += val;
                      childRealDia += val;
                      if (h.data_referencia) {
                          const refDate = new Date(h.data_referencia);
                          if (refDate.getTime() > maxRefTimeMs) {
                              maxRefTimeMs = refDate.getTime();
                              lastRefStr = extractTime(refDate);
                          }
                          childLastRef = extractTime(refDate);
                          if (!isFuture && !isPast) {
                              const diff = dataRefGlobalObj.getTime() - refDate.getTime();
                              if (diff > 2 * 60 * 1000) childIsStale = true;
                          }
                      }
                  }
                  if (h.data_wip >= toISO(startSerie)) {
                      if (isParent || !centroCard.centro_pai_id) {
                          const prev = historyAgregadoGlobal.get(h.data_wip) ?? 0;
                          historyAgregadoGlobal.set(h.data_wip, prev + val);
                      }
                  }
              });

              if (isParent) {
                  contribuintesList.push({ codigo: childCode, real: childRealDia, is_stale: childIsStale, last_ref: childLastRef });
              }
          });

          let cardIsStale = false;
          if (!isParent && !isFuture && !isPast) {
             const histHoje = fullHistory.find(h => h.centro_id === cardId && h.data_wip === toISO(diaRefLocal));
             if (histHoje?.data_referencia) {
                 const refDate = new Date(histHoje.data_referencia);
                 const diff = dataRefGlobalObj.getTime() - refDate.getTime();
                 if (diff > 2 * 60 * 1000) cardIsStale = true;
                 lastRefStr = extractTime(refDate);
             }
          }

          let fracAplicada = fracGlobal;
          if (!isParent && cardIsStale) fracAplicada = fracDiaLogico(lastRefStr);
          
          const esperado = +(metaDia * fracAplicada).toFixed(2);
          let aderDia: number | null = null;
          if (!isFuture) {
            if (esperado > 0) aderDia = (realDia / esperado) * 100;
            else if (isPast && metaDia > 0) aderDia = (realDia / metaDia) * 100;
            else aderDia = 0;
          }

          const aderMes = metaMes > 0 ? (realMes / metaMes) * 100 : null;
          const pctMetaDia = metaDia > 0 ? (realDia / metaDia) * 100 : null;

          perfCalculada.push({
              centro_id: cardId,
              codigo: centroCard.codigo,
              is_parent: isParent,
              has_parent: hasParent, 
              pinned: isPinned,
              meta_dia: +metaDia.toFixed(2),
              meta_mes: +metaMes.toFixed(2),
              real_dia: +realDia.toFixed(2),
              real_mes: +realMes.toFixed(2),
              esperado_dia: esperado,
              desvio_dia: +(realDia - esperado).toFixed(2),
              ader_dia: aderDia !== null ? +aderDia.toFixed(2) : null,
              pct_meta_dia: pctMetaDia !== null ? +pctMetaDia.toFixed(2) : null,
              ader_mes: aderMes !== null ? +aderMes.toFixed(2) : null,
              is_stale: cardIsStale,
              last_ref_time: lastRefStr,
              contribuintes: contribuintesList.sort((a,b) => b.real - a.real),
          });
      });

      // Gráfico Global
      const metaTotalCards = perfCalculada
          .filter(c => c.is_parent || !c.has_parent)
          .reduce((acc, c) => acc + c.meta_dia, 0);
      
      const dias = daysBetween(startSerie, diaRefLocal);
      const serieFactory: FactoryDayRow[] = [];
      for (const iso of dias) {
        if (isSundayISO(iso)) continue; 
        const prod = +(historyAgregadoGlobal.get(iso) ?? 0).toFixed(2);
        const pct = metaTotalCards > 0 ? (prod / metaTotalCards) * 100 : 100;
        const bateuMeta = metaTotalCards > 0 && prod >= metaTotalCards;
        // COR VERDE SE BATEU META, SENÃO AZUL/LARANJA
        const color = bateuMeta ? '#16a34a' : (isSaturdayISO(iso) ? '#3b82f6' : '#f97316');
        serieFactory.push({ iso, label: shortBR(iso), produzido: prod, meta: metaTotalCards, pct, isSaturday: isSaturdayISO(iso) });
      }

      if (!cancelledRef.current) {
        setFactoryDays(serieFactory);
        setCentrosPerf(perfCalculada);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    cancelledRef.current = false;
    loadData();
    return () => { cancelledRef.current = true; };
  }, [loadData]);

  useEffect(() => {
    const channel = supabase.channel('tv-uploads-kiosk').on('postgres_changes', { event: '*', schema: 'public', table: 'upload_dia_ativo' }, () => { loadData(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  useEffect(() => {
    const id = window.setInterval(() => { loadData(); }, 60000);
    return () => window.clearInterval(id);
  }, [loadData]);

  const resumo = useMemo(() => {
    if (!centrosPerf.length) return { metaMes: 0, realMes: 0, aderMes: null, metaDia: 0, realDia: 0, esperadoDia: 0, aderDia: null };
    
    const lideres = centrosPerf.filter(c => c.is_parent || !c.has_parent);
    
    return lideres.reduce((acc, c) => {
        acc.metaMes += c.meta_mes;
        acc.realMes += c.real_mes;
        acc.metaDia += c.meta_dia;
        acc.realDia += c.real_dia;
        acc.esperadoDia += c.esperado_dia;
        return acc;
    }, { metaMes: 0, realMes: 0, aderMes: null, metaDia: 0, realDia: 0, esperadoDia: 0, aderDia: null });
  }, [centrosPerf, contextDia]);

  const centroPages = useMemo(() => {
      const pinnedItems = centrosPerf.filter(c => c.pinned);
      const regularItems = centrosPerf.filter(c => !c.pinned).sort((a, b) => (b.ader_dia ?? -Infinity) - (a.ader_dia ?? -Infinity));

      const slotsPerPage = 6; 
      const availableSlots = Math.max(1, slotsPerPage - pinnedItems.length);

      const regularChunks = chunk(regularItems, availableSlots);

      if (regularChunks.length === 0 && pinnedItems.length > 0) {
          return [pinnedItems];
      }

      if (regularChunks.length === 0 && pinnedItems.length === 0) {
          return [];
      }

      return regularChunks.map(c => [...pinnedItems, ...c]);
  }, [centrosPerf]);

  // TOTAL SLIDES = 1 (Factory) + Pages + 1 (Branding)
  // CORREÇÃO: Garantir que centroPages.length não seja negativo, mas o array nunca é negativo.
  // O +1 do Branding é adicionado aqui.
  const totalSlides = 1 + Math.max(centroPages.length, 0) + 1; 

  useEffect(() => {
    if (totalSlides <= 1) return;
    
    const isBrandingSlide = activeSlide === totalSlides - 1;
    const duration = isBrandingSlide ? 3000 : 15000; // 6s para Branding, 15s para o resto

    const id = window.setTimeout(() => { 
        setActiveSlide((prev) => (prev + 1) % totalSlides); 
    }, duration);

    return () => window.clearTimeout(id);
  }, [totalSlides, activeSlide]); 

  // Reseta se o escopo mudar
  useEffect(() => { setActiveSlide(0); }, [scope, centroPages.length]);

  const goPrev = () => setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  const goNext = () => setActiveSlide((prev) => (prev + 1) % totalSlides);

  /* ========= render ========= */
  return (
    <div ref={rootRef} style={{ width: '100vw', height: '100vh', background: '#f5f5f7', padding: '16px 24px', boxSizing: 'border-box' }}>
      <Stack h="100%" gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="sm" align="center">
             <Button variant="subtle" color="gray" size="md" leftSection={<IconArrowLeft size={20} />} onClick={() => navigate('/tv')} styles={{ root: { paddingLeft: 0, paddingRight: 10 } }}>Menu</Button>
            <ThemeIcon size="lg" radius="md" color="blue" variant="light"><IconTrendingUp size={20} /></ThemeIcon>
            <Title order={2}>{tituloPainel}</Title>
          </Group>
          <Group gap="lg" align="center">
            <Card padding="xs" radius="md" withBorder shadow="xs" bg="white">
               <Group gap="xs"><Text size="xs" fw={700} c="dimmed">MÊS</Text><Badge variant="light" color="gray" size="lg">Meta: {formatNum(resumo.metaMes)}h</Badge><Badge variant="filled" color="blue" size="lg">Real: {formatNum(resumo.realMes)}h</Badge><Badge variant="filled" color={perfColor(resumo.metaMes > 0 ? (resumo.realMes/resumo.metaMes)*100 : 0)} size="lg">{resumo.metaMes > 0 ? `${formatNum((resumo.realMes/resumo.metaMes)*100, 1)}%` : '-'}</Badge></Group>
            </Card>
            <Card padding="xs" radius="md" withBorder shadow="xs" bg="white">
               <Group gap="xs"><Text size="xs" fw={700} c="dimmed">DIA</Text><Badge variant="light" color="gray" size="lg">Meta: {formatNum(resumo.metaDia)}h</Badge><Badge variant="outline" color="blue" size="lg">Real: {formatNum(resumo.realDia)}h</Badge><Badge variant="outline" color={perfColor(resumo.esperadoDia > 0 ? (resumo.realDia/resumo.esperadoDia)*100 : 0)} size="lg">{resumo.esperadoDia > 0 ? `${formatNum((resumo.realDia/resumo.esperadoDia)*100, 1)}%` : '-'}</Badge></Group>
            </Card>
            <Card padding="sm" radius="md" withBorder shadow="sm" bg="gray.1">
                <Group gap="sm"><ThemeIcon size="lg" radius="xl" color="teal" variant="filled"><IconClock size={20} /></ThemeIcon><Stack gap={0}><Text size="xs" c="dimmed" fw={700} tt="uppercase">Atualizado em</Text><Text size="lg" fw={900} c="dark">{lastUpdateText}</Text></Stack></Group>
            </Card>
            <ActionIcon variant="subtle" color="gray" onClick={toggleFullscreen}>{isFullscreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}</ActionIcon>
          </Group>
        </Group>

        <Card withBorder shadow="sm" radius="lg" padding="lg" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {loading ? (
            <Group justify="center" align="center" style={{ height: '100%' }}><Loader size="xl" /></Group>
          ) : (
            <>
              <Group justify="space-between" mb="xs" align="center">
                <Group gap="xs" align="center">
                   <ActionIcon variant="light" radius="xl" onClick={goPrev} size="lg"><IconChevronLeft size={18} /></ActionIcon>
                   <Group gap={6}>{Array.from({ length: totalSlides }).map((_, idx) => (<ActionIcon key={idx} radius="xl" size="sm" variant={idx === activeSlide ? 'filled' : 'light'} color={idx === activeSlide ? 'blue' : 'gray'} onClick={() => setActiveSlide(idx)} />))}</Group>
                   <ActionIcon variant="light" radius="xl" onClick={goNext} size="lg"><IconChevronRight size={18} /></ActionIcon>
                </Group>
                <Text fw={600} c="dimmed" size="sm">
                     {activeSlide === 0 ? "Visão Geral" 
                      : activeSlide === totalSlides - 1 ? "" 
                      : `Máquinas - Pág ${activeSlide} de ${centroPages.length}`}
                </Text>
              </Group>

              <div style={{ flex: 1, minHeight: 0 }}>
                {activeSlide === 0 ? (
                   <SlideFactory dias={factoryDays} />
                ) : activeSlide === totalSlides - 1 ? (
                   <SlideBranding />
                ) : (
                   <SlideMaquinas page={centroPages[activeSlide - 1] ?? []} isFuture={contextDia.isFuture} />
                )}
              </div>
            </>
          )}
        </Card>
      </Stack>
    </div>
  );
}

function SlideFactory({ dias }: { dias: FactoryDayRow[] }) {
  if (!dias.length) return <Group justify="center" align="center" h="100%"><Text c="dimmed" size="lg">Sem dados recentes.</Text></Group>;
  return (
    <Stack gap="md" h="100%">
      <Group justify="space-between" align="center"><Title order={3}>Produção Diária (Últimos 14 dias)</Title><Group><Badge size="lg" variant="dot" color="orange">Dia Útil</Badge><Badge size="lg" variant="dot" color="blue">Sábado</Badge></Group></Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dias} margin={{ top: 30, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 14, fontWeight: 500 }} tickMargin={10} />
            <YAxis hide /> <ReTooltip content={<FactoryTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }}/>
            <Bar dataKey="produzido" name="Produzido (h)" radius={[6, 6, 0, 0]} isAnimationActive={true}>
                {dias.map((d, i) => {
                    const bateuMeta = d.meta > 0 && d.produzido >= d.meta;
                    const color = bateuMeta ? '#16a34a' : (d.isSaturday ? '#3b82f6' : '#f97316');
                    return <Cell key={i} fill={color} />;
                })}
                <LabelList dataKey="produzido" content={<FactoryBarLabel />} />
            </Bar>
            <Line type="monotone" dataKey="meta" name="Meta diária (h)" stroke="#1f2937" strokeDasharray="5 5" dot={false} strokeWidth={3} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <SimpleGrid cols={Math.min(dias.length, 7)} spacing="sm" mt="xs">{dias.slice(-7).map((d) => (<Card key={d.iso} padding="sm" radius="md" withBorder style={{ borderTop: `4px solid var(--mantine-color-${perfColor(d.pct)}-filled)` }}><Stack gap={2} align="center"><Text size="sm" fw={700} c="dimmed">{d.label}</Text><Text size="xl" fw={800}>{d.produzido.toFixed(0)}h</Text><Badge variant="light" size="sm" color={perfColor(d.pct)}>{d.pct.toFixed(0)}%</Badge></Stack></Card>))}</SimpleGrid>
    </Stack>
  );
}

function SlideMaquinas({ page, isFuture }: { page: CentroPerf[]; isFuture: boolean }) {
  if (!page.length) return <Group justify="center" align="center" h="100%"><Text c="dimmed" size="xl">Nenhuma máquina neste painel.</Text></Group>;

  return (
    <Stack gap="md" h="100%">
      <Group justify="space-between" align="center"><Title order={2}>Performance por Máquina • Visão do Dia</Title></Group>

      <SimpleGrid cols={3} spacing="lg" verticalSpacing="lg" style={{ flex: 1, minHeight: 0 }}>
        {page.map((c) => {
          const pctEsperado = c.esperado_dia > 0 ? (c.real_dia / c.esperado_dia) * 100 : 0;
          const cor = perfColor(c.ader_dia);
          return (
            <Card key={c.centro_id} withBorder radius="lg" padding="lg" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Stack gap="md" h="100%">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={0}>
                      <Group gap={4}>
                          <Text fw={900} size="xl" style={{ fontSize: '1.6rem' }}>{c.codigo}</Text>
                          {c.is_parent && <IconArrowMerge size={22} color="gray" style={{ opacity: 0.5 }} />}
                          {c.pinned && <IconPin size={22} color="gray" style={{ opacity: 0.5, transform: 'rotate(45deg)' }} />}
                      </Group>
                      {c.is_stale && <Badge variant="filled" color="orange" size="sm" leftSection={<IconAlertTriangle size={12} />}>Dados de {c.last_ref_time}</Badge>}
                  </Stack>
                  {isFuture ? <Badge variant="light" color="gray" size="lg">FUTURO</Badge> : <Badge color={cor} variant="filled" size="xl">{c.ader_dia == null ? '-' : `${formatNum(c.ader_dia, 0)}%`}</Badge>}
                </Group>

                <Group gap="md" align="center" style={{ flex: 1 }} wrap="nowrap">
                  <RingProgress size={130} thickness={14} roundCaps sections={[{ value: clamp(c.ader_dia ?? 0, 0, 200), color: perfColor(c.ader_dia) }]} label={<Text ta="center" size="md" fw={900} c={cor}>{c.ader_dia ? `${c.ader_dia.toFixed(0)}%` : '-'}</Text>} />
                  <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: '0.5px' }}>Produzido</Text>
                      <Text fw={900} style={{ fontSize: '2.8rem', lineHeight: 1, color: '#1f2937' }}>{formatNum(c.real_dia)}h</Text>
                      <Stack gap={0} mt={4}>
                          <Text size="sm" c="dimmed">Esperado: <b>{formatNum(c.esperado_dia)}h</b></Text>
                          <Text size="sm" c="dimmed">Meta Dia: <b>{formatNum(c.meta_dia)}h</b></Text>
                      </Stack>
                  </Stack>
                  
                  {c.is_parent && (
                    <>
                      <Divider orientation="vertical" mx={2} style={{ height: 100 }} />
                      <Stack gap={2} style={{ flex: 1, height: 130, overflow: 'hidden' }}>
                         <Text size="xs" c="dimmed" fw={700}>DETALHE:</Text>
                         <ScrollArea h="100%" type="never" offsetScrollbars>
                            <Stack gap={4}>
                              {c.contribuintes.map((child, idx) => (
                                <Group key={idx} justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid #f8f9fa', paddingBottom: 2 }}>
                                    <Text size="xs" fw={600} truncate title={child.codigo} style={{maxWidth: 90}}>{child.codigo}</Text>
                                    <Group gap={4}>
                                        {child.is_stale && <IconClock size={12} color="orange" />}
                                        <Text size="xs" fw={700}>{child.real.toFixed(1)}</Text>
                                    </Group>
                                </Group>
                              ))}
                            </Stack>
                         </ScrollArea>
                      </Stack>
                    </>
                  )}
                </Group>

                <Stack gap="sm" mt="auto">
                  <Stack gap={2}><Group justify="space-between"><Text size="sm" fw={700} c="dimmed">Progresso vs Esperado</Text><Text size="sm" fw={800}>{clamp(pctEsperado).toFixed(0)}%</Text></Group><Progress size="xl" radius="md" value={clamp(pctEsperado)} color={perfColor(pctEsperado)} striped animated={pctEsperado < 100} /></Stack>
                  <Stack gap={2}><Group justify="space-between"><Text size="sm" fw={700} c="dimmed">Progresso vs Meta</Text><Text size="sm" fw={800}>{clamp(c.pct_meta_dia ?? 0).toFixed(0)}%</Text></Group><Progress size="xl" radius="md" value={clamp(c.pct_meta_dia ?? 0)} color="blue" /></Stack>
                </Stack>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

function SlideBranding() {
  const [showCompany, setShowCompany] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowCompany(prev => !prev);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Center style={{ height: '100%', width: '100%', background: 'white', borderRadius: 16 }}>
       <div style={{ width: '80%', height: '60%', position: 'relative', maxWidth: 800 }}>
          <Transition mounted={!showCompany} transition="scale" duration={800} timingFunction="ease">
            {(styles) => (
                <div style={{ ...styles, position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Image src="/logos/melhoria-continua.png" fit="contain" h={700} w="auto" fallbackSrc="https://placehold.co/800x600?text=Departamento" />
                    <Text size="2rem" fw={900} mt="xl" c="dimmed" style={{ letterSpacing: 2 }}>A CADA DIA, UM POUCO MELHOR</Text>
                </div>
            )}
          </Transition>

          <Transition mounted={showCompany} transition="scale" duration={800} timingFunction="ease">
            {(styles) => (
                <div style={{ ...styles, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Image src="/logos/spirax-sarco.png" fit="contain" h={700} w="auto" fallbackSrc="https://placehold.co/800x600?text=Spirax+Sarco" />
                </div>
            )}
          </Transition>
       </div>
    </Center>
  );
}