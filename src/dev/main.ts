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
  const item = renderLink(scenario.name, scenarioUrl(scenario.name), scenario.description);
  item.dataset.scenario = scenario.name;
  return item;
}

function renderLink(name: string, url: string, descriptionText: string): HTMLElement {
  const item = document.createElement('li');
  item.className = 'scenario';

  const text = document.createElement('div');
  const link = document.createElement('a');
  link.href = url;
  link.textContent = name;
  const description = document.createElement('p');
  description.textContent = descriptionText;
  text.append(link, description);

  const qr = document.createElement('img');
  qr.src = qrImageUrl(url);
  qr.alt = `QR code for ${name}`;
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

  // MK-36 netcode spike: not a scenario (it needs two browsers), so it's listed by hand.
  const spike = document.createElement('section');
  const spikeTitle = document.createElement('h2');
  spikeTitle.textContent = 'Online (spike)';
  const spikeItems = document.createElement('ul');
  spikeItems.append(
    renderLink(
      'net-spike-host',
      `${window.location.origin}/?spike=net&role=host`,
      'Host a 2-player WebRTC test race; it shows the client link + QR code to open on a second device.',
    ),
  );
  spike.append(spikeTitle, spikeItems);
  app.append(spike);
}
