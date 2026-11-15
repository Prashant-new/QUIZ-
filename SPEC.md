# Student Quiz Application Specification

## Goal
Build a web-based multiple-choice quiz that helps students practise topics and
review their mistakes. A companion CLI quiz (`main.py`) shares the same question
bank but is not the focus of this specification.

## Technology
- Python standard-library HTTP server (`server.py`).
- HTML, CSS, and plain JavaScript in `web/` (no frameworks, bundlers, or
  third-party dependencies).
- Questions stored in `questions.json`, shared by the web and CLI quizzes.

## Architecture and data flow
- `GET /api/topics` returns every topic plus an `all` ("All topics") entry, each
  with its question count.
- `POST /api/quiz` accepts `{topic, count}`, validates both, samples questions,
  shuffles the choices, stores the prepared (answer-bearing) quiz in the
  in-memory `sessions` map keyed by `quizId`, and returns the questions with
  shuffled choices only. `correct_index` and `explanation` must not be sent to
  the browser before submission.
- `POST /api/submit` accepts `{quizId, answers}`, validates the quiz and every
  answer index, scores the final answers on the server, and returns
  `{score, total, percentage, tier, message, review}`. `review` contains each
  incorrect question with the chosen answer, correct answer, and explanation.
- A quiz session is removed only after a successful submission. An invalid
  submission must leave the session intact so the student can retry with
  corrected answers.
- `GET /api/health` returns `{"status": "ok"}`.

## Required behaviour
1. Students can choose a topic (including "All topics") and a question count
   between 1 and that topic's question count (default 5, capped by availability).
2. The application presents multiple-choice questions one at a time with a
   progress bar and a "Question X of Y" label.
3. Students must select an answer before moving to the next question; the
   Next/Finish button stays disabled until a choice is selected.
4. Students can move back to earlier questions at any time before submission
   (Previous is disabled on the first question).
5. Selected answers remain saved during navigation and are restored, and
   highlighted, when returning to a question.
6. Students can change an answer before submitting.
7. On the last question the button reads "Finish quiz"; submission requires an
   answer for every question.
8. The server calculates the score using the final submitted answers.
9. Correct answers are not sent to the browser before submission; they may be
   included in the review after submission.
10. Results show the score as correct answers out of total, the percentage, a
    feedback message, and explanations for incorrect answers.

## Keyboard and accessibility
- Number keys 1-9 select the corresponding choice.
- Enter advances or submits when Next is enabled; Left Arrow moves to the
  previous question.
- Controls are reachable by keyboard, have visible focus styles, and expose
  `aria-pressed` for selectable topics and choices.
- The progress bar exposes `role="progressbar"` and `aria-valuenow`.

## Question-bank requirements
Each question must contain:
- Non-empty question text.
- At least two non-empty answer choices.
- An integer answer index within the choices list.
- A non-empty explanation.

`tools/check_questions.py` also cross-checks every stored answer against the
trusted `tools/answer_key.json`.

## Web interface requirements
- Present a cohesive, playful educational-quiz visual design with a clear
  colour palette, readable typography, distinct answer cards, subtle hover
  effects, smooth question transitions, and a polished results screen.
- Provide a light/dark theme toggle; persist the choice in `localStorage`
  (`quiz-theme`) and default to the system colour scheme.
- Keep the interface responsive on small screens and usable with a keyboard.
- Keep focus styles visible and respect `prefers-reduced-motion`; reduced motion
  disables decorative animation/transitions and the confetti effect.
- Do not add decorative animation that distracts from reading or answering.

## Score-feedback requirements
Feedback is based on the percentage of correct answers out of the total submitted,
rounded to the nearest integer. A percentage falls into the highest band whose
minimum it reaches.

| Percentage | Message | Celebration |
| --- | --- | --- |
| 0–39% | Keep practicing! | None |
| 40–59% | Good effort! Try again. | Gentle fade-in only |
| 60–79% | Well done! | Small success animation |
| 80–100% | Excellent work! | Trophy and confetti |

Tier names are `keep-practicing`, `good-effort`, `well-done`, and `excellent`;
`server.py` and `web/app.js` use the same thresholds. Confetti and the trophy
must appear only when the score is 80% or higher. A 40% result must not trigger
confetti. The results screen must show the correct message for each band, and the
score must be displayed as correct answers out of total questions.

## Results review
- Show the percentage badge and "You scored X out of Y."
- List each incorrect question with its topic, question, "Your answer", "Correct
  answer", and "Suggestion: <explanation>".
- When every answer is correct, show "Nothing to review. You answered every
  question correctly."

## Acceptance checks
Automated/scripted checks:
- `python -m py_compile main.py server.py`
- `python tools/check_questions.py` — question-bank structure and answer key.
- `python tools/check_result_feedback.py` — server score boundaries 39%, 40%,
  59%, 60%, 79%, 80%, and 100%, including tier, message, and confetti
  eligibility.
- `python tools/check_session_retry.py` — an invalid submission does not consume
  the session and a valid retry succeeds.
- `node tools/check_web_result_feedback.mjs` — client boundaries, confetti
  gating, reduced-motion handling, and preserved answers during navigation.

Manual checks:
- Start `python server.py` and open `http://localhost:8000`.
- Exercise the topics list, count validation, answering, Previous/Next
  (confirming Next is disabled until a choice is selected), changing answers,
  submission, scoring, review, "Play again", and the theme toggle.
- Check the layout at desktop and narrow mobile widths.
- Check that the reduced-motion preference disables celebration animation and
  confetti.
- For CLI changes, run `python main.py` and walk through a short quiz.

Passing the question-bank checker alone does not prove that all application
requirements are met.
