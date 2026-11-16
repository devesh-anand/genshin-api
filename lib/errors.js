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
   /**
    * @param {string} [message]
    * @param {{ suggestions?: string[], query?: string, entity?: string }} [details]
    *   suggestions - close matches the caller can retry with
    *   query/entity - the name that didn't resolve and what it was looked up as (usage logging)
    */
   constructor(message = 'Not found.', { suggestions = [], query, entity } = {}) {
      super(message, 404);
      this.suggestions = suggestions;
      if (query !== undefined) this.query = query;
      if (entity !== undefined) this.entity = entity;
   }
}
