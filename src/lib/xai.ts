/**
 * SpaceXAI / xAI Grok client (OpenAI-compatible).
 * Server-side only — never expose XAI_API_KEY to the browser.
 */

const XAI_BASE = "https://api.x.ai/v1";

export function xaiModel() {
  return process.env.XAI_MODEL?.trim() || "grok-4.5";
}

export function xaiApiKey() {
  return process.env.XAI_API_KEY?.trim() || "";
}

export async function grokChat(opts: {
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const key = xaiApiKey();
  if (!key) {
    throw new Error(
      "XAI_API_KEY is not set. Add it to .env (https://console.x.ai).",
    );
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 180_000);

  try {
    const res = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: xaiModel(),
        temperature: opts.temperature ?? 0.3,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!res.ok) {
      throw new Error(
        data.error?.message || `Grok API error (${res.status})`,
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("Grok returned an empty response");
    return text;
  } finally {
    clearTimeout(t);
  }
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() || text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Grok response did not contain JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}
