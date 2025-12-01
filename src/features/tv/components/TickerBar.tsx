import { Text } from '@mantine/core';
import type { AvisoTV } from '../../../services/db';

export function TickerBar({ avisos }: { avisos: AvisoTV[] }) {
    const fullText = avisos.map(a => {
        const prefix = a.tipo === 'alerta' ? '⚠️ ' : a.tipo === 'sucesso' ? '🎉 ' : 'ℹ️ ';
        return `${prefix} ${a.titulo.toUpperCase()}: ${a.mensagem || ''}`;
    }).join('   •   ');
    const hasAlert = avisos.some(a => a.tipo === 'alerta');
    return (
        <div style={{ background: hasAlert ? '#d9480f' : '#1f2937', color: 'white', height: 60, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', boxShadow: '0 -4px 10px rgba(0,0,0,0.1)', zIndex: 9999 }}>
            <div className="ticker-wrapper" style={{ whiteSpace: 'nowrap', position: 'absolute' }}>
                <Text fw={700} size="xl" style={{ display: 'inline-block', paddingLeft: '100vw' }}>{fullText}</Text>
            </div>
            <style>{` .ticker-wrapper { animation: ticker 30s linear infinite; } @keyframes ticker { 0% { transform: translate3d(0, 0, 0); } 100% { transform: translate3d(-100%, 0, 0); } } `}</style>
        </div>
    );
}
