export const MAX_VERIFICATION_ATTEMPTS: number

export type VerificationAttempt = {
  allowed: boolean
  blocked: boolean
  attempts: number
  remaining: number
  maxAttempts: number
  sessionID: string
}

export type VerificationLimitResult = {
  title: string
  output: string
  metadata: {
    blocked: true
    reason: "verification-limit"
    attempts: number
    maxAttempts: number
    remaining: number
    sessionID: string
  }
}

export function takeVerificationAttempt(
  sessionID: string,
): VerificationAttempt
export function getVerificationAttempts(sessionID: string): number
export function verificationLimitResult(
  sessionID: string,
): VerificationLimitResult
