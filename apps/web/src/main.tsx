import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import './auth/auth.css';
import { AuthProvider } from './auth/AuthProvider';
import { AuthGate } from './auth/AuthGate';

const App = lazy(() => import('./App'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <Suspense fallback={<div className="auth-loading"><div className="auth-spinner"/><span>Loading workspace…</span></div>}>
          <App />
        </Suspense>
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>,
);
