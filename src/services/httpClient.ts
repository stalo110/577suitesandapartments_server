export type HttpMethod = 'GET' | 'POST';

export class GatewayError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export class GatewayTimeoutError extends Error {
  constructor(message = 'Gateway timeout') {
    super(message);
  }
}

export interface HttpClient {
  request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
}

export const createFetchClient = (
  baseUrl: string,
  defaultHeaders: Record<string, string>,
  timeoutMs = 10000
): HttpClient => {
  return {
    async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            ...defaultHeaders,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const text = await response.text();
        const data = text ? (JSON.parse(text) as T) : ({} as T);

        if (!response.ok) {
          const message = (data as any)?.message || `Gateway error (${response.status})`;
          throw new GatewayError(message, response.status, data);
        }

        return data;
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          throw new GatewayTimeoutError();
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
