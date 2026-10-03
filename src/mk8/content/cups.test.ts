import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { courseGroups } from '../loader';
import { MK8_CUPS } from './cups';

// MK-136: the course select loads `course/<pack>` from the pack, so each course's `pack` must be
// the pipeline's course id (the real pack's groups are `course/mario-kart-stadium`, …).
const sources = JSON.parse(
  readFileSync(new URL('../../../tools/mk8/sources.json', import.meta.url), 'utf8'),
) as { models: { id: string; kind: string }[] };

describe('MK8 cups (MK-119, MK-136)', () => {
  it('every course loads the pack group the pipeline writes for it', () => {
    const pipelineCourses = sources.models.filter((m) => m.kind === 'course').map((m) => m.id);
    const courses = MK8_CUPS.flatMap((cup) => cup.courses);
    expect(courses.length).toBeGreaterThan(0);
    for (const course of courses) {
      expect(pipelineCourses, course.key).toContain(course.pack);
      expect(courseGroups(course.pack)[0]).toBe(`course/${course.pack}`);
    }
  });
});
