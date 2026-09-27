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

This sets up the whole app locally: the database and sign-in run in Docker
(local Supabase), the API and the website run with Node. It takes about 20
minutes the first time, mostly downloading Docker images.

You need three things from the project owner, sent privately (never through Git
or a group chat):

- a **Google Maps API key** (for the map, places and routes)
- the **Google OAuth client ID and client secret** (for "Sign in with Google" and Google Calendar)
- your Gmail address added as a **test user** in our Google Cloud project, so Google lets you sign in

### 1. Install the prerequisites

| Tool | Version | Get it |
| --- | --- | --- |
| Git | any recent | <https://git-scm.com/downloads> |
| Node.js | 22.9 or newer (includes npm) | <https://nodejs.org> (LTS) |
| Docker | Docker Desktop on macOS/Windows, Docker Engine on Linux | <https://docs.docker.com/get-docker/> |
| OpenSSL | any | Built in on macOS/Linux; on Windows use Git Bash, which includes it |

Docker must be **running** (Docker Desktop open, or `sudo systemctl start docker`
on Linux) and have about **4 GB of free memory**. Check with:

```sh
node --version     # v22.9.0 or newer
docker info        # prints details, not an error
```

On Linux, if `docker info` says "permission denied", run
`sudo usermod -aG docker $USER`, then log out and back in.

### 2. Get the code and install packages

```sh
git clone https://github.com/DayMapTeam/DayMap.git
cd DayMap
npm --prefix client ci
npm --prefix server ci
```

### 3. Start the local database (Supabase)

From the repository root:

```sh
npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor
```

The first run downloads the Docker images, then creates the tables from
`supabase/migrations/`. When it finishes it prints the local settings. You need
two of them: `API_URL` (`http://127.0.0.1:54321`) and `PUBLISHABLE_KEY`
(starts with `sb_publishable_`). These are Supabase's fixed local defaults,
not secrets. Show them again at any time with `npx supabase status`.

| Command | What it does |
| --- | --- |
| `npx supabase stop` | Stops the containers and frees memory. Your data is kept. |
| `npx supabase start -x …` (same as above) | Starts them again. |
| `npx supabase db reset` | Wipes the local database and re-creates the tables. |

Studio, a web view of the tables, is at <http://127.0.0.1:54323>.

### 4. Create the three settings files

These files hold keys and are ignored by Git. **Never commit them, paste them
in chat, or show them in screenshots.**

**`client/.env.local`** (copy `client/.env.example`):

```ini
VITE_GOOGLE_MAPS_API_KEY=<Maps key from the owner>
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from step 3>
```

**`server/.env`** (copy `server/.env.example`):

```ini
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from step 3>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
GOOGLE_OAUTH_CLIENT_ID=<client ID from the owner>
GOOGLE_OAUTH_CLIENT_SECRET=<client secret from the owner>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/api/calendar/callback
TOKEN_ENCRYPTION_KEY=<output of: openssl rand -base64 32>
```

Generate your own `TOKEN_ENCRYPTION_KEY` once and keep it. It encrypts the
Google Calendar tokens stored in your database; changing it later means
reconnecting Google Calendar. The five Calendar settings (`DATABASE_URL` down
to `TOKEN_ENCRYPTION_KEY`) go together: leave all five empty to turn Calendar
off, because the server refuses to start with only some of them set.

**`supabase/.env`** (new file, for "Sign in with Google"):

```ini
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<the same client secret from the owner>
```

Supabase only reads this file when it starts, so restart it after creating it:
`npx supabase stop`, then the start command from step 3.

### 5. Start the app

Use two terminals, both from the repository root, and leave them running:

```sh
npm --prefix server run dev    # API on http://localhost:3001
npm --prefix client run dev    # website on http://localhost:5173
```

The server should print `Sign-in and saved days: on` and `Google Calendar: on`.
Open <http://localhost:5173>.

### 6. First use

- **Sign up with email and password.** This works straight away: local sign-up
  needs no confirmation email. Any emails the local sign-in service sends
  appear at <http://127.0.0.1:54324>.
- **Sign in with Google** and **Connect Google Calendar** only work with a
  Google account on the test-user list. Google shows "Google hasn't verified
  this app": choose **Continue**. That is expected while the app is in testing.
- On an empty day, **Import from Google Calendar** copies that day's events
  into DayMap. From then on they are DayMap's own copy: star, edit, resize or
  remove them without changing your Google Calendar.

Each computer has its own local database, so accounts and saved days are not
shared between teammates.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| "DayMap can't reach its server" | The API isn't running. Start `npm --prefix server run dev` and check that it printed no error. |
| The server stops with a message about Google Calendar settings | Only some of the five Calendar settings in `server/.env` are filled. Fill all five, or empty all five. |
| Google says `redirect_uri_mismatch` | The OAuth client in Google Cloud must list **both** `http://127.0.0.1:54321/auth/v1/callback` (sign-in) and `http://localhost:3001/api/calendar/callback` (Calendar). Ask the owner. |
| Google says "Access blocked" or error 403 | Your Google account isn't a test user yet. Ask the owner to add it. |
| "Sign in with Google" does nothing or says the provider is disabled | `supabase/.env` is missing, or Supabase wasn't restarted after creating it. |
| The map is blank or says the key is invalid | Check `VITE_GOOGLE_MAPS_API_KEY`, then restart the client (Vite reads `.env.local` only at start). |
| `npx supabase start` fails: Docker isn't running, or a port is in use | Start Docker. If ports 54321–54324 are taken by another Supabase project, run `npx supabase stop --all`. |
| Port 3001 or 5173 already in use | Another copy is still running. Close it, or find it with `lsof -i :3001` (macOS/Linux). |
| The computer gets slow | The containers use about 2 GB of memory. Run `npx supabase stop` when you're not working on DayMap. |

### For the project owner: adding a teammate

1. In [Google Cloud Console](https://console.cloud.google.com/), open the
   DayMap project, then **Google Auth Platform → Audience → Test users → Add
   users**, and add their Gmail address. A project in testing mode allows up to
   100 test users.
2. Check that **Clients →** the DayMap web client lists both redirect URIs from
   the troubleshooting table above.
3. Send them the Maps key, client ID and client secret privately, for example
   through a password manager's sharing feature. Never through Git, GitHub
   issues or a group chat.
4. If a key leaks, rotate it in Google Cloud (**Credentials** for the Maps key,
   **Clients** for the client secret) and send everyone the new one.

More detail: [server/PERSISTENCE.md](server/PERSISTENCE.md) (database and saved
days) and [server/CALENDAR.md](server/CALENDAR.md) (Google Calendar import).
