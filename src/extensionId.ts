// A Chrome extension's id is exactly 32 letters from a to p.
export const EXTENSION_ID = /^[a-p]{32}$/;

export const isExtensionId = (value: unknown): value is string =>
  typeof value === 'string' && EXTENSION_ID.test(value);
