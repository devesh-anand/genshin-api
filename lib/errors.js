/**
 * Errors services may throw. Transports map them:
 *   REST → HTTP status via middlewares/errorHandle.js
 *   MCP  → tool result with isError: true (Phase 1)
 * Anything else is treated as an unexpected 500.
 */
export class AppError extends Error {
   constructor(message, status = 500) {
      super(message);
      this.name = this.constructor.name;
      this.status = status;
   }
}

export class ValidationError extends AppError {
   constructor(message) { super(message, 400); }
}

export class UnauthorizedError extends AppError {
   constructor(message = 'Unauthorized.') { super(message, 401); }
}

export class NotFoundError extends AppError {
   constructor(message = 'Not found.') { super(message, 404); }
}
