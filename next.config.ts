import type { NextConfig } from "next";

// This sprint runs locally via `npm run dev` only (SPEC Block A — no build or
// deploy targets), so there is nothing to configure but one opt-out:
//
// agentRules: `next dev` otherwise appends a "nextjs-agent-rules" block to
// CLAUDE.md on every run. CLAUDE.md is the owner's hand-written rulebook and the
// phase gates depend on reviewing a clean diff, so we keep vendor text out of it.
// Flip this to true if you would rather commit that block.
const nextConfig: NextConfig = {
  agentRules: false,
};

export default nextConfig;
