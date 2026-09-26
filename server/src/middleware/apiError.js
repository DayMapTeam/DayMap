export class ApiError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message)
    Object.assign(this, { status, code, retryable })
  }
}
