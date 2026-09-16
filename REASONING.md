# Reasoning

## Interpreting the problem

The prompt describes Ananya running a 75-day challenge with a mix of habits:
some daily (water, no sugar), some probably not daily (workouts on
weekdays, say). The concrete signal I pulled out of "she's juggling several
habits at once: some she does every day, some only on weekdays" is that the
**core domain problem is scheduling**, not just a flat checklist. A todo
list where every item shows every day doesn't model her actual situation —
a weekday-only habit showing up on a Sunday would just be visual noise she
has to ignore, every single Sunday, for 75 days.

So I treated the three load-bearing requirements as:

1. Habits can have **different schedules** (daily vs. specific days), and
   the app must only show what's actually due on a given day.
2. She wants a quick **morning ritual** — open the app, see today, tick
   things off. That has to be the default view, not something she has to
   navigate to.
3. It's a **75-day challenge**, which implies she cares about the whole
   arc, not just today — hence streaks and a progress view, not just a
   daily checklist that forgets yesterday existed.

I scoped out anything that wasn't clearly implied: multi-user accounts,
notifications/reminders, editing a habit's schedule in place, and anything
requiring a real database. A 2.5-hour build window rewards a small feature
set done correctly over a large one done shakily.

## Data model

Two ideas, deliberately kept separate:

- **Habit**: name + schedule rule (`daily`, or `custom` with a set of
  weekday numbers). This never changes day to day.
- **Completion**: a per-habit, per-date boolean. Stored as
  `completions[habitId][dateISO] = true`.

Keeping "is this habit due today" (a pure function of the schedule + date)
separate from "was it done" (a stored fact) is what makes streaks and the
heatmap possible without extra bookkeeping — both are just derived by
walking dates and asking `isDue()` / `isCompleted()`.

## Streaks

The obvious naive approach — "count backward while completed[date] is
true" — breaks for weekday-only habits, because it'd zero out every
Monday when the weekend wasn't completed (it couldn't have been; the habit
wasn't due). So the streak walk skips any date the habit wasn't due, and
only breaks the streak on a due date that was missed. I also special-cased
"today": if a habit is due today but not yet checked off, that shouldn't
already look like a broken streak at 8am — it starts counting from
yesterday instead, so the streak reflects committed history, not an
in-progress day.

## Database decision

The first version used a JSON file because it was quick to build. The updated solution uses SQLite through `better-sqlite3`. This provides a real relational database without requiring a separate database server in the Codespace.

The schema separates users, settings, habits, weekday schedules, and completion records. Foreign keys keep task data associated with the correct user and habit.

A migration path was added so an existing `data.json` can be imported automatically into SQLite. This preserves the work from the earlier version instead of forcing a clean restart.

The tradeoff is that SQLite is still intended for a small single-server application rather than a large distributed production system.

## Specific-date task decision

The original recurring model supported daily habits and weekday schedules. I extended it with a third type: `specific`.

A specific task stores an exact date such as `2026-09-20`. The task is considered due only when the requested date matches that stored date. This makes it possible to track one-time activities such as:

- Submit an assignment on a particular date
- Attend an interview on a particular date
- Complete a project milestone on a particular date

The existing completion system is reused, so these tasks are stored and checked in the same way as recurring habits.

## Frontend: no framework

Same reasoning as the storage choice: no build step means no time spent
debugging a bundler in a container, and the UI surface here (a form, a
checklist, a progress bar) doesn't need componentization to stay readable.
Three small files (`index.html`, `style.css`, `app.js`) with a handful of
`fetch` calls cover it.

## The morning reminder ("the twist")

The brief's twist was specific: remind the user each morning of habits
still unlogged. I split this into what a plain web app can and can't
actually promise:

- **Can promise reliably:** the instant someone opens the app, if their
  saved reminder time has passed and something's unlogged, show them
  clearly. That's the in-app banner — no permissions needed, works every
  time, and is the part that actually satisfies "remind the user each
  morning" for anyone who opens the app that day. The time itself is
  user-configurable (`GET`/`PUT /api/settings`, saved per account) rather
  than a fixed cutoff, since "morning" means a different clock time to
  different people, and a habit tracker that assumes everyone wakes up by
  the same hour is making a bad assumption on day one.
- **Can offer, but with an honest caveat:** an opt-in real OS notification
  via the browser's Notification API. I built this too, since it's a
  meaningfully better experience when it works — but I didn't want to
  oversell it. A page with no service worker can only fire a notification
  while it's actually loaded in a tab; it cannot wake itself up from a
  closed browser. True "notifies you even if you never open the app"
  requires push infrastructure (a service worker + a server tracking
  subscriptions + a scheduler), which is a backend feature outside a
  single Express app's normal scope and outside the challenge's time
  budget. I noted this clearly in the README rather than implying the
  notification works like a phone's daily alarm when it doesn't.

I deliberately made both layers **dismissible/re-checking**, not
persistent nags: the banner disappears once dismissed for the day (tracked
in `localStorage`, keyed by date) and also disappears on its own once the
morning cutoff passes, even if the tab stays open. A reminder that can't be
turned off for the day stops being useful information and starts being
noise — and noise is the thing users of a habit app are least likely to
forgive.

## Visual design

The brief involves a personal, disciplined, day-by-day challenge, so I
leaned into a "trail log / expedition" identity — trail-blaze amber on a
pine-charcoal ground, a condensed signage-style display face for headings,
a progress bar drawn like a dotted trail with a marker, and a tally grid
instead of a generic heatmap. This was a deliberate move away from the
default AI-generated look (dark slate background, single bright accent,
uniform rounded SaaS cards, emoji as icons) toward something that reads as
a considered choice for *this* app rather than a template. Icons are
hand-drawn inline SVG rather than emoji, for visual consistency across
platforms and a more professional finish.

## What I'd do with more time

- Real push notifications (service worker + subscription server) instead
  of the tab-must-be-open browser notification.
- Swap the JSON store for SQLite once install-time risk isn't a concern,
  to get real concurrent-write safety across multiple accounts.
- Basic tests around `isDue`/streak logic — I sanity-checked these by hand
  during the build (see terminal output in AI_LOGS.md), but they're exactly
  the kind of date-math edge cases that deserve real unit tests, not just
  spot checks against a couple of known dates.
- Password reset flow (currently: sign up again with a new username).
