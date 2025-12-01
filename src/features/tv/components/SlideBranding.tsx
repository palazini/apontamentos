import { Center, Image, Text, Transition } from '@mantine/core';
import { useEffect, useState } from 'react';

export function SlideBranding() {
    const [showCompany, setShowCompany] = useState(false);
    useEffect(() => { const i = setInterval(() => setShowCompany(p => !p), 1500); return () => clearInterval(i); }, []);
    return (
        <Center style={{ height: '100%', width: '100%', background: 'white', borderRadius: 16 }}>
            <div style={{ width: '80%', height: '60%', position: 'relative', maxWidth: 800 }}>
                <Transition mounted={!showCompany} transition="scale" duration={800} timingFunction="ease">{(styles) => (<div style={{ ...styles, position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><Image src="/logos/melhoria-continua.png" fit="contain" h={700} w="auto" fallbackSrc="https://placehold.co/800x600?text=Departamento" /><Text size="2rem" fw={900} mt="xl" c="dimmed" style={{ letterSpacing: 2 }}>A CADA DIA, UM POUCO MELHOR</Text></div>)}</Transition>
                <Transition mounted={showCompany} transition="scale" duration={800} timingFunction="ease">{(styles) => (<div style={{ ...styles, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Image src="/logos/spirax-sarco.png" fit="contain" h={700} w="auto" fallbackSrc="https://placehold.co/800x600?text=Spirax+Sarco" /></div>)}</Transition>
            </div>
        </Center>
    );
}
