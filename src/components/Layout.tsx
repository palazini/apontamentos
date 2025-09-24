// src/components/Layout.tsx
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  AppShell,
  NavLink,
  Group,
  Text,
  Image,
  Badge,
} from '@mantine/core';
import {
  IconCalendarStats,
  IconChartHistogram,
  IconUpload,
  IconTarget,
  IconMap,
} from '@tabler/icons-react';

function Brand() {
  return (
    <Group gap="sm">
      <Image src="/logo.png" alt="logo" h={50} />
    </Group>
  );
}

const links = [
  { label: 'Visão do Dia', to: '/dia', icon: <IconCalendarStats size={16} /> },
  { label: 'Gráficos', to: '/graficos', icon: <IconChartHistogram size={16} /> },
  { label: 'Upload', to: '/upload', icon: <IconUpload size={16} /> },
  { label: 'Metas', to: '/metas', icon: <IconTarget size={16} /> },
  { label: 'Mapeamento', to: '/mapeamento', icon: <IconMap size={16} /> },
];

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 232, breakpoint: 'sm' }} padding="md">
      {/* HEADER */}
      <AppShell.Header withBorder style={{ backdropFilter: 'saturate(180%) blur(6px)', background: 'rgba(255,255,255,0.85)' }}>
        <Group h="100%" px="md" justify="space-between">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Brand />
          </Link>
          <Badge variant="light" color="gray">v0.1</Badge>
        </Group>
      </AppShell.Header>
      
      <AppShell.Navbar p="xs" withBorder>
        <nav>
          {links.map((l) => (
            <NavLink
              key={l.to}
              component={Link}
              to={l.to}
              label={l.label}
              leftSection={l.icon}
              active={pathname === l.to || (l.to !== '/' && pathname.startsWith(l.to))}
              variant="light"
              style={{ borderRadius: 10, marginBottom: 6 }}
            />
          ))}
        </nav>

        <div style={{ marginTop: 'auto', opacity: 0.6, fontSize: 12, padding: 8 }}>
          <Text c="dimmed">© {new Date().getFullYear()}</Text>
        </div>
      </AppShell.Navbar>

      {/* AQUI É O PONTO-CHAVE: Outlet para renderizar as páginas */}
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
