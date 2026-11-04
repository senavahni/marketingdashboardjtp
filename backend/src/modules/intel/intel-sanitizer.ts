const SENSITIVE_KEY = /\blgw_[A-Za-z0-9_-]{20,}\b|\bmcpk_[a-z0-9]{8}_[A-Za-z0-9_-]{43}\b/g;

export function redactGatewayKeys<T>(value: T): T {
  if (typeof value === 'string') return value.replace(SENSITIVE_KEY, '[REDACTED_KEY]') as T;
  if (Array.isArray(value)) return value.map((item) => redactGatewayKeys(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactGatewayKeys(item)])) as T;
  }
  return value;
}
