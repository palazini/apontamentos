import { Badge, Card, Group, Progress, Text } from '@mantine/core';
import type { LinhaCentro } from '../types';
import { clamp, colorFor } from '../utils';

interface DashboardCentroCardProps {
    linha: LinhaCentro;
    isFuture: boolean;
}

export function DashboardCentroCard({ linha: r, isFuture }: DashboardCentroCardProps) {
    const pctEsperado = r.esperado_h > 0 ? (r.produzido_h / r.esperado_h) * 100 : 0;
    const pctMeta = r.meta_h > 0 ? (r.produzido_h / r.meta_h) * 100 : 0;
    const cor = colorFor(r.aderencia_pct ?? 0);

    return (
        <Card withBorder shadow="sm" radius="lg" padding="md">
            <Group justify="space-between" mb="xs">
                <Text fw={600}>{r.centro}</Text>
                {isFuture ? (
                    <Badge variant="light" color="gray">FUTURO</Badge>
                ) : (
                    <Badge color={cor}>{`${((r.aderencia_pct ?? 0)).toFixed(2)}%`}</Badge>
                )}
            </Group>

            <Text size="sm">Produzido: <b>{r.produzido_h.toFixed(2)} h</b></Text>
            <Text size="sm">Esperado: <b>{r.esperado_h.toFixed(2)} h</b></Text>
            <Text size="sm">Meta diária: <b>{r.meta_h.toFixed(2)} h</b></Text>
            <Text size="sm">Desvio: <b>{r.desvio_h.toFixed(2)} h</b></Text>

            {/* Barras de progresso dual */}
            <Text size="xs" c="dimmed" mt="xs">vs esperado</Text>
            <Progress size="sm" value={clamp(pctEsperado)} color={colorFor(pctEsperado)} striped />

            <Text size="xs" c="dimmed" mt={6}>vs meta do dia</Text>
            <Progress size="sm" value={clamp(pctMeta)} color="var(--mantine-primary-color-filled)" />

            <Group justify="space-between" mt="sm">
                <Badge variant="dot">{pctEsperado.toFixed(0)}% esp.</Badge>
                <Badge variant="dot">{pctMeta.toFixed(0)}% meta</Badge>
            </Group>
        </Card>
    );
}
