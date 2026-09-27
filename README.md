# DayMap

An interactive map that turns your calendar into a personalised daily route and planner, adapting as your plans and travel conditions change.

DayMap puts one day on a 3D map of Adelaide, next to a linked event planner. Google Calendar events, activities you add, and the travel time between them form a single plan. When something runs over, DayMap proposes one clear adjustment and changes nothing until you accept it.

> **Status (September 2026):** the planner, map, navigation, sign-in, saved days and Google Calendar import all work locally. Without sign-in DayMap shows a fictional demo day.

## Documentation

| Document | Read it for |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, data contract, API, integrations, scheduling rules, environment variables |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Team ownership, kickoff setup, milestones, starter issues, workflow |

## Run DayMap on your own computer

Two commands set up and run the whole app: the database and sign-in run in
Docker (local Supabase), the API and the website run with Node.

### 1. Install Node and Docker

| Tool | Version | Get it |
| --- | --- | --- |
| Git | any recent | <https://git-scm.com/downloads> |
| Node.js | 22.9 or newer (includes npm) | <https://nodejs.org> (LTS) |
| Docker | Docker Desktop on macOS/Windows, Docker Engine on Linux | <https://docs.docker.com/get-docker/> |

Start Docker (open Docker Desktop, or `sudo systemctl start docker` on Linux).
It needs about **4 GB of free memory**. On Linux, if Docker says "permission
denied", run `sudo usermod -aG docker $USER`, then log out and back in.

### 2. Set up

```sh
git clone https://github.com/DayMapTeam/DayMap.git
cd DayMap
npm run setup
```

`npm run setup` checks Node and Docker, installs the packages, starts the local
database, and writes the three settings files for you (`client/.env.local`,
`server/.env`, `supabase/.env`). The first run takes a few minutes while Docker
downloads images.

It asks for two keys from the project owner. What you type isn't shown. Press
**Enter** to skip either one; the app still runs, with that feature off:

| Key | Turns on | Without it |
| --- | --- | --- |
| **Google Maps API key** | The map, place search and travel times | The planner and email sign-in still work, but journeys show "Travel unknown" |
| **Google OAuth client secret** | Sign in with Google, Google Calendar import | Sign up with email and password instead |

For Sign in with Google and Calendar, the owner also has to add your Gmail
address as a **test user** ([see below](#for-the-project-owner-adding-a-teammate)).
Got a key later? Run `npm run setup` again and paste it in. Running it again is
always safe: it keeps your settings and only fills in what is missing.

The keys are secrets. **Never commit the settings files, paste keys in chat, or
show them in screenshots.**

### 3. Run

```sh
npm run dev
```

Open <http://localhost:5173>. This one terminal runs the API (`[api]` lines)
and the website (`[web]` lines), and starts the database if it isn't running.
**Ctrl+C** stops the API and website.

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs DayMap. |
| `npm run doctor` | Checks your setup and says exactly what to fix. Run it when something doesn't work. |
| `npm run stop` | Stops the database containers and frees about 2 GB of memory. Your data is kept. |
| `npm run setup` | Re-checks everything; installs new packages after a `git pull`. |
| `npx supabase db reset` | Wipes the local database and re-creates the tables. |

Studio, a web view of the database tables, is at <http://127.0.0.1:54323>.

### 4. First use

- **Sign up with email and password.** This works straight away: local sign-up
  needs no confirmation email. Any emails the local sign-in service sends
  appear at <http://127.0.0.1:54324>.
- **Sign in with Google** and **Connect Google Calendar** only work with a
  Google account on the test-user list. Google shows "Google hasn't verified
  this app": choose **Continue**. That is expected while the app is in testing.

**Import your Google Calendar:**

1. Sign in (email or Google).
2. Click **Connect Google Calendar**. It is on an empty day in the planner, and
   in the Calendar section of the account menu.
3. Choose the Google account that was added as a test user. On "Google hasn't
   verified this app" choose **Continue**, then allow DayMap to **see your
   calendar events**. DayMap only reads events and never changes your Google
   Calendar.
4. You're back in DayMap, now connected. Click **Import from Google Calendar** to copy
   that day's events into the planner. Opening a day later imports it
   quietly again, keeping your own changes.
5. The imported events are now DayMap's own copy:
   - Tap the **star** to make an event fixed. Suggestions never move a fixed event.
   - Open an event to edit its name and times, or use **−15 / +15 min** to make it shorter or longer.
   - Use **Delete** to remove an event (with Undo). A removed event stays hidden when you import again, until you choose **Bring back**.

Each computer has its own local database, so accounts and saved days are not
shared between teammates.

### Troubleshooting

Start with `npm run doctor`: it checks Node, Docker, the database, the settings
files and the ports, and prints the fix for each problem.

| Problem | Fix |
| --- | --- |
| "DayMap can't reach its server" | The API stopped. Look for `[api]` errors in the `npm run dev` terminal. |
| `npm run dev` says a port is already in use | DayMap is already running in another terminal. Close it with Ctrl+C there. |
| Google says `redirect_uri_mismatch` | The OAuth client in Google Cloud must list **both** `http://127.0.0.1:54321/auth/v1/callback` (sign-in) and `http://localhost:3001/api/calendar/callback` (Calendar). Ask the owner. |
| Google says "Access blocked" or error 403 | Your Google account isn't a test user yet. Ask the owner to add it. |
| The map is blank or says the key is invalid | The Maps key is missing or wrong. Delete the `VITE_GOOGLE_MAPS_API_KEY` value in `client/.env.local`, run `npm run setup` and paste the key again, then restart `npm run dev`. |
| Supabase doesn't start: ports 54321–54324 in use | Another Supabase project is running. Run `npx supabase stop --all`, then `npm run dev`. |
| The computer gets slow | Run `npm run stop` when you're not working on DayMap. |

### For the project owner: adding a teammate

1. In [Google Cloud Console](https://console.cloud.google.com/), open the
   DayMap project, then **Google Auth Platform → Audience → Test users → Add
   users**, and add their Gmail address. A project in testing mode allows up to
   100 test users.
2. Check that **Clients →** the DayMap web client lists both redirect URIs from
   the troubleshooting table above.
3. Send them the Maps key and the client secret privately, for example
   through a password manager's sharing feature. Never through Git, GitHub
   issues or a group chat. (The client ID is public and already in
   `supabase/config.toml`; `npm run setup` fills it in.)
4. If a key leaks, rotate it in Google Cloud (**Credentials** for the Maps key,
   **Clients** for the client secret) and send everyone the new one.

More detail: [server/PERSISTENCE.md](server/PERSISTENCE.md) (database and saved
days) and [server/CALENDAR.md](server/CALENDAR.md) (Google Calendar import).
