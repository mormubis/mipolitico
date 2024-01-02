import type { BrokerOptions } from 'moleculer';

const options: BrokerOptions = {
  // Concurrency
  bulkhead: { enabled: true, concurrency: 10, maxQueueSize: 100 },

  cacher: { type: 'Memory', options: { ttl: 60 } },

  circuitBreaker: { enabled: true },

  logLevel: 'warn',

  maxCallLevel: 25,

  metrics: {
    enabled: true,
    reporter: 'Console',
  },

  namespace: 'congress',

  // Load balancing strategy
  registry: { strategy: 'CpuUsage' },

  requestTimeout: 10 * 1_000, // 10s

  retryPolicy: {
    enabled: false,
  },

  serializer: 'CBOR',

  tracing: {
    enabled: true,
    exporter: {
      type: 'Console',
      options: {
        width: 80,
      },
    },
  },

  // Tracking requests and waiting for running requests before shuting down.
  tracking: {
    enabled: false,
  },

  validator: true,
};

export default options;
