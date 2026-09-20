"""
Root entrypoint for backend service deployment.
Exposes FastAPI app for Vercel, Uvicorn, and standard WSGI/ASGI servers.
"""

from app.main import app

__all__ = ["app"]
