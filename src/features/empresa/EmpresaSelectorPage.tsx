// src/features/empresa/EmpresaSelectorPage.tsx
import { useNavigate } from 'react-router-dom';
import { Card, Title, Text, Group, Stack, Badge, ThemeIcon, Box } from '@mantine/core';
import { IconBuilding, IconCheck, IconChevronRight, IconBuildingFactory2, IconTool } from '@tabler/icons-react';
import { useTenant, type Empresa } from '../../contexts/TenantContext';
import { useState } from 'react';

const EMPRESAS: (Empresa & {
    icon: React.ReactNode;
})[] = [
        {
            id: 1,
            slug: 'spirax',
            nome: 'Spirax Sarco',
            icon: <IconBuildingFactory2 size={24} stroke={1.5} />
        },
        {
            id: 2,
            slug: 'hiter',
            nome: 'Hiter Controls',
            icon: <IconTool size={24} stroke={1.5} />
        },
    ];

const STORAGE_KEY = 'empresaPreferida';

export default function EmpresaSelectorPage() {
    const navigate = useNavigate();
    const { empresa: empresaAtual, setEmpresa } = useTenant();
    const [hoveredId, setHoveredId] = useState<number | null>(null);

    const handleSelect = (empresa: Empresa) => {
        localStorage.setItem(STORAGE_KEY, empresa.slug);
        setEmpresa(empresa);
        navigate('/dia');
    };

    return (
        <Box
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8fafc',
                padding: 32,
            }}
        >
            <Stack gap={36} align="center">
                {/* Header */}
                <Stack gap="sm" align="center">
                    <ThemeIcon
                        size={64}
                        radius="xl"
                        variant="light"
                        color="blue"
                    >
                        <IconBuilding size={32} stroke={1.5} />
                    </ThemeIcon>

                    <Title
                        order={2}
                        ta="center"
                        c="dark.7"
                        fw={600}
                    >
                        Selecione a Empresa
                    </Title>
                    <Text c="gray.6" ta="center" size="sm">
                        Escolha para acessar o painel
                    </Text>
                </Stack>

                {/* Company Cards */}
                <Group gap="lg" justify="center">
                    {EMPRESAS.map((emp) => {
                        const isAtual = empresaAtual.id === emp.id;
                        const isHovered = hoveredId === emp.id;

                        return (
                            <Card
                                key={emp.id}
                                shadow={isHovered ? 'md' : 'sm'}
                                radius="lg"
                                padding="xl"
                                w={220}
                                style={{
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                                    border: isAtual ? '2px solid var(--mantine-color-blue-5)' : '1px solid #e5e7eb',
                                    background: isAtual ? 'var(--mantine-color-blue-0)' : 'white',
                                }}
                                onClick={() => handleSelect(emp)}
                                onMouseEnter={() => setHoveredId(emp.id)}
                                onMouseLeave={() => setHoveredId(null)}
                            >
                                <Stack gap="md" align="center">
                                    <ThemeIcon
                                        size={48}
                                        radius="md"
                                        variant="light"
                                        color="blue"
                                    >
                                        {emp.icon}
                                    </ThemeIcon>

                                    <Title order={5} c="dark.7" ta="center">
                                        {emp.nome}
                                    </Title>

                                    {isAtual ? (
                                        <Badge
                                            variant="light"
                                            color="blue"
                                            size="sm"
                                            leftSection={<IconCheck size={12} />}
                                        >
                                            Atual
                                        </Badge>
                                    ) : (
                                        <Group gap={4} style={{ opacity: isHovered ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                                            <Text size="xs" c="blue" fw={500}>Acessar</Text>
                                            <IconChevronRight size={14} color="var(--mantine-color-blue-5)" />
                                        </Group>
                                    )}
                                </Stack>
                            </Card>
                        );
                    })}
                </Group>

                {/* Footer */}
                <Text size="xs" c="gray.5" ta="center">
                    Preferência salva neste navegador
                </Text>
            </Stack>
        </Box>
    );
}
