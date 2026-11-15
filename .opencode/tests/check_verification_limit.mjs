import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

const testDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(testDir, "..", "..")

const newSessionID = () => `verification-limit-test-${crypto.randomUUID()}`

let shellCalls = 0

globalThis.Bun = {
  $() {
    shellCalls += 1
    return {
      async nothrow() {
        return {
          stdout: Buffer.from('{"passed": true}'),
          stderr: Buffer.from(""),
          exitCode: 0,
        }
      },
    }
  },
}

const { default: checkQuestions } = await import("../tools/check_questions.ts")
const { default: runQuizTest } = await import("../tools/run_quiz_test.ts")
const { getVerificationAttempts } = await import(
  "../lib/verification-budget.mjs"
)

function contextFor(sessionID, messageID = "message-1") {
  return {
    sessionID,
    messageID,
    agent: "test",
    directory: root,
    worktree: root,
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
  }
}

function assertAllowed(result, attempt) {
  assert.equal(result.metadata?.blocked, undefined)
  assert.equal(result.metadata?.exitCode, 0)
  assert.equal(result.metadata?.verificationAttempt, attempt)
  assert.equal(result.metadata?.maxVerificationAttempts, 3)
  assert.match(result.output, /passed/)
}

function assertBlocked(result) {
  assert.equal(result.title, "Verification limit reached")
  assert.match(result.output, /Verification limit reached/)
  assert.equal(result.metadata?.blocked, true)
  assert.equal(result.metadata?.attempts, 3)
  assert.equal(result.metadata?.maxAttempts, 3)
  assert.equal(result.metadata?.exitCode, undefined)
}

const tests = []

function test(name, fn) {
  tests.push({ name, fn })
}

test("first three verification calls are allowed and the fourth is blocked across both tools", async () => {
  const sessionID = newSessionID()
  const context = contextFor(sessionID)
  shellCalls = 0

  assertAllowed(await checkQuestions.execute({}, context), 1)
  assertAllowed(await runQuizTest.execute({}, context), 2)
  assertAllowed(await checkQuestions.execute({}, context), 3)
  assert.equal(getVerificationAttempts(sessionID), 3)
  assert.equal(shellCalls, 3)

  assertBlocked(await runQuizTest.execute({}, context))
  assert.equal(shellCalls, 3)
  assert.equal(getVerificationAttempts(sessionID), 3)
})

test("changing the message ID cannot reset the same run", async () => {
  const sessionID = newSessionID()
  const firstMessage = contextFor(sessionID, "message-1")
  shellCalls = 0

  assertAllowed(await checkQuestions.execute({}, firstMessage), 1)
  assertAllowed(await runQuizTest.execute({}, firstMessage), 2)
  assertAllowed(await checkQuestions.execute({}, firstMessage), 3)

  assertBlocked(await runQuizTest.execute({}, contextFor(sessionID, "message-2")))
  assert.equal(shellCalls, 3)
})

test("a new independent run gets a fresh counter", async () => {
  const oldSessionID = newSessionID()
  const newSessionIDValue = newSessionID()
  shellCalls = 0

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assertAllowed(
      await checkQuestions.execute({}, contextFor(oldSessionID)),
      attempt,
    )
  }
  assertBlocked(await runQuizTest.execute({}, contextFor(oldSessionID)))

  assertAllowed(
    await checkQuestions.execute({}, contextFor(newSessionIDValue)),
    1,
  )
  assert.equal(getVerificationAttempts(newSessionIDValue), 1)
  assert.equal(getVerificationAttempts(oldSessionID), 3)
})

test("the budget exposes no reset function", async () => {
  const budget = await import("../lib/verification-budget.mjs")
  assert.equal(typeof budget.resetVerificationAttempts, "undefined")
  assert.equal(typeof budget.reset, "undefined")
})

let failed = 0

for (const { name, fn } of tests) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}`)
    console.error(error?.stack ?? String(error))
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exitCode = 1
} else {
  console.log(`\nAll ${tests.length} tests passed`)
}
