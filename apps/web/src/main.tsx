import { createRoot } from 'react-dom/client';
import { AppRouter } from './app/router';
import { ErrorBoundary } from './components/error-boundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AppRouter />
  </ErrorBoundary>
);
