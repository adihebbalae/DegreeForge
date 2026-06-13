import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchJson,
  loadCourseCatalog,
  loadPrereqGraph,
  loadTechCores,
  loadSectionsIndex,
} from './data-loaders';
import { courseCatalogSchema } from './data-schemas';

function mockFetchOnce(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 })
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchJson schema validation', () => {
  it('returns parsed data when the body matches the schema', async () => {
    const good = {
      'ECE 302': {
        id: 'ECE 302',
        title: 'Intro',
        credits: 3,
        description: '',
        prerequisites: [],
        corequisites: [],
        grading: 'letter',
        department: 'ECE',
      },
    };
    mockFetchOnce(good);
    const out = await fetchJson('/data/course-catalog.json', courseCatalogSchema);
    expect(out['ECE 302'].title).toBe('Intro');
  });

  it('throws an error NAMING the offending file when the shape is wrong', async () => {
    // course-catalog.json must be a keyed object; a scraper regression emits an array.
    mockFetchOnce([{ id: 'ECE 302' }]);
    await expect(loadCourseCatalog()).rejects.toThrow(
      /\/data\/course-catalog\.json is malformed/
    );
  });

  it('rejects a catalog entry missing a required field, naming the file', async () => {
    // `prerequisites` dropped — downstream solver assumes it's always an array.
    mockFetchOnce({ 'ECE 302': { id: 'ECE 302', title: 'x', credits: 3, corequisites: [] } });
    await expect(loadCourseCatalog()).rejects.toThrow(/course-catalog\.json/);
  });

  it('rejects a prereq-graph file whose edges are not an array, naming the file', async () => {
    mockFetchOnce({ nodes: {}, edges: 'not-an-array' });
    await expect(loadPrereqGraph()).rejects.toThrow(
      /\/data\/prerequisite-graph\.json is malformed/
    );
  });

  it('rejects a tech-cores entry missing elective_pool, naming the file', async () => {
    mockFetchOnce({ track_a: { name: 'A', required_courses: {} } });
    await expect(loadTechCores()).rejects.toThrow(/\/data\/tech-cores\.json is malformed/);
  });

  it('rejects a sections-index missing default_term, naming the file', async () => {
    mockFetchOnce({ terms: [] });
    await expect(loadSectionsIndex()).rejects.toThrow(
      /\/data\/sections-index\.json is malformed/
    );
  });

  it('still surfaces HTTP errors with the url', async () => {
    mockFetchOnce({}, false);
    await expect(loadCourseCatalog()).rejects.toThrow(
      /Failed to load \/data\/course-catalog\.json/
    );
  });
});
