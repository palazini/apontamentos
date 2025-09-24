// fração do dia lógico: 05:30 -> 00:44 (+1 dia)
export function fracDiaLogico(hhmm: string) {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMin('05:30');
  const end   = 24 * 60 + 44; // 1484
  const cur   = toMin(hhmm);
  if (cur < start) return 0;
  if (cur >= end)  return 1;
  return (cur - start) / (end - start);
}
