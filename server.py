import json
import os
import random
import socket
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"
QUESTIONS_FILE = BASE_DIR / "questions.json"
HOST = "0.0.0.0"
DEFAULT_PORT = 8000
DEFAULT_COUNT = 5

STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "application/javascript; charset=utf-8"),
}

sessions = {}
sessions_lock = threading.Lock()


def load_topics():
    with QUESTIONS_FILE.open("r", encoding="utf-8") as file:
        topics = json.load(file)

    for topic in topics.values():
        for question in topic["questions"]:
            question["topic"] = topic["label"]
            if not 0 <= question["answer"] < len(question["choices"]):
                raise ValueError(f"Invalid answer index in question: {question['question']}")
    return topics


TOPICS = load_topics()
ALL_QUESTIONS = [question for topic in TOPICS.values() for question in topic["questions"]]


def topics_payload():
    payload = [
        {"id": topic_id, "label": topic["label"], "count": len(topic["questions"])}
        for topic_id, topic in TOPICS.items()
    ]
    payload.append({"id": "all", "label": "All topics", "count": len(ALL_QUESTIONS)})
    return payload


def get_pool(topic_id):
    if topic_id == "all":
        return ALL_QUESTIONS
    return TOPICS[topic_id]["questions"]


def prepare_questions(questions):
    prepared = []
    for question in questions:
        options = [
            (choice, index == question["answer"])
            for index, choice in enumerate(question["choices"])
        ]
        random.shuffle(options)
        choices = [choice for choice, _ in options]
        correct_index = next(
            index for index, (_, is_correct) in enumerate(options) if is_correct
        )
        prepared.append(
            {
                "topic": question["topic"],
                "question": question["question"],
                "choices": choices,
                "correct_index": correct_index,
                "explanation": question["explanation"],
            }
        )
    return prepared


def score_message(percentage):
    if percentage == 100:
        return "Excellent. You got every question right."
    if percentage >= 80:
        return "Great job. You have a strong grasp of this topic."
    if percentage >= 50:
        return "Good effort. Review the missed questions below."
    return "Keep practicing. Review the suggestions below and try again."


class QuizHandler(BaseHTTPRequestHandler):
    server_version = "QuizServer/1.0"

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/topics":
            self.send_json(topics_payload())
            return

        if path == "/api/health":
            self.send_json({"status": "ok"})
            return

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if path in STATIC_FILES:
            filename, content_type = STATIC_FILES[path]
            self.send_file(filename, content_type)
            return

        self.send_json({"error": "Not found."}, status=404)

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/quiz":
            self.handle_create_quiz()
            return

        if path == "/api/submit":
            self.handle_submit()
            return

        self.send_json({"error": "Not found."}, status=404)

    def handle_create_quiz(self):
        data = self.read_json()
        if data is None:
            return

        topic_id = data.get("topic")
        if topic_id not in TOPICS and topic_id != "all":
            self.send_json({"error": "Unknown topic."}, status=400)
            return

        pool = get_pool(topic_id)
        try:
            count = int(data.get("count", DEFAULT_COUNT))
        except (TypeError, ValueError):
            self.send_json({"error": "Question count must be a number."}, status=400)
            return

        if not 1 <= count <= len(pool):
            self.send_json(
                {"error": f"Question count must be between 1 and {len(pool)}."},
                status=400,
            )
            return

        prepared = prepare_questions(random.sample(pool, count))
        quiz_id = uuid.uuid4().hex
        with sessions_lock:
            sessions[quiz_id] = prepared

        label = "All topics" if topic_id == "all" else TOPICS[topic_id]["label"]
        self.send_json(
            {
                "quizId": quiz_id,
                "topic": label,
                "total": len(prepared),
                "questions": [
                    {
                        "topic": question["topic"],
                        "question": question["question"],
                        "choices": question["choices"],
                    }
                    for question in prepared
                ],
            }
        )

    def handle_submit(self):
        data = self.read_json()
        if data is None:
            return

        quiz_id = data.get("quizId")
        answers = data.get("answers")

        with sessions_lock:
            session = sessions.pop(quiz_id, None)

        if session is None:
            self.send_json(
                {"error": "Quiz session not found. Please start a new quiz."},
                status=404,
            )
            return

        if not isinstance(answers, list) or len(answers) != len(session):
            self.send_json(
                {"error": "Please answer every question before submitting."},
                status=400,
            )
            return

        score = 0
        review = []
        for question, answer in zip(session, answers):
            if isinstance(answer, bool) or not isinstance(answer, int):
                self.send_json({"error": "Answers must be whole numbers."}, status=400)
                return
            if not 0 <= answer < len(question["choices"]):
                self.send_json({"error": "Answer index out of range."}, status=400)
                return

            correct_index = question["correct_index"]
            is_correct = answer == correct_index
            if is_correct:
                score += 1
                continue

            review.append(
                {
                    "topic": question["topic"],
                    "question": question["question"],
                    "chosen": question["choices"][answer],
                    "correct": question["choices"][correct_index],
                    "explanation": question["explanation"],
                }
            )

        total = len(session)
        percentage = round(score / total * 100)
        self.send_json(
            {
                "score": score,
                "total": total,
                "percentage": percentage,
                "message": score_message(percentage),
                "review": review,
            }
        )

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                raise ValueError
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            self.send_json({"error": "Invalid JSON request body."}, status=400)
            return None

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, filename, content_type):
        try:
            body = (WEB_DIR / filename).read_bytes()
        except FileNotFoundError:
            self.send_json({"error": "Not found."}, status=404)
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


def get_lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def resolve_port():
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        return int(sys.argv[1])
    try:
        return int(os.environ.get("QUIZ_PORT", DEFAULT_PORT))
    except ValueError:
        return DEFAULT_PORT


def main():
    port = resolve_port()
    try:
        server = ThreadingHTTPServer((HOST, port), QuizHandler)
    except OSError as exc:
        print(f"Could not start the server on port {port}: {exc}")
        print(f"Try another port, for example: python server.py {port + 1}")
        return

    lan_ip = get_lan_ip()
    print("Quiz server is running.")
    print(f"  Local:   http://localhost:{port}")
    if lan_ip != "127.0.0.1":
        print(f"  Network: http://{lan_ip}:{port}")
    print("Open one of the URLs above in your browser.")
    print("Press Ctrl+C to stop the server.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()
        print("Server stopped.")


if __name__ == "__main__":
    main()
