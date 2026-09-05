/**
 * Worker entry point.
 *
 * This is an ESM shim on purpose: `RELAY_ROLE` has to be set *before* the queue
 * consumer and the logger are evaluated, and ESM hoists static imports above
 * everything else. A dynamic import after the assignment is the only ordering
 * that works - the same shape the previous project settled on.
 */
process.env.RELAY_ROLE = 'worker';
process.env.RELAY_SERVICE = 'worker';

export {};

await import('./main');
