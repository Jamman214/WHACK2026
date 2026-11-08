import { describe, expect, it } from 'vitest';
import { countryName, countryOf } from './country';

describe('countryOf', () => {
  it('finds the outlet from its domain', () => {
    expect(countryOf('https://www.malaymail.com/news/a')).toBe('MY');
    expect(countryOf('https://www.rnz.co.nz/news/a')).toBe('NZ');
    expect(countryOf('https://www.bbc.co.uk/news/a')).toBe('GB');
  });

  it('finds the outlet from a subdomain', () => {
    expect(countryOf('https://news.sky.com/story/a')).toBe('GB');
    expect(countryOf('https://timesofindia.indiatimes.com/a')).toBe('IN');
  });

  it('shows no country for unknown, pan-regional or malformed URLs', () => {
    expect(countryOf('https://example.com/a')).toBeNull();
    expect(countryOf('https://theconversation.com/a')).toBeNull();
    expect(countryOf('')).toBeNull();
  });

  it('does not match a domain that only ends with an outlet name', () => {
    expect(countryOf('https://notbbc.co.uk/a')).toBeNull();
  });
});

it('names countries', () => {
  expect(countryName('MY')).toBe('Malaysia');
});
