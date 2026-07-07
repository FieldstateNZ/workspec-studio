import { StrictMode } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { C4Stub } from './c4-stub.js';
import { Decisions } from './decisions.js';
import { Demo } from './demo.js';
import { useRoute } from './router.js';
import { StudioHome } from './studio-home.js';
import './styles.css';

function App(): ReactElement {
  const route = useRoute();
  switch (route) {
    case 'decisions':
      return <Decisions />;
    case 'decisions-demo':
      return <Demo />;
    case 'c4':
      return <C4Stub />;
    case 'studio-home':
      return <StudioHome />;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
