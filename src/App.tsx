import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import UploadPage from './features/upload/UploadPage';
import DashboardDia from './features/dia/DashboardDia';
import GraficosPage from './features/graficos/GraficosPage';
import UploadDetalhePage from './features/upload/UploadDetalhePage';
import ConfigGeralPage from './features/config/ConfigGeralPage';
import RendimentoPage from './features/funcionario/RendFuncionarioPage';
import FuncionariosMetaPage from './features/funcionarios/FuncionariosMetaPage';
import TvDashboardPage from './features/tv/TvDashboardPage'; // ⬅ NOVO

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rotas normais com Layout (sidebar, header, etc.) */}
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dia" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/upload/:data/:uploadId" element={<UploadDetalhePage />} />
          <Route path="/dia" element={<DashboardDia />} />
          <Route path="/colaboradores" element={<FuncionariosMetaPage />} />
          <Route path="/rendimento" element={<RendimentoPage />} />
          <Route path="/graficos" element={<GraficosPage />} />
          <Route path="/config" element={<ConfigGeralPage />} />
        </Route>

        {/* Rota da TV em modo kiosk (sem Layout) */}
        <Route path="/tv" element={<TvDashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
