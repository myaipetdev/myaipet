import { NextResponse } from "next/server";

// SCRUM-46: serve security.txt via route handler — Next.js doesn't ship
// dot-prefixed paths from /public reliably across builds.
const TEXT = `Contact: mailto:support@myaipet.ai
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en, ko
Canonical: https://app.myaipet.ai/.well-known/security.txt
Policy: https://app.myaipet.ai/privacy
`;

export function GET() {
  return new NextResponse(TEXT, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
