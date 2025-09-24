import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { parsePtBrNumber, normalizeCategoriaToCandidates, excelSerialToISODate } from '../../utils/normalization';
import * as XLSX from 'xlsx';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { Title, Card, Grid, Text, Table, Group, Button, Badge, Divider } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { fetchUploadsPorDia, setUploadAtivo, fetchUltimoDiaComDados, type VUploadDia } from '../../services/db';

type Centro = { id: number; codigo: string };
type Alias = { alias_texto: string; centro_id: number };

type ParsedRow = {
  data_wip: string;           // 'YYYY-MM-DD'
  categoria_raw: string;
  centro_id: number | null;   // null => sem meta (ignorar)
  aliquota_horas: number;
  tipo_raw?: string | null;
};

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function detectCol(columns: string[], targets: string[]): string | null {
  const lowered = columns.map((c) => c.toLowerCase().trim());
  // match exato
  for (const t of targets) {
    const i = lowered.findIndex((c) => c === t.toLowerCase());
    if (i >= 0) return columns[i];
  }
  // match contém
  for (const t of targets) {
    const i = lowered.findIndex((c) => c.includes(t.toLowerCase()));
    if (i >= 0) return columns[i];
  }
  return null;
}

function parseWipISO(input: unknown): string | null {
  if (input == null) return null;

  // Excel serial
  if (typeof input === 'number') return excelSerialToISODate(input);

  const s = String(input).trim();

  // dd/mm/yyyy [hh:mm[:ss]]
  const m1 = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/);
  if (m1) {
    const [, dd, mm, yyyy] = m1;
    return `${yyyy}-${mm}-${dd}`;
  }

  // yyyy-mm-dd[ T]hh:mm[:ss]
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?/);
  if (m2) {
    const [, yyyy, mm, dd] = m2;
    return `${yyyy}-${mm}-${dd}`;
  }

  // fallback: Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function parseLocalDateString(input: string | null | undefined): Date | null {
  if (!input) return null;
  let s = input.trim();

  // se vier "YYYY-MM-DDTHH:mm:ssZ" corta a parte de tempo/fuso
  const t = s.indexOf('T');
  if (t >= 0) s = s.slice(0, t);

  // DD/MM/YYYY ou DD-MM-YYYY
  let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  return null; // não tenta Date.parse para evitar shift por UTC
}

export default function UploadPage() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [dia, setDia] = useState<Date | null>(null);
  const [uploadsDia, setUploadsDia] = useState<VUploadDia[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const nav = useNavigate();

  function dateToISO(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  function toLocalBR(dt: string | Date) {
    const d = new Date(dt);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
  }

  const refetchUploads = useCallback(async (d: Date) => {
    setLoadingUploads(true);
    setUploadsDia([]);
    try {
      const iso = dateToISO(d);
      const rows = await fetchUploadsPorDia(iso);
      setUploadsDia(rows);
    } finally {
      setLoadingUploads(false);
    }
  }, []);

  // >>> FIX 1: handler robusto para o DateInput (aceita Date, string, dayjs)
  const handleDiaChange = (value: unknown) => {
    if (!value) {
      setDia(null);
      setUploadsDia([]);
      setLoadingUploads(false);
      return;
    }

    let d: Date | null = null;

    if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'string') {
      d = parseLocalDateString(value);
    } else if ((value as any)?.toDate instanceof Function) {
      d = (value as any).toDate(); // dayjs/date-fns compat
    }

    if (!d || Number.isNaN(d.getTime())) return;

    // normaliza para 00:00 LOCAL (sem fuso/UTC)
    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    setDia(normalized);
    refetchUploads(normalized);
  };

  const pushLog = (s: string) => setLog((prev) => [...prev, s]);

  // carregar primeiro dia automaticamente (último com dados)
  useEffect(() => {
    (async () => {
      if (dia) return;
      try {
        const last = await fetchUltimoDiaComDados();
        const target = last
          ? new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 1, Number(last.slice(8, 10)))
          : new Date();
        setDia(target);
        await refetchUploads(target);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [dia, refetchUploads]);

  type UploadError = { tipo: 'sheet' | 'header' | 'row' | 'meta' | 'persist'; mensagem: string };

  const readWorkbook = async (file: File) => {
    const data = await file.arrayBuffer();
    return XLSX.read(data, { type: 'array' });
  };

  const fetchCentros = async (): Promise<Centro[]> => {
    const { data, error } = await supabase.from('centro').select('id, codigo');
    if (error) throw error;
    return data ?? [];
  };

  const fetchAlias = async (): Promise<Alias[]> => {
    const { data, error } = await supabase.from('centro_alias').select('alias_texto, centro_id');
    if (error) throw error;
    return data ?? [];
  };

  const carregarMapeamento = async () => {
    const centros = await fetchCentros();
    const alias = await fetchAlias();

    const centrosById = new Map<number, Centro>();
    for (const c of centros) centrosById.set(c.id, c);

    const aliasLista = alias.map((a) => ({
      alias_texto: a.alias_texto.trim().toLowerCase(),
      centro_id: a.centro_id,
    }));

    return { centrosById, aliasLista };
  };

  const carregarMetasDoDia = async (dataISO: string) => {
    const { data, error } = await supabase
      .from('meta_dia')
      .select('centro_id, data_wip')
      .eq('data_wip', dataISO);
    if (error) throw error;
    return data ?? [];
  };

  const salvarMetas = async (rows: ParsedRow[]) => {
    if (!rows.length) return;
    const payload = rows.map((r) => ({
      data_wip: r.data_wip,
      centro_id: r.centro_id,
      aliquota_horas: r.aliquota_horas,
      tipo: r.tipo_raw ?? null,
    }));
    const { error } = await supabase.rpc('importa_meta_upload', { rows: payload });
    if (error) throw error;
  };

  const marcarUpload = async (uploadId: number, dataISO: string) => {
    const { error } = await supabase
      .from('upload_log')
      .update({ ativo: true })
      .eq('id', uploadId);
    if (error) throw error;
    await setUploadAtivo(dataISO, uploadId);
  };

  const persistirUpload = async (
    dataISO: string,
    nomeArquivo: string,
    originalRows: ParsedRow[],
    hashConteudo: string,
  ): Promise<number> => {
    const { data, error } = await supabase
      .from('upload_log')
      .insert({
        data_wip: dataISO,
        nome_arquivo: nomeArquivo,
        linhas: originalRows.length,
        horas_total: originalRows.reduce((acc, curr) => acc + curr.aliquota_horas, 0),
        conteudo_hash: hashConteudo,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data?.id ?? 0;
  };

  const calculaHash = (rows: ParsedRow[]) => {
    const digest = rows
      .map((r) => `${r.data_wip}|${r.centro_id}|${r.aliquota_horas}|${r.tipo_raw ?? ''}`)
      .join('\n');
    let hash = 0;
    for (let i = 0; i < digest.length; i += 1) {
      const chr = digest.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return String(hash);
  };

  const normalizarLinhas = async (
    sheetRows: any[],
    mapping: { centrosById: Map<number, Centro>; aliasLista: Alias[] },
  ) => {
    const headers = Object.keys(sheetRows[0] ?? {}).map((k) => k.trim());
    const colData = detectCol(headers, ['data', 'wip', 'data wip', 'mês', 'mes']);
    const colCategoria = detectCol(headers, ['categoria', 'centro', 'grupo']);
    const colAliquota = detectCol(headers, ['aliquota', 'horas', 'total horas']);
    const colTipo = detectCol(headers, ['tipo', 'origem']);

    if (!colData || !colCategoria || !colAliquota) {
      const missing = [
        !colData ? 'Data WIP' : null,
        !colCategoria ? 'Categoria' : null,
        !colAliquota ? 'Alíquota' : null,
      ]
        .filter(Boolean)
        .join(', ');
      throw { tipo: 'header', mensagem: `Colunas obrigatórias ausentes: ${missing}.` } as UploadError;
    }

    const rows: ParsedRow[] = [];
    const erros: UploadError[] = [];

    for (let idx = 0; idx < sheetRows.length; idx += 1) {
      const raw = sheetRows[idx];
      const dataWip = parseWipISO(raw[colData]);
      if (!dataWip) {
        erros.push({ tipo: 'row', mensagem: `Linha ${idx + 2}: Data WIP inválida (${raw[colData]}).` });
        continue;
      }

      const categoriaRaw = String(raw[colCategoria] ?? '').trim();
      if (!categoriaRaw) {
        erros.push({ tipo: 'row', mensagem: `Linha ${idx + 2}: Categoria vazia.` });
        continue;
      }

      const candidatos = normalizeCategoriaToCandidates(categoriaRaw);
      const alias = mapping.aliasLista.find((a) => candidatos.includes(a.alias_texto));
      if (!alias) {
        erros.push({ tipo: 'meta', mensagem: `Linha ${idx + 2}: Categoria "${categoriaRaw}" sem meta vinculada.` });
        continue;
      }

      const centroId = alias.centro_id ?? null;
      if (centroId == null) {
        erros.push({ tipo: 'meta', mensagem: `Linha ${idx + 2}: Centro ausente no alias.` });
        continue;
      }
      const centro = mapping.centrosById.get(centroId);
      if (!centro) {
        erros.push({ tipo: 'meta', mensagem: `Linha ${idx + 2}: Centro id=${centroId} não encontrado no cadastro.` });
        continue;
      }

      const aliParsed = parsePtBrNumber(raw[colAliquota]);
      if (!isFiniteNumber(aliParsed)) {
        erros.push({ tipo: 'row', mensagem: `Linha ${idx + 2}: Alíquota inválida (${raw[colAliquota]}).` });
        continue;
      }
      // se quiser padronizar 4 casas:
      const aliquota = +aliParsed.toFixed(4);

      const tipoRaw = colTipo ? (String(raw[colTipo] ?? '').trim() || null) : null;

      rows.push({
        data_wip: dataWip,
        categoria_raw: categoriaRaw,
        centro_id: centro.id,
        aliquota_horas: aliquota,
        tipo_raw: tipoRaw,
      });
    }

    if (erros.length) {
      const mensagem = erros.map((e) => e.mensagem).join('\n');
      throw { tipo: 'row', mensagem } as UploadError;
    }

    return rows;
  };

  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setLog([]);

    try {
      const file = files[0];
      pushLog(`Lendo arquivo "${file.name}"...`);
      const wb = await readWorkbook(file);
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        throw { tipo: 'sheet', mensagem: 'Nenhuma planilha encontrada no arquivo.' } as UploadError;
      }

      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (!json.length) {
        throw { tipo: 'sheet', mensagem: 'Planilha vazia.' } as UploadError;
      }

      pushLog('Carregando mapeamentos de centros...');
      const mapping = await carregarMapeamento();

      pushLog('Normalizando linhas...');
      const rows = await normalizarLinhas(json, mapping);
      if (!rows.length) {
        throw { tipo: 'row', mensagem: 'Nenhuma linha válida após normalização.' } as UploadError;
      }

      const dataISO = rows[0].data_wip;
      pushLog(`Detectado WIP=${dataISO}. Validando metas existentes...`);
      const metasExistentes = await carregarMetasDoDia(dataISO);
      if (metasExistentes.length) {
        pushLog(`Encontradas ${metasExistentes.length} metas já cadastradas. Serão substituídas.`);
      }

      const hash = calculaHash(rows);
      pushLog(`Calculando hash: ${hash}`);

      pushLog('Persistindo upload...');
      const uploadId = await persistirUpload(dataISO, file.name, rows, hash);
      pushLog(`Upload cadastrado com id=${uploadId}.`);

      pushLog('Salvando metas...');
      await salvarMetas(rows);

      pushLog('Marcando upload como ativo...');
      await marcarUpload(uploadId, dataISO);

      notifications.show({
        title: 'Upload processado',
        message: `Arquivo "${file.name}" importado com sucesso.`,
        color: 'green',
      });

      if (dia) {
        pushLog('Atualizando lista de uploads do dia...');
        await refetchUploads(dia);
      }
    } catch (err: any) {
      console.error(err);
      const tipo = (err?.tipo as UploadError['tipo']) ?? 'persist';
      const mensagem = err?.mensagem ?? err?.message ?? 'Erro desconhecido ao processar o upload.';
      pushLog(`Erro (${tipo}): ${mensagem}`);
      notifications.show({
        title: 'Falha no upload',
        message: mensagem,
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  }, [dia, refetchUploads]);

  return (
    <div style={{ padding: '24px 32px' }}>
      <Title order={2} mb="sm">Metas - Upload</Title>
      <Text c="dimmed" mb="lg">
        Envie o .xlsx (início, parcial, semana ou dia completo). Somamos <b>Alíquotas</b> (inclui estornos),
        mapeamos <b>Categoria → Centro</b> e marcamos o upload como <b>ativo</b> por Data do WIP.
      </Text>

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card withBorder shadow="sm" radius="lg" p="lg">
            <Dropzone
              onDrop={onDrop}
              disabled={busy}
              multiple={false}
              // >>> FIX 2: aceitar por MIME type (e alguns fallbacks comuns)
              accept={[
                MIME_TYPES.xlsx,
                MIME_TYPES.xls,
                'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm (se vier)
                'application/octet-stream', // fallback p/ navegadores que rotulam errado
              ]}
              maxSize={50 * 1024 * 1024}
            >
              <div style={{ padding: '48px 12px', textAlign: 'center' }}>
                <Title order={4} mb={6}>Arraste o arquivo aqui ou clique para selecionar</Title>
                <div style={{ color: '#667085', fontSize: 14 }}>Formatos: .xlsx / .xls • Máx. 50&nbsp;MB</div>
              </div>
            </Dropzone>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder shadow="sm" radius="lg" p="lg">
            <Title order={6} mb="sm">Dicas</Title>
            <ul style={{ margin: 0, paddingLeft: 16, color: '#475467' }}>
              <li>“Alíquota” aceita vírgula (pt-BR).</li>
              <li>“Categoria” mapeia para centros com meta; demais são ignoradas.</li>
              <li>Reenvie o mesmo dia para <b>substituir</b> o upload ativo.</li>
            </ul>
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder shadow="sm" radius="lg" p="lg">
            <Group justify="space-between" mb="sm">
              <Title order={4} m={0}>Uploads do dia</Title>
              <DateInput
                value={dia}
                onChange={handleDiaChange}
                valueFormat="DD/MM/YYYY"
                locale="pt-BR"
                dateParser={(input) => parseLocalDateString(input) ?? new Date()}
              />
            </Group>
            <Divider my="sm" />

            <Table highlightOnHover withTableBorder stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Arquivo</Table.Th>
                  <Table.Th>Enviado em</Table.Th>
                  <Table.Th className="right">Centros</Table.Th>
                  <Table.Th className="right">Horas totais</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loadingUploads ? (
                  <Table.Tr><Table.Td colSpan={6}>Carregando…</Table.Td></Table.Tr>
                ) : uploadsDia.length === 0 ? (
                  <Table.Tr><Table.Td colSpan={6}>Nenhum upload encontrado para esta data.</Table.Td></Table.Tr>
                ) : (
                  uploadsDia.map((u) => {
                    const enviado = toLocalBR(u.enviado_em);
                    return (
                      <Table.Tr
                        key={`${u.data_wip}-${u.upload_id}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => nav(`/upload/${u.data_wip}/${u.upload_id}`)}
                      >
                        <Table.Td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.nome_arquivo}
                        </Table.Td>
                        <Table.Td>{enviado}</Table.Td>
                        <Table.Td align="right">{u.linhas}</Table.Td>
                        <Table.Td align="right">{u.horas_total.toFixed(2)} h</Table.Td>
                        <Table.Td>
                          {u.ativo ? <Badge color="green">ATIVO</Badge> : <Badge color="gray">Inativo</Badge>}
                        </Table.Td>
                        <Table.Td width={160}>
                          {!u.ativo && (
                            <Button
                              size="xs"
                              variant="light"
                              onClick={async (event) => {
                                event.stopPropagation();
                                if (!dia) return;
                                setLoadingUploads(true);
                                try {
                                  const iso = dateToISO(dia);
                                  await setUploadAtivo(iso, u.upload_id);
                                  await refetchUploads(dia);
                                } catch (e) {
                                  console.error(e);
                                } finally {
                                  setLoadingUploads(false);
                                }
                              }}
                            >
                              Tornar ativo
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder shadow="sm" radius="lg" p="md">
            <Title order={6} style={{ opacity: 0.9, letterSpacing: 0.3 }} mb="xs">Log</Title>
            <pre style={{ whiteSpace: 'pre-wrap', color: '#101828', margin: 0, fontSize: 13 }}>
              {log.join('\n') || 'Nenhum evento ainda.'}
            </pre>
          </Card>
        </Grid.Col>
      </Grid>
    </div>
  );
}


