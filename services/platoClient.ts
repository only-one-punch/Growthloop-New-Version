/**
/**
 * 注意：本客户端仅做“调用封装”，不包含任何具体业务提示词。
 */

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
export type ChatMessageContent = string | ChatMessageContentPart[];
export interface ChatMessage { role: ChatRole; content: ChatMessageContent }

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_ms?: number; // 请求超时
  extraHeaders?: Record<string, string>; // 额外头（可选）
}

// 模型注册：不要在这里写提示词，只登记可用的模型名
export const ModelRegistry = {
  DEFAULT: import.meta.env.VITE_PLATO_DEFAULT_MODEL || 'claude',
  CLAUDE: 'claude',
  // 下面可按需补充更多（示例）。真实可用列表请以平台文档为准：
  // QWEN_PLUS: 'qwen-plus',
  // GPT_4O_MINI: 'gpt-4o-mini',
} as const;

const BASE_URL = (import.meta.env.VITE_PLATO_BASE_URL || '').replace(/\/$/, '');
const API_KEY = import.meta.env.VITE_PLATO_API_KEY || '';

if (!BASE_URL) {
  // 仅控制台提示，避免在构建时中断
  console.warn('[PlatoClient] 未配置 VITE_PLATO_BASE_URL，将导致请求失败。');
}
if (!API_KEY) {
  console.warn('[PlatoClient] 未配置 VITE_PLATO_API_KEY，将导致请求失败。');
}

/**
 * 带重试的基础请求封装（处理 429/5xx）。
 */
async function postWithRetry<T>(url: string, body: any, headers: Record<string,string>, timeoutMs = 30000, maxRetries = 2): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.ok) {
      return await res.json() as T;
    }

    // 对 429 或 5xx 做指数退避重试
    if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && maxRetries > 0) {
      const retryAfter = Number(res.headers.get('retry-after')) || 1000;
      await new Promise(r => setTimeout(r, retryAfter));
      return postWithRetry<T>(url, body, headers, timeoutMs, maxRetries - 1);
    }

    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通用聊天接口（非流式）。
 * - messages: 按 OpenAI 格式传入
 * - options.model 不传则使用环境变量或默认模型
 */
export async function chatCompletion(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  if (!BASE_URL || !API_KEY) {
    return 'Plato 接口未配置：请设置 VITE_PLATO_API_KEY 与 VITE_PLATO_BASE_URL';
  }

  const model = options.model || ModelRegistry.DEFAULT;
  const url = `${BASE_URL}/chat/completions`;
  const headers: Record<string,string> = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...(options.extraHeaders || {}),
  };

  const payload = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens,
    // 可按需加入：top_p、frequency_penalty、presence_penalty 等
  };

  type OpenAIChatResponse = {
    choices?: Array<{ message?: { role: ChatRole; content: string } }>
    usage?: any
    error?: { message?: string }
  };

  try {
    const data = await postWithRetry<OpenAIChatResponse>(url, payload, headers, options.timeout_ms ?? 30000);
    const text = data?.choices?.[0]?.message?.content || '';
    return text || '（空响应）';
  } catch (err: any) {
    return `Plato 接口错误：${err?.message || String(err)}`;
  }
}

/** Images generation via OpenAI-compatible endpoint */
export interface ImageOptions {
  model?: string; // default from env
  size?: string;  // e.g. '1024x1024', '1024x576'
  timeout_ms?: number;
}

export async function imagesGenerate(prompt: string, opts: ImageOptions = {}): Promise<string | undefined> {
  if (!BASE_URL || !API_KEY) return undefined;
  const model = opts.model || (import.meta.env.VITE_PLATO_IMAGE_MODEL || 'nano-banana-2-2k');
  const url = `${BASE_URL}/images/generations`;
  const headers: Record<string,string> = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
  type OpenAIImageResp = { data?: Array<{ url?: string }> };
  try {
    const data = await postWithRetry<OpenAIImageResp>(url, {
      model,
      prompt,
      size: opts.size || '1024x1024',
      response_format: 'url'
    }, headers, opts.timeout_ms ?? 60000);

    return data?.data?.[0]?.url;
  } catch (e) {
    console.error('[Plato imagesGenerate] error', e);
    return undefined;
  }
}

/**
 * 便捷方法：快速调用某个指定模型。
 */
export async function runModel(model: string, content: string, system?: string, opts?: Omit<ChatOptions,'model'>): Promise<string> {
  const msgs: ChatMessage[] = [];
  if (system) msgs.push({ role: 'system', content: system });
  msgs.push({ role: 'user', content });
  return chatCompletion(msgs, { ...(opts || {}), model });
}

/**
 * 健康检查：在设置好环境变量后，可在控制台调用 testPlato() 验证联通性。
 */
export async function testPlato(): Promise<void> {
  const reply = await chatCompletion([{ role: 'user', content: 'ping' }], { temperature: 0 });
  // 仅打印，不抛异常
  console.log('[Plato test] reply:', reply);
}

