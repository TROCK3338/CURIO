import { describe, expect, it } from 'vitest';
import { buildCanonicalUrl, detectPlatform, extractShortcode } from '../lib/extractor';
import { citationsFromAnswer } from '../lib/ai';
import { cleanEntities, isLoginWall } from '../lib/enrich';
import { decodeHtmlEntities } from '../lib/extractor';
import type { SavedItem } from '../lib/types';

function canonical(url: string): string {
  const platform = detectPlatform(url);
  const code = extractShortcode(url, platform);
  return code ? buildCanonicalUrl(platform, code) : url;
}

describe('detectPlatform', () => {
  it.each([
    ['https://www.instagram.com/reel/abc123/?igsh=xyz', 'instagram'],
    ['https://vm.tiktok.com/ZMabc/', 'tiktok'],
    ['https://x.com/someone/status/123', 'x'],
    ['https://mobile.twitter.com/someone/status/123', 'x'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://old.reddit.com/r/x/comments/abc/title', 'reddit'],
    ['https://bsky.app/profile/a.bsky.social/post/3k', 'bluesky'],
  ])('%s -> %s', (url, expected) => {
    expect(detectPlatform(url)).toBe(expected);
  });

  it.each([
    'https://www.netflix.com/title/123',
    'https://www.dropbox.com/s/abc',
    'https://box.com/file',
    'https://notyoutube.com/watch?v=abc',
    'not a url',
  ])('%s is generic', url => {
    expect(detectPlatform(url)).toBe('generic');
  });
});

describe('URL canonicalization', () => {
  it('strips Instagram tracking params', () => {
    expect(canonical('https://www.instagram.com/reel/C1a2B3/?igsh=MWQ1ZGUxMzBkMA==')).toBe(
      'https://www.instagram.com/reel/C1a2B3/',
    );
  });

  it('collapses every YouTube URL form to one watch URL', () => {
    const expected = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(canonical('https://youtu.be/dQw4w9WgXcQ?si=tracking')).toBe(expected);
    expect(canonical('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe(expected);
    expect(canonical('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe(expected);
    expect(canonical('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(expected);
  });

  it('strips X share params', () => {
    expect(canonical('https://x.com/someone/status/1790000000000000000?s=46&t=abc')).toBe(
      'https://x.com/user/status/1790000000000000000',
    );
  });

  it('leaves generic links untouched', () => {
    expect(canonical('https://example.com/post?id=7')).toBe('https://example.com/post?id=7');
  });
});

describe('citationsFromAnswer', () => {
  const item = (id: string): SavedItem => ({
    id,
    url: `https://example.com/${id}`,
    platform: 'generic',
    title: `Title ${id}`,
    userNote: null,
    summary: `Summary ${id}`,
    tags: [],
    entities: {},
    embedding: null,
    mediaUrl: null,
    thumbnailUrl: null,
    authorUsername: null,
    authorDisplayName: null,
    publishedAt: null,
    savedAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    enrichmentStatus: 'enriched',
    enrichmentError: null,
  });
  const items = [item('a'), item('b'), item('c')];

  it('maps [n] markers to items in first-cited order, without duplicates', () => {
    const result = citationsFromAnswer('Try the glaze [3]. Also see [1] and again [3].', items);
    expect(result.map(c => [c.marker, c.itemId])).toEqual([[3, 'c'], [1, 'a']]);
  });

  it('handles grouped markers like [1, 2]', () => {
    expect(citationsFromAnswer('Both say so [1, 2].', items).map(c => c.itemId)).toEqual(['a', 'b']);
  });

  it('ignores out-of-range numbers and answers without markers', () => {
    expect(citationsFromAnswer('See [0] and [9].', items)).toEqual([]);
    expect(citationsFromAnswer("I don't have that information in your saves.", items)).toEqual([]);
  });
});

describe('cleanEntities', () => {
  it('drops empty and placeholder entities', () => {
    expect(
      cleanEntities({
        recipe: { name: 'Miso cod', ingredients: ['miso'], instructions: [] },
        place: { name: '' },
        product: { name: 'Detected product' },
        event: null as never,
      }),
    ).toEqual({ recipe: { name: 'Miso cod', ingredients: ['miso'], instructions: [] } });
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes numeric, hex and double-encoded entities', () => {
    expect(decodeHtmlEntities('&quot;Custom widgets &#x1f924; can&#x2019;t &#064;claudeai&quot;')).toBe(
      '"Custom widgets \u{1f924} can\u2019t @claudeai"',
    );
    expect(decodeHtmlEntities('Tom &amp;amp; Jerry &amp;quot;hi&amp;quot;')).toBe('Tom & Jerry "hi"');
    expect(decodeHtmlEntities('a &unknown; b')).toBe('a &unknown; b');
  });
});

describe('isLoginWall', () => {
  it.each([
    ['LinkedIn Login, Sign in | LinkedIn', null],
    ['Sign Up | LinkedIn', null],
    ['Log in • Instagram', null],
    ['Instagram', 'Log in to see photos and videos from friends.'],
  ])('flags %s', (title, description) => {
    expect(isLoginWall(title, description)).toBe(true);
  });

  it.each([
    ['How I designed a login flow users love', 'A case study on onboarding'],
    ['Kaajal Tekwani on Instagram: "Custom React hook"', 'Tutorial on hooks'],
    ['Sign-in with Apple: a developer guide', null],
  ])('keeps %s', (title, description) => {
    expect(isLoginWall(title, description)).toBe(false);
  });
});
