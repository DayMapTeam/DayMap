# DayMap

An interactive map that turns your calendar into a personalised daily route and planner, adapting as your plans and travel conditions change.

DayMap puts one day on a 3D map of Adelaide, next to a linked event planner. Google Calendar events, activities you add, and the travel time between them form a single plan. When something runs over, DayMap proposes one clear adjustment and changes nothing until you accept it.

> **Status (September 2026):** the frontend scaffold and an Express API are present. The server provides a fictional demo and authenticated day-plan persistence; the frontend has not yet connected to those endpoints.

## Documentation

| Document | Read it for |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, data contract, API, integrations, scheduling rules, environment variables |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Team ownership, kickoff setup, milestones, starter issues, workflow |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents working in this repository |

## Getting started

Install and run the frontend with `npm --prefix client ci` and `npm --prefix client run dev`.
Install and run the API with `npm --prefix server ci` and `npm --prefix server run dev`.
See [server/PERSISTENCE.md](server/PERSISTENCE.md) for Supabase configuration,
authenticated plan requests, and migration tests.
