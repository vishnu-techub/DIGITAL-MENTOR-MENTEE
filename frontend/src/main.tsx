import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { PwaProvider } from './context/PwaContext';
import { App } from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <NotificationProvider>
        <PwaProvider>
          <App />
        </PwaProvider>
      </NotificationProvider>
    </AuthProvider>
  </React.StrictMode>
);
