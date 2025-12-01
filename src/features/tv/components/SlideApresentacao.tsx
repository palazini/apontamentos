import { Center, Image, Loader, Text } from '@mantine/core';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export function SlideApresentacao({ url, pagina }: { url: string, pagina: number }) {
    const isImg = url.match(/\.(jpeg|jpg|gif|png)$/i) != null;
    if (isImg) {
        return (
            <Center h="100%" bg="black" style={{ overflow: 'hidden' }}>
                <Image src={url} fit="contain" h="100%" w="100%" />
            </Center>
        );
    }
    return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Document
                file={url}
                loading={<Loader color="white" />}
                error={<Text c="red">Erro ao carregar PDF.</Text>}
            >
                <Page
                    pageNumber={pagina}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    height={window.innerHeight}
                    className="pdf-page-canvas"
                />
            </Document>
            <style>{` .react-pdf__Page__canvas { margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.5); } `}</style>
        </div>
    );
}
