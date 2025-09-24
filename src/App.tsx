import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import UploadPage from './features/upload/UploadPage';
import DashboardDia from './features/dia/DashboardDia';
import MetasPage from './features/metas/MetasPage';
import MapeamentoPage from './features/mapeamento/MapeamentoPage';
import GraficosPage from './features/graficos/GraficosPage';
import UploadDetalhePage from './features/upload/UploadDetalhePage';


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dia" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/upload/:data/:uploadId" element={<UploadDetalhePage />} />
          <Route path="/dia" element={<DashboardDia />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/mapeamento" element={<MapeamentoPage />} />
          <Route path="/graficos" element={<GraficosPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
