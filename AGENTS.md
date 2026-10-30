# AGENTS.md

## Project overview

This repository is a quiz application that exists in two forms sharing the same
question bank in `questions.json`:

- A CLI quiz in `main.py`.
- A web quiz served by a Python standard-library HTTP server in `server.py`, with
  the browser UI in `web/`.

There is no framework, build step, or package manifest. Python and browser code
use only the standard library / plain DOM APIs.

### File structure

```
cli-quiz/
├── main.py          # CLI quiz: topic menu, question flow, scoring, review
├── server.py        # HTTP server + JSON API + session scoring for the web quiz
├── questions.json   # Shared question bank (topics -> questions/choices/answer/explanation)
├── README.md        # Currently only "# QUIZ-"
├── AGENTS.md        # This file
└── web/
    ├── index.html   # Single-page UI: start, quiz, and result screens
    ├── app.js       # Client state, API calls, rendering, keyboard shortcuts
    └── style.css    # Styling for the web UI
```

`questions.json` is the single source of truth. Both `main.py` and `server.py`
load it, attach the topic label to each question, and validate that each
`answer` index is within range.

## Current development focus: the Web Quiz

Work is focused on the web application (`server.py` + `web/`). The CLI in
`main.py` should keep working but is not the active target.

Web flow as implemented today:

1. `web/app.js` calls `GET /api/topics` and renders topic buttons.
2. Starting a quiz calls `POST /api/quiz`; `server.py` samples questions,
   shuffles choices, stores a prepared quiz in the in-memory `sessions` dict
   keyed by `quizId`, and returns questions without the correct answers.
3. The browser keeps the user's answers in `state.answers` while navigating
   between questions.
4. Finishing calls `POST /api/submit` with `{ quizId, answers }`. `server.py`
   pops the session, validates the answers, and computes the score from those
   final submitted answers. Correct answers must not be sent to the client
   before submission. They may be included in the review after submission.

### Requirements for the Web Quiz

- Preserve selected answers before submission. Selections must survive moving
  to previous/next questions and be submitted exactly as chosen. The client
  stores them in `state.answers` (see `renderQuestion`, `selectChoice`,
  `previousQuestion`, `nextQuestion`, and `submitQuiz` in `web/app.js`).
- Calculate scores from the final submitted answers on the server. Scoring must
  happen in `server.py` (`handle_submit`), not in the browser. Do not trust or
  accept a client-computed score, and do not send correct answers to the client
  before submission.

Keep these two guarantees intact when changing the web quiz. If a change would
break either one, stop and reconsider the approach.

## Before editing

Inspect the relevant files first; do not assume behavior:

- Web UI/behavior: read `web/index.html`, `web/app.js`, and `web/style.css`.
- API, sessions, or scoring: read `server.py`, especially `handle_create_quiz`,
  `handle_submit`, `prepare_questions`, and `read_json`.
- Question content or schema: read `questions.json` and the loaders
  (`load_topics` in both `main.py` and `server.py`).
- CLI changes: read `main.py`.
- If `index.html` element IDs or classes change, update `web/app.js` and
  `web/style.css` together, and vice versa.

Match existing conventions: plain Python standard library, no dependencies, and
plain DOM APIs with no frameworks or bundler in the browser code.

## Running checks after changes

There is currently **no automated test suite, linter configuration, or CI**
in this repository (no test files, `pyproject.toml`, `requirements.txt`,
`package.json`, or similar). Do not claim tests passed when none exist.

After changes, at minimum:

1. Verify Python files parse/compile:

   ```powershell
   python -m py_compile main.py server.py
   ```

2. Start the server and manually exercise the affected flow:

   ```powershell
   python server.py
   ```

   Then open `http://localhost:8000` and check the topics list, answering
   questions (including going back and forth), submission, scoring, and review.

3. For CLI changes, run `python main.py` and walk through a short quiz.

Report honestly what was and was not verified. If no automated tests exist,
say so explicitly and describe the manual checks performed.
