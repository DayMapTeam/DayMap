# DayMap

An interactive map that turns your calendar into a personalised daily route and planner, adapting as your plans and travel conditions change.

DayMap puts one day on a 3D map of Adelaide, next to a linked event planner. Google Calendar events, activities you add, and the travel time between them form a single plan. When something runs over, DayMap proposes one clear adjustment and changes nothing until you accept it.

> **Status (September 2026):** initial implementation. The frontend has a shared fixture and selection demo; the backend has an Express app and separate server entry point. API endpoints and live integrations are still planned.

## Documentation

| Document | Read it for |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, data contract, API, integrations, scheduling rules, environment variables |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Team ownership, kickoff setup, milestones, starter issues, workflow |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents working in this repository |

## Getting started

Run the frontend using [client/README.md](client/README.md), and the backend using [server/R