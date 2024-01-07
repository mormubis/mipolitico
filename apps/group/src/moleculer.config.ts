import type { BrokerOptions } from 'moleculer';

const options: BrokerOptions = {
  // Concurrency
  bulkhead: { enabled: true, concurrency: 10, maxQueueSize: 100 },

  // Enable built-in cache
  cacher: { type: 'Memory', options: { ttl: 60 } },

  // Enable circuit breaker
  // @see https://moleculer.services/docs/0.14/fault-tolerance#Circuit-Breaker
  circuitBreaker: { enabled: true },

  // Log level for built-in console logger.
  logLevel: 'warn',

  // Depth of calling
  maxCallLevel: 25,

  // Enable metrics
  metrics: {
    enabled: true,
    reporter: 'Console',
  },

  // Namespace of nodes to segment your nodes
  // In case I want to run other applications over the same NATS broker
  namespace: 'congress',

  // Load balancing strategy
  registry: { strategy: 'CpuUsage' },

  // Request timeout
  requestTimeout: 10 * 1_000, // 10s

  // Enable retries
  retryPolicy: {
    enabled: false,
  },

  // CBOR Serializer
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

  // Enable validation of schema
  validator: true,
};

export default options;
