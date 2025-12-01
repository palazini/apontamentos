import { Badge, Card, Group, Progress, Text } from '@mantine/core';
import type { FabricaData } from '../types';
import { clamp, colorFor } from '../utils';

interface DashboardSummaryCardProps {
    fabrica: FabricaData;
    scope: string;
    isPast: boolean;
    isFuture: boolean;
}

export function DashboardSummaryCard({ fabrica, scope, isPast, isFuture }: DashboardSummaryCardProps) {
    return (
        <Card withBorder shadow="sm" radius="lg" padding="md">
            <Group justify="space-between" mb="xs">
                <Text fw={600}>Total {scope === 'geral' ? 'Fábrica' : scope === 'usinagem' ? 'Usinagem' : 'Montagem'}</Text>
                <Group gap="xs">
                    {isPast && <Badge variant="light" color="gray">Dia completo</Badge>}
                    {isFuture ? (
                        <Badge variant="light" color="gray">FUTURO</Badge>
                    ) : (
                        <Badge color={colorFor((fabrica.aderencia_pct ?? 0))}>
                            {`${((fabrica.aderencia_pct ?? 0)).toFixed(2)}%`}
                        </Badge>
                    )}
                </Group>
            </Group>

            <Text size="sm">Produzido: <b>{fabrica.produzido_h.toFixed(2)} h</b></Text>
            <Text size="sm">Esperado: <b>{fabrica.esperado_h.toFixed(2)} h</b></Text>
            <Text size="sm">Meta diária: <b>{fabrica.meta_h.toFixed(2)} h</b></Text>

            {/* Progresso vs esperado agora */}
            <Text size="xs" c="dimmed" mt="xs">Progresso vs esperado</Text>
            <Progress
                size="sm"
                value={clamp(fabrica.esperado_h > 0 ? (fabrica.produzido_h / fabrica.esperado_h) * 100 : 0)}
                color={colorFor(
                    fabrica.esperado_h > 0 ? (fabrica.produzido_h / fabrica.esperado_h) * 100 : 0
                )}
                striped
            />

            {/* Projeção do dia */}
            <Group gap="sm" mt="xs">
                <Badge variant="dot">Projeção: {fabrica.projEod_h.toFixed(2)} h</Badge>
                <Badge color={fabrica.gapEod_h >= 0 ? 'green' : 'red'} variant="light">
                    Gap vs meta: {fabrica.gapEod_h >= 0 ? '+' : ''}{fabrica.gapEod_h.toFixed(2)} h
                </Badge>
            </Group>
        </Card>
    );
}
