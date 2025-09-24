export function parsePtBrNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return null;
  // trata "1.234,56" -> "1234.56"
  s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCategoriaToCandidates(catRaw: string): string[] {
  if (!catRaw) return [];
  let s = catRaw.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const upper = s.toUpperCase();

  // CE-TH* => TH-01G (fallback adicional, além do alias no banco)
  if (/^CE[-\s]?TH(\b|$)/.test(upper)) return []; // ignorar CE-TH (sem meta)
  // CE-FT* => ignorar (sem meta)
  if (/^CE[-\s]?FT(\b|$)/.test(upper)) return [];

  // remove prefixo CE-
  let u = upper.replace(/^CE[-\s]/, '');
  // normaliza hifens/espaços
  u = u.replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');

  // Casos "verbais"
  const specials: Record<string, string> = {
    'JATO': 'Jato',
    'PINT': 'Pintura',
    'ESTAÇ': 'MTG ESTAÇÃO',
    'ESTAC': 'MTG ESTAÇÃO',
    'ESTAÇÃO': 'MTG ESTAÇÃO',
    'MTG-ESTAÇÃO': 'MTG ESTAÇÃO',
  };
  if (specials[u]) return [specials[u]];

  const cands: string[] = [];
  const m = u.match(/^([A-Z]+)-?(\d+)$/);
  if (m) {
    const letters = m[1], digits = m[2];
    cands.push(`${letters}-${digits}`);
    if (digits.length === 1) cands.push(`${letters}-0${digits}`);
    if (digits.length === 2 && digits.startsWith('0')) cands.push(`${letters}-${digits.slice(1)}`);
  } else {
    cands.push(u);                    // ex.: "TP-21", "CH-02"
    cands.push(u.toLowerCase());     // redundância defensiva
  }
  // dedup
  return Array.from(new Set(cands.map(x => x.replace(/\s+/g, ' ').trim())));
}

// Excel serial -> ISO date (yyyy-mm-dd)
export function excelSerialToISODate(serial: number): string {
  // Excel epoch 1899-12-30
  const ms = (serial - 25569) * 86400 * 1000; // 25569 = days from 1970-01-01 to 1899-12-30
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
