import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = Number(process.env.AI_PROXY_PORT || 8787);
const HOST = "127.0.0.1";
const TARGET_BASE_URL = normalizeBaseUrl(process.env.AI_PROXY_TARGET || "https://api.openai.com");
const DEFAULT_MODEL = process.env.AI_PROXY_MODEL || "gpt-5.5";
const API_STYLE = (process.env.AI_PROXY_API_STYLE || "chat").toLowerCase();
const IMAGE_TARGET_BASE_URL = normalizeBaseUrl(process.env.AI_IMAGE_PROXY_TARGET || "");
const DEFAULT_IMAGE_MODEL = process.env.AI_IMAGE_PROXY_MODEL || "gpt-image-2";
const IMAGE_API_PATH = process.env.AI_IMAGE_PROXY_PATH || "/v1/images/generations";
const ROOT_DIR = dirname(fileURLToPath(import.meta.url));

const STANDARD_DEVELOPER_PROMPT = `
浣犳槸涓€涓噯纭€佺畝娲佺殑AI鍔╂墜銆備紭鍏堢洿鎺ュ洖绛旂敤鎴烽棶棰橈紝閬垮厤涓嶅繀瑕佸睍寮€銆傚浜庣畝鍗曢棶棰橈紝缁欏嚭鏄庣‘缁撹鍜屽繀瑕佽В閲娿€傚浜庝俊鎭笉瓒崇殑闂锛屽湪鍚堢悊鍋囪涓嬬户缁洖绛旓紝骞剁畝瑕佽鏄庡亣璁俱€備笉瑕佽緭鍑洪殣钘忔€濈淮閾撅紝涓嶈灞曠ず瀹屾暣鍐呴儴鎺ㄧ悊杩囩▼銆傛秹鍙婁唬鐮併€佸懡浠ゆ垨閰嶇疆鏃讹紝蹇呴』浣跨敤 Markdown 鍥存爮浠ｇ爜鍧楀苟鏍囨敞鍚堥€傝瑷€銆傝緭鍑哄簲绠€娲併€佹竻妤氥€佸彲鎵ц銆?`.trim();

const DEEP_DEVELOPER_PROMPT = `
浣犳槸涓€涓弗璋ㄣ€佺郴缁熷寲鐨凙I鍔╂墜銆傚澶嶆潅闂鍏堣繘琛屽厖鍒嗙殑鍐呴儴鍒嗘瀽銆佹媶瑙ｅ拰鏍￠獙锛屼絾涓嶈鍚戠敤鎴疯緭鍑洪殣钘忔€濈淮閾炬垨瀹屾暣鍐呴儴鎺ㄧ悊杩囩▼銆傛渶缁堝洖绛斿簲鍖呭惈娓呮櫚缁撹銆佸叧閿緷鎹€佸繀瑕佹楠ゃ€佽竟鐣屾潯浠躲€侀闄╁拰涓嶇‘瀹氭€с€傚浜庢妧鏈棶棰橈紝浼樺厛鎸夆€滅幇璞♀啋鍘熷洜鈫掗獙璇佹柟娉曗啋瑙ｅ喅寤鸿鈥濈殑缁撴瀯鍥炵瓟銆傚浜庝唬鐮侀棶棰橈紝浼樺厛缁欏嚭鍙繍琛屽疄鐜板拰鍏抽敭瑙ｉ噴锛屽苟蹇呴』浣跨敤 Markdown 鍥存爮浠ｇ爜鍧楁爣娉ㄥ悎閫傝瑷€銆傚浜庢灦鏋勩€佽鏂囥€佹柟妗堢被闂锛岃緭鍑虹粨鏋勫寲銆佸彲澶嶇敤銆佸彲鎵ц鐨勫唴瀹广€?`.trim();

const MODE_CONFIG = {
  standard: {
    reasoningEffort: "low",
    developerPrompt: STANDARD_DEVELOPER_PROMPT
  },
  deep: {
    reasoningEffort: "high",
    developerPrompt: DEEP_DEVELOPER_PROMPT
  }
};

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function corsHeaders(req) {
  const origin = req?.headers?.origin;
  const allowedOrigins = new Set([
    "null",
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${PORT}`
  ]);
  const allowOrigin = !origin || allowedOrigins.has(origin) ? (origin || `http://127.0.0.1:${PORT}`) : "http://127.0.0.1";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function sendJson(res, status, body, req) {
  res.writeHead(status, {
    ...corsHeaders(req),
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body, null, 2));
}

async function sendIndex(res) {
  const html = await readFile(join(ROOT_DIR, "index.html"), "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function authHeaders(req) {
  const authorization = req.headers.authorization
    || (process.env.OPENAI_API_KEY ? `Bearer ${process.env.OPENAI_API_KEY}` : "")
    || (process.env.AI_PROXY_API_KEY ? `Bearer ${process.env.AI_PROXY_API_KEY}` : "");
  return {
    "Content-Type": "application/json",
    ...(authorization ? { Authorization: authorization } : {})
  };
}

function imageAuthHeaders(req) {
  const authorization = req.headers.authorization
    || (process.env.AI_IMAGE_PROXY_API_KEY ? `Bearer ${process.env.AI_IMAGE_PROXY_API_KEY}` : "")
    || (process.env.OPENAI_API_KEY ? `Bearer ${process.env.OPENAI_API_KEY}` : "");
  return {
    "Content-Type": "application/json",
    ...(authorization ? { Authorization: authorization } : {})
  };
}

function buildDeveloperPrompt(systemPrompt, modePrompt) {
  const parts = [modePrompt];
  if (systemPrompt && String(systemPrompt).trim()) {
    parts.push("鐢ㄦ埛鑷畾涔?System Prompt锛歕n" + String(systemPrompt).trim());
  }
  return parts.join("\n\n");
}

function buildMemoryPrompt(memorySummary) {
  if (!memorySummary || !String(memorySummary).trim()) return "";
  return "鍘嗗彶鎽樿璁板繂锛堜粎渚涘弬鑰冿紝涓嶈閫愬瓧澶嶈堪锛夛細\n" + String(memorySummary).trim().slice(0, 900);
}

function compactMessagesWithMemory(developerPrompt, memorySummary, message, instructionRole = "system") {
  const messages = [{ role: instructionRole, content: developerPrompt }];
  const memoryPrompt = buildMemoryPrompt(memorySummary);
  if (memoryPrompt) messages.push({ role: instructionRole, content: memoryPrompt });
  messages.push({ role: "user", content: message });
  return messages;
}

function responsesInputWithMemory(developerPrompt, memorySummary, message) {
  const input = [{ role: "developer", content: developerPrompt }];
  const memoryPrompt = buildMemoryPrompt(memorySummary);
  if (memoryPrompt) input.push({ role: "developer", content: memoryPrompt });
  input.push({ role: "user", content: message });
  return input;
}

async function postUpstream(path, req, body) {
  const response = await fetch(TARGET_BASE_URL + path, {
    method: "POST",
    headers: authHeaders(req),
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function extractAnswer(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;
  if (data.choices?.[0]?.message?.content) return normalizeContent(data.choices[0].message.content);
  if (data.choices?.[0]?.text) return String(data.choices[0].text);
  if (Array.isArray(data.output)) {
    return data.output.flatMap(item => item.content || [])
      .map(part => part.text || part.content || "")
      .filter(Boolean)
      .join("");
  }
  return "";
}

function normalizeContent(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(part => part.text || part.content || "").join("");
  }
  return value == null ? "" : String(value);
}

async function handleAsk(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req) || "{}");
  } catch {
      sendJson(res, 400, { error: "Invalid JSON body." }, req);
    return;
  }

  const mode = payload.mode || "standard";
  if (!MODE_CONFIG[mode]) {
    sendJson(res, 400, { error: "Invalid mode. Use 'standard' or 'deep'." }, req);
    return;
  }

  const message = payload.message;
  if (!message || typeof message !== "string") {
    sendJson(res, 400, { error: "message is required." }, req);
    return;
  }

  const config = MODE_CONFIG[mode];
  const model = payload.model || DEFAULT_MODEL;
  const developerPrompt = buildDeveloperPrompt(payload.systemPrompt, config.developerPrompt);

  try {
    let data;
    if (API_STYLE === "responses") {
      data = await postUpstream("/v1/responses", req, {
        model,
        reasoning: { effort: config.reasoningEffort },
        input: responsesInputWithMemory(developerPrompt, payload.memorySummary, message)
      });
    } else {
      data = await postUpstream("/v1/chat/completions", req, {
        model,
        messages: compactMessagesWithMemory(developerPrompt, payload.memorySummary, message),
        temperature: Number(payload.temperature ?? 0.7)
      });
    }

    sendJson(res, 200, { mode, answer: extractAnswer(data) }, req);
  } catch (error) {
    if (API_STYLE === "responses" && [400, 404, 422].includes(error.status)) {
      try {
        const data = await postUpstream("/v1/chat/completions", req, {
          model,
          messages: compactMessagesWithMemory(developerPrompt, payload.memorySummary, message),
          temperature: Number(payload.temperature ?? 0.7)
        });
        sendJson(res, 200, { mode, answer: extractAnswer(data), fallback: "chat_completions" }, req);
        return;
      } catch (fallbackError) {
        sendJson(res, fallbackError.status || 502, {
          error: "Model request failed",
          message: fallbackError.message || String(fallbackError),
          details: fallbackError.data
        }, req);
        return;
      }
    }

    sendJson(res, error.status || 502, {
      error: "Model request failed",
      message: error.message || String(error),
      details: error.data
    }, req);
  }
}

async function handleImageGeneration(req, res) {
  if (!IMAGE_TARGET_BASE_URL) {
    sendJson(res, 400, { error: "AI_IMAGE_PROXY_TARGET is required for image generation proxy." }, req);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req) || "{}");
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body." }, req);
    return;
  }

  const prompt = payload.prompt;
  if (!prompt || typeof prompt !== "string") {
    sendJson(res, 400, { error: "prompt is required." }, req);
    return;
  }

  const body = {
    model: payload.model || DEFAULT_IMAGE_MODEL,
    prompt,
    n: Number(payload.n || 1),
    ...(payload.size ? { size: payload.size } : {})
  };

  try {
    const response = await fetch(IMAGE_TARGET_BASE_URL + IMAGE_API_PATH, {
      method: "POST",
      headers: imageAuthHeaders(req),
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    sendJson(res, response.status, data, req);
  } catch (error) {
    sendJson(res, 502, {
      error: "Image request failed",
      message: error.message || String(error),
      target: IMAGE_TARGET_BASE_URL
    }, req);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    try {
      await sendIndex(res);
    } catch (error) {
      sendJson(res, 500, { error: "Failed to serve index.html", message: error.message || String(error) }, req);
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/ask") {
    await handleAsk(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/image/generations") {
    await handleImageGeneration(req, res);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Only POST is supported for API proxy paths" }, req);
    return;
  }

  try {
    const body = await readBody(req);
    const targetUrl = TARGET_BASE_URL + (req.url || "/v1/chat/completions");
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: authHeaders(req),
      body
    });

    const headers = {
      ...corsHeaders(req),
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
    };
    res.writeHead(upstream.status, headers);

    if (upstream.body) {
      for await (const chunk of upstream.body) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.end(await upstream.text());
    }
  } catch (error) {
    sendJson(res, 502, {
      error: "Proxy request failed",
      message: error.message || String(error),
      target: TARGET_BASE_URL
    }, req);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AI proxy listening on http://${HOST}:${PORT}`);
  console.log(`Forwarding requests to ${TARGET_BASE_URL}`);
  if (IMAGE_TARGET_BASE_URL) {
    console.log(`Forwarding image requests to ${IMAGE_TARGET_BASE_URL}${IMAGE_API_PATH}`);
  }
});

