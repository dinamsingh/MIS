import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@presentation/App';
import { Agentation } from 'agentation';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
    {import.meta.env.DEV && <Agentation />}
  </StrictMode>,
);
