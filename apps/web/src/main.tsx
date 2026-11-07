import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { Dashboard } from './pages/Dashboard';
import { EditorPage } from './pages/EditorPage';
import { TourPage } from './pages/TourPage';
// Bundled with the app (no font CDN): works offline and sends nothing to third parties.
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/fraunces';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/p/:id" element={<EditorPage />} />
          <Route path="/t/:slug" element={<TourPage />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
