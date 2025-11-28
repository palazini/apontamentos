import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ActionIcon, Badge, Card, Group, Loader, SimpleGrid, Stack, Text, Title, Progress, RingProgress, ThemeIcon, Button, ScrollArea, Divider, Center, Image, Transition,
} from '@mantine/core';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Cell, LabelList,
} from 'recharts';
import {
  IconChevronLeft, IconChevronRight, IconMaximize, IconMinimize, IconTrendingUp, IconClock, IconAlertTriangle, IconArrowLeft, IconArrowMerge, IconPin,
  IconInfoCircle, IconCheck, IconSpeakerphone, IconX // <--- NOVO ÍCONE IMPORTADO
} from '@tabler/icons-react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import {
  fetchMetasAtuais, fetchCentroSeriesRange, fetchUltimoDiaComDados, fetchUploadsPorDia, fetchAvisosAtivos,
  type AvisoTV
} from '../../services/db';
import { supabase } from '../../lib/supabaseClient';
import { fracDiaLogico } from '../../utils/time';

/* ========= Debug & Time Helpers ========= */
function getNow() {
  const debugDate = localStorage.getItem('TV_DEBUG_DATE'); 
  if (debugDate) {
    const d = new Date(debugDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function startOfDayLocal(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function toISO(d: Date) { return d.toISOString().split('T')[0]; }
function isoToLocalDate(iso: string) { const parts = iso.split('-'); return new Date(+parts[0], +parts[1]-1, +parts[2]); }
function addDays(d: Date, delta: number) { const nd = new Date(d); nd.setDate(d.getDate() + delta); return startOfDayLocal(nd); }

function daysBetween(a: Date, b: Date): string[] {
  const res: string[] = [];
  const start = startOfDayLocal(a);
  const end = startOfDayLocal(b);
  for (let d = start; d <= end; d = addDays(d, 1)) res.push(toISO(d));
  return res;
}

function isSundayISO(iso: string) { return isoToLocalDate(iso).getDay() === 0; }
function isSaturdayISO(iso: string) { return isoToLocalDate(iso).getDay() === 6; }

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
  let s = input.trim().split('T')[0];
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

function isCentroAtivoNoDia(c: any, dataWip: Date): boolean {
  if (c.ativo === false) return false;
  if (c.desativado_desde) {
    const d = parseLocalDateString(c.desativado_desde);
    if (d) {
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

/* ========= Tipos Locais ========= */
type FactoryDayRow = { iso: string; label: string; produzido: number; meta: number; pct: number; isSaturday: boolean; };
type Contribuinte = { codigo: string; real: number; is_stale: boolean; last_ref: string; };

type CentroPerf = {
  centro_id: number; codigo: string; is_parent: boolean; has_parent: boolean; pinned: boolean;
  meta_dia: number; meta_mes: number;
  real_dia: number; real_mes: number;
  esperado_dia: number; desvio_dia: number;
  ader_dia: number | null; pct_meta_dia: number | null; ader_mes: number | null;
  is_stale: boolean; last_ref_time: string;
  contribuintes: Contribuinte[];
};

/* ========= UI Helpers ========= */
const formatNum = (v: number, dec = 2) => Number.isFinite(v) ? v.toFixed(dec) : '-';
const perfColor = (p: number | null | undefined) => {
  if (p == null || !Number.isFinite(p)) return 'gray';
  if (p < 80) return 'red';
  if (p <= 100) return 'yellow.7';
  return 'green';
};
function clamp(v: number, min = 0, max = 200) { return Math.max(min, Math.min(max, v)); }
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ========= Componentes de Gráfico ========= */
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
  if (value == null || !height || height < 20) return null;
  return (
    <text x={x + width / 2} y={y - 10} textAnchor="middle" fontSize={16} fontWeight={700} fill="#374151" style={{ pointerEvents: 'none' }}>
      {Number(value).toFixed(1)}
    </text>
  );
}

/* ========= PÁGINA PRINCIPAL ========= */
export default function TvDashboardPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { scope } = useParams(); 
  const navigate = useNavigate();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Dados de Produção
  const [factoryDays, setFactoryDays] = useState<FactoryDayRow[]>([]);
  const [centrosPerf, setCentrosPerf] = useState<CentroPerf[]>([]);
  const [lastUpdateText, setLastUpdateText] = useState<string>('–');
  const [contextDia, setContextDia] = useState<{ isPast: boolean; isToday: boolean; isFuture: boolean; frac: number; }>({ isPast: false, isToday: false, isFuture: false, frac: 0 });

  // Avisos e Slides
  const [avisos, setAvisos] = useState<AvisoTV[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [overrideTimer, setOverrideTimer] = useState<number | null>(null);
  const seenAvisosRef = useRef<Set<number>>(new Set());
  const cancelledRef = useRef(false);

  // NOVO STATE PARA MODO APRESENTAÇÃO
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const tickerAvisos = useMemo(() => avisos.filter(a => a.exibir_como === 'ticker'), [avisos]);
  const slideAvisos = useMemo(() => avisos.filter(a => a.exibir_como === 'slide' || a.exibir_como === 'apresentacao'), [avisos]);

  const tituloPainel = useMemo(() => {
    if (scope === 'montagem') return 'Painel de Montagem';
    if (scope === 'usinagem') return 'Painel de Usinagem';
    return 'Painel Geral de Produção';
  }, [scope]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* --- DATA FETCHING --- */
  const loadData = useCallback(async () => {
    cancelledRef.current = false;
    try {
      setLoading(true);
      const avisosAtivos = await fetchAvisosAtivos(scope || 'geral');
      if (!cancelledRef.current) setAvisos(avisosAtivos);

      const lastDayIso = await fetchUltimoDiaComDados();
      if (!lastDayIso) {
        if (!cancelledRef.current) { setFactoryDays([]); setCentrosPerf([]); setLastUpdateText('Sem dados'); }
        return;
      }
      const diaRefLocal = startOfDayLocal(isoToLocalDate(lastDayIso));
      const uploadsDia = await fetchUploadsPorDia(lastDayIso);
      let ativo = uploadsDia.find((u) => u.ativo) ?? uploadsDia.slice().sort((a, b) => new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime()).at(-1) ?? null;

      let horaRefGlobal = '00:00';
      let dataRefGlobalObj = getNow();

      if (ativo) {
        const dt = new Date(ativo.enviado_em);
        if (!localStorage.getItem('TV_DEBUG_DATE')) dataRefGlobalObj = dt;
        const dataStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const horaStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        horaRefGlobal = horaStr;
        if (!cancelledRef.current) setLastUpdateText(`${dataStr} • ${horaStr}`);
      } else if (!cancelledRef.current) setLastUpdateText('Sem dados');

      const todayLocal = startOfDayLocal(getNow());
      const isPast = diaRefLocal < todayLocal;
      const isToday = diaRefLocal.getTime() === todayLocal.getTime();
      const isFuture = !isPast && !isToday;
      const fracGlobal = isPast ? 1 : isFuture ? 0 : fracDiaLogico(horaRefGlobal);

      if (!cancelledRef.current) setContextDia({ isPast, isToday, isFuture, frac: fracGlobal });

      const startMes = new Date(diaRefLocal.getFullYear(), diaRefLocal.getMonth(), 1);
      const diasCorridosMes = countDaysExcludingSundays(startMes, diaRefLocal);
      const startSerie = addDays(diaRefLocal, -13);

      const { data: centrosRaw } = await supabase.from('centros').select('*').order('codigo');
      const centrosAll = centrosRaw ?? [];
      const metasAtuaisAll = await fetchMetasAtuais();

      const centrosMap = new Map<number, any>();
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
                 const parentInScope = !scope || scope === 'geral' || pai.escopo === scope;
                 if (belongsToScope || parentInScope) {
                     idsParaBuscarDados.add(c.id);
                     if (parentInScope) idsCards.add(pai.id);
                     const list = parentToChildren.get(pai.id) ?? [];
                     list.push(c.id);
                     parentToChildren.set(pai.id, list);
                     if (pai.exibir_filhos && parentInScope) idsCards.add(c.id);
                 }
             } else if (belongsToScope) { idsParaBuscarDados.add(c.id); idsCards.add(c.id); }
         }
      });

      let fullHistory: any[] = [];
      if (idsParaBuscarDados.size > 0) {
          fullHistory = await fetchCentroSeriesRange(
              Array.from(idsParaBuscarDados), toISO(startSerie < startMes ? startSerie : startMes), toISO(diaRefLocal)
          );
      }

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
          const isPinned = !!centroCard.exibir_filhos && isParent && (scope === centroCard.escopo);
          const childrenIds = parentToChildren.get(cardId) ?? [cardId];
          const metaDia = metasMap.get(cardId) ?? 0;
          const metaMes = metaDia * diasCorridosMes;
          let realDia = 0, realMes = 0;
          let lastRefStr = horaRefGlobal;
          let cardIsStale = false;
          const contribuintesList: Contribuinte[] = [];

          childrenIds.forEach(childId => {
               const childCode = centrosMap.get(childId)?.codigo ?? '?';
               let childRealDia = 0, childLastRef = horaRefGlobal, childIsStale = false;
               const hist = fullHistory.filter(h => h.centro_id === childId);
               hist.forEach(h => {
                   const val = Number(h.produzido_h) || 0;
                   if (h.data_wip >= toISO(startMes) && h.data_wip <= toISO(diaRefLocal)) realMes += val;
                   if (h.data_wip === toISO(diaRefLocal)) {
                       realDia += val; childRealDia += val;
                       if (h.data_referencia) {
                           const refDate = new Date(h.data_referencia);
                           childLastRef = extractTime(refDate);
                           if (!isFuture && !isPast && (dataRefGlobalObj.getTime() - refDate.getTime() > 2 * 60 * 1000)) childIsStale = true;
                       }
                   }
                   if (h.data_wip >= toISO(startSerie)) {
                       if (isParent || !centroCard.centro_pai_id) {
                           const prev = historyAgregadoGlobal.get(h.data_wip) ?? 0;
                           historyAgregadoGlobal.set(h.data_wip, prev + val);
                       }
                   }
               });
               if (isParent) contribuintesList.push({ codigo: childCode, real: childRealDia, is_stale: childIsStale, last_ref: childLastRef });
          });

          if (!isParent && !isFuture && !isPast) {
             const histHoje = fullHistory.find(h => h.centro_id === cardId && h.data_wip === toISO(diaRefLocal));
             if (histHoje?.data_referencia) {
                 const refDate = new Date(histHoje.data_referencia);
                 if (dataRefGlobalObj.getTime() - refDate.getTime() > 2 * 60 * 1000) cardIsStale = true;
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
             centro_id: cardId, codigo: centroCard.codigo, is_parent: isParent, has_parent: hasParent, pinned: isPinned,
             meta_dia: +metaDia.toFixed(2), meta_mes: +metaMes.toFixed(2), real_dia: +realDia.toFixed(2), real_mes: +realMes.toFixed(2),
             esperado_dia: esperado, desvio_dia: +(realDia - esperado).toFixed(2),
             ader_dia: aderDia ? +aderDia.toFixed(2) : null, pct_meta_dia: pctMetaDia ? +pctMetaDia.toFixed(2) : null,
             ader_mes: aderMes ? +aderMes.toFixed(2) : null, is_stale: cardIsStale, last_ref_time: lastRefStr,
             contribuintes: contribuintesList.sort((a,b) => b.real - a.real),
          });
      });

      const metaTotalCards = perfCalculada.filter(c => c.is_parent || !c.has_parent).reduce((acc, c) => acc + c.meta_dia, 0);
      const dias = daysBetween(startSerie, diaRefLocal);
      const serieFactory: FactoryDayRow[] = [];
      for (const iso of dias) {
        if (isSundayISO(iso)) continue;
        const prod = +(historyAgregadoGlobal.get(iso) ?? 0).toFixed(2);
        const pct = metaTotalCards > 0 ? (prod / metaTotalCards) * 100 : 100;
        serieFactory.push({ iso, label: shortBR(iso), produzido: prod, meta: metaTotalCards, pct, isSaturday: isSaturdayISO(iso) });
      }

      if (!cancelledRef.current) { setFactoryDays(serieFactory); setCentrosPerf(perfCalculada); }
    } catch (e) { console.error(e); } finally { if (!cancelledRef.current) setLoading(false); }
  }, [scope]);

  useEffect(() => { cancelledRef.current = false; loadData(); return () => { cancelledRef.current = true; }; }, [loadData]);
  useEffect(() => { const ch = supabase.channel('tv-realtime').on('postgres_changes', { event: '*', schema: 'public' }, () => loadData()).subscribe(); return () => { supabase.removeChannel(ch); }; }, [loadData]);
  useEffect(() => { const id = window.setInterval(loadData, 60000); return () => window.clearInterval(id); }, [loadData]);

  const resumo = useMemo(() => {
    if (!centrosPerf.length) return { metaMes: 0, realMes: 0, metaDia: 0, realDia: 0, esperadoDia: 0 };
    const lideres = centrosPerf.filter(c => c.is_parent || !c.has_parent);
    return lideres.reduce((acc, c) => {
        acc.metaMes += c.meta_mes; acc.realMes += c.real_mes; acc.metaDia += c.meta_dia; acc.realDia += c.real_dia; acc.esperadoDia += c.esperado_dia;
        return acc;
    }, { metaMes: 0, realMes: 0, metaDia: 0, realDia: 0, esperadoDia: 0 });
  }, [centrosPerf]);

  const centroPages = useMemo(() => {
      const pinnedItems = centrosPerf.filter(c => c.pinned);
      const regularItems = centrosPerf.filter(c => !c.pinned).sort((a, b) => (b.ader_dia ?? -Infinity) - (a.ader_dia ?? -Infinity));
      const slotsPerPage = 6;
      const availableSlots = Math.max(1, slotsPerPage - pinnedItems.length);
      const regularChunks = chunk(regularItems, availableSlots);
      if (regularChunks.length === 0 && pinnedItems.length > 0) return [pinnedItems];
      if (regularChunks.length === 0 && pinnedItems.length === 0) return [];
      return regularChunks.map(c => [...pinnedItems, ...c]);
  }, [centrosPerf]);

  // --- LÓGICA DO CARROSSEL (Slides) ---
  const countFactory = 1;
  const countMaquinas = Math.max(centroPages.length, 0);
  const countAvisos = slideAvisos.length;
  const countBranding = 1;
  const totalSlides = countFactory + countMaquinas + countAvisos + countBranding;

  // 1. SEGURAN?A: Se o n?mero de slides diminuir (ex: removeu aviso) e estourar o ?ndice, volta pro zero
  useEffect(() => {
    if (totalSlides > 0 && activeSlide >= totalSlides) {
      setActiveSlide(0);
      setOverrideTimer(null); // Reseta timer se perdeu a refer?ncia
    }
  }, [totalSlides, activeSlide]);

  // 2. DETEC??O DE NOVO ALERTA (Interrup??o)
  useEffect(() => {
    // Procura um aviso slide/apresenta??o que ainda n?o foi visto nesta sess?o
    const novoAviso = avisos.find(a => !seenAvisosRef.current.has(a.id) && (a.exibir_como === 'slide' || a.exibir_como === 'apresentacao'));
    
    if (novoAviso) {
      seenAvisosRef.current.add(novoAviso.id);
      
      const slideIndex = slideAvisos.findIndex(a => a.id === novoAviso.id);
      if (slideIndex >= 0) {
          const absoluteIndex = countFactory + countMaquinas + slideIndex;
          
          setActiveSlide(absoluteIndex);
          
          // Define timer: 1 hora para apresenta??o, 20s para avisos comuns
          const tempo = novoAviso.exibir_como === 'apresentacao' ? 3600000 : 20000;
          setOverrideTimer(tempo);
          
          // Se for apresenta??o, j? ativa o modo
          if (novoAviso.exibir_como === 'apresentacao') {
             setIsPresentationMode(true);
          }
      }
    }
  }, [avisos, slideAvisos, countFactory, countMaquinas]);

  // 3. SINCRONIA DE ESTADO (Corrige o bug do timer travado)
  // Verifica o que est? sendo exibido AGORA e ajusta o modo/timer
  useEffect(() => {
    if (totalSlides === 0) return;

    // Calcula qual aviso est? na tela agora (se houver)
    const avisoIndex = activeSlide - countFactory - countMaquinas;
    const isAvisoSlide = avisoIndex >= 0 && avisoIndex < countAvisos;
    const avisoAtual = isAvisoSlide ? slideAvisos[avisoIndex] : null;

    // Verifica se ? uma apresenta??o v?lida
    const isShowingPresentation = avisoAtual?.exibir_como === 'apresentacao' && !!avisoAtual.arquivo_url;

    if (isShowingPresentation) {
      // Se ? apresenta??o mas o modo t? desligado, Liga.
      if (!isPresentationMode) setIsPresentationMode(true);
    } else {
      // Se N?O ? apresenta??o (ex: foi removido ou mudou o slide), mas o modo t? ligado OU o timer t? gigante
      if (isPresentationMode || (overrideTimer && overrideTimer > 20000)) {
         setIsPresentationMode(false);
         setOverrideTimer(null); // <--- AQUI EST? A CORRE??O: Mata o timer de 1 hora
      }
    }
  }, [activeSlide, totalSlides, countFactory, countMaquinas, countAvisos, slideAvisos, isPresentationMode, overrideTimer]);

  // 4. ROTA??O AUTOM?TICA (Carrossel)
  useEffect(() => {
    if (totalSlides <= 1) return;

    // Se estiver em modo apresenta??o (timer longo), n?o roda o carrossel padr?o curto
    // A dura??o vem do overrideTimer ou do padr?o
    let duration = 12000; // Padr?o

    if (overrideTimer) {
       duration = overrideTimer;
    } else {
       // L?gica padr?o sem override
       const isBranding = activeSlide === totalSlides - 1;
       const avisoIndex = activeSlide - countFactory - countMaquinas;
       const isAviso = avisoIndex >= 0 && avisoIndex < countAvisos;
       
       if (isBranding) duration = 3000; 
       if (isAviso) duration = 10000; 
    }

    const id = window.setTimeout(() => { 
        // Ao virar o slide, limpamos o override (a menos que seja apresenta??o, mas a? o useEffect 3 trata)
        if (overrideTimer) setOverrideTimer(null);
        setActiveSlide((prev) => (prev + 1) % totalSlides); 
    }, duration);

    return () => window.clearTimeout(id);
  }, [totalSlides, activeSlide, countFactory, countMaquinas, countAvisos, overrideTimer]);

  useEffect(() => { setActiveSlide(0); }, [scope, centroPages.length]);

  const goPrev = useCallback(() => setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides), [totalSlides]);
  const goNext = useCallback(() => setActiveSlide((prev) => (prev + 1) % totalSlides), [totalSlides]);

  // Função para sair manualmente da apresentação
  const handleExitPresentation = useCallback(() => {
      setIsPresentationMode(false);
      setOverrideTimer(null);
      goNext();
  }, [goNext]);

  // Efeito para entrar/sair do Fullscreen real
  useEffect(() => {
    if (isPresentationMode && rootRef.current && !document.fullscreenElement) {
        rootRef.current.requestFullscreen().catch(err => console.log("Fullscreen negado:", err));
    }
  }, [isPresentationMode]);

  // --- RENDERIZAÇÃO DO CONTEÚDO ---
  let slideContent = null;
  let slideTitle = "";

  if (activeSlide === 0) {
      if (isPresentationMode) setIsPresentationMode(false);
      slideTitle = "Visão Geral";
      slideContent = <SlideFactory dias={factoryDays} />;
  } else if (activeSlide > 0 && activeSlide <= countMaquinas) {
      if (isPresentationMode) setIsPresentationMode(false);
      const pageIndex = activeSlide - 1;
      slideTitle = `Máquinas - Pág ${pageIndex + 1} de ${countMaquinas}`;
      slideContent = <SlideMaquinas page={centroPages[pageIndex] ?? []} isFuture={contextDia.isFuture} />;
  } else if (activeSlide > countMaquinas && activeSlide <= countMaquinas + countAvisos) {
      const avisoIndex = activeSlide - 1 - countMaquinas;
      const avisoAtual = slideAvisos[avisoIndex];
      
      if (avisoAtual.exibir_como === 'apresentacao' && avisoAtual.arquivo_url) {
          // ATIVA MODO APRESENTAÇÃO
          if (!isPresentationMode) setIsPresentationMode(true);
          slideTitle = `Apresentação • Pág ${avisoAtual.pagina_atual || 1}`;
          slideContent = <SlideApresentacao url={avisoAtual.arquivo_url} pagina={avisoAtual.pagina_atual || 1} />;
      } else {
          if (isPresentationMode) setIsPresentationMode(false);
          slideTitle = "Comunicado Importante";
          slideContent = <SlideAviso aviso={avisoAtual} />;
      }
  } else {
      if (isPresentationMode) setIsPresentationMode(false);
      slideTitle = "";
      slideContent = <SlideBranding />;
  }

  const hasTicker = tickerAvisos.length > 0;

  // Estilos Condicionais
  const mainContainerStyle: React.CSSProperties = isPresentationMode 
    ? { flex: 1, padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }
    : { flex: 1, padding: '16px 24px', display: 'flex', flexDirection: 'column', minHeight: 0 };

  const cardStyle: React.CSSProperties = isPresentationMode
    ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderRadius: 0, border: 'none' }
    : { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 };

  const headerStyle: React.CSSProperties = isPresentationMode 
    ? { position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 4, color: 'white' }
    : {};

  return (
    <div ref={rootRef} style={{ width: '100vw', height: '100vh', background: '#f5f5f7', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
       
       {/* CABEÇALHO PRINCIPAL (Oculto na apresentação) */}
       {!isPresentationMode && (
         <div style={{ padding: '16px 24px 0' }}>
           <Group justify="space-between" align="center" mb="sm">
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
         </div>
       )}

       <div style={mainContainerStyle}>
        <Stack h="100%" gap={isPresentationMode ? 0 : "sm"}>
          
          {/* CARD DO SLIDE */}
          <Card withBorder={!isPresentationMode} shadow={isPresentationMode ? undefined : "sm"} radius={isPresentationMode ? 0 : "lg"} padding={isPresentationMode ? 0 : "lg"} style={cardStyle}>
             {loading ? <Group justify="center" align="center" style={{ height: '100%' }}><Loader size="xl" /></Group> : (
               <>
                 {/* Navegação do Slide */}
                 <Group justify="space-between" mb={isPresentationMode ? 0 : "xs"} align="center" style={headerStyle}>
                   <Group gap="xs" align="center">
                      {!isPresentationMode && <ActionIcon variant="light" radius="xl" onClick={goPrev} size="lg"><IconChevronLeft size={18} /></ActionIcon>}
                      {!isPresentationMode && totalSlides <= 15 && (
                        <Group gap={6}>{Array.from({ length: totalSlides }).map((_, idx) => (<ActionIcon key={idx} radius="xl" size="sm" variant={idx === activeSlide ? 'filled' : 'light'} color={idx === activeSlide ? 'blue' : 'gray'} onClick={() => setActiveSlide(idx)} />))}</Group>
                      )}
                      <Text fw={600} c={isPresentationMode ? "white" : "dimmed"} size="sm" style={{ textShadow: isPresentationMode ? '0 1px 2px rgba(0,0,0,0.8)' : 'none' }}>
                         {slideTitle}
                      </Text>
                      {!isPresentationMode && <ActionIcon variant="light" radius="xl" onClick={goNext} size="lg"><IconChevronRight size={18} /></ActionIcon>}
                   </Group>
                 </Group>
                 
                 {/* Conteúdo */}
                 <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    {slideContent}
                    
                    {/* Botão Sair Emergência */}
                    {isPresentationMode && (
                        <ActionIcon 
                            variant="filled" color="dark" size="lg" radius="xl" 
                            style={{ position: 'absolute', top: 10, right: 10, zIndex: 1001, opacity: 0.6 }}
                            onClick={handleExitPresentation}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                        >
                            <IconX size={20} />
                        </ActionIcon>
                    )}
                 </div>
               </>
             )}
          </Card>
        </Stack>
      </div>
      
      {/* Ticker (Oculto na apresentação) */}
      {!isPresentationMode && hasTicker && !loading && <TickerBar avisos={tickerAvisos} />}
    </div>
  );
}

/* ========= Sub-Componentes ========= */
function TickerBar({ avisos }: { avisos: AvisoTV[] }) {
  const fullText = avisos.map(a => {
      const prefix = a.tipo === 'alerta' ? '⚠️ ' : a.tipo === 'sucesso' ? '🎉 ' : 'ℹ️ ';
      return `${prefix} ${a.titulo.toUpperCase()}: ${a.mensagem || ''}`;
  }).join('   •   ');
  const hasAlert = avisos.some(a => a.tipo === 'alerta');
  return (
    <div style={{ background: hasAlert ? '#d9480f' : '#1f2937', color: 'white', height: 60, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', boxShadow: '0 -4px 10px rgba(0,0,0,0.1)', zIndex: 9999 }}>
      <div className="ticker-wrapper" style={{ whiteSpace: 'nowrap', position: 'absolute' }}>
        <Text fw={700} size="xl" style={{ display: 'inline-block', paddingLeft: '100vw' }}>{fullText}</Text>
      </div>
      <style>{` .ticker-wrapper { animation: ticker 30s linear infinite; } @keyframes ticker { 0% { transform: translate3d(0, 0, 0); } 100% { transform: translate3d(-100%, 0, 0); } } `}</style>
    </div>
  );
}

function SlideAviso({ aviso }: { aviso: AvisoTV }) {
  if (!aviso) return null;
  const configs = {
    info: { color: 'blue', icon: IconInfoCircle, bg: 'var(--mantine-color-blue-0)' },
    alerta: { color: 'red', icon: IconAlertTriangle, bg: 'var(--mantine-color-red-0)' },
    sucesso: { color: 'green', icon: IconCheck, bg: 'var(--mantine-color-green-0)' },
    aviso: { color: 'orange', icon: IconSpeakerphone, bg: 'var(--mantine-color-orange-0)' },
  };
  const { color, icon: Icon, bg } = configs[aviso.tipo] || configs.info;
  return (
    <Center h="100%" bg={bg} style={{ borderRadius: 16, padding: 32 }}>
      <Stack align="center" gap="xl" style={{ maxWidth: '80%' }}>
        <ThemeIcon size={120} radius="100%" color={color} variant="filled"><Icon size={70} /></ThemeIcon>
        <Title order={1} size="4rem" ta="center" c="dark" style={{ lineHeight: 1.1 }}>{aviso.titulo}</Title>
        {aviso.mensagem && <Text size="2.5rem" ta="center" c="dimmed" style={{ lineHeight: 1.3 }}>{aviso.mensagem}</Text>}
      </Stack>
    </Center>
  );
}

function SlideApresentacao({ url, pagina }: { url: string, pagina: number }) {
    const isImg = url.match(/\.(jpeg|jpg|gif|png)$/i) != null;
    if (isImg) {
        return (
            <Center h="100%" bg="black" style={{ overflow: 'hidden' }}>
                <Image src={url} fit="contain" h="100%" w="100%" />
            </Center>
        );
    }
    return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Document 
                file={url} 
                loading={<Loader color="white" />}
                error={<Text c="red">Erro ao carregar PDF.</Text>}
            >
                <Page 
                    pageNumber={pagina} 
                    renderTextLayer={false} 
                    renderAnnotationLayer={false}
                    height={window.innerHeight}
                    className="pdf-page-canvas"
                />
            </Document>
            <style>{` .react-pdf__Page__canvas { margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.5); } `}</style>
        </div>
    );
}

function SlideFactory({ dias }: { dias: FactoryDayRow[] }) {
  if (!dias.length) return <Center h="100%"><Text c="dimmed">Sem dados recentes.</Text></Center>;
  return (
    <Stack gap="md" h="100%">
      <Group justify="space-between"><Title order={3}>Produção Diária (Últimos 14 dias)</Title><Group><Badge size="lg" variant="dot" color="orange">Dia Útil</Badge><Badge size="lg" variant="dot" color="blue">Sábado</Badge></Group></Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dias} margin={{ top: 30, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 14 }} tickMargin={10} />
            <YAxis hide /> <ReTooltip content={<FactoryTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }}/>
            <Bar dataKey="produzido" radius={[6, 6, 0, 0]} isAnimationActive={true}>
                {dias.map((d, i) => <Cell key={i} fill={(d.meta > 0 && d.produzido >= d.meta) ? '#16a34a' : (d.isSaturday ? '#3b82f6' : '#f97316')} />)}
                <LabelList dataKey="produzido" content={<FactoryBarLabel />} />
            </Bar>
            <Line type="monotone" dataKey="meta" stroke="#1f2937" strokeDasharray="5 5" dot={false} strokeWidth={3} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <SimpleGrid cols={Math.min(dias.length, 7)} spacing="sm">{dias.slice(-7).map((d) => (<Card key={d.iso} padding="sm" radius="md" withBorder style={{ borderTop: `4px solid var(--mantine-color-${perfColor(d.pct)}-filled)` }}><Stack gap={2} align="center"><Text size="sm" fw={700} c="dimmed">{d.label}</Text><Text size="xl" fw={800}>{d.produzido.toFixed(0)}h</Text><Badge variant="light" size="sm" color={perfColor(d.pct)}>{d.pct.toFixed(0)}%</Badge></Stack></Card>))}</SimpleGrid>
    </Stack>
  );
}

function SlideMaquinas({ page, isFuture }: { page: CentroPerf[]; isFuture: boolean }) {
  if (!page.length) return <Center h="100%"><Text c="dimmed">Nenhuma máquina.</Text></Center>;
  return (
    <Stack gap="md" h="100%">
      <Title order={2}>Performance por Máquina • Visão do Dia</Title>
      <SimpleGrid cols={3} spacing="lg" verticalSpacing="lg" style={{ flex: 1 }}>
        {page.map((c) => {
          const pctEsperado = c.esperado_dia > 0 ? (c.real_dia / c.esperado_dia) * 100 : 0;
          const cor = perfColor(c.ader_dia);
          return (
            <Card key={c.centro_id} withBorder radius="lg" padding="lg" style={{ display: 'flex', flexDirection: 'column' }}>
              <Stack gap="md" h="100%">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={0}>
                      <Group gap={4}><Text fw={900} size="xl" style={{ fontSize: '1.6rem' }}>{c.codigo}</Text>{c.is_parent && <IconArrowMerge size={22} color="gray" />}{c.pinned && <IconPin size={22} color="gray" />}</Group>
                      {c.is_stale && <Badge variant="filled" color="orange" size="sm" leftSection={<IconAlertTriangle size={12} />}>Dados de {c.last_ref_time}</Badge>}
                  </Stack>
                  {isFuture ? <Badge variant="light" color="gray" size="lg">FUTURO</Badge> : <Badge color={cor} variant="filled" size="xl">{c.ader_dia == null ? '-' : `${formatNum(c.ader_dia, 0)}%`}</Badge>}
                </Group>
                <Group gap="md" align="center" style={{ flex: 1 }} wrap="nowrap">
                  <RingProgress size={130} thickness={14} roundCaps sections={[{ value: clamp(c.ader_dia ?? 0), color: perfColor(c.ader_dia) }]} label={<Text ta="center" size="md" fw={900} c={cor}>{c.ader_dia ? `${c.ader_dia.toFixed(0)}%` : '-'}</Text>} />
                  <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" c="dimmed" fw={700} tt="uppercase">Produzido</Text>
                      <Text fw={900} style={{ fontSize: '2.8rem', lineHeight: 1, color: '#1f2937' }}>{formatNum(c.real_dia)}h</Text>
                      <Stack gap={0} mt={4}><Text size="sm" c="dimmed">Esperado: <b>{formatNum(c.esperado_dia)}h</b></Text><Text size="sm" c="dimmed">Meta Dia: <b>{formatNum(c.meta_dia)}h</b></Text></Stack>
                  </Stack>
                  {c.is_parent && (
                    <>
                      <Divider orientation="vertical" mx={2} style={{ height: 100 }} />
                      <Stack gap={2} style={{ flex: 1, height: 130, overflow: 'hidden' }}>
                          <Text size="xs" c="dimmed" fw={700}>DETALHE:</Text>
                          <ScrollArea h="100%" type="never" offsetScrollbars>
                            <Stack gap={4}>{c.contribuintes.map((child, idx) => (<Group key={idx} justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid #f8f9fa', paddingBottom: 2 }}><Text size="xs" fw={600} truncate title={child.codigo} style={{maxWidth: 90}}>{child.codigo}</Text><Group gap={4}>{child.is_stale && <IconClock size={12} color="orange" />}<Text size="xs" fw={700}>{child.real.toFixed(1)}</Text></Group></Group>))}</Stack>
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
  useEffect(() => { const i = setInterval(() => setShowCompany(p => !p), 1500); return () => clearInterval(i); }, []);
  return (
    <Center style={{ height: '100%', width: '100%', background: 'white', borderRadius: 16 }}>
       <div style={{ width: '80%', height: '60%', position: 'relative', maxWidth: 800 }}>
          <Transition mounted={!showCompany} transition="scale" duration={800} timingFunction="ease">{(styles) => (<div style={{ ...styles, position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><Image src="/logos/melhoria-continua.png" fit="contain" h={700} w="auto" fallbackSrc="https://placehold.co/800x600?text=Departamento" /><Text size="2rem" fw={900} mt="xl" c="dimmed" style={{ letterSpacing: 2 }}>A CADA DIA, UM POUCO MELHOR</Text></div>)}</Transition>
          <Transition mounted={showCompany} transition="scale" duration={800} timingFunction="ease">{(styles) => (<div style={{ ...styles, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Image src="/logos/spirax-sarco.png" fit="contain" h={700} w="auto" fallbackSrc="https://placehold.co/800x600?text=Spirax+Sarco" /></div>)}</Transition>
       </div>
    </Center>
  );
}