# quiz-harness

## Purpose
This harness helps OpenCode develop our student quiz application.
It provides project instructions and a custom question_bank checker.

## Current setup
- Coding agent: OpenCode
- Installed version: 1.19.0
- Mode: Big Pickle (as displayed in OpenCode)
- Provider shown: OpenCode
- Agent mode: Build
The homework specifies version 1.18.31 unless a newer version has been approved.
Our installed version currently differs.

## Harness files
- AGENTS.md: project context and development instructions.
- SPEC.md: describes the quiz application's required behaviour.
- tools/check_questions.py: validates the question bank.
- .opencode/tools/check_questions.ts: lets OpenCode call the checker.

## Installation
Python and OpenCode must be installed.

Copy the three harness files into the quiz application's root,
preserving their folder paths. The quiz project must contain questions.json.

Start OpenCode from the quiz application's root folder.

## Running the checker manually 
Run from the quiz application's root:
 python tools/check_questions.py
The checker returns JSON containing:
- passed: whether validation succeeded.
- checked_questions: how many questions were checked.
- errors: the validation problems found

## Using the tool in OpenCode
Ask OpenCode:

"Use the custom check_questions tool to validate questions.json
and report the result."

## Verification so far
The Python checker was run manually on 41 questions.
It reported passed: true, checked_answers: 41, and an empty error list.
The question bank and tools/answer_key.json are currently in sync.

## Limitations
The checker validates the structure of the question data and verifies that every
stored answer index matches the trusted tools/answer_key.json. It also fails when
the key has stale or unknown entries, keeping the key and question bank in sync.
It does not verify the factual correctness of the answer key itself, browser
navigation, or application scoring.
