// netlify/functions/ai.mjs
// Kindling's server proxy. Holds your API keys in Netlify env vars so they
// never touch the browser. The app POSTs {system, user, maxTokens, provider, model}
// and gets back {text}. Set these in Netlify → Site settings → Environment variables:
//   ANTHROPIC_API_KEY = sk-ant-...
//   OPENAI_API_KEY    = sk-...
// You only need the one(s) you'll use.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });
  if (req.method !== "POST")   return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });

  let payload;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Bad JSON" }), { status: 400, headers: CORS }); }

  const { system, user, maxTokens = 1000, provider = "anthropic", model } = payload;
  if (!user) return new Response(JSON.stringify({ error: "Missing 'user' prompt" }), { status: 400, headers: CORS });

  try {
    let text = "";

    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY not set on the server");
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: user });
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: Bearer ${key} },
        body: JSON.stringify({ model: model || "gpt-4o-mini", max_tokens: maxTokens, messages })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || OpenAI HTTP ${r.status});
      text = d.choices?.[0]?.message?.content || "";

    } else {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("ANTHROPIC_API_KEY not set on the server");
      const body = { model: model || "claude-sonnet-5", max_tokens: maxTokens, messages: [{ role: "user", content: user }] };
      if (system) body.system = system;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || Anthropic HTTP ${r.status});
      text = (d.content || []).map(b => (b.type === "text" ? b.text : "")).join("");
    }

    return new Response(JSON.stringify({ text: text.trim() }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: CORS });
  }
}
