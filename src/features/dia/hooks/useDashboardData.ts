import { useEffect, useMemo, useState } from 'react';
import { useEmpresaId } from '../../../contexts/TenantContext';
import { fracDiaLogico } from '../../../utils/time';
import {
    fetchMetasAtuais,
    fetchTotaisAtivosPorDia,
    fetchCentrosSmart,
    type VMetaAtual,
    type VTtotalAtivo,
} from '../../../services/db';
import type { LinhaCentro, CentroFull, FabricaData } from '../types';
import {
    isPastLocalDay,
    isSameLocalDay,
    parseLocalDateString,
    toISO,
    isCentroAtivoNoDia
} from '../utils';

export function useDashboardData() {
    const empresaId = useEmpresaId();

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

    useEffect(() => {
        (async () => {
            try {
                const [m, c] = await Promise.all([
                    fetchMetasAtuais(empresaId),
                    fetchCentrosSmart(empresaId)
                ]);
                setMetas(m);
                setCentros(c as CentroFull[]);
            } catch (e) {
                console.error(e);
            }
        })();
    }, [empresaId]);

    useEffect(() => {
        if (dataWip) return;
        const now = new Date();
        const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        setDataWip(todayLocal);
    }, [dataWip]);

    useEffect(() => {
        (async () => {
            if (!dataWip) return;
            setLoading(true);
            try {
                const iso = toISO(new Date(dataWip.getFullYear(), dataWip.getMonth(), dataWip.getDate()));
                const t = await fetchTotaisAtivosPorDia(empresaId, iso);
                setTotais(t);
            } catch (e) {
                console.error(e); setTotais([]);
            } finally { setLoading(false); }
        })();
    }, [dataWip?.getTime(), empresaId]);

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
    const fabrica: FabricaData = useMemo(() => {
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
        const gapEod = +(projEod - meta).toFixed(2);

        return {
            produzido_h: +prod.toFixed(2),
            meta_h: +meta.toFixed(2),
            esperado_h: +esperado.toFixed(2),
            aderencia_pct: aderenciaPct !== null ? +aderenciaPct.toFixed(2) : null,
            projEod_h: +projEod.toFixed(2),
            gapEod_h: gapEod,
        };
    }, [linhas, isFuture, isPast, frac, centros]);

    return {
        hora,
        setHora,
        dataWip,
        handleDataWipChange,
        scope,
        setScope,
        loading,
        linhas,
        fabrica,
        isPast,
        isFuture,
        parseLocalDateString
    };
}
