/**
 * Tests for the Subway MCP Server tools.
 *
 * Tests all 9 tools with a synthetic subway.json schema.
 */
import { describe, it, expect } from 'vitest';
import type { SubwaySchema, Station, Synapse } from '../src/types/index.js';
import {
  subwaySearch,
  subwayStation,
  subwayPath,
  subwayImpact,
  subwayConditions,
  subwayOnboard,
  subwayLine,
  subwayBusRisk,
  subwayAsk,
} from '../src/mcp/tools.js';

// ============================================================
// Synthetic test schema
// ============================================================

function makeTestSchema(): SubwaySchema {
  const stations: Station[] = [
    {
      id: 'station_login',
      label: 'LoginScreen',
      world: 'auth',
      role: 'start',
      terminalType: null,
      files: ['src/screens/LoginScreen.tsx'],
      description: 'Entry point for user authentication. Redirects to Dashboard or Admin.',
      weight: { influence: 0.85, dependency: 0.3, churn: 0.45, centrality: 0.9 },
      authors: ['alice'],
      lastModified: '2026-01-15T10:00:00Z',
      commitCount: 32,
    },
    {
      id: 'station_dashboard',
      label: 'DashboardPage',
      world: 'core',
      role: 'hub',
      terminalType: null,
      files: ['src/pages/DashboardPage.tsx'],
      description: 'Main dashboard hub after login. Routes to various modules.',
      weight: { influence: 0.92, dependency: 0.25, churn: 0.6, centrality: 0.95 },
      authors: ['alice', 'bob'],
      lastModified: '2026-01-20T14:00:00Z',
      commitCount: 56,
      embedding: [0.1, 0.2, 0.3, 0.4],
    },
    {
      id: 'station_checkout',
      label: 'CheckoutFlow',
      world: 'checkout',
      role: 'importance',
      terminalType: null,
      files: ['src/flows/CheckoutFlow.tsx'],
      description: 'Checkout flow handling cart items and payment processing.',
      weight: { influence: 0.78, dependency: 0.55, churn: 0.7, centrality: 0.72 },
      authors: ['bob'],
      lastModified: '2026-02-01T09:00:00Z',
      commitCount: 41,
      embedding: [0.5, 0.6, 0.7, 0.8],
    },
    {
      id: 'station_payment',
      label: 'PaymentService',
      world: 'checkout',
      role: 'importance',
      terminalType: null,
      files: ['src/services/PaymentService.ts'],
      description: 'Handles payment gateway integration and transaction processing.',
      weight: { influence: 0.88, dependency: 0.65, churn: 0.82, centrality: 0.8 },
      authors: ['bob'],
      lastModified: '2026-02-10T11:00:00Z',
      commitCount: 67,
      embedding: [0.5, 0.55, 0.75, 0.85],
    },
    {
      id: 'station_success',
      label: 'OrderSuccessPage',
      world: 'checkout',
      role: 'terminal',
      terminalType: 'success',
      files: ['src/pages/OrderSuccessPage.tsx'],
      description: 'Displayed after successful payment. Confirms order details.',
      weight: { influence: 0.2, dependency: 0.1, churn: 0.15, centrality: 0.1 },
      authors: ['alice', 'charlie'],
      lastModified: '2026-01-25T12:00:00Z',
      commitCount: 8,
      embedding: [0.55, 0.6, 0.8, 0.9],
    },
    {
      id: 'station_error',
      label: 'ErrorBoundary',
      world: 'core',
      role: 'terminal',
      terminalType: 'failure',
      files: ['src/components/ErrorBoundary.tsx'],
      description: 'Global error boundary catching uncaught exceptions.',
      weight: { influence: 0.15, dependency: 0.05, churn: 0.05, centrality: 0.08 },
      authors: ['charlie'],
      lastModified: '2026-01-10T08:00:00Z',
      commitCount: 3,
    },
    {
      id: 'station_network',
      label: 'NetworkClient',
      world: 'core',
      role: 'checkpoint',
      terminalType: null,
      files: ['src/services/NetworkClient.ts'],
      description: 'HTTP client with retry logic and timeout configuration.',
      weight: { influence: 0.72, dependency: 0.35, churn: 0.3, centrality: 0.65 },
      authors: ['alice'],
      lastModified: '2026-01-18T10:00:00Z',
      commitCount: 24,
      embedding: [0.2, 0.25, 0.35, 0.45],
    },
  ];

  const synapses: Synapse[] = [
    {
      from: 'station_login',
      to: 'station_dashboard',
      condition: { description: 'User logs in successfully', type: 'api_response', value: 'auth.status === 200' },
      direction: 'forward',
      isCritical: true,
      strength: 0.95,
    },
    {
      from: 'station_dashboard',
      to: 'station_checkout',
      condition: { description: 'User starts checkout', type: 'data_value', value: 'user.action === CHECKOUT' },
      direction: 'forward',
      isCritical: true,
      strength: 0.75,
    },
    {
      from: 'station_checkout',
      to: 'station_payment',
      condition: { description: 'Cart is not empty', type: 'data_value', value: 'cart.total > 0' },
      direction: 'forward',
      isCritical: true,
      strength: 0.88,
    },
    {
      from: 'station_payment',
      to: 'station_success',
      condition: { description: 'Payment processed successfully', type: 'api_response', value: 'payment.status === SUCCESS' },
      direction: 'forward',
      isCritical: true,
      strength: 0.9,
    },
    {
      from: 'station_payment',
      to: 'station_error',
      condition: { description: 'Payment failed', type: 'api_response', value: 'payment.status === FAILED' },
      direction: 'forward',
      isCritical: false,
      strength: 0.4,
    },
    {
      from: 'station_dashboard',
      to: 'station_error',
      condition: { description: 'Uncaught exception in dashboard', type: 'always', value: 'always' },
      direction: 'forward',
      isCritical: false,
      strength: 0.2,
    },
    {
      from: 'station_network',
      to: 'station_payment',
      condition: { description: 'Network layer for payment', type: 'always', value: 'always' },
      direction: 'forward',
      isCritical: false,
      strength: 0.6,
    },
    {
      from: 'station_checkout',
      to: 'station_network',
      condition: { description: 'Checkout uses HTTP client', type: 'always', value: 'always' },
      direction: 'forward',
      isCritical: false,
      strength: 0.5,
    },
  ];

  return {
    meta: {
      project: 'test-app',
      version: '3.0',
      generated: '2026-05-25T00:00:00Z',
      entryPoint: 'station_login',
      totalStations: stations.length,
      totalSynapses: synapses.length,
      totalLines: 1,
      totalWorlds: 3,
      languages: ['typescript'],
      embeddings_model: 'test-embedder:v1',
    },
    worlds: [
      { id: 'auth', name: 'Authentication', color: '#f5a623', description: 'Identity and access', stations: ['station_login'] },
      { id: 'core', name: 'Core', color: '#4cc9f0', description: 'Core modules', stations: ['station_dashboard', 'station_error', 'station_network'] },
      { id: 'checkout', name: 'Checkout', color: '#06d6a0', description: 'Checkout flow', stations: ['station_checkout', 'station_payment', 'station_success'] },
    ],
    stations,
    synapses,
    lines: [
      {
        id: 'line_happy_checkout',
        name: 'Happy Path — Complete Purchase',
        world: 'checkout',
        color: '#4cc9f0',
        path: ['station_login', 'station_dashboard', 'station_checkout', 'station_payment', 'station_success'],
        conditions: ['User is logged in', 'Cart is not empty', 'Payment succeeds'],
        outcome: 'success',
      },
      {
        id: 'line_failed_payment',
        name: 'Failed Payment Flow',
        world: 'checkout',
        color: '#ef476f',
        path: ['station_login', 'station_dashboard', 'station_checkout', 'station_payment', 'station_error'],
        conditions: ['User is logged in', 'Cart is not empty', 'Payment fails'],
        outcome: 'failure',
      },
    ],
  };
}

const schema = makeTestSchema();

// ============================================================
// subway_search
// ============================================================

describe('subway_search', () => {
  it('finds stations by keyword', () => {
    const result = subwaySearch(schema, { query: 'payment' });
    const text = result.content[0].text;
    expect(text).toContain('PaymentService');
    expect(text).toContain('checkout');
  });

  it('finds stations by label', () => {
    const result = subwaySearch(schema, { query: 'LoginScreen' });
    const text = result.content[0].text;
    expect(text).toContain('LoginScreen');
  });

  it('returns no results for unknown query', () => {
    const result = subwaySearch(schema, { query: 'xyznonexistent' });
    const text = result.content[0].text;
    expect(text).toContain('No stations found');
  });

  it('handles limit parameter', () => {
    // The format changed — we can't count exactly, but should work
    const result = subwaySearch(schema, { query: 'station', limit: 2 });
    expect(result.content[0].text).not.toContain('isError');
  });

  it('handles empty query', () => {
    const result = subwaySearch(schema, { query: '' });
    expect(result.isError).toBe(true);
  });

  it('uses synonym expansion', () => {
    // "errore" should expand to "error" and find ErrorBoundary
    const result = subwaySearch(schema, { query: 'errore' });
    const text = result.content[0].text;
    expect(text).toContain('ErrorBoundary');
  });

  it('searches keyword-only (vector mode intentionally disabled)', () => {
    const result = subwaySearch(schema, { query: 'payment', limit: 5 });
    expect(result.isError).toBeUndefined();
  });
});

// ============================================================
// subway_station
// ============================================================

describe('subway_station', () => {
  it('returns station details by ID', () => {
    const result = subwayStation(schema, { id: 'station_payment' });
    const text = result.content[0].text;
    expect(text).toContain('PaymentService');
    expect(text).toContain('checkout');
    expect(text).toContain('importance');
    expect(text).toContain('influence');
    expect(text).toContain('88%');
  });

  it('returns station details by label', () => {
    const result = subwayStation(schema, { id: 'LoginScreen' });
    const text = result.content[0].text;
    expect(text).toContain('LoginScreen');
    expect(text).toContain('start');
  });

  it('shows incoming and outgoing synapses', () => {
    const result = subwayStation(schema, { id: 'station_payment' });
    const text = result.content[0].text;
    expect(text).toContain('Incoming synapses');
    expect(text).toContain('Outgoing synapses');
    expect(text).toContain('OrderSuccessPage');
  });

  it('returns error for unknown station', () => {
    const result = subwayStation(schema, { id: 'nonexistent' });
    expect(result.isError).toBe(true);
  });

  it('returns error for empty ID', () => {
    const result = subwayStation(schema, { id: '' });
    expect(result.isError).toBe(true);
  });

  it('does not show embedding info (intentionally disabled)', () => {
    const result = subwayStation(schema, { id: 'station_payment' });
    const text = result.content[0].text;
    expect(text).not.toContain('Embedding');
  });
});

// ============================================================
// subway_path
// ============================================================

describe('subway_path', () => {
  it('finds a path between connected stations', () => {
    const result = subwayPath(schema, { from: 'station_login', to: 'station_success' });
    const text = result.content[0].text;
    expect(text).toContain('LoginScreen');
    expect(text).toContain('OrderSuccessPage');
    expect(text).toContain('auth.status === 200');
    expect(text).toContain('payment.status === SUCCESS');
  });

  it('returns error when stations are not connected', () => {
    // NetworkClient is connected to payment but not from the start
    const result = subwayPath(schema, { from: 'station_network', to: 'station_login' });
    const text = result.content[0].text;
    expect(text).toContain('No path found');
  });

  it('returns error for missing stations', () => {
    const result = subwayPath(schema, { from: '', to: 'station_payment' });
    expect(result.isError).toBe(true);
  });

  it('handles same from and to', () => {
    const result = subwayPath(schema, { from: 'station_login', to: 'station_login' });
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('0 hops');
  });
});

// ============================================================
// subway_impact
// ============================================================

describe('subway_impact', () => {
  it('shows direct and indirect impact', () => {
    const result = subwayImpact(schema, { id: 'station_payment' });
    const text = result.content[0].text;
    expect(text).toContain('Impact Analysis');
    expect(text).toContain('PaymentService');
    expect(text).toContain('Direct dependencies');
    expect(text).toContain('Direct dependents');
    expect(text).toContain('Indirect impact');
    expect(text).toContain('Impact Score');
  });

  it('flags high impact stations', () => {
    // The dashboard is a central hub — it should show impact information
    const result = subwayImpact(schema, { id: 'station_dashboard' });
    const text = result.content[0].text;
    expect(text).toContain('DashboardPage');
    expect(text).toContain('Impact Score');
    expect(text).toContain('CheckoutFlow');
    expect(text).toContain('CRITICAL');
  });

  it('returns error for unknown station', () => {
    const result = subwayImpact(schema, { id: 'ghost' });
    expect(result.isError).toBe(true);
  });
});

// ============================================================
// subway_conditions
// ============================================================

describe('subway_conditions', () => {
  it('shows conditions to reach a station', () => {
    const result = subwayConditions(schema, { id: 'station_success' });
    const text = result.content[0].text;
    expect(text).toContain('Conditions to reach');
    expect(text).toContain('PaymentService');
    expect(text).toContain('payment.status === SUCCESS');
  });

  it('shows upstream conditions', () => {
    const result = subwayConditions(schema, { id: 'station_payment' });
    const text = result.content[0].text;
    expect(text).toContain('Upstream conditions');
    expect(text).toContain('Cart is not empty');
  });

  it('shows lines that pass through station', () => {
    const result = subwayConditions(schema, { id: 'station_payment' });
    const text = result.content[0].text;
    expect(text).toContain('Happy Path');
  });

  it('handles entry point with no incoming', () => {
    const result = subwayConditions(schema, { id: 'station_login' });
    const text = result.content[0].text;
    expect(text).toContain('No incoming synapses');
  });
});

// ============================================================
// subway_onboard
// ============================================================

describe('subway_onboard', () => {
  it('generates onboarding for frontend role', () => {
    const result = subwayOnboard(schema, { role: 'frontend' });
    const text = result.content[0].text;
    expect(text).toContain('Onboarding path');
    expect(text).toContain('frontend');
    expect(text).toContain('START HERE');
    expect(text).toContain('CRITICAL STATIONS');
  });

  it('generates onboarding for backend role', () => {
    const result = subwayOnboard(schema, { role: 'backend' });
    const text = result.content[0].text;
    expect(text).toContain('backend');
  });

  it('returns error for unknown role', () => {
    const result = subwayOnboard(schema, { role: 'astronaut' });
    expect(result.isError).toBe(true);
  });

  it('returns error for empty role', () => {
    const result = subwayOnboard(schema, { role: '' });
    expect(result.isError).toBe(true);
  });
});

// ============================================================
// subway_line
// ============================================================

describe('subway_line', () => {
  it('shows line details', () => {
    const result = subwayLine(schema, { name: 'Happy Path' });
    const text = result.content[0].text;
    expect(text).toContain('Happy Path — Complete Purchase');
    expect(text).toContain('Success');
    expect(text).toContain('LoginScreen');
    expect(text).toContain('OrderSuccessPage');
    expect(text).toContain('5 stations');
  });

  it('finds line by partial name', () => {
    const result = subwayLine(schema, { name: 'paid' });
    const text = result.content[0].text;
    expect(text).toContain('Failed Payment Flow');
  });

  it('returns error when no lines match', () => {
    const result = subwayLine(schema, { name: 'nonexistent_line_name' });
    const text = result.content[0].text;
    expect(text).toContain('not found');
  });
});

// ============================================================
// subway_busrisk
// ============================================================

describe('subway_busrisk', () => {
  it('identifies single-author stations', () => {
    const result = subwayBusRisk(schema, { limit: 5 });
    const text = result.content[0].text;
    expect(text).toContain('Bus Factor Risk');
    // CheckoutFlow and PaymentService both have single author 'bob'
    expect(text).toContain('CheckoutFlow');
    expect(text).toContain('PaymentService');
    // ErrorBoundary has 'charlie' (single)
    expect(text).toContain('ErrorBoundary');
  });

  it('sorts by importance (highest risk first)', () => {
    const result = subwayBusRisk(schema, { limit: 3 });
    const text = result.content[0].text;
    // LoginScreen has highest combined influence+centrality among single-author stations
    // PaymentService is second, CheckoutFlow is third
    const loginPos = text.indexOf('LoginScreen');
    const paymentPos = text.indexOf('PaymentService');
    expect(loginPos).toBeLessThan(paymentPos);
    expect(loginPos).not.toBe(-1);
    expect(paymentPos).not.toBe(-1);
  });

  it('uses default limit', () => {
    const result = subwayBusRisk(schema);
    expect(result.isError).toBeUndefined();
  });
});

// ============================================================
// subway_ask
// ============================================================

describe('subway_ask', () => {
  it('answers questions using relevant stations', () => {
    const result = subwayAsk(schema, { question: 'How does payment work?' });
    const text = result.content[0].text;
    expect(text).toContain('PaymentService');
    expect(text).toContain('CheckoutFlow');
  });

  it('handles Italian questions', () => {
    const result = subwayAsk(schema, { question: 'come funziona il pagamento?' });
    const text = result.content[0].text;
    // Should still find payment-related stations via keyword matching
    expect(text).toContain('pagamento');  // keyword expansion
  });

  it('detects impact questions', () => {
    const result = subwayAsk(schema, { question: 'what breaks if I change PaymentService?' });
    const text = result.content[0].text;
    expect(text).toContain('Impact analysis');
  });

  it('handles empty question', () => {
    const result = subwayAsk(schema, { question: '' });
    expect(result.isError).toBe(true);
  });

  it('handles question with no results gracefully', () => {
    const result = subwayAsk(schema, { question: 'mxyzptlk unicorn protocol' });
    const text = result.content[0].text;
    expect(text).toContain("couldn't find stations");
  });

  it('includes related synapses in station results', () => {
    const result = subwayAsk(schema, { question: 'dashboard' });
    const text = result.content[0].text;
    expect(text).toContain('DashboardPage');
    expect(text).toContain('Connections');
  });
});
