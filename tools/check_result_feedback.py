#!/usr/bin/env python3
"""Check the server-side score-feedback boundaries.

Usage:
    python tools/check_result_feedback.py

The check starts the real ``server.QuizHandler`` on an ephemeral localhost port,
builds quiz sessions that produce exactly 39/40/59/60/79/80/100 percent, and
submits them through ``POST /api/submit``. It verifies the reported score,
percentage, tier, wording, and whether the tier is eligible for confetti.

The check only uses in-memory test sessions and does not modify the question
bank or any application file.
"""

import http.client
import importlib.util
import json
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

BOUNDARY_CASES = (
    (39, 39, 100, "keep-practicing", "Keep practicing!"),
    (40, 2, 5, "good-effort", "Good effort! Try again."),
    (59, 59, 100, "good-effort", "Good effort! Try again."),
    (60, 3, 5, "well-done", "Well done!"),
    (79, 79, 100, "well-done", "Well done!"),
    (80, 4, 5, "excellent", "Excellent work!"),
    (100, 5, 5, "excellent", "Excellent work!"),
)


def load_server_module():
    sys.path.insert(0, str(PROJECT_ROOT))
    spec = importlib.util.spec_from_file_location(
        "quiz_server_under_test", PROJECT_ROOT / "server.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_session(total):
    return [
        {
            "topic": "Boundary test",
            "question": f"Question {number + 1}?",
            "choices": ["Correct answer", "Wrong answer", "Another wrong answer"],
            "correct_index": 0,
            "explanation": "The first choice is correct in this test session.",
        }
        for number in range(total)
    ]


def build_answers(score, total):
    return [0 if number < score else 1 for number in range(total)]


def post_json(port, path, payload):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    body = json.dumps(payload)
    try:
        connection.request("POST", path, body, {"Content-Type": "application/json"})
        response = connection.getresponse()
        raw = response.read().decode("utf-8")
        status = response.status
    finally:
        connection.close()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = None
    return status, data, raw


def main():
    server_module = load_server_module()

    class QuietHandler(server_module.QuizHandler):
        def log_message(self, format, *args):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    results = []
    try:
        for percentage, score, total, expected_tier, expected_message in BOUNDARY_CASES:
            case = {
                "percentage": percentage,
                "score": score,
                "total": total,
                "expectedTier": expected_tier,
                "expectedMessage": expected_message,
            }
            case_failures = []

            direct_tier, direct_message = server_module.score_feedback(percentage)
            if (direct_tier, direct_message) != (expected_tier, expected_message):
                case_failures.append(
                    "score_feedback returned "
                    f"{(direct_tier, direct_message)!r} for {percentage}%"
                )

            quiz_id = f"boundary-{percentage}"
            with server_module.sessions_lock:
                server_module.sessions[quiz_id] = build_session(total)

            status, data, raw = post_json(
                port,
                "/api/submit",
                {"quizId": quiz_id, "answers": build_answers(score, total)},
            )

            actual = {
                "status": status,
                "body": data if data is not None else raw,
            }
            case["actual"] = actual

            if status != 200 or not isinstance(data, dict):
                case_failures.append(f"submission failed: HTTP {status}: {raw}")
            else:
                expected_confetti = percentage >= 80
                if data.get("score") != score:
                    case_failures.append(
                        f"expected score {score}, got {data.get('score')!r}"
                    )
                if data.get("total") != total:
                    case_failures.append(
                        f"expected total {total}, got {data.get('total')!r}"
                    )
                if data.get("percentage") != percentage:
                    case_failures.append(
                        f"expected percentage {percentage}, got {data.get('percentage')!r}"
                    )
                if data.get("tier") != expected_tier:
                    case_failures.append(
                        f"expected tier {expected_tier!r}, got {data.get('tier')!r}"
                    )
                if data.get("message") != expected_message:
                    case_failures.append(
                        f"expected message {expected_message!r}, "
                        f"got {data.get('message')!r}"
                    )
                if (data.get("tier") == "excellent") != expected_confetti:
                    case_failures.append(
                        "confetti eligibility does not match the 80% threshold"
                    )

            case["passed"] = not case_failures
            if case_failures:
                case["failures"] = case_failures
            results.append(case)
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)

    report = {
        "passed": all(case["passed"] for case in results),
        "boundary_cases": [case["percentage"] for case in results],
        "cases": results,
    }
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
