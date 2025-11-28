import { useEffect, useState } from 'react';
import {
  Button, Card, Container, Group, Modal, Select, Stack, Table, Text, TextInput, Title, Badge, ActionIcon, Switch, Textarea, Grid, LoadingOverlay // <--- 1. Importe LoadingOverlay
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { fetchTodosAvisos, createAviso, deleteAviso, toggleAviso, type AvisoTV } from '../../services/db';

export default function AvisosAdminPage() {
  const [avisos, setAvisos] = useState<AvisoTV[]>([]);
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  // Formulário para criar aviso
  const form = useForm({
    initialValues: {
      titulo: '',
      mensagem: '',
      tipo: 'info', // info, alerta, sucesso, aviso
      escopo: 'geral', // geral, usinagem, montagem
      exibir_como: 'ticker', // ticker, slide
      valido_ate_data: '', 
      valido_ate_hora: '23:59',
    },
    validate: {
      titulo: (val) => (val.length < 3 ? 'Título muito curto' : null),
      valido_ate_data: (val) => (!val ? 'Data obrigatória' : null),
    },
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchTodosAvisos();
      setAvisos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (values: typeof form.values) => {
    try {
      setLoading(true); // Opcional: feedback imediato ao salvar
      // Monta data ISO combinando dia e hora
      const isoDate = new Date(`${values.valido_ate_data}T${values.valido_ate_hora}`).toISOString();
      
      await createAviso({
        titulo: values.titulo,
        mensagem: values.mensagem,
        tipo: values.tipo as any,
        escopo: values.escopo as any,
        exibir_como: values.exibir_como as any,
        valido_de: new Date().toISOString(), // Começa agora
        valido_ate: isoDate,
      });
      
      form.reset();
      close();
      await load(); // await aqui garante que o loading do load() assuma
    } catch (e) {
      alert('Erro ao criar aviso');
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este aviso?')) return;
    setLoading(true);
    await deleteAviso(id);
    await load();
  };

  const handleToggle = async (id: number, current: boolean) => {
    // Aqui geralmente não colocamos loading full screen para ser mais fluido, 
    // mas o load() no final vai disparar um breve loading.
    await toggleAviso(id, current);
    load();
  };

  // Helper de cores
  const typeColor = (t: string) => 
    t === 'alerta' ? 'red' : t === 'sucesso' ? 'green' : t === 'aviso' ? 'orange' : 'blue';

  return (
    <Container size="xl" py="lg">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>Gerenciador de Avisos da TV</Title>
          <Text c="dimmed">Crie mensagens para rodapé (ticker) ou tela cheia (slide)</Text>
        </div>
        <Button leftSection={<IconPlus size={18} />} onClick={open}>Novo Aviso</Button>
      </Group>

      <Card withBorder shadow="sm" radius="md">
        {/* 2. ADICIONE O OVERLAY AQUI */}
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
        
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Status</Table.Th>
              <Table.Th>Título / Mensagem</Table.Th>
              <Table.Th>Escopo</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Formato</Table.Th>
              <Table.Th>Validade</Table.Th>
              <Table.Th style={{textAlign:'right'}}>Ações</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {avisos.map((aviso) => {
              const isExpired = new Date(aviso.valido_ate) < new Date();
              return (
                <Table.Tr key={aviso.id} style={{ opacity: isExpired ? 0.5 : 1 }}>
                  <Table.Td>
                      <Switch 
                        checked={aviso.ativo && !isExpired} 
                        disabled={isExpired}
                        onChange={() => handleToggle(aviso.id, aviso.ativo)} 
                        color="green"
                      />
                  </Table.Td>
                  <Table.Td>
                    <Text fw={700}>{aviso.titulo}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>{aviso.mensagem}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={aviso.escopo === 'geral' ? 'gray' : 'cyan'}>
                      {aviso.escopo.toUpperCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="filled" color={typeColor(aviso.tipo)}>{aviso.tipo}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {aviso.exibir_como === 'ticker' ? 'Rodapé' : 'Slide Tela Cheia'}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {new Date(aviso.valido_ate).toLocaleDateString()} <br/>
                      <span style={{ fontSize: '0.8em', color: 'gray' }}>{new Date(aviso.valido_ate).toLocaleTimeString().slice(0,5)}</span>
                    </Text>
                  </Table.Td>
                  <Table.Td style={{textAlign:'right'}}>
                    <ActionIcon color="red" variant="subtle" onClick={() => handleDelete(aviso.id)}>
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {avisos.length === 0 && (
              <Table.Tr><Table.Td colSpan={7} align="center">Nenhum aviso registrado</Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* MODAL DE CRIAÇÃO (Sem alterações no form) */}
      <Modal opened={opened} onClose={close} title="Novo Aviso para TV" size="lg">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            
            <Grid>
               <Grid.Col span={8}>
                 <TextInput label="Título (Destaque)" placeholder="Ex: Meta Batida!" required {...form.getInputProps('titulo')} />
               </Grid.Col>
               <Grid.Col span={4}>
                 <Select 
                    label="Tipo de Mensagem"
                    data={[
                      { value: 'info', label: 'Informativo (Azul)' },
                      { value: 'sucesso', label: 'Sucesso/Celebração (Verde)' },
                      { value: 'alerta', label: 'Alerta Crítico (Vermelho)' },
                      { value: 'aviso', label: 'Atenção (Laranja)' },
                    ]}
                    {...form.getInputProps('tipo')}
                 />
               </Grid.Col>
            </Grid>
            
            <Textarea label="Mensagem Detalhada (Opcional)" placeholder="Ex: Parabéns à equipe da Usinagem pelo resultado..." rows={3} {...form.getInputProps('mensagem')} />

            <Grid>
               <Grid.Col span={6}>
                 <Select 
                    label="Onde exibir? (Escopo)"
                    data={[
                      { value: 'geral', label: 'Todas as TVs (Geral)' },
                      { value: 'usinagem', label: 'Apenas Usinagem' },
                      { value: 'montagem', label: 'Apenas Montagem' },
                    ]}
                    {...form.getInputProps('escopo')}
                 />
               </Grid.Col>
               <Grid.Col span={6}>
                 <Select 
                    label="Formato de Exibição"
                    data={[
                      { value: 'ticker', label: 'Ticker (Texto correndo no rodapé)' },
                      { value: 'slide', label: 'Slide (Tela cheia no carrossel)' },
                    ]}
                    {...form.getInputProps('exibir_como')}
                 />
               </Grid.Col>
            </Grid>

            <Text size="sm" fw={500} mt="xs">Válido até:</Text>
            <Group grow>
               <TextInput type="date" required {...form.getInputProps('valido_ate_data')} />
               <TextInput type="time" required {...form.getInputProps('valido_ate_hora')} />
            </Group>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={close}>Cancelar</Button>
              <Button type="submit" color="blue" loading={loading}>Publicar Aviso</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}