import { describe, expect, it } from 'vitest';
import { clamp, cross, forwardFromHeading, length, normalize, rotateY, vec3 } from './math';

describe('math', () => {
  it('clamp keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('heading 0 faces −Z and a quarter turn faces −X', () => {
    const f0 = forwardFromHeading(0);
    expect(f0.x).toBeCloseTo(0);
    expect(f0.z).toBeCloseTo(-1);
    const f90 = forwardFromHeading(Math.PI / 2);
    expect(f90.x).toBeCloseTo(-1);
    expect(f90.z).toBeCloseTo(0);
  });

  it('rotateY preserves length', () => {
    expect(length(rotateY(vec3(3, 1, 4), 1.234))).toBeCloseTo(length(vec3(3, 1, 4)));
  });

  it('normalize gives unit length and leaves zero alone', () => {
    expect(length(normalize(vec3(2, 0, 0)))).toBeCloseTo(1);
    expect(normalize(vec3())).toEqual(vec3());
  });

  it('cross of X and Y is Z', () => {
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
  });
});
