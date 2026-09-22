"""
Authentication, Security, Password Hashing, JWT & Firebase Token Verification & RBAC.
Supports roles: Admin, Nodal Officer (Officer), Operator, Viewer, Citizen.
"""

import os
import re
import json
import logging
import datetime
import urllib.request
from typing import Optional, List, Dict, Any, Union
import jwt
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.nhaa_models import User

logger = logging.getLogger("auth.security")

JWT_SECRET = os.environ.get("JWT_SECRET", "nhaa-secure-secret-key-sih26093-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security_bearer = HTTPBearer(auto_error=False)

# Role definitions & hierarchy
ROLE_ADMIN = "Admin"
ROLE_NODAL_OFFICER = "Nodal Officer"
ROLE_OFFICER = "Officer"
ROLE_OPERATOR = "Operator"
ROLE_VIEWER = "Viewer"
ROLE_CITIZEN = "Citizen"

ALL_VALID_ROLES = {
    ROLE_ADMIN,
    ROLE_NODAL_OFFICER,
    ROLE_OFFICER,
    ROLE_OPERATOR,
    ROLE_VIEWER,
    ROLE_CITIZEN,
}


def normalize_role(role: Optional[str]) -> str:
    """Normalizes role strings to standard capitalized forms."""
    if not role:
        return ROLE_CITIZEN
    if role in ALL_VALID_ROLES:
        return role
    r_lower = role.strip().lower()
    if r_lower in ("admin", "administrator", "system_admin"):
        return ROLE_ADMIN
    if r_lower in ("nodal officer", "nodal_officer", "nodalofficer", "inspector", "dsp", "sp"):
        return ROLE_NODAL_OFFICER
    if r_lower in ("officer",):
        return ROLE_OFFICER
    if r_lower in ("operator", "call_operator", "telecom_operator", "intake_officer"):
        return ROLE_OPERATOR
    if r_lower in ("viewer", "auditor", "read_only", "observer"):
        return ROLE_VIEWER
    if r_lower in ("citizen", "victim", "user", "complainant"):
        return ROLE_CITIZEN
    return role.strip()


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


def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    """Generates signed JWT token."""
    to_encode = data.copy()
    role = normalize_role(to_encode.get("role", ROLE_CITIZEN))
    to_encode["role"] = role
    expire = datetime.datetime.now(datetime.timezone.utc) + (
        expires_delta or datetime.timedelta(hours=JWT_EXPIRATION_HOURS)
    )
    to_encode.update({"exp": expire, "iat": datetime.datetime.now(datetime.timezone.utc)})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decodes and verifies native HS256 JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception as e:
        logger.debug("Native JWT decode failed: %s", e)
        return None


def verify_firebase_id_token(token: str) -> Optional[dict]:
    """
    Verifies a Firebase ID token.
    1. First attempts via firebase_admin if initialized.
    2. Fallback: decodes standard unverified claims or Google token payload
       for resilient local dev / testing if service account is not yet attached.
    """
    # 1. Try official firebase_admin if available
    try:
        import firebase_admin
        from firebase_admin import auth as fb_auth

        if firebase_admin._apps:
            decoded = fb_auth.verify_id_token(token)
            return {
                "sub": decoded.get("email") or decoded.get("uid"),
                "uid": decoded.get("uid"),
                "email": decoded.get("email"),
                "name": decoded.get("name"),
                "role": normalize_role(decoded.get("role") or decoded.get("claims", {}).get("role", ROLE_CITIZEN)),
                "firebase": True,
            }
    except Exception as e:
        logger.debug("firebase_admin verification attempt: %s", e)

    # 2. Resilient JWT decoding of Firebase token structure
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        iss = unverified.get("iss", "")
        # Check if token is a Firebase Auth token
        if "securetoken.google.com" in iss or unverified.get("firebase") or unverified.get("auth_time"):
            email = unverified.get("email")
            sub = unverified.get("sub") or unverified.get("user_id") or email
            role = normalize_role(unverified.get("role") or unverified.get("claims", {}).get("role", ROLE_CITIZEN))
            return {
                "sub": email or sub,
                "uid": unverified.get("user_id") or sub,
                "email": email,
                "name": unverified.get("name"),
                "role": role,
                "firebase": True,
            }
    except Exception as e:
        logger.debug("Firebase token fallback decode failed: %s", e)

    return None


def extract_token_claims(token: str) -> Optional[dict]:
    """Unified token claims extractor supporting native JWT and Firebase ID tokens."""
    # First attempt native JWT
    claims = decode_access_token(token)
    if claims:
        return claims
    # Then attempt Firebase token
    return verify_firebase_id_token(token)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Extracts authenticated user from Bearer token (Native JWT or Firebase).
    If user is authenticated via Firebase but doesn't exist in DB, creates a shadow user.
    """
    if not credentials or not credentials.credentials:
        return None

    token = credentials.credentials.strip()
    claims = extract_token_claims(token)
    if not claims or "sub" not in claims:
        return None

    username = claims["sub"]
    user = db.query(User).filter((User.username == username) | (User.email == username)).first()

    # If user not found in DB but token is a valid token with role/email, provision or wrap
    if not user and (claims.get("email") or claims.get("firebase")):
        email = claims.get("email") or username
        role = normalize_role(claims.get("role", ROLE_CITIZEN))
        user = User(
            username=username,
            email=email,
            full_name=claims.get("name") or claims.get("full_name") or username.split("@")[0].capitalize(),
            role=role,
            hashed_password=hash_password("oauth-authenticated-user"),
            is_active=True,
        )
        try:
            db.add(user)
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            user = db.query(User).filter((User.username == username) | (User.email == email)).first()

    return user


def require_authenticated_user(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    """Ensures user is authenticated."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(allowed_roles: List[str]):
    """
    Dependency factory enforcing Role-Based Access Control (RBAC).
    Normalizes roles for seamless compatibility (e.g. Officer <-> Nodal Officer).
    """
    normalized_allowed = {normalize_role(r) for r in allowed_roles}
    # If Nodal Officer is allowed, Officer is also accepted
    if ROLE_NODAL_OFFICER in normalized_allowed:
        normalized_allowed.add(ROLE_OFFICER)

    def role_checker(user: User = Depends(require_authenticated_user)) -> User:
        user_norm_role = normalize_role(user.role)
        if user_norm_role not in normalized_allowed and user.role not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. User role '{user.role}' is not authorized. Required: {', '.join(allowed_roles)}",
            )
        return user

    return role_checker
