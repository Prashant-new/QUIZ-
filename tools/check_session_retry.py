#!/usr/bin/env python3
"""Check that a rejected submission does not destroy the quiz session.

Usage:
    python tools/check_session_retry.py

The check starts the real ``server.QuizHandler`` on an ephemeral localhost port,
creates a quiz, submits an invalid answers list, and then retries with valid
answers using the same quizId. It prints a JSON report and exits with status 0
only when every invalid submission is rejected and the subsequent valid retry
still succeeds.

The check is read-only with respect to the application and question bank.
"""

import http.client
import importlib.util
import json
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
QUIZ_COUNT = 3


def load_server_module():
    sys.path.insert(0, str(PROJECT_ROOT))
    spec = importlib.util.spec_from_file_location(
        "quiz_server_under_test", PROJECT_ROOT / "server.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_cases(total):
    return [
        ("empty answers list", []),
        ("too few answers", [0] * (total - 1)),
        ("non-integer answer", ["zero"] * total),
        ("out-of-range answer", [99] * total),
    ]


def post_json(port, path, payload):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    body = json.dumps(payload)
    try:
        connection.request(
            "POST", path, body, {"Content-Type": "application/json"}
        )
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
        for name, invalid_answers in build_cases(QUIZ_COUNT):
            case = {"case": name}

            status, quiz, raw = post_json(
                port, "/api/quiz", {"topic": "all", "count": QUIZ_COUNT}
            )
            if status != 200 or not isinstance(quiz, dict):
                case["error"] = f"could not create quiz: HTTP {status}: {raw}"
                case["passed"] = False
                results.append(case)
                continue

            quiz_id = quiz["quizId"]
            total = quiz["total"]
            valid_answers = [0] * total

            invalid_status, invalid_data, invalid_raw = post_json(
                port,
                "/api/submit",
                {"quizId": quiz_id, "answers": invalid_answers},
            )
            retry_status, retry_data, retry_raw = post_json(
                port,
                "/api/submit",
                {"quizId": quiz_id, "answers": valid_answers},
            )

            expected = {
                "invalidSubmissionStatus": 400,
                "retryStatus": 200,
                "retryTotal": total,
            }
            actual = {
                "invalidSubmissionStatus": invalid_status,
                "invalidSubmissionBody": invalid_data,
                "retryStatus": retry_status,
                "retryBody": retry_data,
            }
            passed = (
                invalid_status == 400
                and retry_status == 200
                and isinstance(retry_data, dict)
                and retry_data.get("total") == total
            )

            case.update(
                {
                    "quizId": quiz_id,
                    "expected": expected,
                    "actual": actual,
                    "passed": passed,
                }
            )
            if not passed:
                if retry_status != 200:
                    case["failure"] = (
                        "the invalid submission consumed the session; "
                        f"valid retry returned HTTP {retry_status}: {retry_raw}"
                    )
                else:
                    case["failure"] = "the valid retry did not return the expected result"
            results.append(case)
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)

    report = {
        "passed": all(case["passed"] for case in results),
        "quiz_count": QUIZ_COUNT,
        "cases": results,
    }
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
