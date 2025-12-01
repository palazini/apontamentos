// src/features/dia/DashboardDia.tsx
import { DateInput, TimeInput } from '@mantine/dates';
import {
  Group, SimpleGrid, Loader, Title, Grid, Text, SegmentedControl
} from '@mantine/core';

import { useDashboardData } from './hooks/useDashboardData';
import { DashboardSummaryCard } from './components/DashboardSummaryCard';
import { DashboardCentroCard } from './components/DashboardCentroCard';

/* -------------------- Página -------------------- */
export default function DashboardDia() {
  const {
    hora,
    setHora,
    dataWip,
    handleDataWipChange,
    scope,
    setScope,
    loading,
    linhas,
    fabrica,
    isPast,
    isFuture,
    parseLocalDateString
  } = useDashboardData();

  return (
    <div>
      <Group justify="space-between" align="center" mb="md">
        <Title order={2}>Visão do dia</Title>
        <SegmentedControl
          value={scope}
          onChange={setScope}
          data={[
            { label: 'Geral', value: 'geral' },
            { label: 'Usinagem', value: 'usinagem' },
            { label: 'Montagem', value: 'montagem' },
          ]}
        />
      </Group>

      <Grid gutter="md" mb="lg">
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <DateInput
            label="Data do WIP"
            value={dataWip}
            onChange={handleDataWipChange}
            valueFormat="DD/MM/YYYY"
            locale="pt-BR"
            dateParser={(s) => parseLocalDateString(s) ?? new Date()}
            placeholder="Selecione a data"
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <TimeInput
            label="Hora de referência (05:30 → 00:44)"
            value={hora}
            onChange={(e) => setHora(e.currentTarget.value)}
            disabled={isPast || isFuture}
            description={
              isPast ? 'Dia concluído — usando janela completa'
                : isFuture ? 'Dia futuro — aguardando início'
                  : undefined
            }
          />
        </Grid.Col>

        {/* CARD DE TOTAL (LAYOUT RESTAURADO) */}
        <Grid.Col span={{ base: 12, md: 12, lg: 4 }}>
          <DashboardSummaryCard
            fabrica={fabrica}
            scope={scope}
            isPast={isPast}
            isFuture={isFuture}
          />
        </Grid.Col>
      </Grid>

      {loading ? (
        <Group><Loader size="sm" /><Text size="sm">Carregando...</Text></Group>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {linhas.map((r) => (
            <DashboardCentroCard
              key={r.centro_id}
              linha={r}
              isFuture={isFuture}
            />
          ))}
        </SimpleGrid>
      )}
    </div>
  );
}