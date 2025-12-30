// src/contexts/TenantContext.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Empresa = {
  id: number;
  slug: string;
  nome: string;
};

// Empresas conhecidas (hardcoded para performance)
export const EMPRESAS: Record<string, Empresa> = {
  spirax: { id: 1, slug: 'spirax', nome: 'Spirax Sarco' },
  hiter: { id: 2, slug: 'hiter', nome: 'Hiter Controls' },
};

const STORAGE_KEY = 'empresaPreferida';

// Detecta empresa pelo hostname ou localStorage
function detectEmpresa(): Empresa {
  // 1. Primeiro verifica o hostname (produção)
  const hostname = window.location.hostname.toLowerCase();

  if (hostname.startsWith('spirax.')) return EMPRESAS.spirax;
  if (hostname.startsWith('hiter.')) return EMPRESAS.hiter;
  if (hostname.includes('spirax')) return EMPRESAS.spirax;
  if (hostname.includes('hiter')) return EMPRESAS.hiter;

  // 2. Query param para desenvolvimento
  const params = new URLSearchParams(window.location.search);
  const empresaParam = params.get('empresa');
  if (empresaParam && EMPRESAS[empresaParam]) {
    return EMPRESAS[empresaParam];
  }

  // 3. Verifica preferência salva no localStorage
  const salva = localStorage.getItem(STORAGE_KEY);
  if (salva && EMPRESAS[salva]) {
    return EMPRESAS[salva];
  }

  // 4. Default: Spirax Sarco
  return EMPRESAS.spirax;
}

// Verifica se o usuário tem preferência salva
export function hasEmpresaPreference(): boolean {
  const salva = localStorage.getItem(STORAGE_KEY);
  return !!salva && !!EMPRESAS[salva];
}

// Limpa preferência salva
export function clearEmpresaPreference(): void {
  localStorage.removeItem(STORAGE_KEY);
}

type TenantContextType = {
  empresa: Empresa;
  empresaId: number;
  setEmpresa: (emp: Empresa) => void;
  isLoading: boolean;
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [empresa, setEmpresaState] = useState<Empresa>(() => detectEmpresa());
  const [isLoading] = useState(false);

  // Re-detecta se a URL mudar (útil para dev)
  useEffect(() => {
    const detected = detectEmpresa();
    if (detected.id !== empresa.id) {
      setEmpresaState(detected);
    }
  }, [window.location.hostname, window.location.search]);

  // Função para mudar empresa (e salvar no localStorage)
  const setEmpresa = (emp: Empresa) => {
    localStorage.setItem(STORAGE_KEY, emp.slug);
    setEmpresaState(emp);
  };

  const value: TenantContextType = {
    empresa,
    empresaId: empresa.id,
    setEmpresa,
    isLoading,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextType {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant deve ser usado dentro de TenantProvider');
  }
  return context;
}

// Hook helper para pegar só o empresaId
export function useEmpresaId(): number {
  return useTenant().empresaId;
}
