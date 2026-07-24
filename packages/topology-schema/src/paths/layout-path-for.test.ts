import { describe, expect, it } from 'vitest';
import { isLayoutFile } from './is-layout-file.js';
import { layoutPathFor } from './layout-path-for.js';

describe('layoutPathFor', () => {
  it('builds the .layout/ path for a topology slug', () => {
    expect(layoutPathFor('web-app')).toBe('.workspec/topologies/.layout/web-app.yaml');
  });
});

describe('isLayoutFile', () => {
  it('accepts a path under topologies/.layout/', () => {
    expect(isLayoutFile('.workspec/topologies/.layout/web-app.yaml')).toBe(true);
  });

  it('rejects an ordinary topology artifact path', () => {
    expect(isLayoutFile('.workspec/topologies/web-app.yaml')).toBe(false);
  });

  it('rejects a non-yaml file under the layout directory', () => {
    expect(isLayoutFile('.workspec/topologies/.layout/web-app.yml')).toBe(false);
  });

  it('rejects a layout-looking path under a different type directory', () => {
    expect(isLayoutFile('.workspec/resources/.layout/web-app.yaml')).toBe(false);
  });
});
