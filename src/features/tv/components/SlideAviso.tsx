import { Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
    IconInfoCircle, IconCheck, IconSpeakerphone, IconAlertTriangle
} from '@tabler/icons-react';
import type { AvisoTV } from '../../../services/db';

export function SlideAviso({ aviso }: { aviso: AvisoTV }) {
    if (!aviso) return null;
    const configs = {
        info: { color: 'blue', icon: IconInfoCircle, bg: 'var(--mantine-color-blue-0)' },
        alerta: { color: 'red', icon: IconAlertTriangle, bg: 'var(--mantine-color-red-0)' },
        sucesso: { color: 'green', icon: IconCheck, bg: 'var(--mantine-color-green-0)' },
        aviso: { color: 'orange', icon: IconSpeakerphone, bg: 'var(--mantine-color-orange-0)' },
    };
    const { color, icon: Icon, bg } = configs[aviso.tipo] || configs.info;
    return (
        <Center h="100%" bg={bg} style={{ borderRadius: 16, padding: 32 }}>
            <Stack align="center" gap="xl" style={{ maxWidth: '80%' }}>
                <ThemeIcon size={120} radius="100%" color={color} variant="filled"><Icon size={70} /></ThemeIcon>
                <Title order={1} size="4rem" ta="center" c="dark" style={{ lineHeight: 1.1 }}>{aviso.titulo}</Title>
                {aviso.mensagem && <Text size="2.5rem" ta="center" c="dimmed" style={{ lineHeight: 1.3 }}>{aviso.mensagem}</Text>}
            </Stack>
        </Center>
    );
}
