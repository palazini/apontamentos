import { pdfjs } from 'react-pdf';

// Configura o worker para funcionar com o Vite
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;