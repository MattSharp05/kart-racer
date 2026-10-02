import { describe, expect, it } from 'vitest';
import { SPRITES, sprite, spriteUrl } from './sprites';

/** Every sprite id the approved MK8 Mode mockup uses. */
const MOCKUP_IDS = [
  ...[
    'mario',
    'luigi',
    'peach',
    'daisy',
    'yoshi',
    'toad',
    'koopa',
    'shyguy',
    'bowser',
    'dk',
    'wario',
    'waluigi',
  ].map((r) => `c_${r}`),
  ...[
    'green',
    'green3',
    'red',
    'red3',
    'banana',
    'banana3',
    'boomerang',
    'mushroom',
    'mushroom3',
    'golden',
    'coin',
  ]
    .concat([
      'fireflower',
      'bobomb',
      'star',
      'lightning',
      'blooper',
      'piranha',
      'bullet',
      'spiny',
      'horn',
      'crazy8',
    ])
    .map((i) => `i_${i}`),
  ...['cc50', 'cc100', 'cc150', 'cc200', 'mushroomcup', 'flowercup', 'starcup', 'specialcup'].map(
    (u) => `u_${u}`,
  ),
  ...['stadium', 'waterpark', 'canyon', 'ruins'].flatMap((c) => [`p_${c}`, `m_${c}`]),
  ...[
    'b_standard',
    'b_pipe',
    'b_mach8',
    'b_cat',
    'b_bdasher',
    'b_coupe',
    't_standard',
    't_monster',
    't_roller',
  ]
    .concat(['t_slick', 'g_super', 'g_cloud', 'g_parasol'])
    .map((v) => `v_${v}`),
  'logo',
  'bg_stadium',
];

describe('MK8 UI sprite table', () => {
  it('has every mockup sprite, with the mockup’s sizes', () => {
    for (const id of MOCKUP_IDS) expect(SPRITES[id], id).toBeDefined();
    expect(sprite('c_mario')).toMatchObject({ width: 128, height: 128 });
    expect(sprite('i_banana')).toMatchObject({ width: 128, height: 128, transparent: true });
    expect(sprite('u_cc150')).toMatchObject({ width: 128, height: 128, transparent: true });
    expect(sprite('p_stadium')).toMatchObject({ width: 304, height: 162 });
    expect(sprite('m_stadium')).toMatchObject({ width: 240, height: 240 });
    expect(sprite('v_b_standard')).toMatchObject({ width: 200, height: 128 });
    expect(sprite('logo')).toMatchObject({ width: 640, height: 195 });
    expect(sprite('bg_stadium')).toMatchObject({ width: 1280, height: 720 });
  });

  it('item, cup and shield sprites are keyed out; files are unique WebP paths', () => {
    for (const [id, s] of Object.entries(SPRITES))
      expect(s.transparent, id).toBe(s.group === 'item' || s.group === 'cup');
    const files = Object.values(SPRITES).map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
    expect(files.every((f) => /^ui\/[a-z]+\/[a-z0-9_]+\.webp$/.test(f))).toBe(true);
  });

  it('builds URLs from the asset base', () => {
    expect(spriteUrl('c_mario')).toBe('/mk8/ui/characters/c_mario.webp');
    expect(spriteUrl('logo', 'https://cdn.example/mk8/')).toBe(
      'https://cdn.example/mk8/ui/title/logo.webp',
    );
    expect(() => sprite('nope')).toThrow(/Unknown MK8 sprite/);
  });
});
