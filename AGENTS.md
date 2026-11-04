# AGENTS.md

## Project Overview
LogosArena is a mobile-first, turn-based AI-refereed religious and philosophical debate platform featuring:
- A 3-tier annual subscription model (`FREE`, `PRO`, `PREMIUM`).
- A Sermon & Essay Stress-Tester studio.
- A self-funding Sunday Scholar Bounty ($20 to $100).
- A site-wide Anti-Cheat & Integrity Engine.

## Tech Stack
- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database & ORM:** Drizzle ORM + Turso (`@libsql/client`) with local fallback (`file:local.db`)
- **AI SDK:** Google Gen AI SDK (`@google/genai`)
- **Testing:** Vitest

## Design System: "Intellectual Colosseum"
- High-contrast dark mode aesthetic:
  - Slate-950 backgrounds (`bg-slate-950`)
  - Amber-400 accents (`text-amber-400`, `border-amber-400`) for Referee whistles and alerts
  - Emerald-400 accents (`text-emerald-400`, `border-emerald-400`) for verified citations and high integrity scores
  - Rose-500 accents (`text-rose-500`, `border-rose-500`) for logical fallacies and anti-cheat flags

## Verification Rules
Always run the following commands and ensure they pass before completing any task:
1. `npm test` - to ensure all unit tests pass.
2. `npm run build` - to ensure TypeScript validity and clean production build.
