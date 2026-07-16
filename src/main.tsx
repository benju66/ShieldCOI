import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import Root from './Root.tsx';
import {AuthProvider} from './AuthContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
