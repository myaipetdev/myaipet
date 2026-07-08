import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import { rateLimit } from "@/lib/rateLimit";

// Chrome-extension ambient companionship → season recognition.
//
// The desktop pet walks your tabs; caring for it there (petting it, collecting a
// treat it finds, greeting it when you come back) feeds the SAME non-financial,
// capped season score as the web app. Points are recognition only — no token, no
// cash value, no redemption.
//
// SECURITY / ANTI-FARM — this endpoint is called by a client the user fully
// controls, so it is written to be un-farmable:
//   • The server owns the grant. The client sends only an `action` string; it
//     CANNOT send a point amount. The reward per action is fixed here.
//   • Every action routes through awardPointsCapped(), which enforces a per-user,
//     per-day ceiling in DailyActionCount. Past the cap, further calls grant 0.
//   • `pet` and `treat` share the `ext_care` counter so they can't be stacked
//     into double the ceiling.
//   • Auth is required (getUser → pck_ CLI token or session). No owner, no points.

// action → [capped-reason (the DailyActionCount pool), points per action]
const EXTENSION_ACTIONS: Record<string, { reason: keyof typeof DAILY_POINT_CAPS; points: number }> = {
  pet:     { reason: "ext_care",    points: 1 }, // grab/hold the walking pet
  treat:   { reason: "ext_care",    points: 1 }, // collect a treat it found (shares ext_care)
  welcome: { reason: "ext_welcome", points: 2 }, // daily "welcome back" greeting
};

export async function POST(req: NextRequest) {
  // Ambient care is low-frequency; 60/min per user is generous headroom and caps
  // DB write amplification from a scripted client (the daily cap already bounds
  // the *points*, but not the raw upsert/update load — this bounds that too).
  const rl = rateLimit(req, { key: "petclaw-engagement", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // tolerate empty / malformed body — action validation below rejects it
  }

  const action = typeof body?.action === "string" ? body.action : "";
  const spec = EXTENSION_ACTIONS[action];
  if (!spec) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  // Server decides the grant. Any `amount`/`points` the client sent is ignored.
  const res = await awardPointsCapped(
    user.id,
    spec.reason,
    spec.points,
    DAILY_POINT_CAPS[spec.reason],
  ).catch(() => ({ points: 0, capped: true }));

  return NextResponse.json({
    ok: true,
    action,
    points: res.points,          // season points actually granted (0 if capped out)
    capped: (res as any).capped ?? false,
  });
}
