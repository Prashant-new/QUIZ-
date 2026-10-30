import json
import random
from pathlib import Path

QUESTIONS_FILE = Path(__file__).with_name("questions.json")
QUESTIONS_PER_QUIZ = 5


def load_topics():
    with QUESTIONS_FILE.open("r", encoding="utf-8") as file:
        topics = json.load(file)

    for topic in topics.values():
        for question in topic["questions"]:
            question["topic"] = topic["label"]
            if not 0 <= question["answer"] < len(question["choices"]):
                raise ValueError(f"Invalid answer index in question: {question['question']}")
    return topics


def build_entries(topics):
    entries = list(topics.items())
    all_questions = [question for topic in topics.values() for question in topic["questions"]]
    entries.append(("all", {"label": "All topics", "questions": all_questions}))
    return entries


def show_menu(entries):
    print("\n=== Quiz Application ===")
    for number, (_, topic) in enumerate(entries, start=1):
        print(f"  {number}. {topic['label']} ({len(topic['questions'])} questions)")
    print("  q. Quit")


def choose_topic(entries):
    while True:
        choice = input("\nChoose a topic: ").strip().lower()
        if choice in {"q", "quit"}:
            return None
        if choice.isdigit() and 1 <= int(choice) <= len(entries):
            return entries[int(choice) - 1][1]
        print(f"Please enter a number between 1 and {len(entries)}, or q to quit.")


def choose_question_count(available):
    default = min(QUESTIONS_PER_QUIZ, available)
    while True:
        raw = input(f"How many questions? [default {default}]: ").strip()
        if raw == "":
            return default
        if raw.isdigit() and 1 <= int(raw) <= available:
            return int(raw)
        print(f"Please enter a number between 1 and {available}.")


def ask_question(question):
    choices = question["choices"][:]
    correct = choices[question["answer"]]
    random.shuffle(choices)

    print(f"\n[{question['topic']}] {question['question']}")
    for number, choice in enumerate(choices, start=1):
        print(f"  {number}. {choice}")

    while True:
        raw = input("Your answer: ").strip()
        if raw.isdigit() and 1 <= int(raw) <= len(choices):
            return choices[int(raw) - 1], correct
        print(f"Please enter a number between 1 and {len(choices)}.")


def run_quiz(selected, count):
    questions = random.sample(selected["questions"], count)
    score = 0
    results = []

    for question in questions:
        chosen, correct = ask_question(question)
        is_correct = chosen == correct
        if is_correct:
            score += 1
            print("Correct!")
        else:
            print(f"Wrong. Correct answer: {correct}")

        results.append(
            {
                "topic": question["topic"],
                "question": question["question"],
                "chosen": chosen,
                "correct": correct,
                "explanation": question["explanation"],
                "is_correct": is_correct,
            }
        )

    return score, results


def show_summary(score, total):
    percentage = round(score / total * 100)
    if percentage == 100:
        message = "Excellent! Perfect score."
    elif percentage >= 80:
        message = "Great job!"
    elif percentage >= 50:
        message = "Good effort. Review the missed questions below."
    else:
        message = "Keep practicing. Review the suggestions below."

    print("\n=== Results ===")
    print(f"Score: {score}/{total} ({percentage}%)")
    print(message)


def review_answers(results):
    wrong = [result for result in results if not result["is_correct"]]
    print("\n=== Wrong Answer Review ===")
    if not wrong:
        print("Nothing to review. You answered everything correctly.")
        return

    for number, result in enumerate(wrong, start=1):
        print(f"\n{number}. [{result['topic']}] {result['question']}")
        print(f"   Your answer:    {result['chosen']}")
        print(f"   Correct answer: {result['correct']}")
        print(f"   Suggestion:     {result['explanation']}")


def ask_play_again():
    while True:
        raw = input("\nPlay again? (y/n) [n]: ").strip().lower()
        if raw in {"", "n", "no"}:
            return False
        if raw in {"y", "yes"}:
            return True
        print("Please enter y or n.")


def main():
    topics = load_topics()
    entries = build_entries(topics)

    print("Welcome to the CLI Quiz App!")
    while True:
        show_menu(entries)
        selected = choose_topic(entries)
        if selected is None:
            print("Goodbye!")
            return

        available = len(selected["questions"])
        count = choose_question_count(available)
        score, results = run_quiz(selected, count)
        show_summary(score, count)
        review_answers(results)

        if not ask_play_again():
            print("Goodbye!")
            return


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nGoodbye!")
