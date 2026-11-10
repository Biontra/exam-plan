# Exam Plan

Exam Plan turns a list of exams into a day-by-day study schedule. You enter each exam's date and difficulty plus the hours you can study per day, and it shows countdown cards and a plan up to your last exam.

Live demo: <LIVE_URL>

## How to use

1. Add each exam: course name, date, difficulty (Easy, Medium, Hard). Time and number of topics are optional. You can edit or delete any exam (deleting has an Undo).
2. Set your study hours per day. A separate weekend value is optional.
3. Read the plan. A warning such as "Not enough time for Calculus II: 6 hours short" appears when the hours do not fit.
4. Download the plan as an `.ics` file (opens in Google Calendar, Apple Calendar, Outlook) or print it.

No exams yet? Press "Try with sample exams". The page is available in English and Turkish (EN / TR button).

## How the plan is calculated

- Hours needed per exam: Easy 4, Medium 8, Hard 12. With a topic count: topics x 1 (Easy), 1.5 (Medium) or 2 (Hard) hours.
- Planning runs from today to the day before each exam, in 30-minute steps.
- The day before an exam is a review day for that course. About a quarter of its hours are kept for that day.
- Each day, every open course asks for an even share of its remaining hours. If the requests do not fit in the day, the day's hours are split by request size times difficulty weight (Easy 1, Medium 1.5, Hard 2). Requests grow as an exam gets closer, so near exams get more.
- A day never gets more than your daily hours. A course is not planned on or after its exam day. An exam dated today or earlier gets no plan.
- Hours that do not fit are reported as a shortage per course.

The rules live in `plan.js`, a pure module with no DOM access.

## Run locally

No build step and no dependencies. Serve the folder with any static server:

```
python3 -m http.server 8460
```

Then open http://localhost:8460. Opening `index.html` directly also works.

## Tests

```
node --test
```

Tests (`test/plan.test.js`) cover the plan rules, input validation and `.ics` output. They need Node 18 or newer. The interface was checked by hand in headless Chrome at 1280 px and 375 px wide.

## Built with

Plain HTML, CSS and JavaScript. Fonts (Space Grotesk, JetBrains Mono) are loaded from Google Fonts; the page falls back to system fonts if they are blocked.

## Limitations

- Data is saved only in this browser (localStorage). It is not synced between devices, and clearing site data deletes it. If storage is blocked, the app still works but forgets everything on reload.
- Study hours are estimates from difficulty and topic count, not from your own pace.
- Exam events in the `.ics` file last 2 hours when a time is given, because the app does not ask for a duration. Study events are all-day entries, not timed blocks.
- No accounts, no server, no analytics.

## License

MIT, see `LICENSE`.
