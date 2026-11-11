# Exam Plan

Exam Plan is a mission-control board for exam weeks. You enter your exams and the hours you can study per day. It counts down to the next exam, builds a day-by-day plan, and re-plans every time you open it, based on the hours you actually logged.

Live demo: https://exam.kaanyunusemre.com

## Features

- **Next mission**: a live countdown (days, hours, minutes, seconds) to the nearest exam, with its readiness ring.
- **Summary board**: total planned hours, done, remaining, study streak and today's goal.
- **Timeline**: today to the last exam on one line, exams coloured by difficulty, bars for the planned load per day. It turns vertical on phones.
- **Today**: the blocks planned for today. Mark a block done, or log it in 0.5 hour steps.
- **Living plan**: hours you did not do move to the days that are left. Extra work shortens later days.
- **Readiness rings**: per exam, done hours over needed hours. A second thin ring shows ticked topics.
- **Topic checklists**: add, tick and delete topics per exam.
- **Focus timer**: full-screen Pomodoro (focus 15 to 50 minutes, 5 minute break), pause and end, the finished time is added to the block, remaining time in the tab title, optional short sound.
- **Backup**: export everything as a JSON file and import it again. Files are validated; a broken file shows an error and changes nothing.
- **First run guide**: three skippable steps and a "Try with sample exams" button (the sample already has some progress).
- English and Turkish, `.ics` calendar export, print view of the plan.
- On phones the board becomes four tabs: Today, Plan, Exams, Settings. On a desktop it is one board.

## How to use

1. Add each exam: course name, date, difficulty (Easy, Medium, Hard). Time and number of topics are optional.
2. Set your study hours per day (Settings). A separate weekend value is optional.
3. Each day, open Today and log what you did, by hand or with the focus timer.
4. Check Plan for the days ahead. A warning such as "Not enough time for Calculus II: 6 hours short" appears when the hours do not fit.

## How the plan is calculated

- Hours needed per exam: Easy 4, Medium 8, Hard 12. With a topic count: topics x 1 (Easy), 1.5 (Medium) or 2 (Hard) hours. The topic checklist does not change the hours; the topic count field does.
- Planning runs from today to the day before each exam, in 30-minute steps.
- The day before an exam is a review day for that course. About a quarter of its hours are kept for that day.
- Each day, every open course asks for an even share of its remaining hours. If the requests do not fit in the day, the day's hours are split by request size times difficulty weight (Easy 1, Medium 1.5, Hard 2).
- A day never gets more than your daily hours. A course is not planned on or after its exam day. An exam dated today or earlier gets no plan.
- **Re-planning (`replan` in `plan.js`)**: logged hours are subtracted from what each exam needs, then the same rules run again from today. Today's target depends only on what was done before today, so it does not shrink while you tick it off. Whatever you did today replaces today's target for the days after: finished less, and the rest moves on; finished more, and later days get lighter. Hours done on past days that were not planned for them still count. Progress logged for an exam that is already past is ignored by the plan.
- **Streak**: days in a row with any logged study, counted back from today. A day that has no log yet does not break the streak until it is over.
- **Focus credit**: a finished or ended session is rounded to the nearest 30 minutes. Under 15 minutes adds nothing.
- Countdown: an exam without a time counts down to 09:00 on its day.

The rules live in `plan.js`, a pure module with no DOM access. It is loaded as a normal script; the interface in `js/` uses ES modules.

## Run locally

No build step and no dependencies. Because the interface uses ES modules, serve the folder with a static server (opening `index.html` from disk does not work):

```
python3 -m http.server 8460
```

Then open http://localhost:8460.

## Tests

```
node --test
```

`test/plan.test.js` covers the plan rules, validation and `.ics` output. `test/replan.test.js` covers re-planning (missed days, extra work, finished exams, past exams), streaks, progress helpers, focus credit, backup validation and sample data. They need Node 18 or newer.

The interface was checked by hand and with a scripted headless Chrome at 1280 px and 375 px: logging hours, reload, a fake date three days ahead, the focus timer with a fake clock, topics, backup import with broken files, Turkish, blocked storage, reduced motion and print.

## Code layout

```
plan.js          pure plan, replan, streak, backup and sample data
i18n.js          English and Turkish text
js/store.js      state, storage, the computed plan
js/dashboard.js  countdown, summary tiles, timeline
js/today.js      today blocks and the day list
js/exams.js      exam cards, topics, exam form
js/focus.js      focus timer
js/settings.js   hours, focus length, backup
js/onboarding.js first-run guide
js/main.js       wiring
```

## Built with

Plain HTML, CSS and JavaScript. Fonts (Space Grotesk, JetBrains Mono) are loaded from Google Fonts; the page falls back to system fonts if they are blocked. Animations (ring fill, timeline marker, focus ring) stop when the system asks for reduced motion.

## Limitations

- Data is saved only in this browser (localStorage). It is not synced between devices, and clearing site data deletes it. Use Export JSON to keep a copy. If storage is blocked, the app still works but forgets everything on reload.
- Study hours are estimates from difficulty and topic count, not from your own pace.
- You can log hours for today only; past days cannot be edited.
- The focus timer works from timestamps, but it only runs while the page is open. Closing the tab ends the session without logging.
- Exam events in the `.ics` file last 2 hours when a time is given. Study events are all-day entries, not timed blocks.
- Up to 100 exams, 40 topics per exam.
- No accounts, no server, no analytics.

## License

MIT, see `LICENSE`.
