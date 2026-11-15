export const MAX_VERIFICATION_ATTEMPTS = 3

const STORE_KEY = Symbol.for("opencode.quiz.verification-budget.v1")
const attemptsBySession =
  globalThis[STORE_KEY] ?? (globalThis[STORE_KEY] = new Map())

function requireSessionID(sessionID) {
  if (typeof sessionID !== "string" || sessionID.length === 0) {
    throw new Error("verification budget requires a non-empty sessionID")
  }
  return sessionID
}

export function takeVerificationAttempt(sessionID) {
  const key = requireSessionID(sessionID)
  const attempts = attemptsBySession.get(key) ?? 0

  if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return {
      allowed: false,
      blocked: true,
      attempts,
      remaining: 0,
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
      sessionID: key,
    }
  }

  const nextAttempts = attempts + 1
  attemptsBySession.set(key, nextAttempts)

  return {
    allowed: true,
    blocked: false,
    attempts: nextAttempts,
    remaining: MAX_VERIFICATION_ATTEMPTS - nextAttempts,
    maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    sessionID: key,
  }
}

export function getVerificationAttempts(sessionID) {
  return attemptsBySession.get(requireSessionID(sessionID)) ?? 0
}

export function verificationLimitResult(sessionID) {
  const key = requireSessionID(sessionID)
  return {
    title: "Verification limit reached",
    output:
      `Verification limit reached: the maximum of ${MAX_VERIFICATION_ATTEMPTS} ` +
      `verification attempts for this run has been used (session ${key}). ` +
      "No further check_questions or run_quiz_test calls are allowed in this run.",
    metadata: {
      blocked: true,
      reason: "verification-limit",
      attempts: MAX_VERIFICATION_ATTEMPTS,
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
      remaining: 0,
      sessionID: key,
    },
  }
}
