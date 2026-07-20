import { describe, expect, it } from 'vitest';
import { isAllowedHost, isAllowedOrigin } from './is-allowed-host.js';

const LOCAL = ['127.0.0.1', 'localhost'];

describe('isAllowedHost', () => {
  it('allows a bare hostname match', () => {
    expect(isAllowedHost('localhost', LOCAL)).toBe(true);
    expect(isAllowedHost('127.0.0.1', LOCAL)).toBe(true);
  });

  it('allows a hostname with a port, stripped before comparing', () => {
    expect(isAllowedHost('127.0.0.1:4173', LOCAL)).toBe(true);
    expect(isAllowedHost('localhost:65535', LOCAL)).toBe(true);
  });

  it('matches case-insensitively (uppercase LOCALHOST)', () => {
    expect(isAllowedHost('LOCALHOST', LOCAL)).toBe(true);
    expect(isAllowedHost('LocalHost:4173', LOCAL)).toBe(true);
  });

  it('matches the absolute-DNS trailing-dot form (localhost.)', () => {
    expect(isAllowedHost('localhost.', LOCAL)).toBe(true);
    expect(isAllowedHost('localhost.:4173', LOCAL)).toBe(true);
  });

  it('rejects a hostname not on the allowlist', () => {
    expect(isAllowedHost('evil.example:4173', LOCAL)).toBe(false);
    expect(isAllowedHost('evil.com', LOCAL)).toBe(false);
  });

  it('rejects a missing or empty Host header', () => {
    expect(isAllowedHost(undefined, LOCAL)).toBe(false);
    expect(isAllowedHost('', LOCAL)).toBe(false);
  });

  it('handles a bracketed IPv6 literal: fails closed by default, allowed if listed', () => {
    // `[::1]` is not in the default localhost allowlist → denied (this tool
    // binds IPv4 loopback by default). The bracket parsing must not let a
    // bare `::1` sneak through either.
    expect(isAllowedHost('[::1]:4173', LOCAL)).toBe(false);
    expect(isAllowedHost('[::1]', LOCAL)).toBe(false);
    expect(isAllowedHost('[::1]:4173', ['[::1]', 'localhost'])).toBe(true);
  });
});

describe('isAllowedOrigin', () => {
  it('allows a truly absent Origin (non-browser clients send none)', () => {
    expect(isAllowedOrigin(undefined, LOCAL)).toBe(true);
  });

  it('denies a present-but-empty Origin (only an absent header is allowed)', () => {
    expect(isAllowedOrigin('', LOCAL)).toBe(false);
  });

  it('allows a same-origin localhost Origin (http and https, any port)', () => {
    expect(isAllowedOrigin('http://localhost', LOCAL)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4173', LOCAL)).toBe(true);
    expect(isAllowedOrigin('https://127.0.0.1:4173', LOCAL)).toBe(true);
    expect(isAllowedOrigin('http://LOCALHOST:4173', LOCAL)).toBe(true);
  });

  it('rejects a cross-origin Origin even when its hostname format is valid', () => {
    expect(isAllowedOrigin('https://evil.com', LOCAL)).toBe(false);
    expect(isAllowedOrigin('http://evil.com:4173', LOCAL)).toBe(false);
  });

  it('rejects a present-but-unparseable Origin (e.g. "null")', () => {
    expect(isAllowedOrigin('null', LOCAL)).toBe(false);
  });

  it('rejects a non-HTTP scheme', () => {
    expect(isAllowedOrigin('file:///etc/passwd', LOCAL)).toBe(false);
    expect(isAllowedOrigin('ftp://localhost', LOCAL)).toBe(false);
  });
});
