export type PaymentKeyMode = 'live' | 'test' | 'unknown' | 'missing';

const stripWrappingQuotes = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const startsWithSingle = trimmed.startsWith("'");
  const endsWithSingle = trimmed.endsWith("'");
  if (startsWithSingle && endsWithSingle && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }

  const startsWithDouble = trimmed.startsWith('"');
  const endsWithDouble = trimmed.endsWith('"');
  if (startsWithDouble && endsWithDouble && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const stripBearerPrefix = (value: string) => value.replace(/^Bearer\s+/i, '').trim();

export const normalizeEnvValue = (value?: string | null) =>
  stripBearerPrefix(stripWrappingQuotes(String(value || '')));

export const getEnvValue = (...keys: string[]) => {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw === undefined || raw === null) continue;
    const normalized = normalizeEnvValue(String(raw));
    if (normalized) return normalized;
  }
  return '';
};

const detectKeyMode = (value: string, livePrefixes: string[], testPrefixes: string[]): PaymentKeyMode => {
  const normalized = normalizeEnvValue(value);
  if (!normalized) return 'missing';

  const lower = normalized.toLowerCase();
  if (livePrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) return 'live';
  if (testPrefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))) return 'test';
  return 'unknown';
};

export const detectPaystackKeyMode = (value: string): PaymentKeyMode =>
  detectKeyMode(value, ['sk_live_', 'pk_live_'], ['sk_test_', 'pk_test_']);

export const detectFlutterwaveKeyMode = (value: string): PaymentKeyMode =>
  detectKeyMode(
    value,
    ['flwseck_live-', 'flwpubk_live-', 'flwseck-', 'flwpubk-', 'flw_live_', 'fwk_live_'],
    ['flwseck_test-', 'flwpubk_test-', 'flw_test_', 'fwk_test_']
  );

export const isValidPaystackSecretKey = (value: string) =>
  /^sk_(test|live)_/i.test(normalizeEnvValue(value));

// Accept both older live format `FLWSECK-...` and newer `FLWSECK_TEST-...` / `FLWSECK_LIVE-...`.
export const isValidFlutterwaveSecretKey = (value: string) =>
  /^FLWSECK(?:(?:_(?:TEST|LIVE))?)-/i.test(normalizeEnvValue(value));

export const getPaymentEnvironmentSummary = () => {
  const paystackSecret = getEnvValue(
    'PAYSTACK_SECRET_KEY',
    'PAYSTACK_LIVE_SECRET_KEY',
    'PAYSTACK_SECRET_KEY_LIVE',
    'PAYSTACK_SECRET'
  );
  const paystackPublic = getEnvValue(
    'PAYSTACK_PUBLIC_KEY',
    'PAYSTACK_LIVE_PUBLIC_KEY',
    'PAYSTACK_PUBLIC_KEY_LIVE',
    'PAYSTACK_PUBLIC'
  );
  const flutterwaveSecret = getEnvValue(
    'FLUTTERWAVE_SECRET_KEY',
    'FLUTTERWAVE_LIVE_SECRET_KEY',
    'FLUTTERWAVE_SECRET_KEY_LIVE',
    'FLW_SECRET_KEY',
    'FLUTTERWAVE_SECRET'
  );
  const flutterwavePublic = getEnvValue(
    'FLUTTERWAVE_PUBLIC_KEY',
    'FLUTTERWAVE_LIVE_PUBLIC_KEY',
    'FLUTTERWAVE_PUBLIC_KEY_LIVE',
    'FLW_PUBLIC_KEY',
    'FLUTTERWAVE_PUBLIC'
  );

  return {
    paystack: {
      secretMode: detectPaystackKeyMode(paystackSecret),
      publicMode: detectPaystackKeyMode(paystackPublic),
      secretConfigured: Boolean(paystackSecret),
      publicConfigured: Boolean(paystackPublic),
      secretFormatValid: Boolean(paystackSecret) && isValidPaystackSecretKey(paystackSecret),
    },
    flutterwave: {
      secretMode: detectFlutterwaveKeyMode(flutterwaveSecret),
      publicMode: detectFlutterwaveKeyMode(flutterwavePublic),
      secretConfigured: Boolean(flutterwaveSecret),
      publicConfigured: Boolean(flutterwavePublic),
      secretFormatValid:
        Boolean(flutterwaveSecret) && isValidFlutterwaveSecretKey(flutterwaveSecret),
    },
  };
};
