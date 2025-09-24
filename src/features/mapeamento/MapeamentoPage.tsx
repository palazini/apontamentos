import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Button, Card, Group, Modal, Select, Table, TextInput, Title, Tooltip } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { fetchAliases, fetchCentros, addAlias, deleteAlias, type Alias, type Centro } from '../../services/db';
import { notifications } from '@mantine/notifications';

export default function MapeamentoPage() {
  const [loading, setLoading] = useState(true);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [opened, setOpened] = useState(false);

  const [aliasTexto, setAliasTexto] = useState('');
  const [aliasCentroId, setAliasCentroId] = useState<string | null>(null);

  const centrosOptions = useMemo(
    () => centros.map((c) => ({ value: String(c.id), label: c.codigo })),
    [centros]
  );

  async function refresh() {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([fetchAliases(), fetchCentros()]);
      setAliases(a);
      setCentros(c);
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Erro ao carregar', message: e.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const rows = useMemo(() => {
    return aliases.map((a) => (
      <Table.Tr key={a.id}>
        <Table.Td><b>{a.alias_texto}</b></Table.Td>
        <Table.Td>{a.centro?.codigo ?? a.centro_id}</Table.Td>
        <Table.Td width={60}>
          <Tooltip label="Excluir alias">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={async () => {
                try {
                  await deleteAlias(a.id);
                  notifications.show({ color: 'green', title: 'Alias removido', message: a.alias_texto });
                  await refresh();
                } catch (e: any) {
                  notifications.show({ color: 'red', title: 'Erro', message: e.message ?? String(e) });
                }
              }}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
        </Table.Td>
      </Table.Tr>
    ));
  }, [aliases]);

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Mapeamento (Categoria → Centro)</Title>
        <Group>
          <Button variant="default" onClick={refresh}>Recarregar</Button>
          <Button onClick={() => setOpened(true)}>Novo alias</Button>
        </Group>
      </Group>

      <Card withBorder shadow="sm" radius="lg" p="md">
        <Table highlightOnHover stickyHeader striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Categoria (arquivo)</Table.Th>
              <Table.Th>Centro (meta)</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading ? (
              <Table.Tr><Table.Td colSpan={3}>Carregando…</Table.Td></Table.Tr>
            ) : rows.length ? rows : (
              <Table.Tr><Table.Td colSpan={3}>Nenhum alias cadastrado.</Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Novo alias" centered>
        <TextInput
          label="Categoria do arquivo (ex.: CE-TCN18, CE-TP 21, CE-JATO)"
          placeholder="CE-TCN18"
          value={aliasTexto}
          onChange={(e) => setAliasTexto(e.currentTarget.value)}
        />
        <Select
          label="Centro de destino"
          data={centrosOptions}
          value={aliasCentroId}
          onChange={setAliasCentroId}
          searchable
          mt="sm"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setOpened(false)}>Cancelar</Button>
          <Button
            onClick={async () => {
              try {
                if (!aliasTexto.trim() || !aliasCentroId) return;
                await addAlias(aliasTexto.trim(), Number(aliasCentroId));
                notifications.show({ color: 'green', title: 'Alias criado', message: aliasTexto });
                setAliasTexto(''); setAliasCentroId(null);
                setOpened(false);
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
