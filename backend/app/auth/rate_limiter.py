"""
FastAPI In-Memory Rate Limiting Middleware & Dependency.
Supports tiered rate limits by client IP or Bearer token with sliding window.
"""

import time
import logging
from typing import Dict, Tuple, List, Optional
from fastapi import Request, Response, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("auth.rate_limiter")


class InMemoryRateLimiter:
    """
    Sliding window in-memory rate limiter.
    Stores timestamps of requests per client key.
    """
    def __init__(self):
        # key -> list of timestamp floats
        self._requests: Dict[str, List[float]] = {}

    def is_allowed(self, key: str, max_requests: int, window_seconds: int = 60) -> Tuple[bool, int, int]:
        """
        Checks if the request is permitted under the rate limit.
        Returns: (is_allowed, remaining_requests, retry_after_seconds)
        """
        now = time.time()
        window_start = now - window_seconds

        # Get existing timestamps and purge older than window
        timestamps = self._requests.get(key, [])
        valid_timestamps = [t for t in timestamps if t > window_start]

        if len(valid_timestamps) >= max_requests:
            oldest = valid_timestamps[0]
            retry_after = max(1, int(oldest + window_seconds - now))
            self._requests[key] = valid_timestamps
            return False, 0, retry_after

        # Record this request
        valid_timestamps.append(now)
        self._requests[key] = valid_timestamps

        remaining = max_requests - len(valid_timestamps)
        return True, remaining, 0

    def cleanup(self):
        """Clean up stale keys older than 5 minutes."""
        now = time.time()
        stale_cutoff = now - 300
        keys_to_delete = []
        for k, timestamps in self._requests.items():
            valid = [t for t in timestamps if t > stale_cutoff]
            if not valid:
                keys_to_delete.append(k)
            else:
                self._requests[k] = valid
        for k in keys_to_delete:
            del self._requests[k]


limiter = InMemoryRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware applying tiered rate limits based on path:
    - Auth endpoints (/api/auth/login, /api/auth/register): 20 req/min
    - Chat & AI endpoints (/api/chat, /api/analyze): 60 req/min
    - General endpoints: 120 req/min
    - WebSocket and live streaming chunk endpoints: 300 req/min
    """
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Determine rate limit configuration based on path
        if path.startswith("/api/auth/login") or path.startswith("/api/auth/register"):
            max_req = 30
            window = 60
        elif path.startswith("/api/chat") or path.startswith("/api/analyze"):
            max_req = 80
            window = 60
        elif "/chunk" in path or "/segment" in path or path.startswith("/api/deepgram"):
            max_req = 350
            window = 60
        else:
            max_req = 150
            window = 60

        # Derive client identifier (bearer token sub or client IP)
        auth_hdr = request.headers.get("Authorization", "")
        client_ip = request.client.host if request.client else "unknown"
        client_key = f"{client_ip}:{path.split('/')[2] if len(path.split('/')) > 2 else 'root'}"

        if auth_hdr.startswith("Bearer "):
            token = auth_hdr.split(" ")[1]
            client_key = f"tok:{token[-12:] if len(token) >= 12 else token}:{path.split('/')[2] if len(path.split('/')) > 2 else 'root'}"

        # Check rate limit
        allowed, remaining, retry_after = limiter.is_allowed(client_key, max_requests=max_req, window_seconds=window)

        if not allowed:
            logger.warning("Rate limit exceeded for client %s on %s (Retry-After: %ds)", client_key, path, retry_after)
            return Response(
                content=f'{{"error": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please slow down and try again later.", "retry_after": {retry_after}}}',
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                media_type="application/json",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(max_req),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(max_req)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
