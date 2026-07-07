import { StrictMode } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { Demo } from './demo.js';
import { Marketing } from './marketing.js';
import { useRoute } from './router.js';
import './styles.css';

function App(): ReactElement {
  const route = useRoute();
  return route === 'demo' ? <Demo /> : <Marketing />;
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
