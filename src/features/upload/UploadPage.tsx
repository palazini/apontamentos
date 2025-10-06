// src/features/upload/UploadPage.tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { parsePtBrNumber, excelSerialToISODate } from '../../utils/normalization';
import * as XLSX from 'xlsx';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { Title, Card, Grid, Text, Table, Group, Button, Badge, Divider } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { fetchUploadsPorDia, setUploadAtivo, fetchUltimoDiaComDados, type VUploadDia } from '../../services/db';

/* ==========================
   Tipos
========================== */
type Centro = { id: number; codigo: string };
type Alias  = { alias_texto: string; centro_id: number };

type ParsedRow = {
  data_wip: string;         // 'YYYY-MM-DD'
  categoria_raw: string;
  centro_id: number;        // já resolvido (apenas linhas válidas)
  aliquota_horas: number;
  tipo_raw?: string | null;
};

type UploadError = { tipo: 'sheet' | 'header' | 'row' | 'meta' | 'persist'; mensagem: string };

/* ==========================
   Utils
========================== */
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

// remove acentos e normaliza; facilita encontrar headers ("Alíquota (h)" etc.)
function normKey(s: string): string {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\(\)\[\]\{\},;.:/_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detector tolerante a variações */
function detectCol(columns: string[], targets: string[]): string | null {
  const rawCols = columns.map((c) => c.trim());
  const normCols = rawCols.map(normKey);
  const normTargets = targets.map(normKey);

  // 1) exato
  for (const t of normTargets) {
    const idx = normCols.findIndex((c) => c === t);
    if (idx >= 0) return rawCols[idx];
  }
  // 2) contém (por palavra)
  for (const t of normTargets) {
    const rx = new RegExp(`(?:^|\\s)${t}(?:\\s|$)`);
    const idx = normCols.findIndex((c) => rx.test(c));
    if (idx >= 0) return rawCols[idx];
  }
  return null;
}

// chave canônica para categorias/aliases (ex.: "CE-TCN-14" -> "cetcn14")
function keyize(s: string): string {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function groupByDate<T extends { data_wip: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const arr = map.get(r.data_wip) ?? [];
    arr.push(r);
    map.set(r.data_wip, arr);
  }
  return map;
}

/** Transforma [10,11,12,15,18,19,20] em "10-12, 15, 18-20" */
function compactLineRanges(nums: number[]): string {
  if (!nums.length) return '';
  const a = [...nums].sort((x, y) => x - y);
  const out: string[] = [];
  let start = a[0];
  let prev = a[0];

  for (let i = 1; i < a.length; i += 1) {
    const n = a[i];
    if (n === prev + 1) {
      prev = n;
    } else {
      out.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = prev = n;
    }
  }
  out.push(start === prev ? `${start}` : `${start}-${prev}`);
  return out.join(', ');
}

// Data do WIP proveniente da célula (serial Excel, "dd/mm/yyyy", "yyyy-mm-dd", etc.)
function parseWipISO(input: unknown): string | null {
  if (input == null) return null;

  if (typeof input === 'number') return excelSerialToISODate(input);

  let s = String(input).trim();

  // dd/mm/yyyy [hh:mm]
  let m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }

  // yyyy-mm-dd[ T]hh:mm
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${yyyy}-${mm}-${dd}`;
  }

  // fallback seguro
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

// DateInput aceita Date/string; garantimos Date local (sem UTC shift)
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

/* ==========================
   Página
========================== */
export default function UploadPage() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [dia, setDia] = useState<Date | null>(null);
  const [uploadsDia, setUploadsDia] = useState<VUploadDia[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const nav = useNavigate();

  const pushLog = (s: string) => setLog((prev) => [...prev, s]);

  const dateToISO = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const toLocalBR = (dt: string | Date) => {
    const d = new Date(dt);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
  };

  // carrega a lista de uploads para o "dia" atual
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

  // handler robusto do DateInput
  const handleDiaChange = (value: unknown) => {
    if (!value) {
      setDia(null);
      setUploadsDia([]);
      setLoadingUploads(false);
      return;
    }
    let d: Date | null = null;

    if (value instanceof Date) d = value;
    else if (typeof value === 'string') d = parseLocalDateString(value);
    else if ((value as any)?.toDate instanceof Function) d = (value as any).toDate(); // dayjs

    if (!d || Number.isNaN(d.getTime())) return;

    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    setDia(normalized);
    refetchUploads(normalized);
  };

  // abre já no último dia com dados (ou hoje)
  useEffect(() => {
    (async () => {
      if (dia) return;
      try {
        const last = await fetchUltimoDiaComDados();
        const target = last
          ? new Date(+last.slice(0, 4), +last.slice(5, 7) - 1, +last.slice(8, 10))
          : new Date();
        setDia(target);
        await refetchUploads(target);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [dia, refetchUploads]);

  /* ==========================
     IO/DB helpers
  ========================== */
  const readWorkbook = async (file: File) => {
    const data = await file.arrayBuffer();
    return XLSX.read(data, { type: 'array' });
  };

  const fetchCentros = async (): Promise<Centro[]> => {
    const { data, error } = await supabase.from('centros').select('id, codigo');
    if (error) throw error;
    return data ?? [];
  };

  const fetchAlias = async (): Promise<Alias[]> => {
    const { data, error } = await supabase.from('centro_aliases').select('alias_texto, centro_id');
    if (error) throw error;
    return data ?? [];
  };

  /**
   * Monta:
   * - centrosById: valida centros existentes
   * - aliasIndex: Map<chave, centro_id>, incluindo chave com/sem "ce" no início
   */
  const carregarMapeamento = async () => {
    const centros = await fetchCentros();
    const aliases = await fetchAlias();

    const centrosById = new Map<number, Centro>();
    for (const c of centros) centrosById.set(c.id, c);

    const aliasIndex = new Map<string, number>();
    for (const a of aliases) {
      const k1 = keyize(a.alias_texto);
      const k2 = k1.replace(/^ce/, ''); // tenta também sem "CE"
      aliasIndex.set(k1, a.centro_id);
      aliasIndex.set(k2, a.centro_id);
    }
    return { centrosById, aliasIndex };
  };

  // Contagem rápida: existem totais no dia?
  const carregarTotaisDoDiaCount = async (dataISO: string) => {
    const { count, error } = await supabase
      .from('totais_diarios')
      .select('centro_id', { count: 'exact', head: true })
      .eq('data_wip', dataISO);
    if (error) throw error;
    return count ?? 0;
  };

  // RPC → importa_meta_upload(rows jsonb, p_upload_id bigint)
  // Fallback: agrega no front e grava em totais_diarios
  const salvarTotais = async (rows: ParsedRow[], uploadId: number) => {
    if (!rows.length) return;

    const payload = rows.map((r) => ({
      data_wip: r.data_wip,
      centro_id: r.centro_id,
      aliquota_horas: r.aliquota_horas,
      tipo: r.tipo_raw ?? null,
    }));

    // 1) tenta RPC
    const rpcRes = await supabase.rpc('importa_meta_upload', {
      rows: payload,
      p_upload_id: uploadId,
    });

    if (!rpcRes.error) return;

    // 2) fallback: agrega no front e grava direto
    const agg = new Map<string, { data_wip: string; centro_id: number; horas_somadas: number }>();
    for (const r of rows) {
      const key = `${r.data_wip}|${r.centro_id}`;
      const cur = agg.get(key) ?? { data_wip: r.data_wip, centro_id: r.centro_id, horas_somadas: 0 };
      cur.horas_somadas += r.aliquota_horas;
      agg.set(key, cur);
    }
    const inserts = [...agg.values()].map((x) => ({
      data_wip: x.data_wip,
      centro_id: x.centro_id,
      horas_somadas: +x.horas_somadas.toFixed(4),
      upload_id_origem: uploadId,
    }));

    // apaga reprocesso do mesmo upload
    await supabase.from('totais_diarios').delete().eq('upload_id_origem', uploadId);
    const { error: insErr } = await supabase.from('totais_diarios').insert(inserts);
    if (insErr) throw insErr;
  };

  const marcarUpload = async (uploadId: number, dataISO: string) => {
    const { error } = await supabase
      .from('uploads')
      .update({ ativo: true })
      .eq('id', uploadId);
    if (error) throw error;
    await setUploadAtivo(dataISO, uploadId);
  };

  const persistirUpload = async (
    dataISO: string,
    nomeArquivo: string,
    originalRows: ParsedRow[],
    // hashConteudo: string, // se desejar usar depois
  ): Promise<number> => {
    const payload: any = {
      data_wip: dataISO,
      nome_arquivo: nomeArquivo,
      linhas: originalRows.length,
      horas_total: originalRows.reduce((acc, curr) => acc + curr.aliquota_horas, 0),
      // conteudo_hash: hashConteudo, // <- só use se a coluna existir
    };

    const { data, error } = await supabase
      .from('uploads')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return data!.id as number;
  };

  /* ==========================
     Normalização das linhas
  ========================== */
  const normalizarLinhas = async (
    sheetRows: any[],
    mapping: { centrosById: Map<number, Centro>; aliasIndex: Map<string, number> },
  ) => {
    const headers = Object.keys(sheetRows[0] ?? {}).map((k) => k.trim());

    const colData = detectCol(headers, [
      'data', 'data wip', 'wip', 'data do wip', 'mes', 'mês'
    ]);
    const colCategoria = detectCol(headers, [
      'categoria', 'centro', 'grupo', 'maquina', 'máquina', 'equipamento'
    ]);
    const colAliquota = detectCol(headers, [
      'aliquota', 'alíquota', 'aliquota h', 'alíquota h',
      'aliquota horas', 'alíquota horas',
      'total horas', 'horas totais', 'qtd horas', 'quantidade de horas', 'total h'
    ]);
    const colTipo = detectCol(headers, ['tipo', 'origem']);

    if (!colData || !colCategoria || !colAliquota) {
      const missing = [
        !colData ? 'Data WIP' : null,
        !colCategoria ? 'Categoria' : null,
        !colAliquota ? 'Alíquota' : null,
      ].filter(Boolean).join(', ');
      throw { tipo: 'header', mensagem: `Colunas obrigatórias ausentes: ${missing}.` } as UploadError;
    }

    const rows: ParsedRow[] = [];
    const erros: UploadError[] = [];   // dados realmente inválidos
    const avisos: string[] = [];       // avisos gerais

    // NOVO: agregador para categorias sem meta
    const semMetaPorCategoria = new Map<string, number[]>();

    for (let idx = 0; idx < sheetRows.length; idx += 1) {
      const raw = sheetRows[idx];
      const excelRow = idx + 2; // linha real no Excel (conta o header)

      const dataWip = parseWipISO(raw[colData]);
      if (!dataWip) {
        // Heurística: se a linha contém a palavra "total" em QUALQUER coluna, trate como rodapé e ignore
        const linhaTexto = Object.values(raw)
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');

        if (linhaTexto.includes('total')) {
          avisos.push(`Linha ${excelRow}: linha de total/rodapé ignorada.`);
          continue;
        }

        // Se a linha está essencialmente vazia (sem textos relevantes), ignore também
        const soVazios = Object.values(raw).every((v) => {
          if (v == null) return true;
          const s = String(v).trim();
          return s === '';
        });
        if (soVazios) {
          avisos.push(`Linha ${excelRow}: linha vazia ignorada.`);
          continue;
        }

        // Caso contrário, é um erro real de data
        erros.push({ tipo: 'row', mensagem: `Linha ${excelRow}: Data WIP inválida (${raw[colData]}).` });
        continue;
      }

      const categoriaRaw = String(raw[colCategoria] ?? '').trim();
      if (!categoriaRaw) {
        erros.push({ tipo: 'row', mensagem: `Linha ${excelRow}: Categoria vazia.` });
        continue;
      }

      // mapeamento por chave canônica (com/sem prefixo "CE")
      const k1 = keyize(categoriaRaw);
      const k2 = k1.replace(/^ce/, '');
      const centroId = mapping.aliasIndex.get(k1) ?? mapping.aliasIndex.get(k2) ?? null;

      if (centroId == null) {
        // NOVO: acumula a linha em vez de logar uma por uma
        const arr = semMetaPorCategoria.get(categoriaRaw) ?? [];
        arr.push(excelRow);
        semMetaPorCategoria.set(categoriaRaw, arr);
        continue;
      }

      const centro = mapping.centrosById.get(centroId);
      if (!centro) {
        // mantém aviso individual — casos raros
        avisos.push(`Centro id=${centroId} não encontrado no cadastro (linha ${excelRow}).`);
        continue;
      }

      const aliParsed = parsePtBrNumber(raw[colAliquota]);
      if (!isFiniteNumber(aliParsed)) {
        erros.push({ tipo: 'row', mensagem: `Linha ${excelRow}: Alíquota inválida (${raw[colAliquota]}).` });
        continue;
      }
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

    // NOVO: gera um aviso por categoria com as faixas de linhas
    if (semMetaPorCategoria.size) {
      for (const [categoria, linhas] of semMetaPorCategoria) {
        avisos.push(`Categoria "${categoria}" sem meta vinculada (linhas: ${compactLineRanges(linhas)})`);
      }
    }

    if (erros.length) {
      const mensagem = erros.map((e) => e.mensagem).join('\n');
      throw { tipo: 'row', mensagem } as UploadError;
    }

    return { rows, avisos };
  };

  /* ==========================
     onDrop
  ========================== */
  const onDrop = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setLog([]);

    try {
      const file = files[0];
      pushLog(`Lendo arquivo "${file.name}"...`);
      const wb = await readWorkbook(file);

      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw { tipo: 'sheet', mensagem: 'Nenhuma planilha encontrada no arquivo.' } as UploadError;

      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (!json.length) throw { tipo: 'sheet', mensagem: 'Planilha vazia.' } as UploadError;

      // mapeamentos
      pushLog('Carregando mapeamentos de centros...');
      const mapping = await carregarMapeamento();

      // normalização (podem vir várias datas)
      pushLog('Normalizando linhas...');
      const { rows, avisos } = await normalizarLinhas(json, mapping);
      if (avisos.length) avisos.forEach((m) => pushLog(`Aviso: ${m}`));
      if (!rows.length) throw { tipo: 'row', mensagem: 'Nenhuma linha válida após normalização.' } as UploadError;

      // -> AGRUPA POR DATA
      const groups = groupByDate(rows);
      pushLog(`Detectadas ${groups.size} data(s): ${[...groups.keys()].join(', ')}`);

      // Processa cada data separadamente
      for (const [dataISO, rowsDia] of groups.entries()) {
        pushLog(`\n=== Dia ${dataISO} ===`);
        try {
          const existentes = await carregarTotaisDoDiaCount(dataISO);
          if (existentes) pushLog(`Encontradas ${existentes} linhas já cadastradas para ${dataISO} (serão substituídas).`);

          pushLog('Persistindo upload...');
          const uploadId = await persistirUpload(
            dataISO,
            file.name,
            rowsDia, // LINHAS SOMENTE DAQUELE DIA
          );
          pushLog(`Upload ${uploadId} criado para ${dataISO}.`);

          pushLog('Salvando totais agregados por centro...');
          await salvarTotais(rowsDia, uploadId);
          pushLog('Totais salvos.');

          pushLog('Marcando upload como ativo...');
          await marcarUpload(uploadId, dataISO);
          pushLog('Upload marcado como ATIVO.');

          // Se a data selecionada no filtro é esta, atualiza a tabela
          if (dia && dateToISO(dia) === dataISO) {
            await refetchUploads(dia);
          }
        } catch (e: any) {
          console.error(e);
          pushLog(`Erro ao processar ${dataISO}: ${e?.mensagem ?? e?.message ?? e}`);
          // continua pros outros dias
        }
      }

      notifications.show({
        title: 'Upload processado',
        message: `Arquivo "${file.name}" importado. (${groups.size} dia(s))`,
        color: 'green',
      });

      // Atualiza a lista do dia selecionado (caso não tenha atualizado dentro do loop)
      if (dia) await refetchUploads(dia);

    } catch (err: any) {
      console.error(err);
      const tipo = (err?.tipo as UploadError['tipo']) ?? 'persist';
      const mensagem = err?.mensagem ?? err?.message ?? 'Erro desconhecido ao processar o upload.';
      pushLog(`Erro (${tipo}): ${mensagem}`);
      notifications.show({ title: 'Falha no upload', message: mensagem, color: 'red' });
    } finally {
      setBusy(false);
    }
  }, [dia, refetchUploads]);

  /* ==========================
     Render
  ========================== */
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
              accept={[
                MIME_TYPES.xlsx,
                MIME_TYPES.xls,
                'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm
                'application/octet-stream', // fallback
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
