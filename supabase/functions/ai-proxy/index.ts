/**
 * AI Proxy — Supabase Edge Function
 *
 * 代理 DeepSeek API 调用，前端不再直接持有 API Key。
 * 部署：supabase secrets set DEEPSEEK_API_KEY=sk-... && supabase functions deploy ai-proxy
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
const MAX_MESSAGES_CHARS = 100_000; // 请求体 messages 总字符数上限

// CORS headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  messages: Array<{ role: string; content: string | null }>;
  tools?: Array<Record<string, unknown>>;
  stream?: boolean;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Auth: verify JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized — missing Bearer token" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const jwt = authHeader.slice(7);

  // Verify token with Supabase Auth
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized — invalid token" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "Missing or invalid 'messages' field" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Size limit check
  const messagesChars = JSON.stringify(body.messages).length;
  if (messagesChars > MAX_MESSAGES_CHARS) {
    return new Response(
      JSON.stringify({ error: `Messages too large (${messagesChars} chars, max ${MAX_MESSAGES_CHARS})` }),
      { status: 413, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Get DeepSeek API Key from environment
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server not configured — missing DEEPSEEK_API_KEY" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Forward to DeepSeek
  try {
    const response = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: body.messages,
        tools: body.tools,
        stream: body.stream ?? true,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || `DeepSeek API returned HTTP ${response.status}`;
      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Stream the response back (SSE)
    if (body.stream !== false) {
      return new Response(response.body, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming — return JSON
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: `Proxy error: ${msg}` }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});