#!/usr/bin/env python3
"""Validate the structure and stored answers of the quiz question bank.

Usage:
    python tools/check_questions.py [path-to-questions.json] [path-to-answer-key.json]

The checker only reads the question bank and its answer key; it never modifies
them. It prints a JSON report with ``passed``, ``checked_questions``,
``checked_answers``, and ``errors`` and exits with status 0 when every question
is valid, or 1 otherwise.
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


def find_default_answer_key_path():
    """Locate answer_key.json next to this checker or under tools/."""
    tool_dir = Path(__file__).resolve().parent
    candidates = [
        tool_dir / "answer_key.json",
        Path.cwd() / "tools" / "answer_key.json",
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


def check_questions(data, answer_key=None):
    errors = []
    checked_questions = 0
    checked_answers = 0

    if not isinstance(data, dict):
        add_error(errors, None, None, "question bank must be a JSON object")
        return checked_questions, checked_answers, errors

    for topic, topic_data in data.items():
        if not isinstance(topic_data, dict):
            add_error(errors, topic, None, "topic must be a JSON object")
            continue

        questions = topic_data.get("questions")
        if not isinstance(questions, list):
            add_error(errors, topic, None, "topic must contain a questions list")
            continue

        topic_answers = answer_key.get(topic) if isinstance(answer_key, dict) else None
        seen_question_texts = set()

        for number, question in enumerate(questions, start=1):
            checked_questions += 1

            if not isinstance(question, dict):
                add_error(errors, topic, number, "question must be a JSON object")
                continue

            question_text = question.get("question")
            valid_question_text = is_non_empty_text(question_text)
            if not valid_question_text:
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
            valid_answer = False
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
            else:
                valid_answer = True

            if not is_non_empty_text(question.get("explanation")):
                add_error(errors, topic, number, "explanation is empty")

            if valid_question_text:
                if question_text in seen_question_texts:
                    add_error(
                        errors,
                        topic,
                        number,
                        "duplicate question text in this topic",
                    )
                else:
                    seen_question_texts.add(question_text)

            if answer_key is not None and valid_question_text:
                if not isinstance(topic_answers, dict):
                    add_error(
                        errors,
                        topic,
                        number,
                        "answer key is missing topic '{}'".format(topic),
                    )
                elif question_text not in topic_answers:
                    add_error(
                        errors,
                        topic,
                        number,
                        "answer key is missing an expected answer for this question",
                    )
                else:
                    expected_answer = topic_answers[question_text]
                    if not is_non_empty_text(expected_answer):
                        add_error(
                            errors,
                            topic,
                            number,
                            "answer key expected answer must be non-empty text",
                        )
                    elif valid_choices and expected_answer not in choices:
                        add_error(
                            errors,
                            topic,
                            number,
                            "answer key expected answer {!r} is not among the choices".format(
                                expected_answer
                            ),
                        )
                    elif valid_choices and valid_answer:
                        checked_answers += 1
                        chosen_answer = choices[answer]
                        if chosen_answer != expected_answer:
                            add_error(
                                errors,
                                topic,
                                number,
                                "answer index {} points to {!r}, but the answer key expects {!r}".format(
                                    answer, chosen_answer, expected_answer
                                ),
                            )

    if isinstance(answer_key, dict):
        for key_topic, topic_answers in answer_key.items():
            topic_data = data.get(key_topic)
            if not isinstance(topic_data, dict) or not isinstance(
                topic_data.get("questions"), list
            ):
                add_error(
                    errors,
                    key_topic,
                    None,
                    "answer key contains topic '{}' that is not in the question bank".format(
                        key_topic
                    ),
                )
                continue

            if not isinstance(topic_answers, dict):
                add_error(
                    errors,
                    key_topic,
                    None,
                    "answer key topic must be a JSON object",
                )
                continue

            bank_question_texts = {
                question.get("question")
                for question in topic_data["questions"]
                if isinstance(question, dict)
                and is_non_empty_text(question.get("question"))
            }
            for question_text in topic_answers:
                if question_text not in bank_question_texts:
                    add_error(
                        errors,
                        key_topic,
                        None,
                        "answer key has an expected answer for a question not in the bank: {!r}".format(
                            question_text
                        ),
                    )

    return checked_questions, checked_answers, errors


def main(argv):
    questions_path = Path(argv[1]) if len(argv) > 1 else find_default_questions_path()
    answer_key_path = (
        Path(argv[2]) if len(argv) > 2 else find_default_answer_key_path()
    )
    errors = []
    checked_questions = 0
    checked_answers = 0

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
        answer_key = None
        try:
            with answer_key_path.open("r", encoding="utf-8") as file:
                answer_key = json.load(file)
        except (OSError, json.JSONDecodeError) as error:
            add_error(
                errors,
                None,
                None,
                "could not read {}: {}".format(answer_key_path, error),
            )
        else:
            if not isinstance(answer_key, dict):
                add_error(errors, None, None, "answer key must be a JSON object")
                answer_key = None

        checked_questions, checked_answers, question_errors = check_questions(
            data, answer_key
        )
        errors.extend(question_errors)

    result = {
        "passed": not errors,
        "checked_questions": checked_questions,
        "checked_answers": checked_answers,
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
