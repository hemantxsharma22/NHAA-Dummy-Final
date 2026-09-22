"""
Authentication, Security, Password Hashing, Firebase Token Verification & RBAC.
Supports roles: Admin, Nodal Officer (Officer), Operator, Viewer, Citizen.
"""

import os
import re
import datetime
import urllib.request
import json
import secrets
import logging
from typing import Optional, List, Dict, Any
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.nhaa_models import User

logger = logging.getLogger("nhaa.security")

# ── JWT Secret & Cryptographic Configuration ──────────────────────────────────
_raw_jwt_secret = os.environ.get("JWT_SECRET", "").strip()
if not _raw_jwt_secret:
    if os.environ.get("ENV") == "production":
        raise RuntimeError("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production!")
    # Cryptographically secure dynamic in-memory random secret for development/testing if unset
    _raw_jwt_secret = secrets.token_urlsafe(48)
    logger.warning("SECURITY WARNING: JWT_SECRET not provided in environment. Generated ephemeral 384-bit random secret.")

JWT_SECRET = _raw_jwt_secret
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", os.environ.get("VITE_FIREBASE_PROJECT_ID", "nhaa-case-intelligence"))

security_bearer = HTTPBearer(auto_error=False)

# Cached Google public keys for Firebase Token Verification
_GOOGLE_PUBLIC_KEYS: Dict[str, str] = {}
_GOOGLE_KEYS_EXPIRY: float = 0.0


# ── Password Utilities ────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


# ── Role Normalization & Taxonomy ──────────────────────────────────────────────
ROLE_ALIASES = {
    "admin": "Admin",
    "nodal_officer": "Nodal Officer",
    "nodal officer": "Nodal Officer",
    "officer": "Nodal Officer",
    "operator": "Operator",
    "viewer": "Viewer",
    "citizen": "Citizen",
}


def normalize_role(role: Optional[str]) -> str:
    """Standardizes role names across the system."""
    if not role:
        return "Citizen"
    cleaned = role.strip().lower()
    return ROLE_ALIASES.get(cleaned, role.strip().title())


def is_role_authorized(user_role: str, allowed_roles: List[str]) -> bool:
    """
    Checks if user_role matches any allowed role, taking into account
    role normalization (e.g. Officer <-> Nodal Officer).
    """
    norm_user = normalize_role(user_role)
    norm_allowed = {normalize_role(r) for r in allowed_roles}

    # Admin always has access if Admin is in allowed_roles or system-wide
    if norm_user == "Admin" and "Admin" in norm_allowed:
        return True

    return norm_user in norm_allowed


# ── Native JWT Token Utilities ────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    """Generates signed native JWT token."""
    to_encode = data.copy()
    expire = datetime.datetime.now(datetime.timezone.utc) + (
        expires_delta or datetime.timedelta(hours=JWT_EXPIRATION_HOURS)
    )
    raw_role = data.get("role")
    if raw_role in ("Officer", "Nodal Officer"):
        clean_role = raw_role
    else:
        clean_role = normalize_role(raw_role)
    to_encode.update({"exp": expire, "role": clean_role})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_native_token(token: str) -> Optional[dict]:
    """Decodes and verifies native HS256 JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None


# Backward-compatibility alias
decode_access_token = decode_native_token


# ── Google Public Key Cache for Firebase ──────────────────────────────────────
def _get_google_public_keys() -> Dict[str, str]:
    global _GOOGLE_PUBLIC_KEYS, _GOOGLE_KEYS_EXPIRY
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    if _GOOGLE_PUBLIC_KEYS and now < _GOOGLE_KEYS_EXPIRY:
        return _GOOGLE_PUBLIC_KEYS
    try:
        url = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
        req = urllib.request.Request(url, headers={"User-Agent": "NHAA-Security/1.0"})
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            _GOOGLE_PUBLIC_KEYS = data
            _GOOGLE_KEYS_EXPIRY = now + 3600
            return _GOOGLE_PUBLIC_KEYS
    except Exception as e:
        logger.debug("Could not refresh Google public certs: %s", e)
        return _GOOGLE_PUBLIC_KEYS


# ── Firebase ID Token Verification ───────────────────────────────────────────
def verify_firebase_token(token: str) -> Optional[dict]:
    """
    Verifies a Firebase ID token.
    Validates algorithm (RS256), issuer (https://securetoken.google.com/<project_id>),
    audience (<project_id>), expiration, and RS256 signature against Google public certs.
    """
    try:
        # Decode header to check algorithm (RS256 for Firebase)
        unverified_headers = jwt.get_unverified_header(token)
        if unverified_headers.get("alg") != "RS256":
            return None

        kid = unverified_headers.get("kid")
        google_keys = _get_google_public_keys()

        # If matching Google public certificate is available, verify cryptographically
        if kid and kid in google_keys:
            cert_pem = google_keys[kid]
            from jwt.algorithms import RSAAlgorithm
            public_key = RSAAlgorithm.from_certificate(cert_pem.encode("utf-8"))
            claims = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                audience=FIREBASE_PROJECT_ID,
                issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
                options={"verify_signature": True, "verify_aud": True, "verify_iss": True, "verify_exp": True},
            )
        elif os.environ.get("ALLOW_MOCK_FIREBASE_TOKENS", "").lower() in ("1", "true", "yes"):
            # Explicit local offline dev/testing mock mode only
            claims = jwt.decode(token, options={"verify_signature": False})
            iss = claims.get("iss", "")
            if not iss.startswith(f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"):
                return None
            exp = claims.get("exp", 0)
            now = datetime.datetime.now(datetime.timezone.utc).timestamp()
            if exp < now:
                return None
        else:
            # Reject token when signature cannot be validated against a trusted Google cert
            return None

        # Extract standard Firebase claims
        return {
            "sub": claims.get("sub"),
            "email": claims.get("email"),
            "name": claims.get("name") or claims.get("email", "").split("@")[0],
            "role": normalize_role(claims.get("role") or "Citizen"),
            "firebase": True,
        }
    except Exception:
        return None


# ── Current User Dependency ──────────────────────────────────────────────────
def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Extracts authenticated user from Bearer token.
    Accepts both:
      1. Native HMAC-SHA256 tokens (from /api/auth/login)
      2. Firebase ID tokens (RS256 from Google Sign-In)
    """
    if not credentials or not credentials.credentials:
        return None

    token = credentials.credentials.strip()

    # 1. Try Native HS256 Token
    payload = decode_native_token(token)
    if payload and "sub" in payload:
        username = payload["sub"]
        user = db.query(User).filter(User.username == username).first()
        if user and user.is_active:
            return user

    # 2. Try Firebase ID Token
    fb_payload = verify_firebase_token(token)
    if fb_payload:
        email = fb_payload.get("email")
        sub = fb_payload.get("sub")
        # Match user by email or username
        user = db.query(User).filter((User.email == email) | (User.username == sub)).first()
        if not user and email:
            # Auto-provision or link citizen record
            user = User(
                username=sub[:40] if sub else f"fb_{email.split('@')[0]}",
                email=email,
                full_name=fb_payload.get("name"),
                hashed_password=hash_password(os.urandom(16).hex()),
                role=fb_payload.get("role", "Citizen"),
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        if user and user.is_active:
            return user

    return None


def require_authenticated_user(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    """Ensures user is authenticated with a valid Bearer token."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ── RBAC Permission Dependencies ─────────────────────────────────────────────
def require_role(allowed_roles: List[str]):
    """
    Dependency factory enforcing Role-Based Access Control (RBAC).
    Supported roles: Admin, Nodal Officer, Operator, Viewer, Citizen.
    """
    def role_checker(user: User = Depends(require_authenticated_user)) -> User:
        if not is_role_authorized(user.role, allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Role '{user.role}' is not authorized. Required: {', '.join(allowed_roles)}",
            )
        return user

    return role_checker


def require_write_permission():
    """
    Blocks read-only roles (e.g., 'Viewer') from performing mutating actions
    like case triage, status changes, or assignment overrides.
    """
    def write_checker(user: User = Depends(require_authenticated_user)) -> User:
        norm_role = normalize_role(user.role)
        if norm_role == "Viewer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Viewer role has read-only access and cannot modify cases.",
            )
        return user

    return write_checker


# ── Data Sanitization Utility ────────────────────────────────────────────────
SECRET_PATTERNS = [
    re.compile(r"bearer\s+[A-Za-z0-9_\-\.]+", re.IGNORECASE),
    re.compile(r"gsk_[A-Za-z0-9]+", re.IGNORECASE),
    re.compile(r"dg_[A-Za-z0-9]+", re.IGNORECASE),
    re.compile(r"AIza[0-9A-Za-z\-_]{35}", re.IGNORECASE),
    re.compile(r"(password|pwd|secret)['\"]?\s*[:=]\s*['\"]?[^\s,'\"]+", re.IGNORECASE),
]


def sanitize_log_data(data: Any) -> Any:
    """
    Recursively strips/masks secrets, passwords, tokens, and API keys.
    Guarantees sensitive data is NEVER written to audit logs or stdout.
    """
    if data is None:
        return None
    if isinstance(data, str):
        cleaned = data
        for pat in SECRET_PATTERNS:
            cleaned = pat.sub("[REDACTED_SECRET]", cleaned)
        return cleaned
    elif isinstance(data, dict):
        cleaned_dict = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if any(s in k_lower for s in ("password", "token", "secret", "api_key", "credentials")):
                cleaned_dict[k] = "[REDACTED]"
            else:
                cleaned_dict[k] = sanitize_log_data(v)
        return cleaned_dict
    elif isinstance(data, list):
        return [sanitize_log_data(item) for item in data]
    return data
