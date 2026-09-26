import { ApiError } from './apiError.js'

export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint not found', retryable: false },
  })
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, retryable: error.retryable } })
  }

  const knownErrors = {
    'entity.parse.failed': [400, 'INVALID_JSON', 'Request body must be valid JSON'],
    'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'],
    'charset.unsupported': [415, 'UNSUPPORTED_CHARSET', 'Unsupported request charset'],
    'encoding.unsupported': [415, 'UNSUPPORTED_ENCODING', 'Unsupported request encoding'],
  }
  const [status, code, message] = knownErrors[error.type] ??
    [500, 'INTERNAL_ERROR', 'An unexpected error occurred']
  // Only the error itself: request bodies and headers can hold plans and tokens.
  if (status === 500) console.error(`${req.method} ${req.path} failed:`, error?.code ?? '', error?.message)
  res.status(status).json({ error: { code, message, retryable: false } })
}
