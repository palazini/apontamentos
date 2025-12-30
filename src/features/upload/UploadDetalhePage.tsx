// src/features/upload/UploadDetalhePage.tsx
import { useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Title, Text, Table, Group, Button, Badge, SegmentedControl } from '@mantine/core';
import { useEmpresaId } from '../../contexts/TenantContext';
import {
  fetchCentros,
  fetchUploadHeader,
  fetchUploadLinhas,
  fetchUploadLinhasFuncionarios,
  type Centro,
  type UploadHeader,
  type UploadLinha,
  type UploadFuncLinha,
} from '../../services/db';

/* ===== Helpers de data ===== */
// Constrói Date no fuso local a partir de 'YYYY-MM-DD' (evita shift para o dia anterior)
function isoToLocalDate(iso: string) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(y, m - 1, d);
}
function formatISODateBR(iso: string) {
  const d = isoToLocalDate(iso);
  return d.toLocaleDateString('pt-BR'); // já é data local (sem hora)
}
// Para timestamps (enviado_em): ok usar timezone explícito
function toLocalBR(dt: string | Date) {
  const d = new Date(dt);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
}

type Visao = 'centros' | 'matriculas';

export default function UploadDetalhePage() {
  const empresaId = useEmpresaId();
  const nav = useNavigate();
  const { data, uploadId } = useParams(); // /upload/:data/:uploadId
  const dataISO = data!;
  const id = Number(uploadId);

  const [header, setHeader] = useState<UploadHeader | null>(null);
  const [linhasCentros, setLinhasCentros] = useState<UploadLinha[]>([]);
  const [linhasFuncs, setLinhasFuncs] = useState<UploadFuncLinha[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [loading, setLoading] = useState(true);
  const [visao, setVisao] = useState<Visao>('centros');

  const centrosMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of centros) m.set(c.id, c.codigo);
    return m;
  }, [centros]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [h, lsCentros, cs, lsFuncs] = await Promise.all([
          fetchUploadHeader(empresaId, dataISO, id),
          fetchUploadLinhas(empresaId, dataISO, id),
          fetchCentros(empresaId),
          fetchUploadLinhasFuncionarios(empresaId, dataISO, id), // matricula + centro_id + horas
        ]);
        setHeader(h);
        setLinhasCentros(lsCentros);
        setCentros(cs);
        setLinhasFuncs(lsFuncs);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataISO, id, empresaId]);

  // Distintos de matrícula (para badge)
  const qtdMatriculas = useMemo(
    () => new Set(linhasFuncs.map((r) => r.matricula)).size,
    [linhasFuncs]
  );

  // Total por centros (como já era)
  const totalCentros = useMemo(
    () => linhasCentros.reduce((s, r) => s + Number(r.horas_somadas || 0), 0),
    [linhasCentros]
  );

  // Agrupamento por matrícula: total + breakdown por centro
  const gruposMatriculas = useMemo(() => {
    const tmp = new Map<string, { total: number; centros: Map<number, number> }>();

    for (const r of linhasFuncs) {
      const mat = r.matricula;
      const cid = Number(r.centro_id);
      const h = Number(r.horas_somadas || 0);

      let g = tmp.get(mat);
      if (!g) {
        g = { total: 0, centros: new Map() };
        tmp.set(mat, g);
      }
      g.total += h;
      g.centros.set(cid, (g.centros.get(cid) ?? 0) + h);
    }

    const arr = Array.from(tmp.entries()).map(([matricula, g]) => {
      const centrosArr = Array.from(g.centros.entries())
        .map(([centro_id, horas]) => ({ centro_id, horas: +horas.toFixed(2) }))
        .sort((a, b) => b.horas - a.horas);

      return {
        matricula,
        total: +g.total.toFixed(2),
        centros: centrosArr,
      };
    });

    // maiores totais primeiro
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [linhasFuncs]);

  const totalFuncs = useMemo(
    () => gruposMatriculas.reduce((s, g) => s + g.total, 0),
    [gruposMatriculas]
  );

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Detalhes do upload</Title>
        <Button variant="default" onClick={() => nav('/upload')}>Voltar</Button>
      </Group>

      <Card withBorder shadow="sm" radius="lg" p="lg" mb="lg">
        {!header ? (
          <Text c="dimmed">Carregando header…</Text>
        ) : (
          <Group justify="space-between" align="start">
            <div>
              <Title order={4} m={0}>{header.nome_arquivo}</Title>
              {/* >>> Correção do "um dia antes": formata como data local */}
              <Text size="sm" c="dimmed">Data do WIP: <b>{formatISODateBR(header.data_wip)}</b></Text>
              <Text size="sm" c="dimmed">Enviado em: <b>{toLocalBR(header.enviado_em)}</b></Text>
            </div>
            <Group gap="xs">
              <Badge variant="light">Centros: {header.linhas}</Badge>
              <Badge variant="light">Horas (arquivo): {Number(header.horas_total).toFixed(2)} h</Badge>
              {header.ativo ? <Badge color="green">ATIVO</Badge> : <Badge color="gray">Inativo</Badge>}
            </Group>
          </Group>
        )}
      </Card>

      {/* Selector da visão */}
      <Group justify="space-between" mb="sm">
        <SegmentedControl
          value={visao}
          onChange={(v) => setVisao(v as Visao)}
          data={[
            { label: 'Por centro', value: 'centros' },
            { label: 'Por matrícula', value: 'matriculas' },
          ]}
        />
        <Group gap="xs">
          <Badge variant="dot">Centros no upload: {linhasCentros.length}</Badge>
          <Badge variant="dot">Matrículas no upload: {qtdMatriculas}</Badge>
          <Badge variant="light">Total (centros): {totalCentros.toFixed(2)} h</Badge>
          <Badge variant="light">Total (matrículas): {totalFuncs.toFixed(2)} h</Badge>
        </Group>
      </Group>

      <Card withBorder shadow="sm" radius="lg" p="lg">
        {loading ? (
          <Text c="dimmed">Carregando linhas…</Text>
        ) : visao === 'centros' ? (
          linhasCentros.length === 0 ? (
            <Text c="dimmed">Nenhuma linha de centros encontrada para este upload.</Text>
          ) : (
            <Table highlightOnHover withTableBorder stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Centro</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Horas (h)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {linhasCentros.map((r) => (
                  <Table.Tr key={r.centro_id}>
                    <Table.Td>{centrosMap.get(r.centro_id) ?? r.centro_id}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{Number(r.horas_somadas).toFixed(2)}</Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr>
                  <Table.Td style={{ fontWeight: 700 }}>Total</Table.Td>
                  <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>{totalCentros.toFixed(2)}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          )
        ) : (
          // Visão: MATRÍCULAS (agrupado) — ocupa 100% da largura
          gruposMatriculas.length === 0 ? (
            <Text c="dimmed">Nenhuma linha de matrículas encontrada para este upload.</Text>
          ) : (
            <Table
              highlightOnHover
              withTableBorder
              stickyHeader
              style={{ tableLayout: 'fixed', width: '100%' }}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: '70%' }}>Matrícula</Table.Th>
                  <Table.Th style={{ width: '30%', textAlign: 'right' }}>Horas (h)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {gruposMatriculas.map((g) => (
                  <Fragment key={g.matricula}>
                    {/* Linha "pai" com o total da matrícula (ocupa 2 colunas) */}
                    <Table.Tr>
                      <Table.Td colSpan={2} style={{ fontWeight: 600, paddingTop: 10, paddingBottom: 6 }}>
                        <Group justify="space-between" wrap="nowrap">
                          <Text fw={600}>{g.matricula}</Text>
                          <Text fw={600}>{g.total.toFixed(2)}</Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>

                    {/* Sublinhas por centro, indentadas */}
                    {g.centros.map((c) => (
                      <Table.Tr key={`${g.matricula}-${c.centro_id}`}>
                        <Table.Td style={{ paddingLeft: 24 }}>
                          <Text size="sm" c="dimmed">— {centrosMap.get(c.centro_id) ?? c.centro_id}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                          <Text size="sm" c="dimmed">{c.horas.toFixed(2)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Fragment>
                ))}

                {/* Total geral */}
                <Table.Tr>
                  <Table.Td style={{ fontWeight: 700 }}>Total</Table.Td>
                  <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>{totalFuncs.toFixed(2)}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          )
        )}
      </Card>
    </div>
  );
}
