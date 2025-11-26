import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchFuncionariosMeta,
  fetchFuncionariosDia,
  fetchFuncionariosMes,
  upsertFuncionarioMeta,
} from '../../services/db';

/* ==========================
   Tipos locais
========================== */
type FuncionarioMeta = {
  id?: number;
  matricula: string;
  nome: string;
  meta_diaria_horas: number;
  ativo: boolean;
};

type FuncionarioDia = {
  data_wip: string;
  matricula: string;
  produzido_h: number;
};

type FuncionarioMes = {
  ano_mes: string;
  matricula: string;
  produzido_h: number;
};

type LinhaUI = FuncionarioMeta & {
  meta_acumulada: number;
  meta_mensal: number;
  real_dia: number;
  real_mes: number;
  perf_dia: number | null;
  perf_mes: number | null;
};

/* ==========================
   Helpers de data/número
========================== */
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEnd(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function dateToISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ymKeyFromDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function monthToAnoMesISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

// mesmo parse que você usa no UploadPage
function parseLocalDateString(input: string | null | undefined): Date | null {
  if (!input) return null;
  let s = input.trim();

  const t = s.indexOf('T');
  if (t >= 0) s = s.slice(0, t);

  let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/); // dd/mm/yyyy
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // yyyy-mm-dd
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  return null;
}

// só pra default de dias úteis
function businessDaysInMonth(year: number, monthZeroBased: number) {
  const first = new Date(year, monthZeroBased, 1);
  const last = new Date(year, monthZeroBased + 1, 0);
  let count = 0;
  for (let d = first.getDate(); d <= last.getDate(); d += 1) {
    const wd = new Date(year, monthZeroBased, d).getDay();
    if (wd >= 1 && wd <= 5) count += 1; // seg–sex
  }
  return count;
}

/* ==========================
   Persistência local (localStorage)
========================== */
const STORAGE_KEY = 'func_meta_params_v1';

type MesParams = {
  diasCorridos: number;
  diasUteisMes: number;
};

type MesParamsMap = {
  [ym: string]: MesParams;
};

function loadMonthParams(refDate: Date): MesParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as MesParamsMap;
    return map[ymKeyFromDate(refDate)] ?? null;
  } catch {
    return null;
  }
}

function saveMonthParams(refDate: Date, diasCorridos: number, diasUteisMes: number) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const map: MesParamsMap = raw ? JSON.parse(raw) : {};
    map[ymKeyFromDate(refDate)] = {
      diasCorridos,
      diasUteisMes,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // falha silenciosa; não quebra a tela se o storage der erro
  }
}

/* ==========================
   Página
========================== */
export default function FuncionariosMetaPage() {
  const today = startOfDayLocal(new Date());

  const [mesRef, setMesRef] = useState<Date>(() => monthStart(today));
  const [diaRef, setDiaRef] = useState<Date>(() => today);

  // carrega valores já ajustados para o mês atual (se existirem)
  const [diasCorridos, setDiasCorridos] = useState<number>(() => {
    const persisted = loadMonthParams(monthStart(today));
    return persisted?.diasCorridos ?? today.getDate();
  });

  const [diasUteisMes, setDiasUteisMes] = useState<number>(() => {
    const persisted = loadMonthParams(monthStart(today));
    return (
      persisted?.diasUteisMes ??
      businessDaysInMonth(today.getFullYear(), today.getMonth())
    );
  });

  const [metas, setMetas] = useState<FuncionarioMeta[]>([]);
  const [dadosDia, setDadosDia] = useState<FuncionarioDia[]>([]);
  const [dadosMes, setDadosMes] = useState<FuncionarioMes[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // modal de edição/criação
  const [editState, setEditState] = useState<{
    id?: number;
    matricula: string;
    nome: string;
    meta_diaria_horas: number;
    ativo: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const abrirNovo = () => {
    setEditState({
      matricula: '',
      nome: '',
      meta_diaria_horas: 8,
      ativo: true,
    });
  };

  const abrirEditar = (f: FuncionarioMeta) => {
    setEditState({
      id: f.id,
      matricula: f.matricula,
      nome: f.nome,
      meta_diaria_horas: Number(f.meta_diaria_horas) || 0,
      ativo: f.ativo,
    });
  };

  const fecharModal = () => {
    if (saving) return;
    setEditState(null);
  };

  const handleSalvar = async () => {
    if (!editState) return;
    if (!editState.matricula.trim() || !editState.nome.trim()) return;

    setSaving(true);
    try {
      await upsertFuncionarioMeta({
        id: editState.id,
        matricula: editState.matricula.trim(),
        nome: editState.nome.trim(),
        meta_diaria_horas: Number(editState.meta_diaria_horas) || 0,
        ativo: editState.ativo,
      });
      // recarrega lista
      await carregarDados();
      setEditState(null);
    } catch (e) {
      console.error(e);
      // aqui você pode plugar uma notification se quiser
    } finally {
      setSaving(false);
    }
  };

  /* -------- fetch principal -------- */
  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [metasResp, diaResp, mesResp] = await Promise.all([
        fetchFuncionariosMeta(),
        fetchFuncionariosDia(dateToISO(diaRef)),
        fetchFuncionariosMes(monthToAnoMesISO(mesRef)),
      ]);

      setMetas(
        (metasResp ?? []).map((m: any) => ({
          id: m.id,
          matricula: m.matricula,
          nome: m.nome,
          meta_diaria_horas: Number(m.meta_diaria_horas) || 0,
          ativo: Boolean(m.ativo),
        }))
      );
      setDadosDia(
        (diaResp ?? []).map((r: any) => ({
          data_wip: r.data_wip,
          matricula: r.matricula,
          produzido_h: Number(r.produzido_h) || 0,
        }))
      );
      setDadosMes(
        (mesResp ?? []).map((r: any) => ({
          ano_mes: r.ano_mes,
          matricula: r.matricula,
          produzido_h: Number(r.produzido_h) || 0,
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [mesRef, diaRef]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // sempre que mês de referência / diasCorridos / diasUteis mudar, persiste para aquele mês
  useEffect(() => {
    saveMonthParams(mesRef, diasCorridos, diasUteisMes);
  }, [mesRef, diasCorridos, diasUteisMes]);

  /* -------- montagem das linhas -------- */
  const linhas: LinhaUI[] = useMemo(() => {
    if (!metas.length) return [];

    const mapDia = new Map<string, number>();
    dadosDia.forEach((r) => {
      mapDia.set(r.matricula, (mapDia.get(r.matricula) ?? 0) + r.produzido_h);
    });

    const mapMes = new Map<string, number>();
    dadosMes.forEach((r) => {
      mapMes.set(r.matricula, (mapMes.get(r.matricula) ?? 0) + r.produzido_h);
    });

    return metas.map((f) => {
      const metaDia = Number(f.meta_diaria_horas) || 0;
      const realDia = mapDia.get(f.matricula) ?? 0;
      const realMes = mapMes.get(f.matricula) ?? 0;

      const metaAcum = metaDia * (diasCorridos || 0);
      const metaMensal = metaDia * (diasUteisMes || 0);

      const perfDia = metaDia > 0 ? (realDia / metaDia) * 100 : null;
      const perfMes = metaMensal > 0 ? (realMes / metaMensal) * 100 : null;

      return {
        ...f,
        meta_acumulada: metaAcum,
        meta_mensal: metaMensal,
        real_dia: realDia,
        real_mes: realMes,
        perf_dia: perfDia,
        perf_mes: perfMes,
      };
    });
  }, [metas, dadosDia, dadosMes, diasCorridos, diasUteisMes]);

  // ====== TOTAIS ======
  const totalMetaDiaria = useMemo(
    () => linhas.reduce((s, l) => s + l.meta_diaria_horas, 0),
    [linhas]
  );

  const totalMetaAcumulada = useMemo(
    () => linhas.reduce((s, l) => s + l.meta_acumulada, 0),
    [linhas]
  );

  const totalMetaMensal = useMemo(
    () => linhas.reduce((s, l) => s + l.meta_mensal, 0),
    [linhas]
  );

  const totalRealDia = useMemo(
    () => linhas.reduce((s, l) => s + l.real_dia, 0),
    [linhas]
  );

  const totalRealMensal = useMemo(
    () => linhas.reduce((s, l) => s + l.real_mes, 0),
    [linhas]
  );

  const perfDiaGlobal = useMemo(() => {
    if (totalMetaDiaria <= 0) return null;
    const v = (totalRealDia / totalMetaDiaria) * 100;
    return Number.isFinite(v) ? v : null;
  }, [totalMetaDiaria, totalRealDia]);

  const perfMesGlobal = useMemo(() => {
    if (totalMetaMensal <= 0) return null;
    const v = (totalRealMensal / totalMetaMensal) * 100;
    return Number.isFinite(v) ? v : null;
  }, [totalMetaMensal, totalRealMensal]);

  /* -------- helpers de UI -------- */
  const formatNum = (v: number, dec = 2) =>
    Number.isFinite(v) ? v.toFixed(dec) : '-';

  const perfColor = (p: number | null) => {
    if (p == null || !Number.isFinite(p)) return undefined;
    if (p < 80) return 'red';
    if (p <= 100) return 'yellow.7';
    return 'green';
  };

  const handleMesChange = (value: unknown) => {
    if (!value) return;
    let d: Date | null = null;

    if (value instanceof Date) d = value;
    else if (typeof value === 'string') d = parseLocalDateString(value);
    else if ((value as any)?.toDate instanceof Function) d = (value as any).toDate();

    if (!d || Number.isNaN(d.getTime())) return;

    const mStart = monthStart(d);
    const mEnd = monthEnd(mStart);

    // ajusta dia de referência para dentro do mês novo
    let novoDia = diaRef;
    if (novoDia < mStart || novoDia > mEnd) {
      novoDia = mStart;
    }

    setMesRef(mStart);
    setDiaRef(novoDia);

    const persisted = loadMonthParams(mStart);
    if (persisted) {
      setDiasCorridos(persisted.diasCorridos);
      setDiasUteisMes(persisted.diasUteisMes);
    } else {
      setDiasCorridos(novoDia.getDate());
      setDiasUteisMes(
        businessDaysInMonth(mStart.getFullYear(), mStart.getMonth())
      );
    }
  };

  const handleDiaChange = (value: unknown) => {
    if (!value) return;
    let d: Date | null = null;

    if (value instanceof Date) d = value;
    else if (typeof value === 'string') d = parseLocalDateString(value);
    else if ((value as any)?.toDate instanceof Function) d = (value as any).toDate();

    if (!d || Number.isNaN(d.getTime())) return;

    const normalized = startOfDayLocal(d);

    // força ficar dentro do mês de referência
    const mStart = monthStart(mesRef);
    const mEnd = monthEnd(mesRef);
    if (normalized < mStart) {
      setDiaRef(mStart);
      setDiasCorridos(mStart.getDate());
    } else if (normalized > mEnd) {
      setDiaRef(mEnd);
      setDiasCorridos(mEnd.getDate());
    } else {
      setDiaRef(normalized);
      setDiasCorridos(normalized.getDate());
    }
  };

  /* ==========================
     Render
  ========================== */
  return (
    <div style={{ padding: '24px 32px' }}>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>Performance por colaborador</Title>
          <Text c="dimmed" size="sm">
            Para cada matrícula, comparamos a produção real com a meta diária
            definida.
          </Text>
        </div>

        <Group gap="xs" align="center">
          <Badge variant="outline">
            Meta total mês: {formatNum(totalMetaMensal)} h
          </Badge>
          <Badge variant="outline" color="blue">
            Real total mês: {formatNum(totalRealMensal)} h
          </Badge>
        </Group>
      </Group>

      {/* Filtros / parâmetros */}
      <Card withBorder shadow="sm" radius="lg" p="lg" mb="lg">
        <Group gap="lg" align="flex-end" wrap="wrap">
          <DateInput
            label="Mês de referência"
            value={mesRef}
            onChange={handleMesChange}
            valueFormat="MM/YYYY"
            dateParser={(input) => parseLocalDateString(input) ?? new Date()}
            size="sm"
          />

          <DateInput
            label="Dia para análise diária"
            value={diaRef}
            onChange={handleDiaChange}
            valueFormat="DD/MM/YYYY"
            locale="pt-BR"
            size="sm"
            minDate={monthStart(mesRef)}
            maxDate={monthEnd(mesRef)}
          />

          <NumberInput
            label="Dias corridos no mês"
            value={diasCorridos}
            onChange={(v) => setDiasCorridos(Number(v) || 0)}
            min={0}
            step={1}
            size="sm"
          />

          <NumberInput
            label="Dias úteis no mês"
            value={diasUteisMes}
            onChange={(v) => setDiasUteisMes(Number(v) || 0)}
            min={0}
            step={1}
            size="sm"
          />

          <Button size="sm" onClick={carregarDados} variant="filled">
            Recarregar
          </Button>

          <Button
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={abrirNovo}
            variant="light"
          >
            Novo colaborador
          </Button>
        </Group>

        <Text c="dimmed" size="xs" mt="xs">
          Meta acumulada = meta diária × dias corridos. Meta mensal = meta
          diária × dias úteis. Esses parâmetros são salvos por mês neste
          navegador.
        </Text>
      </Card>

      {/* Tabela principal */}
      <Card withBorder shadow="sm" radius="lg" p="lg">
        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : !linhas.length ? (
          <Text c="dimmed">Nenhum colaborador cadastrado ainda.</Text>
        ) : (
          <Table
            highlightOnHover
            withTableBorder
            stickyHeader
            verticalSpacing="xs"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Matrícula</Table.Th>
                <Table.Th>Nome</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>
                  Meta diária (h)
                </Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>
                  Meta acumulada (h)
                </Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>
                  Meta mensal (h)
                </Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>
                  Real dia (h)
                </Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>
                  Real mês (h)
                </Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>
                  Perf. diária (%)
                </Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>
                  Perf. mensal (%)
                </Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th style={{ width: 48 }} />
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {linhas.map((l) => (
                <Table.Tr key={l.matricula}>
                  <Table.Td>{l.matricula}</Table.Td>
                  <Table.Td>{l.nome}</Table.Td>

                  <Table.Td style={{ textAlign: 'right' }}>
                    {formatNum(l.meta_diaria_horas)}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    {formatNum(l.meta_acumulada)}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    {formatNum(l.meta_mensal)}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    {formatNum(l.real_dia)}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    {formatNum(l.real_mes)}
                  </Table.Td>

                  <Table.Td style={{ textAlign: 'right' }}>
                    {l.perf_dia == null ? (
                      '-'
                    ) : (
                      <Text c={perfColor(l.perf_dia)} fw={600}>
                        {formatNum(l.perf_dia)}%
                      </Text>
                    )}
                  </Table.Td>

                  <Table.Td style={{ textAlign: 'right' }}>
                    {l.perf_mes == null ? (
                      '-'
                    ) : (
                      <Text c={perfColor(l.perf_mes)} fw={600}>
                        {formatNum(l.perf_mes)}%
                      </Text>
                    )}
                  </Table.Td>

                  <Table.Td>
                    {l.ativo ? (
                      <Badge color="green" variant="light" radius="sm">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge color="gray" variant="light" radius="sm">
                        Inativo
                      </Badge>
                    )}
                  </Table.Td>

                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Editar"
                      onClick={() => abrirEditar(l)}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>

            {/* ===== Rodapé com totais ===== */}
            <Table.Tfoot>
              <Table.Tr
                style={{
                  backgroundColor: 'var(--mantine-color-gray-0)', // fundo levemente cinza
                  fontWeight: 600,                                // deixa o texto mais forte
                  borderTop: '2px solid var(--mantine-color-gray-3)', // separador mais marcado
                }}
              >
                <Table.Td>
                  <Text fw={700}>Totais</Text>
                </Table.Td>
                <Table.Td />
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text fw={600}>{formatNum(totalMetaDiaria)}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text fw={600}>{formatNum(totalMetaAcumulada)}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text fw={600}>{formatNum(totalMetaMensal)}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text fw={600}>{formatNum(totalRealDia)}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text fw={600}>{formatNum(totalRealMensal)}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {perfDiaGlobal == null ? (
                    '-'
                  ) : (
                    <Text c={perfColor(perfDiaGlobal)} fw={700}>
                      {formatNum(perfDiaGlobal)}%
                    </Text>
                  )}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {perfMesGlobal == null ? (
                    '-'
                  ) : (
                    <Text c={perfColor(perfMesGlobal)} fw={700}>
                      {formatNum(perfMesGlobal)}%
                    </Text>
                  )}
                </Table.Td>
                <Table.Td />
                <Table.Td />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        )}
      </Card>

      {/* Modal de edição/criação */}
      <Modal
        opened={!!editState}
        onClose={fecharModal}
        title={editState?.id ? 'Editar colaborador' : 'Novo colaborador'}
        centered
      >
        {editState && (
          <Stack gap="sm">
            <TextInput
              label="Matrícula"
              value={editState.matricula}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEditState((prev) =>
                  prev ? { ...prev, matricula: value } : prev
                );
              }}
              placeholder="Ex.: 1234"
            />
            <TextInput
              label="Nome"
              value={editState.nome}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEditState((prev) =>
                  prev ? { ...prev, nome: value } : prev
                );
              }}
              placeholder="Nome completo"
            />
            <NumberInput
              label="Meta diária (h)"
              value={editState.meta_diaria_horas}
              onChange={(v) =>
                setEditState((prev) =>
                  prev
                    ? { ...prev, meta_diaria_horas: Number(v) || 0 }
                    : prev
                )
              }
              min={0}
              step={0.25}
            />
            <Switch
              label="Ativo"
              checked={editState.ativo}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setEditState((prev) =>
                  prev ? { ...prev, ativo: checked } : prev
                );
              }}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={fecharModal} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSalvar} loading={saving}>
                Salvar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
