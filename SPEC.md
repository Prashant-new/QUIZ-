# Student Quiz Application Specification

## Goal
Buid a web-based quiz that helps students practise topics and review their mistakes.

## Technology
- Python standard-library HTTP server.
- HTML, CSS, and plain JavaScript.
- Question stored in questions.json.

## Required behaviour
1. Students can choose a topic and question count.
2. The application presents multiple-choice questions.
3. Students can move backwards and forwards before submission.
4. Selected answers remain saved during navigation.
5. Students can change answers before submitting.
6. The server calculates the score using the final answers.
7. Correct answers are not sent to the browser before submission.
8. Results show the score and explanations for incorrect answers.

## Question-bank requirements
Each question must contain:
- Non-empty question text.
- At least two non_empty answer choices.
- An integer answer index within the choices list.
- A non-empty explanation.

## Web interface requirements
- Present a cohesive, playful educational-quiz visual design with a clear
  colour palette, readable typography, distinct answer cards, subtle hover
  effects, smooth question transitions, and a polished results screen.
- Keep the interface responsive on small screens and usable with a keyboard.
- Keep focus styles visible and respect `prefers-reduced-motion`.
- Do not add decorative animation that distracts from reading or answering.

## Score-feedback requirements
Feedback must be based on the percentage calculated from the server-scored
number of correct answers and the total number of questions submitted.

| Percentage | Message | Celebration |
| --- | --- | --- |
| 0–39% | Keep practicing! | None |
| 40–59% | Good effort! Try again. | Gentle fade-in only |
| 60–79% | Well done! | Small success animation |
| 80–100% | Excellent work! | Trophy and confetti |

Confetti must appear only when the score is 80% or higher. A 40% result must not
trigger confetti. The results screen must show the correct message for each
band, and the score must be displayed as correct answers out of total questions.

## Acceptance checks
- Check the score boundaries 39%, 40%, 59%, 60%, 79%, 80%, and 100%.
- Verify that a 40% result shows "Good effort! Try again." and no confetti.
- Verify that confetti appears for 80% and 100% results only.
- Verify that navigation, preserved answers, server-side scoring, and the
  results review still work.
- Check the layout at desktop and narrow mobile widths.
- Check the reduced-motion preference disables celebration animation and
  confetti.
- Run the custom question-bank checker.
- Run the session-retry harness check.
- Manually check navigation and changing answers.
- Verify scoring and the results review with a short quiz.

Passing the question-bank checker alone does not prove that 
all application requirements are met.
