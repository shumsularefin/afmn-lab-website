import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Scope "/update" (no trailing slash): Firebase Hosting serves the app at /update. The page can finish
  // loading before this module runs (the Firebase config is fetched first), so don't wait for 'load' twice.
  const register = () =>
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL.replace(/\/$/, '') })
      .catch(console.error);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
