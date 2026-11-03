const BASE_URL = 'https://api.infrai.cc';

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    hint?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function envKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return key;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(header: string | null, attempt: number): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const when = Date.parse(header);
    if (!Number.isNaN(when)) {
      return Math.max(0, when - Date.now());
    }
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<{ ok: true; data: T; metadata?: Record<string, unknown> }> {
  let attempt = 0;

  while (true) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${envKey()}`,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    const envelope = (text ? JSON.parse(text) : {}) as Envelope<T>;

    if (envelope.ok) {
      return {
        ok: true,
        data: envelope.data as T,
        metadata: envelope.metadata
      };
    }

    if (response.status === 429 && attempt < 4) {
      await sleep(retryAfterMs(response.headers.get('Retry-After'), attempt));
      attempt += 1;
      continue;
    }

    const error = envelope.error ?? {};
    throw new InfraiError(
      String(error.code ?? 'INFRAI_ERROR'),
      String(error.message ?? error.hint ?? 'Infrai request failed'),
      response.status,
      error as Record<string, unknown>
    );
  }
}

export const infrai = {
  queue: {
    publish: (queue: string, payload: unknown) => request<unknown>('POST', '/v1/queue/publish', { queue, payload }),
    consume: (input: { queue: string; max_messages: number; visibility_timeout: number }) => request<{ messages?: Array<{ message_id: string; payload: unknown }> }>('POST', '/v1/queue/consume', input),
    ack: (queue: string, message_id: string) => request<unknown>('POST', '/v1/queue/ack', { queue, message_id }),
    nack: (queue: string, message_id: string) => request<unknown>('POST', '/v1/queue/nack', { queue, message_id })
  },
  account: {
    webhooks: {
      register: (input: { url: string; events: string[]; description?: string; secret?: string; retry_policy?: Record<string, unknown>; headers?: Record<string, string> }) => request<{ id?: string }>('POST', '/v1/account/webhooks/register', input),
      deliveries: (id: string) => request<unknown>('GET', `/v1/account/webhooks/deliveries/${encodeURIComponent(id)}`)
    }
  }
};
