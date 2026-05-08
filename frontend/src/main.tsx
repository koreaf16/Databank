import React from 'react';
import { createRoot } from 'react-dom/client';

import './styles/tokens.css';
import './styles/sidebar.css';
import './styles/sidebar-v3.css';
import './styles/page.css';
import './styles/workspace.css';
import './styles/pages.css';
import './styles/settings.css';
import './styles/common.css';

import App from './app.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
