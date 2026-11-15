import { tool } from "@opencode-ai/plugin"
import path from "path"
import {
  takeVerificationAttempt,
  verificationLimitResult,
} from "../lib/verification-budget.mjs"

export default tool({
  description:
    "Validate the quiz question bank with the repository's existing " +
    "tools/check_questions.py. Verifies every question's stored answer " +
    "index against the trusted tools/answer_key.json, and reports missing, " +
    "stale, or unknown answer-key entries so the two files stay in sync. " +
    "Returns the checker's JSON report. Each invocation counts toward the " +
    "shared 3-attempt verification limit for the current run. Read-only.",
  args: {
    path: tool.schema
      .string()
      .optional()
      .describe(
        "Optional path to a questions JSON file. Omit to validate the repository's questions.json.",
      ),
  },
  async execute(args, context) {
    const budget = takeVerificationAttempt(context.sessionID)
    if (!budget.allowed) {
      return verificationLimitResult(context.sessionID)
    }

    const script = path.join(context.worktree, "tools", "check_questions.py")
    const shell = args.path
      ? Bun.$`python ${script} ${args.path}`
      : Bun.$`python ${script}`

    const result = await shell.nothrow()
    const stdout = result.stdout.toString().trim()
    const stderr = result.stderr.toString().trim()

    return {
      title:
        result.exitCode === 0
          ? "Question bank valid"
          : "Question bank invalid",
      output:
        stdout ||
        stderr ||
        `check_questions.py exited with code ${result.exitCode}`,
      metadata: {
        exitCode: result.exitCode,
        verificationAttempt: budget.attempts,
        maxVerificationAttempts: budget.maxAttempts,
      },
    }
  },
})
