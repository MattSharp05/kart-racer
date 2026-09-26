import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../game/storage/store';
import {
  clearSettingsSections,
  registerSettingsSection,
  settingsSectionsIn,
  type SettingsContext,
  type SettingsSection,
} from './settingsSections';

const ctx: SettingsContext = { store: new MemoryStore() };

function section(id: string, extra: Partial<SettingsSection> = {}): SettingsSection {
  return { id, group: 'controls', render: () => undefined, ...extra };
}

const ids = (list: SettingsSection[]) => list.map((s) => s.id);

describe('settings sections (MK-43)', () => {
  beforeEach(clearSettingsSections);

  it('lists a group’s sections by order, then registration order', () => {
    registerSettingsSection(section('tilt', { order: 2 }));
    registerSettingsSection(section('hand', { order: 1 }));
    registerSettingsSection(section('size', { order: 2 }));
    registerSettingsSection(section('mute', { group: 'sound' }));
    expect(ids(settingsSectionsIn('controls', ctx))).toEqual(['hand', 'tilt', 'size']);
    expect(ids(settingsSectionsIn('sound', ctx))).toEqual(['mute']);
    expect(settingsSectionsIn('profile', ctx)).toEqual([]);
  });

  it('leaves out sections that say they are not visible', () => {
    registerSettingsSection(section('always'));
    registerSettingsSection(section('never', { visible: () => false }));
    registerSettingsSection(section('with-sound', { visible: (c) => c.sound !== undefined }));
    expect(ids(settingsSectionsIn('controls', ctx))).toEqual(['always']);
    const sound = { isMuted: () => false, toggle: () => {} };
    expect(ids(settingsSectionsIn('controls', { ...ctx, sound }))).toEqual([
      'always',
      'with-sound',
    ]);
  });

  it('registering an id again replaces the section (hot reload)', () => {
    registerSettingsSection(section('hand', { order: 1 }));
    registerSettingsSection(section('hand', { order: 1, group: 'profile' }));
    expect(settingsSectionsIn('controls', ctx)).toEqual([]);
    expect(ids(settingsSectionsIn('profile', ctx))).toEqual(['hand']);
  });
});

describe('built-in sections', () => {
  it('Sound shows when there is a sound control; Profile only once a nickname is saved', async () => {
    clearSettingsSections();
    await import('./settings/sound');
    await import('./settings/profile');
    const store = new MemoryStore();
    const sound = { isMuted: () => false, toggle: () => {} };
    expect(ids(settingsSectionsIn('sound', { store }))).toEqual([]);
    expect(ids(settingsSectionsIn('sound', { store, sound }))).toEqual(['sound']);
    expect(settingsSectionsIn('profile', { store })).toEqual([]);
    store.set('kart-racer:settings', JSON.stringify({ version: 1, nickname: '  ' }));
    expect(settingsSectionsIn('profile', { store })).toEqual([]);
    store.set(
      'kart-racer:settings',
      JSON.stringify({ version: 1, nickname: 'Matt', colour: 'blue' }),
    );
    expect(ids(settingsSectionsIn('profile', { store }))).toEqual(['profile']);
  });
});
