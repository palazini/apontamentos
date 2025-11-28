import { useNavigate } from 'react-router-dom';
import { Title, Text, SimpleGrid, UnstyledButton, ThemeIcon, Container, Stack, Button } from '@mantine/core';
import { IconEngine, IconBox, IconChartBar, IconArrowLeft } from '@tabler/icons-react';

export default function TvMenuPage() {
  const navigate = useNavigate();

  const options = [
    {
      id: 'geral',
      label: 'Visão Geral',
      desc: 'Todas as máquinas (Usinagem + Montagem)',
      icon: <IconChartBar size={50} />,
      color: 'blue',
      path: '/tv/geral',
    },
    {
      id: 'usinagem',
      label: 'Usinagem',
      desc: 'Painel exclusivo de máquinas de corte e usinagem',
      icon: <IconEngine size={50} />,
      color: 'orange',
      path: '/tv/usinagem',
    },
    {
      id: 'montagem',
      label: 'Montagem',
      desc: 'Painel exclusivo das bancadas de montagem',
      icon: <IconBox size={50} />,
      color: 'grape',
      path: '/tv/montagem',
    },
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      
      {/* Botão de Voltar no Canto Superior Esquerdo */}
      <Button
        variant="subtle"
        color="gray"
        size="md"
        leftSection={<IconArrowLeft size={20} />}
        onClick={() => navigate('/dia')}
        style={{ position: 'absolute', top: 24, left: 24 }}
      >
        Voltar
      </Button>

      <Container size="lg" w="100%">
        <Stack align="center" mb={60} gap="xs">
            <Title order={1} style={{ fontSize: '3rem', color: '#1f2937' }}>Selecione o Painel</Title>
            <Text c="dimmed" size="xl">Escolha qual setor deseja monitorar nesta tela</Text>
        </Stack>

        <SimpleGrid cols={3} spacing={30}>
          {options.map((opt) => (
            <UnstyledButton
              key={opt.id}
              onClick={() => navigate(opt.path)}
              style={{
                background: 'white',
                borderRadius: 16,
                padding: 40,
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.2s ease',
                height: '100%',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)';
                e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.borderColor = `var(--mantine-color-${opt.color}-4)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              <Stack align="center" gap="md">
                <ThemeIcon 
                    size={100} 
                    radius={100} 
                    variant="light" 
                    color={opt.color}
                    style={{ marginBottom: 10 }}
                >
                   {opt.icon}
                </ThemeIcon>
                <Title order={2} c="dark" style={{ fontSize: '1.8rem' }}>{opt.label}</Title>
                <Text c="dimmed" ta="center" size="lg" style={{ lineHeight: 1.4 }}>{opt.desc}</Text>
              </Stack>
            </UnstyledButton>
          ))}
        </SimpleGrid>
      </Container>
    </div>
  );
}