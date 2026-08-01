// Thin façade over `fractional-indexing-jittered` so the engine has ONE
// import site for z-order key generation (and hosts get the same helpers
// the store's bringToFront/sendToBack family uses).
import { generateKeyBetween } from 'fractional-indexing-jittered';

export { generateKeyBetween };
/** The key for the first shape on an empty canvas. */
export const generateInitialKey = (): string => generateKeyBetween(null, null);
/** A key sorting after `key` (bring-to-front of a known top key). */
export const generateKeyAfter = (key: string): string => generateKeyBetween(key, null);
/** A key sorting before `key` (send-to-back of a known bottom key). */
export const generateKeyBefore = (key: string): string => generateKeyBetween(null, key);
