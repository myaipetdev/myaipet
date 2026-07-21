import { NextResponse } from "next/server";

// SCRUM-46: serve security.txt via route handler — Next.js doesn't ship
// dot-prefixed paths from /public reliably across builds.
// DD round 2: the Policy field used to point at /privacy (a privacy policy,
// not a vulnerability-disclosure policy). Replaced with an honest inline
// disclosure note — no bounty program is promised because none exists.
const TEXT = `Contact: mailto:support@myaipet.ai
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en, ko
Canonical: https://app.myaipet.ai/.well-known/security.txt

# Vulnerability disclosure policy
# Report suspected vulnerabilities to the contact above with enough detail
# to reproduce (URL/endpoint, steps, expected vs. actual behavior).
# We welcome good-faith security research and will not pursue legal action
# against researchers who act in good faith: no accessing or modifying other
# users' data beyond what is needed to demonstrate the issue, no service
# disruption, and no public disclosure before we have had a reasonable
# chance to fix it.
# We currently do not run a paid bug-bounty program.
`;

export function GET() {
  return new NextResponse(TEXT, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
