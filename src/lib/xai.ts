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
  /** Ask the API to emit a JSON object (OpenAI-compatible). */
  json?: boolean;
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
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!res.ok && opts.json && /response_format|json_object/i.test(data.error?.message || "")) {
      return grokChat({ ...opts, json: false });
    }

    if (!res.ok) {
      throw new Error(
        data.error?.message || `Grok API error (${res.status})`,
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("Grok returned an empty response");
    return text;
  } catch (e) {
    if (e && typeof e === "object" && "name" in e && e.name === "AbortError") {
      throw new Error(
        "Grok timed out after 3 minutes. Try a smaller page or try again.",
      );
    }
    throw e;
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
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (first) {
    try {
      return JSON.parse(repairLlmJson(slice));
    } catch {
      const hint = first instanceof Error ? first.message : "parse error";
      throw new Error(
        `Grok returned invalid JSON (${hint}). Try generating again.`,
      );
    }
  }
}

/**
 * Grok often embeds HTML with raw " in attributes. Walk strings and
 * escape those quotes, plus newlines / trailing commas.
 */
export function repairLlmJson(input: string): string {
  const s = input.replace(/,\s*([}\]])/g, "$1");
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inString) {
      if (c === '"') inString = true;
      out += c;
      continue;
    }
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (c === "\\") {
      out += c;
      escaped = true;
      continue;
    }
    if (c === '"') {
      const next = s.slice(i + 1).match(/^\s*[,:}\]]/);
      if (next) {
        inString = false;
        out += c;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (c === "\n") {
      out += "\\n";
      continue;
    }
    if (c === "\r") {
      out += "\\r";
      continue;
    }
    if (c === "\t") {
      out += "\\t";
      continue;
    }
    if (c.charCodeAt(0) < 32) continue;
    out += c;
  }
  return out;
}
