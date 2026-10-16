// Backend API client (Backend/openapi.yaml). Errors are classified so the ask flow can pick the spoken message.
export type ApiErrorKind = "invalid_key" | "bad_request" | "not_found" | "rate_limited" | "server" | "network";

export class ApiError extends Error {
  constructor(public readonly kind: ApiErrorKind, message?: string) {
    super(message ?? kind);
  }
}

export type Point = { latitude: number; longitude: number };
export type HeadingSample = Point & { at: string };
export type AskBody = {
  audio?: string;
  text?: string;
  location?: Point | null;
  headingSample?: HeadingSample | null;
  conversationId?: string | null;
};
export type AskAccepted = { askId: string; conversationId: string; conversationExpiresAt: string };
export type AskResult = {
  askId: string;
  status: "processing" | "completed" | "failed";
  transcript: string | null;
  answer: string | null;
  audio: { seq: number; url: string }[];
  error: string | null;
  timings: Record<string, string>;
};

type Options = {
  baseUrl: string;
  apiKey: string;
  userName: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

const TRANSIENT: ApiErrorKind[] = ["rate_limited", "server", "network"];
// Any UUID works: a valid key gets 404 for an unknown ask, an invalid key gets 403.
const PROBE_ASK_ID = "00000000-0000-4000-8000-000000000000";

function kindFor(status: number): ApiErrorKind | null {
  if (status === 403) return "invalid_key";
  if (status === 400) return "bad_request";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return null;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(private readonly options: Options) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  postAsk(body: AskBody): Promise<AskAccepted> {
    // Only 429 is retried for POST: a lost response may already have created an ask.
    return this.request<AskAccepted>("POST", "/asks", body, ["rate_limited"]);
  }

  getAsk(askId: string): Promise<AskResult> {
    return this.request<AskResult>("GET", `/asks/${encodeURIComponent(askId)}`, undefined, TRANSIENT);
  }

  async checkKey(): Promise<void> {
    try {
      await this.request("GET", `/asks/${PROBE_ASK_ID}`, undefined, TRANSIENT);
    } catch (error) {
      if (error instanceof ApiError && error.kind === "not_found") return;
      throw error;
    }
  }

  private async request<T>(method: string, path: string, body: unknown, retryOn: ApiErrorKind[]): Promise<T> {
    let lastError: ApiError = new ApiError("network");
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await this.once<T>(method, path, body);
      } catch (error) {
        lastError = error instanceof ApiError ? error : new ApiError("network", String(error));
        if (!retryOn.includes(lastError.kind) || attempt === this.maxAttempts) throw lastError;
        await this.sleep(500 * attempt);
      }
    }
    throw lastError;
  }

  private async once<T>(method: string, path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json", "x-api-key": this.options.apiKey, "x-user-name": this.options.userName },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new ApiError("network", String(error));
    }
    const kind = kindFor(response.status);
    if (kind) throw new ApiError(kind, `HTTP ${response.status}`);
    return (await response.json()) as T;
  }
}
