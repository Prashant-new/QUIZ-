import { tool } from "@opencode-ai/plugin"
import path from "path"

export default tool({
  description:
    "Validate the quiz question bank with the repository's existing " +
    "tools/check_questions.py and return its JSON report. Read-only.",
  args: {
    path: tool.schema
      .string()
      .optional()
      .describe(
        "Optional path to a questions JSON file. Omit to validate the repository's questions.json.",
      ),
  },
  async execute(args, context) {
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
      metadata: { exitCode: result.exitCode },
    }
  },
})
