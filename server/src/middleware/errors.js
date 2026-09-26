export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Endpoint not found', retryable: false },
  })
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  const knownErrors = {
    'entity.parse.failed': [400, 'INVALID_JSON', 'Request body must be valid JSON'],
    'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'],
    'charset.unsupported': [415, 'UNSUPPORTED_CHARSET', 'Unsupported request charset'],
    'encoding.unsupported': [415, 'UNSUPPORTED_ENCODING', 'Unsupported request encoding'],
  }
  const [status, code, message] = knownErrors[error.type] ??
    [500, 'INTERNAL_ERROR', 'An unexpected error occurred']
  res.status(status).json({ error: { code, message, retryable: false } })
}
