#!/usr/bin/env python3
"""Validate the structure of the quiz question bank.

Usage:
    python tools/check_questions.py [path-to-questions.json]

The checker only reads the question bank; it never modifies it. It prints a
JSON report with ``passed``, ``checked_questions``, and ``errors`` and exits
with status 0 when every question is valid, or 1 otherwise.
"""

import json
import sys
from pathlib import Path


def find_default_questions_path():
    """Locate questions.json without depending on the current directory."""
    project_root = Path(__file__).resolve().parents[1]
    candidates = [
        project_root / "questions.json",
        project_root / "QUIZ-" / "questions.json",
        Path.cwd() / "questions.json",
        Path.cwd() / "QUIZ-" / "questions.json",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


def is_non_empty_text(value):
    return isinstance(value, str) and bool(value.strip())


def add_error(errors, topic, question_number, message):
    errors.append(
        {
            "topic": topic,
            "question": question_number,
            "message": message,
        }
    )


def check_questions(data):
    errors = []
    checked_questions = 0

    if not isinstance(data, dict):
        add_error(errors, None, None, "question bank must be a JSON object")
        return checked_questions, errors

    for topic, topic_data in data.items():
        if not isinstance(topic_data, dict):
            add_error(errors, topic, None, "topic must be a JSON object")
            continue

        questions = topic_data.get("questions")
        if not isinstance(questions, list):
            add_error(errors, topic, None, "topic must contain a questions list")
            continue

        for number, question in enumerate(questions, start=1):
            checked_questions += 1

            if not isinstance(question, dict):
                add_error(errors, topic, number, "question must be a JSON object")
                continue

            if not is_non_empty_text(question.get("question")):
                add_error(errors, topic, number, "question text is empty")

            choices = question.get("choices")
            valid_choices = False
            if not isinstance(choices, list):
                add_error(errors, topic, number, "choices must be a list")
            else:
                non_empty_choices = [choice for choice in choices if is_non_empty_text(choice)]
                if len(non_empty_choices) < 2:
                    add_error(
                        errors,
                        topic,
                        number,
                        "at least two non-empty answer choices are required",
                    )
                valid_choices = True

            answer = question.get("answer")
            if isinstance(answer, bool) or not isinstance(answer, int):
                add_error(errors, topic, number, "answer must be an integer index")
            elif not valid_choices:
                add_error(
                    errors,
                    topic,
                    number,
                    "answer cannot point to a choice because choices is not a list",
                )
            elif answer < 0 or answer >= len(choices):
                add_error(
                    errors,
                    topic,
                    number,
                    "answer index {} is out of range for {} choices".format(
                        answer, len(choices)
                    ),
                )

            if not is_non_empty_text(question.get("explanation")):
                add_error(errors, topic, number, "explanation is empty")

    return checked_questions, errors


def main(argv):
    questions_path = Path(argv[1]) if len(argv) > 1 else find_default_questions_path()
    errors = []
    checked_questions = 0

    try:
        with questions_path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        add_error(
            errors,
            None,
            None,
            "could not read {}: {}".format(questions_path, error),
        )
    else:
        checked_questions, errors = check_questions(data)

    result = {
        "passed": not errors,
        "checked_questions": checked_questions,
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
