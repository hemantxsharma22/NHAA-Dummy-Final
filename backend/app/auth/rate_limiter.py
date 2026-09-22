"""
Thread-safe, in-memory sliding-window API Rate Limiter for FastAPI.
Protects sensitive auth endpoints and general APIs from brute-force & DDoS.
"""

import time
import threading
import logging
from typing import Dict, List, Tuple, Optional
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("auth.rate_limiter")


class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter tracking request timestamps per client key.
    """

    def __init__(self):
        self._lock = threading.Lock()
        # key: (client_key, bucket_name) -> list of timestamp floats
        self._requests: Dict[Tuple[str, str], List[float]] = {}
        self._last_cleanup = time.time()

    def is_allowed(self, client_key: str, bucket: str = "general", limit: int = 60, window_seconds: int = 60) -> Tuple[bool, int, int]:
        """
        Check if the request is within rate limits.
        Returns (is_allowed, remaining_requests, retry_after_seconds).
        """
        now = time.time()
        key = (client_key, bucket)
        window_start = now - window_seconds

        with self._lock:
            # Periodic cleanup every 5 minutes
            if now - self._last_cleanup > 300:
                self._cleanup_expired(now, window_seconds)
                self._last_cleanup = now

            timestamps = self._requests.get(key, [])
            # Filter timestamps within current window
            valid_timestamps = [ts for ts in timestamps if ts > window_start]

            if len(valid_timestamps) >= limit:
                oldest_in_window = valid_timestamps[0]
                retry_after = max(1, int(oldest_in_window + window_seconds - now))
                self._requests[key] = valid_timestamps
                return False, 0, retry_after

            valid_timestamps.append(now)
            self._requests[key] = valid_timestamps
            remaining = max(0, limit - len(valid_timestamps))
            return True, remaining, 0

    def _cleanup_expired(self, now: float, window_seconds: int):
        cutoff = now - (window_seconds * 2)
        keys_to_delete = []
        for k, timestamps in self._requests.items():
            valid = [ts for ts in timestamps if ts > cutoff]
            if not valid:
                keys_to_delete.append(k)
            else:
                self._requests[k] = valid
        for k in keys_to_delete:
            del self._requests[k]


# Global rate limiter instance
limiter = SlidingWindowRateLimiter()

# Route rules: (path_prefix, bucket_name, max_requests_per_minute)
ROUTE_LIMITS = [
    ("/api/auth/login", "auth_login", 15),
    ("/api/auth/register", "auth_register", 15),
    ("/api/auth/firebase-verify", "auth_firebase", 30),
    ("/api/auth/verify-token", "auth_verify", 60),
    ("/api/complaints/submit", "complaints_submit", 30),
    ("/api/cases", "cases_api", 120),
    ("/api/chat", "chat_api", 80),
    ("/api/engine2", "engine2_api", 100),
    ("/api/", "general_api", 150),
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware applying route-specific rate limits.
    Skips WebSockets and static /health checks.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Bypass rate limits for health, docs, and websocket routes
        if path in ("/health", "/api/health", "/docs", "/openapi.json", "/redoc") or request.scope.get("type") == "websocket":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        # Check X-Forwarded-For if behind a proxy
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()

        # Find matching route limit
        rule = None
        for prefix, bucket, max_reqs in ROUTE_LIMITS:
            if path.startswith(prefix):
                rule = (bucket, max_reqs)
                break

        if rule:
            bucket, max_reqs = rule
            allowed, remaining, retry_after = limiter.is_allowed(client_ip, bucket, limit=max_reqs, window_seconds=60)
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": "RATE_LIMIT_EXCEEDED",
                        "message": f"Too many requests to {bucket}. Please wait {retry_after} seconds before retrying.",
                        "retry_after": retry_after,
                    },
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(max_reqs),
                        "X-RateLimit-Remaining": "0",
                    },
                )

        response = await call_next(request)
        return response
