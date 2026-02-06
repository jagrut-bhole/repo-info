# RepoScope - GitHub Repository Architecture Analyzer

## Overview
RepoScope is a web application that analyzes GitHub repositories and visualizes their architecture using interactive ReactFlow diagrams. It uses Google Gemini AI to detect API endpoints, frontend-backend flows, database mappings, external services, and more.

## Tech Stack
- **Frontend**: React 18 + TypeScript, ReactFlow (@xyflow/react), Framer Motion, Tailwind CSS, Shadcn UI
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Google Gemini (user's own API key via GEMINI_API_KEY)
- **GitHub**: Octokit via Replit GitHub connector

## Project Structure
```
client/src/
  pages/
    home.tsx          - Landing page with URL input
    analysis.tsx      - Analysis dashboard with ReactFlow
  components/
    theme-provider.tsx - Dark/light mode
    theme-toggle.tsx   - Theme toggle button
    ui/               - Shadcn UI components
server/
  index.ts           - Express server entry
  routes.ts          - API routes
  storage.ts         - Database storage layer
  db.ts              - Database connection
  github.ts          - GitHub API integration
  gemini.ts          - Gemini AI analysis
shared/
  schema.ts          - Drizzle schemas + TypeScript types
```

## Key Features
- GitHub URL validation (github.com/{owner}/{repo} format)
- AI-powered repository analysis via Gemini
- Interactive ReactFlow architecture diagrams
- API endpoint detection grouped by controller
- Frontend-backend flow mapping
- Database mapping detection
- External services detection
- Tech stack summary
- Environment variables detection
- API versioning detection
- Contribution suggestions
- Export: PNG, SVG, PDF, README architecture, Mermaid diagrams
- Dark/light theme support
- Framer Motion animations

## Color Theme
Rich warm palette (NOT typical AI purple/blue):
- Primary: Coral (hsl 9 75% 61%)
- Charts: Blue, Teal, Amber, Green, Pink
- Dark mode: Warm dark tones
