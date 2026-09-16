# Waypoint — 75-Day Habit Tracker

A full-stack habit tracker for a 75-day challenge. Users can create recurring habits, create one-time tasks for an exact date, mark due items complete, track streaks, view progress, and receive morning reminders for items still unlogged that day.

## Features

- User signup/login with hashed passwords
- SQLite database with relational tables
- Daily recurring habits
- Specific-weekday recurring habits
- **Specific-date one-time tasks**
- Today-only due list
- Completion tracking
- Streaks and longest streaks
- 75-day progress and heatmap
- Configurable morning reminder time
- Browser notification opt-in
- JSON backup/export
- Automatic migration from the older `data.json` format

## Tech Stack

- Node.js
- Express
- SQLite
- `better-sqlite3`
- `bcryptjs`
- `cookie-session`
- HTML/CSS/JavaScript

`better-sqlite3` provides a synchronous SQLite API and is installed with `npm install`. citeturn0search0

## Project Structure

```text
habit-tracker/
├── server.js
├── db.js
├── package.json
├── .gitignore
├── README.md
├── REASONING.md
├── AI_LOGS.md
└── public/
    ├── index.html
    ├── login.html
    ├── signup.html
    ├── auth.js
    ├── app.js
    └── style.css
```

The SQLite database is created automatically as:

```text
habit-tracker.db
```

It is ignored by Git because it contains local application data.

## Run in GitHub Codespaces

### 1. Open the repository

Open the GitHub repository and select:

**Code → Codespaces → Create codespace on main**

### 2. Install dependencies

In the Codespaces terminal:

```bash
npm install
```

This installs Express, authentication dependencies, and SQLite support.

### 3. Start the server

```bash
npm start
```

Expected output:

```text
Habit tracker running at http://localhost:3000
```

If port 3000 is already occupied, use another port:

```bash
PORT=3001 npm start
```

Then open the corresponding forwarded port in the **Ports** tab.

## How to Use

### Create a recurring habit

Select **Every day** for a daily habit, or **Specific weekdays** to select Monday–Sunday.

### Create a task for one exact day

Select:

**Specific date**

Then choose the date from the date picker.

For example:

```text
Task: Submit assignment
Type: Specific date
Date: 2026-09-20
```

That task is due only on September 20, 2026. It will not appear in the Today list on other dates.

### Complete a task

When the task is due, check its checkbox. The completion is stored in SQLite.

### Morning reminder

The user can select a reminder time, such as `08:00`.

After that time, if there are still due-but-incomplete habits/tasks, the app shows an in-app reminder. The user can also enable browser notifications.

A normal browser page cannot reliably wake itself after the browser/tab is completely closed. True background push notifications require a Service Worker and Push API/push server. The current implementation therefore treats the in-app reminder as the reliable layer and browser notifications as an opt-in enhancement while the app is loaded.

## Database Design

The SQLite database contains:

- `users` — accounts and password hashes
- `user_settings` — challenge start date and reminder time
- `habits` — daily, weekday, and specific-date tasks
- `habit_days` — selected weekdays for recurring custom habits
- `completions` — completion records by task and date

Relationships are enforced with foreign keys.

## Legacy Data Migration

If an older version of the project contains `data.json`, the application automatically attempts a one-time migration when the SQLite database is first created.

After a successful migration, the old file is renamed to:

```text
data.json.migrated
```

## API Reference

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/signup` | Create an account |
| POST | `/api/login` | Log in |
| POST | `/api/logout` | Log out |
| GET | `/api/me` | Current user |
| GET | `/api/settings` | Get reminder settings |
| PUT | `/api/settings` | Update reminder settings |
| GET | `/api/habits?date=YYYY-MM-DD` | Get habits/tasks and status for a date |
| POST | `/api/habits` | Create daily, weekday, or specific-date task |
| PUT | `/api/habits/:id` | Edit task/habit |
| DELETE | `/api/habits/:id` | Delete task/habit |
| POST | `/api/habits/:id/toggle` | Toggle completion |
| GET | `/api/habits/:id/history?days=14` | Completion history |
| GET | `/api/progress` | 75-day progress |
| GET | `/api/export` | Export account data |

## Debugging

### `Cannot find module 'better-sqlite3'`

Run:

```bash
npm install
```

### Port conflict

Use another port:

```bash
PORT=3001 npm start
```

Then open that port from the Codespaces **Ports** panel.

### Database reset

To completely reset local application data, stop the server and remove:

```bash
rm -f habit-tracker.db habit-tracker.db-shm habit-tracker.db-wal
```

Then restart:

```bash
npm start
```

This deletes local accounts, habits, and completions.

### Login/session problems

Clear the site's cookies or use an incognito window and log in again.

## Security Notes

- Passwords are hashed with `bcryptjs`.
- User data is scoped by authenticated user ID.
- SQLite foreign keys prevent orphaned task data.
- `habit-tracker.db` is ignored by Git.
- The default session secret is suitable only for a demo/builder environment. Set `SESSION_SECRET` for a real deployment.

## Limitations

- SQLite is appropriate for this small single-server application, but a larger distributed production deployment would normally use a managed relational database.
- Background notifications when the browser is completely closed require a push-notification architecture.
- There is no password-reset/email-verification flow.
