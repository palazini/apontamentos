import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Title, Text, Table, Group, Button, Badge } from '@mantine/core';
import { fetchCentros, type Centro } from '../../services/db';
import { fetchUploadHeader, fetchUploadLinhas, type UploadHeader, type UploadLinha } from '../../services/db';

function toLocalBR(dt: string | Date) {
  const d = new Date(dt);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
}

export default function UploadDetalhePage() {
  const nav = useNavigate();
  const { data, uploadId } = useParams(); // /upload/:data/:uploadId
  const dataISO = data!;
  const id = Number(uploadId);

  const [header, setHeader] = useState<UploadHeader | null>(null);
  const [linhas, setLinhas] = useState<UploadLinha[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [loading, setLoading] = useState(true);

  const centrosMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of centros) m.set(c.id, c.codigo);
    return m;
  }, [centros]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [h, ls, cs] = await Promise.all([
          fetchUploadHeader(dataISO, id),
          fetchUploadLinhas(dataISO, id),
          fetchCentros(),
        ]);
        setHeader(h);
        setLinhas(ls);
        setCentros(cs);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataISO, id]);

  const total = useMemo(() => linhas.reduce((s, r) => s + Number(r.horas_somadas || 0), 0), [linhas]);

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
            <Group>
              <Badge variant="light">Centros: {header.linhas}</Badge>
              <Badge variant="light">Horas: {Number(header.horas_total).toFixed(2)} h</Badge>
              {header.ativo ? <Badge color="green">ATIVO</Badge> : <Badge color="gray">Inativo</Badge>}
            </Group>
          </Group>
        )}
      </Card>

      <Card withBorder shadow="sm" radius="lg" p="lg">
        {loading ? (
          <Text c="dimmed">Carregando linhas…</Text>
        ) : linhas.length === 0 ? (
          <Text c="dimmed">Nenhuma linha encontrada para este upload.</Text>
        ) : (
          <Table highlightOnHover withTableBorder stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Centro</Table.Th>
                <Table.Th className="right">Horas (h)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {linhas.map((r) => (
                <Table.Tr key={r.centro_id}>
                  <Table.Td>{centrosMap.get(r.centro_id) ?? r.centro_id}</Table.Td>
                  <Table.Td align="right">{Number(r.horas_somadas).toFixed(2)}</Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td style={{ fontWeight: 700 }}>Total</Table.Td>
                <Table.Td align="right" style={{ fontWeight: 700 }}>{total.toFixed(2)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
