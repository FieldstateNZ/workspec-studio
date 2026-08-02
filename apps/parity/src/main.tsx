import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@workspec/design/fonts.css';
import '@workspec/c4-ui/styles.css';
import { renderScenario, type Theme } from './scenarios.js';

// Hash routing: #<scenario>/<theme>, e.g. #cards/dark. Defaults: cards/light.
function parse(): { scenario: string; theme: Theme } {
  const [scenario = 'cards', theme = 'light'] = window.location.hash
    .replace(/^#/, '')
    .split('/');
  return { scenario, theme: theme === 'dark' ? 'dark' : 'light' };
}

const root = createRoot(document.getElementById('root') as HTMLElement);

function render(): void {
  const { scenario, theme } = parse();
  document.body.style.background = theme === 'dark' ? '#0d0d10' : '#ffffff';
  root.render(<StrictMode>{renderScenario(scenario, theme)}</StrictMode>);
}

window.addEventListener('hashchange', render);
render();
