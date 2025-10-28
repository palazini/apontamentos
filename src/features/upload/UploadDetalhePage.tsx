import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Title, Text, Table, Group, Button, Badge, SegmentedControl } from '@mantine/core';
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

function toLocalBR(dt: string | Date) {
  const d = new Date(dt);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
}

type Visao = 'centros' | 'matriculas';

export default function UploadDetalhePage() {
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
          fetchUploadHeader(dataISO, id),
          fetchUploadLinhas(dataISO, id),
          fetchCentros(),
          fetchUploadLinhasFuncionarios(dataISO, id), // <- NOVO
        ]);
        setHeader(h);
        setLinhasCentros(lsCentros);
        setCentros(cs);
        setLinhasFuncs(lsFuncs);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataISO, id]);

  const totalCentros = useMemo(
    () => linhasCentros.reduce((s, r) => s + Number(r.horas_somadas || 0), 0),
    [linhasCentros]
  );
  const totalFuncs = useMemo(
    () => linhasFuncs.reduce((s, r) => s + Number(r.horas_somadas || 0), 0),
    [linhasFuncs]
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
              <Text size="sm" c="dimmed">Data do WIP: <b>{new Date(header.data_wip).toLocaleDateString()}</b></Text>
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
          <Badge variant="dot">Matrículas no upload: {linhasFuncs.length}</Badge>
          {/* Mostramos ambos os totais para facilitar conciliação */}
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
          // Visão: MATRÍCULAS
          linhasFuncs.length === 0 ? (
            <Text c="dimmed">Nenhuma linha de matrículas encontrada para este upload.</Text>
          ) : (
            <Table highlightOnHover withTableBorder stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Matrícula</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Horas (h)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {linhasFuncs.map((r) => (
                  <Table.Tr key={r.matricula}>
                    <Table.Td>{r.matricula}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{Number(r.horas_somadas).toFixed(2)}</Table.Td>
                  </Table.Tr>
                ))}
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
