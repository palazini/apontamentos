import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Group, Modal, NumberInput, Table, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchMetasAtuais, createCentro, insertMeta, type VMetaAtual } from '../../services/db';


export default function MetasPage() {
  const [loading, setLoading] = useState(true);
  const [metas, setMetas] = useState<VMetaAtual[]>([]);

  const [openedEdit, setOpenedEdit] = useState(false);
  const [openedNew, setOpenedNew] = useState(false);

  // editar meta existente
  const [editCentroId, setEditCentroId] = useState<number | null>(null);
  const [editCentroNome, setEditCentroNome] = useState<string>('');
  const [editMetaVal, setEditMetaVal] = useState<number | ''>('');

  // novo centro + meta
  const [novoCentro, setNovoCentro] = useState<string>('');
  const [novaMeta, setNovaMeta] = useState<number | ''>('');

  async function refresh() {
    setLoading(true);
    try {
      const m = await fetchMetasAtuais();
      setMetas(m);
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Erro ao carregar', message: e.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const rows = useMemo(() => {
    return metas
      .slice()
      .sort((a, b) => a.centro.localeCompare(b.centro))
      .map((m) => (
        <Table.Tr key={m.centro_id}>
          <Table.Td><b>{m.centro}</b></Table.Td>
          <Table.Td>{m.meta_horas.toFixed(2)} h</Table.Td>
          <Table.Td>
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                setEditCentroId(m.centro_id);
                setEditCentroNome(m.centro);
                setEditMetaVal(m.meta_horas);
                setOpenedEdit(true);
              }}
            >
              Editar meta
            </Button>
          </Table.Td>
        </Table.Tr>
      ));
  }, [metas]);

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Metas</Title>
        <Group>
          <Button variant="default" onClick={refresh}>Recarregar</Button>
          <Button onClick={() => setOpenedNew(true)}>Novo centro + meta</Button>
        </Group>
      </Group>

      <Card withBorder radius="lg" p="md" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <Table highlightOnHover stickyHeader striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Centro</Table.Th>
              <Table.Th>Meta diária (h)</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading ? (
              <Table.Tr><Table.Td colSpan={3}>Carregando…</Table.Td></Table.Tr>
            ) : rows.length ? rows : (
              <Table.Tr><Table.Td colSpan={3}>Nenhum centro cadastrado.</Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Modal editar meta */}
      <Modal opened={openedEdit} onClose={() => setOpenedEdit(false)} title={`Editar meta • ${editCentroNome}`} centered>
        <NumberInput
          label="Meta diária (h)"
          decimalScale={2}
          value={editMetaVal}
          onChange={(v) => setEditMetaVal(v === '' ? '' : Number(v))}
          min={0}
          step={0.25}
          placeholder="Ex.: 8.5"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setOpenedEdit(false)}>Cancelar</Button>
          <Button
            onClick={async () => {
              try {
                if (!editCentroId || editMetaVal === '' || isNaN(Number(editMetaVal))) return;
                await insertMeta(editCentroId, Number(editMetaVal)); // cria nova vigência (vigente_desde = hoje)
                notifications.show({ color: 'green', title: 'Meta atualizada', message: `Centro ${editCentroNome}` });
                setOpenedEdit(false);
                await refresh();
              } catch (e: any) {
                notifications.show({ color: 'red', title: 'Erro', message: e.message ?? String(e) });
              }
            }}
          >
            Salvar
          </Button>
        </Group>
      </Modal>

      {/* Modal novo centro + meta */}
      <Modal opened={openedNew} onClose={() => setOpenedNew(false)} title="Novo centro + meta" centered>
        <TextInput
          label="Código do centro (ex.: TCN-18)"
          placeholder="TCN-18"
          value={novoCentro}
          onChange={(e) => setNovoCentro(e.currentTarget.value)}
        />
        <NumberInput
          label="Meta diária (h)"
          decimalScale={2}
          value={novaMeta}
          onChange={(v) => setNovaMeta(v === '' ? '' : Number(v))}
          min={0}
          step={0.25}
          mt="sm"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setOpenedNew(false)}>Cancelar</Button>
          <Button
            onClick={async () => {
              try {
                if (!novoCentro.trim() || novaMeta === '' || isNaN(Number(novaMeta))) return;
                const centroId = await createCentro(novoCentro.trim());
                await insertMeta(centroId, Number(novaMeta));
                notifications.show({ color: 'green', title: 'Centro criado', message: novoCentro });
                setNovoCentro(''); setNovaMeta('');
                setOpenedNew(false);
                await refresh();
              } catch (e: any) {
                notifications.show({ color: 'red', title: 'Erro', message: e.message ?? String(e) });
              }
            }}
          >
            Criar
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
