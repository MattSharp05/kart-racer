import { scenarios } from '../scenarios';
import type { Scenario } from '../scenarios/registry';
import './dev.css';

const QR_SIZE = 120;

function scenarioUrl(name: string): string {
  return `${window.location.origin}/?scenario=${encodeURIComponent(name)}`;
}

function qrImageUrl(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(url)}`;
}

function renderScenario(scenario: Scenario): HTMLElement {
  const url = scenarioUrl(scenario.name);
  const item = document.createElement('li');
  item.className = 'scenario';
  item.dataset.scenario = scenario.name;

  const text = document.createElement('div');
  const link = document.createElement('a');
  link.href = url;
  link.textContent = scenario.name;
  const description = document.createElement('p');
  description.textContent = scenario.description;
  text.append(link, description);

  const qr = document.createElement('img');
  qr.src = qrImageUrl(url);
  qr.alt = `QR code for ${scenario.name}`;
  qr.width = QR_SIZE;
  qr.height = QR_SIZE;

  item.append(text, qr);
  return item;
}

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  const heading = document.createElement('h1');
  heading.textContent = 'Kart Racer — scenarios';
  const intro = document.createElement('p');
  intro.textContent =
    'Each link opens the game in an exact state. Add &paused=1 to freeze it, or &seed=<n> to vary it.';
  app.append(heading, intro);

  const groups = new Map<string, Scenario[]>();
  for (const scenario of scenarios.list()) {
    groups.set(scenario.group, [...(groups.get(scenario.group) ?? []), scenario]);
  }
  for (const [group, list] of groups) {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    title.textContent = group;
    const items = document.createElement('ul');
    items.append(...list.map(renderScenario));
    section.append(title, items);
    app.append(section);
  }
}
