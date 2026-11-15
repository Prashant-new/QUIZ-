import { tool } from "@opencode-ai/plugin"
import path from "path"

export default tool({
  description:
    "Run the web quiz behaviour test against web/app.js in a simulated DOM. " +
    "It selects an answer on question 1, clicks Next, then Back, and verifies " +
    "the original selection is restored and can be changed. Read-only.",
  args: {},
  async execute(args, context) {
    const script = path.join(context.worktree, "tools", "run_quiz_test.mjs")
    const result = await Bun.$`node ${script}`.nothrow()
    const stdout = result.stdout.toString().trim()
    const stderr = result.stderr.toString().trim()

    let passed = false
    try {
      passed = JSON.parse(stdout).passed === true
    } catch (error) {
      passed = false
    }

    return {
      title: passed ? "Quiz behaviour test passed" : "Quiz behaviour test failed",
      output:
        stdout ||
        stderr ||
        `run_quiz_test.mjs exited with code ${result.exitCode}`,
      metadata: { exitCode: result.exitCode },
    }
  },
})
