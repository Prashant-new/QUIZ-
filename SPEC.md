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
4. Students can move forward without answering the current question first.
5. Selected answers remain saved during navigation.
6. Students can change answers before submitting.
7. The server calculates the score using the final answers.
8. Correct answers are not sent to the browser before submission.
9. Results show the score and explanations for incorrect answers.

## Question-bank requirements
Each question must contain:
- Non-empty question text.
- At least two non_empty answer choices.
- An integer answer index within the choices list.
- A non-empty explanation.

## Acceptance checks
- Run the custom question-bank checker.
- Manually check navigation and changing answers.
- Verify scoring and the results review with a short quiz.

Passing the question-bank checker alone does not prove that 
all application requirements are met.
