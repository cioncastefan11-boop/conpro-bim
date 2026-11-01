import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SesiuneProvider } from './lib/sesiune';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SesiuneProvider>
        <App />
      </SesiuneProvider>
    </BrowserRouter>
  </StrictMode>,
);
