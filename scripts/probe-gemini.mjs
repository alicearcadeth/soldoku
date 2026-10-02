import { readFileSync } from "node:fs";

const files = [
  "F:/James/AI daily/codex-video-lab/.secrets/gemini-aistudio.key",
  "F:/James/AI daily/codex-video-lab/.secrets/gemini-aistudio-2.key",
];
const models = ["gemini-3.8-flash", "gemini-flash-lite-latest"];
for (const [index, file] of files.entries()) {
  const key = readFileSync(file, "utf8").trim();
  if (key.length < 20) {
    console.log(JSON.stringify({ slot: index + 1, status: "short" }));
    continue;
  }
  const listed = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(12_000),
  });
  const catalog = await listed.json().catch(() => ({}));
  const names = (catalog.models ?? []).map((item) => item.name).filter((name) => /flash/i.test(name)).slice(0, 6);
  console.log(JSON.stringify({ slot: index + 1, list: listed.status, names, error: catalog.error?.status ?? null }));
  if (!listed.ok) continue;
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with OK" }] }],
          generationConfig: { maxOutputTokens: 64, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const data = await response.json().catch(() => ({}));
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part) => part.text ?? "").join("");
    console.log(JSON.stringify({
      slot: index + 1,
      model,
      status: response.status,
      ok: text.toLowerCase().includes("ok"),
      sample: text.slice(0, 24),
      finish: data?.candidates?.[0]?.finishReason ?? null,
      parts: parts.map((part) => Object.keys(part)),
      error: data?.error?.status ?? null,
      detail: typeof data?.error?.message === "string" ? data.error.message.slice(0, 160) : null,
    }));
    if (response.ok) process.exit(0);
  }
}
