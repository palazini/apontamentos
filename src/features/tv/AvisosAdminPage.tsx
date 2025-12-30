import { useEffect, useState } from 'react';
import {
  Button, Card, Container, Group, Modal, Select, Stack, Table, Text, TextInput, Title, Badge, ActionIcon, Switch, Textarea, Grid, LoadingOverlay, FileInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconTrash, IconPlus, IconUpload, IconFileTypePdf, IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { useEmpresaId } from '../../contexts/TenantContext';
import { fetchTodosAvisos, createAviso, deleteAviso, toggleAviso, type AvisoTV } from '../../services/db';
import { supabase } from '../../lib/supabaseClient';

export default function AvisosAdminPage() {
  const empresaId = useEmpresaId();
  const [avisos, setAvisos] = useState<AvisoTV[]>([]);
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const form = useForm({
    initialValues: {
      titulo: '',
      mensagem: '',
      tipo: 'info', // info, alerta, sucesso, aviso
      escopo: 'geral', // geral, usinagem, montagem
      exibir_como: 'ticker', // ticker, slide, apresentacao
      valido_ate_data: '',
      valido_ate_hora: '23:59',
    },
    validate: {
      titulo: (val) => (val.length < 3 ? 'Titulo muito curto' : null),
      valido_ate_data: (val) => (!val ? 'Data obrigatoria' : null),
    },
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchTodosAvisos(empresaId);
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
      setLoading(true);
      let arquivoUrl: string | null = null;

      if (file && values.exibir_como === 'apresentacao') {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('tv-arquivos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('tv-arquivos').getPublicUrl(filePath);
        arquivoUrl = data.publicUrl;
      }

      const isoDate = new Date(`${values.valido_ate_data}T${values.valido_ate_hora}`).toISOString();

      await createAviso(empresaId, {
        titulo: values.titulo,
        mensagem: values.mensagem,
        tipo: values.tipo as any,
        escopo: values.escopo as any,
        exibir_como: values.exibir_como as any,
        valido_de: new Date().toISOString(),
        valido_ate: isoDate,
        arquivo_url: arquivoUrl ?? undefined,
      });

      form.reset();
      setFile(null);
      close();
      await load();
    } catch (e) {
      alert('Erro ao criar aviso/upload');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este aviso?')) return;
    setLoading(true);
    await deleteAviso(empresaId, id);
    await load();
  };

  const handleToggle = async (id: number, current: boolean) => {
    await toggleAviso(empresaId, id, current);
    load();
  };

  const handleChangePage = async (id: number, currentPage: number, delta: number) => {
    const newPage = Math.max(1, currentPage + delta);
    try {
      await supabase.from('avisos_tv').update({ pagina_atual: newPage }).eq('id', id);
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const typeColor = (t: string) =>
    (t === 'alerta' ? 'red' : t === 'sucesso' ? 'green' : t === 'aviso' ? 'orange' : 'blue');

  return (
    <Container size="xl" py="lg">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>Gerenciador de Avisos da TV</Title>
          <Text c="dimmed">Crie mensagens para rodape (ticker), slide ou apresentacao</Text>
        </div>
        <Button leftSection={<IconPlus size={18} />} onClick={open}>Novo Aviso</Button>
      </Group>

      <Card withBorder shadow="sm" radius="md">
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />

        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Status</Table.Th>
              <Table.Th>Titulo / Mensagem</Table.Th>
              <Table.Th>Escopo</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Formato</Table.Th>
              <Table.Th>Validade</Table.Th>
              <Table.Th>Controle</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Acoes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {avisos.map((aviso) => {
              const isExpired = new Date(aviso.valido_ate) < new Date();
              return (
                <Table.Tr
                  key={aviso.id}
                  style={{ opacity: isExpired ? 0.5 : 1 }}
                  bg={aviso.ativo && aviso.exibir_como === 'apresentacao' ? 'var(--mantine-color-blue-0)' : undefined}
                >
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
                    {aviso.exibir_como === 'ticker' ? 'Rodape' : aviso.exibir_como === 'apresentacao' ? <Badge color="violet" leftSection={<IconFileTypePdf size={14} />}>PDF / Arquivo</Badge> : 'Slide Tela Cheia'}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {new Date(aviso.valido_ate).toLocaleDateString()} <br />
                      <span style={{ fontSize: '0.8em', color: 'gray' }}>{new Date(aviso.valido_ate).toLocaleTimeString().slice(0, 5)}</span>
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {aviso.exibir_como === 'apresentacao' && aviso.ativo && !isExpired ? (
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                          variant="filled"
                          color="blue"
                          onClick={() => handleChangePage(aviso.id, aviso.pagina_atual || 1, -1)}
                          disabled={(aviso.pagina_atual || 1) <= 1}
                        >
                          <IconArrowLeft size={16} />
                        </ActionIcon>
                        <Badge size="lg" variant="filled" color="blue">
                          Pag {aviso.pagina_atual || 1}
                        </Badge>
                        <ActionIcon
                          variant="filled"
                          color="blue"
                          onClick={() => handleChangePage(aviso.id, aviso.pagina_atual || 1, 1)}
                        >
                          <IconArrowRight size={16} />
                        </ActionIcon>
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    <ActionIcon color="red" variant="subtle" onClick={() => handleDelete(aviso.id)}>
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {avisos.length === 0 && (
              <Table.Tr><Table.Td colSpan={8} align="center">Nenhum aviso registrado</Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal opened={opened} onClose={close} title="Novo Aviso para TV" size="lg">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              <Grid.Col span={8}>
                <TextInput label="Titulo (Destaque)" placeholder="Ex: Meta Batida!" required {...form.getInputProps('titulo')} />
              </Grid.Col>
              <Grid.Col span={4}>
                <Select
                  label="Tipo de Mensagem"
                  data={[
                    { value: 'info', label: 'Informativo (Azul)' },
                    { value: 'sucesso', label: 'Sucesso/Celebracao (Verde)' },
                    { value: 'alerta', label: 'Alerta Critico (Vermelho)' },
                    { value: 'aviso', label: 'Atencao (Laranja)' },
                  ]}
                  {...form.getInputProps('tipo')}
                />
              </Grid.Col>
            </Grid>

            <Textarea label="Mensagem Detalhada (Opcional)" placeholder="Ex: Parabens a equipe..." rows={3} {...form.getInputProps('mensagem')} />

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
                  label="Formato de Exibicao"
                  data={[
                    { value: 'ticker', label: 'Ticker (Texto correndo no rodape)' },
                    { value: 'slide', label: 'Slide (Tela cheia no carrossel)' },
                    { value: 'apresentacao', label: 'Apresentacao (PDF/Imagem)' },
                  ]}
                  {...form.getInputProps('exibir_como')}
                />
              </Grid.Col>
            </Grid>

            {form.values.exibir_como === 'apresentacao' && (
              <Card withBorder bg="var(--mantine-color-gray-0)">
                <Text size="sm" fw={500} mb="xs">Anexar Arquivo da Apresentacao</Text>
                <Text size="xs" c="dimmed" mb="md">Recomendado: PDF (salvar no PowerPoint). Imagens tambem funcionam.</Text>
                <FileInput
                  placeholder="Clique para selecionar arquivo"
                  leftSection={<IconUpload size={16} />}
                  accept="application/pdf,image/png,image/jpeg"
                  value={file}
                  onChange={setFile}
                  clearable
                />
              </Card>
            )}

            <Text size="sm" fw={500} mt="xs">Valido ate:</Text>
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
