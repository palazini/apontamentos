/* ========= Debug & Time Helpers ========= */
export function getNow() {
    const debugDate = localStorage.getItem('TV_DEBUG_DATE');
    if (debugDate) {
        const d = new Date(debugDate);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
}

export function startOfDayLocal(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function toISO(d: Date) { return d.toISOString().split('T')[0]; }
export function isoToLocalDate(iso: string) { const parts = iso.split('-'); return new Date(+parts[0], +parts[1] - 1, +parts[2]); }
export function addDays(d: Date, delta: number) { const nd = new Date(d); nd.setDate(d.getDate() + delta); return startOfDayLocal(nd); }

export function daysBetween(a: Date, b: Date): string[] {
    const res: string[] = [];
    const start = startOfDayLocal(a);
    const end = startOfDayLocal(b);
    for (let d = start; d <= end; d = addDays(d, 1)) res.push(toISO(d));
    return res;
}

export function isSundayISO(iso: string) { return isoToLocalDate(iso).getDay() === 0; }
export function isSaturdayISO(iso: string) { return isoToLocalDate(iso).getDay() === 6; }

export function countDaysExcludingSundays(start: Date, end: Date) {
    let count = 0;
    for (let d = startOfDayLocal(start); d <= end; d = addDays(d, 1)) {
        if (d.getDay() !== 0) count += 1;
    }
    return count;
}

export function shortBR(iso: string) {
    const d = isoToLocalDate(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function parseLocalDateString(input: string | null | undefined): Date | null {
    if (!input) return null;
    let s = input.trim().split('T')[0];
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
}

export function isCentroAtivoNoDia(c: any, dataWip: Date): boolean {
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

export function extractTime(isoOrDate: string | Date | null): string {
    if (!isoOrDate) return '00:00';
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    if (Number.isNaN(d.getTime())) return '00:00';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ========= UI Helpers ========= */
export const formatNum = (v: number, dec = 2) => Number.isFinite(v) ? v.toFixed(dec) : '-';
export const perfColor = (p: number | null | undefined) => {
    if (p == null || !Number.isFinite(p)) return 'gray';
    if (p < 80) return 'red';
    if (p <= 100) return 'yellow.7';
    return 'green';
};
export function clamp(v: number, min = 0, max = 200) { return Math.max(min, Math.min(max, v)); }
export function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
