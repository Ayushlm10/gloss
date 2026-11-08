import { localMode } from "@/lib/local-mode";
import { codexStatus } from "@/lib/codex";
import { peekFree } from "@/lib/quota";
import { APP_UA } from "@/lib/together";

export const runtime = "nodejs";

/** Validates a pasted key with a zero-cost model listing. The key is never stored or logged. */
export async function POST(req: Request) {
  if (localMode) return Response.json({ error: "API keys are unavailable in local mode." }, { status: 404 });
  let body: { apiKey?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const key = body.apiKey?.trim();
  if (!key) return Response.json({ ok: false });
  try {
    const res = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${key}`, "User-Agent": APP_UA },
      signal: AbortSignal.timeout(10_000),
    });
    return Response.json({ ok: res.ok });
  } catch {
    return Response.json({ ok: false });
  }
}

/** Whether there is a shared key, and how much of today's free allowance is left on it. */
export async function GET(req: Request) {
  if (localMode) return Response.json({ local: true, ready: await codexStatus() });
  const house = Boolean(process.env.TOGETHER_API_KEY);
  return Response.json({ house, free: house ? await peekFree(req) : null });
}
