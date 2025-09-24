import { Stack, Title, Text, NavLink } from '@mantine/core';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import {
  IconUpload, IconCalendarTime, IconTarget, IconLink as IconAlias, IconChartHistogram,
} from '@tabler/icons-react';

function Item({
  to, label, icon,
}: { to: string; label: string; icon: React.ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <NavLink
      component={RouterNavLink}
      to={to}
      label={label}
      leftSection={icon}
      active={active}
      styles={{
        label: { fontWeight: 600 },
      }}
    />
  );
}

export default function Sidebar() {
  return (
    <Stack gap="md" p="md">
      <div>
        <Title order={4} style={{ color: '#0800A8', letterSpacing: 0.3 }}>Fábrica • Metas</Title>
        <Text size="xs" c="dimmed" mt={2}>Acompanhamento diário</Text>
      </div>

      <Stack gap={4} mt="sm">
        <Item to="/dia" label="Visão do Dia" icon={<IconCalendarTime size={18} />} />
        <Item to="/graficos" label="Gráficos" icon={<IconChartHistogram size={18} />} />
        <Item to="/upload" label="Upload" icon={<IconUpload size={18} />} />
        <Item to="/metas" label="Metas" icon={<IconTarget size={18} />} />
        <Item to="/mapeamento" label="Mapeamento" icon={<IconAlias size={18} />} />
      </Stack>

      <div style={{ marginTop: 'auto', opacity: 0.7 }}>
        <Text size="xs">v0.1 • {new Date().getFullYear()}</Text>
      </div>
    </Stack>
  );
}
