// AI plumbing shared by the edge functions: ask a model to answer by calling one tool.
//
// Provider is picked by the AI_PROVIDER secret: "groq" (free tier) or "anthropic".
// If AI_PROVIDER isn't set, whichever API key exists is used (Anthropic first).

export const CATEGORIES = [
  "Food",
  "Transport",
  "Groceries",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Others",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** A base64-encoded photo, e.g. a receipt. */
export type Image = { mediaType: string; data: string };

export type Tool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5";
const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
// Used instead of GROQ_MODEL when there's a photo: the default text model can't see images.
const GROQ_VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";

const PROVIDER: "anthropic" | "groq" | null = (() => {
  const chosen = Deno.env.get("AI_PROVIDER")?.toLowerCase();
  if (chosen === "groq" || chosen === "anthropic") return chosen;
  if (ANTHROPIC_KEY) return "anthropic";
  if (GROQ_KEY) return "groq";
  return null;
})();

/** Why the AI can't be called, or null when it's configured. */
export function aiConfigError(): string | null {
  if (PROVIDER === "anthropic" && !ANTHROPIC_KEY) return "ANTHROPIC_API_KEY secret is not set";
  if (PROVIDER === "groq" && !GROQ_KEY) return "GROQ_API_KEY secret is not set";
  if (!PROVIDER) return "Set GROQ_API_KEY or ANTHROPIC_API_KEY as a secret";
  return null;
}

async function askClaude(system: string, text: string, tool: Tool, image?: Image): Promise<unknown> {
  const content = image
    ? [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text },
      ]
    : text;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const block = data.content?.find((b: { type: string }) => b.type === "tool_use");
  return block?.input ?? null;
}

// Groq uses the OpenAI-compatible chat completions format.
async function askGroq(system: string, text: string, tool: Tool, image?: Image): Promise<unknown> {
  const content = image
    ? [
        { type: "text", text },
        { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
      ]
    : text;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: image ? GROQ_VISION_MODEL : GROQ_MODEL,
      temperature: 0,
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  return JSON.parse(call.function.arguments ?? "{}");
}

/** The tool input the model answered with, or null if it didn't call the tool. */
export async function callTool<T>(
  system: string,
  text: string,
  tool: Tool,
  image?: Image,
): Promise<T | null> {
  const input = PROVIDER === "groq"
    ? await askGroq(system, text, tool, image)
    : await askClaude(system, text, tool, image);
  return (input ?? null) as T | null;
}
