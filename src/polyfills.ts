// Small stand-ins for newer built-ins that older phones and browsers still in use lack (seen in Sentry).
// ponytail: JSON copy drops Dates/Maps/undefined; fine for the plain deck and save data cloned here.
globalThis.structuredClone ??= (<T>(value: T): T => JSON.parse(JSON.stringify(value))) as typeof structuredClone;

const P = Promise as PromiseConstructor & { withResolvers?: unknown };
P.withResolvers ??= function <T>() {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
