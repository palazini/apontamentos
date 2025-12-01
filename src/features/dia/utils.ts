import type { CentroFull } from './types';

export function colorFor(pct: number): 'red' | 'yellow' | 'green' {
    if (pct < 80) return 'red';
    if (pct <= 100) return 'yellow';
    return 'green';
}

export function clamp(v: number, min = 0, max = 200) { return Math.max(min, Math.min(max, v)); }

export function toISO(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function parseLocalDateString(input: string | null | undefined): Date | null {
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

export function ymd(d: Date) { return [d.getFullYear(), d.getMonth(), d.getDate()] as const; }

export function isSameLocalDay(a: Date, b: Date) {
    const [ay, am, ad] = ymd(a); const [by, bm, bd] = ymd(b);
    return ay === by && am === bm && ad === bd;
}

export function isPastLocalDay(d: Date) {
    const today = new Date();
    const [y, m, day] = ymd(d);
    const [ty, tm, td] = ymd(today);
    if (y < ty) return true;
    if (y > ty) return false;
    if (m < tm) return true;
    if (m > tm) return false;
    return day < td;
}

export function isCentroAtivoNoDia(c: CentroFull, dataWip: Date): boolean {
    if (c.ativo === false) return false;

    if (c.desativado_desde) {
        const d = parseLocalDateString(c.desativado_desde);
        if (d && !Number.isNaN(d.getTime())) {
            return dataWip.getTime() < new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        }
    }
    return true;
}
