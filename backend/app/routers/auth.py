"""
Authentication API Router with Dual Token Verification & RBAC.
Handles Registration, Login, Firebase Token Verification, Token generation, and Demo User seeding.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.nhaa_models import User, Officer
from app.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    verify_firebase_token,
    extract_token_claims,
    normalize_role,
    get_current_user,
    require_authenticated_user,
    require_role,
    ROLE_ADMIN,
    ROLE_NODAL_OFFICER,
    ROLE_OPERATOR,
    ROLE_VIEWER,
    ROLE_CITIZEN,
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = "Citizen"  # Admin, Nodal Officer, Operator, Viewer, Citizen


class LoginRequest(BaseModel):
    username: str
    password: str


class FirebaseVerifyRequest(BaseModel):
    id_token: str


class VerifyTokenRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    user_id: int
    full_name: Optional[str] = None


@router.post("/register", response_model=TokenResponse)
def register_user(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    # Check if username exists
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered. Please choose another or log in.",
        )

    # Validate and normalize role
    role = normalize_role(req.role)

    new_user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name or req.username.capitalize(),
        role=role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # If role is Nodal Officer / Officer, create Officer profile record
    if role in ("Nodal Officer", "Officer"):
        officer = Officer(
            user_id=new_user.id,
            badge_number=f"NHAA-OFF-{new_user.id:04d}",
            department="Emergency Triage & Response",
            rank="Nodal Officer",
        )
        db.add(officer)
        db.commit()

    token = create_access_token({"sub": new_user.username, "role": new_user.role, "id": new_user.id})

    # Log user registration in audit trail
    record_audit_log(
        db=db,
        action="USER_REGISTERED",
        rationale=f"User {new_user.username} registered with role {new_user.role}.",
        user=new_user,
        ip_address=request.client.host if request.client else None,
    )

    return TokenResponse(
        access_token=token,
        role=new_user.role,
        username=new_user.username,
        user_id=new_user.id,
        full_name=new_user.full_name,
    )


@router.post("/login", response_model=TokenResponse)
def login_user(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        # Record failed login attempt in audit trail
        record_audit_log(
            db=db,
            action="LOGIN_FAILED",
            rationale=f"Failed login attempt for username: {req.username}",
            user_role="Anonymous",
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify username and password.",
        )

    norm_role = normalize_role(user.role)
    token = create_access_token({"sub": user.username, "role": norm_role, "id": user.id})

    # Record successful login
    record_audit_log(
        db=db,
        action="LOGIN_SUCCESS",
        rationale=f"User {user.username} authenticated successfully.",
        user=user,
        ip_address=request.client.host if request.client else None,
    )

    return TokenResponse(
        access_token=token,
        role=norm_role,
        username=user.username,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.post("/firebase-verify", response_model=TokenResponse)
def verify_firebase_login(req: FirebaseVerifyRequest, db: Session = Depends(get_db)):
    """
    Verifies Firebase client ID token, provisions/links user in SQLite,
    and returns verified token response.
    """
    claims = verify_firebase_token(req.id_token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase ID token.",
        )

    email = claims.get("email")
    sub = claims.get("sub")
    user = db.query(User).filter((User.email == email) | (User.username == sub)).first()

    if not user:
        role = normalize_role(claims.get("role", "Citizen"))
        user = User(
            username=sub[:40] if sub else f"fb_{email.split('@')[0]}",
            email=email,
            full_name=claims.get("name") or "Firebase User",
            hashed_password=hash_password(req.id_token[:16]),
            role=role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    norm_role = normalize_role(user.role)
    token = create_access_token({"sub": user.username, "role": norm_role, "id": user.id})
    return TokenResponse(
        access_token=token,
        role=norm_role,
        username=user.username,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.post("/verify-token")
def verify_token(req: VerifyTokenRequest, db: Session = Depends(get_db)):
    """
    Verifies any Bearer token (Native JWT or Firebase ID token)
    and returns token validity, user claims, and assigned role.
    """
    claims = extract_token_claims(req.token)
    if not claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )

    username = claims.get("sub", "")
    user = db.query(User).filter((User.username == username) | (User.email == username)).first()

    assigned_role = user.role if user else normalize_role(claims.get("role", ROLE_CITIZEN))

    return {
        "valid": True,
        "username": username,
        "email": claims.get("email") or (user.email if user else None),
        "role": assigned_role,
        "token_type": "firebase" if claims.get("firebase") else "jwt",
        "user_id": user.id if user else None,
    }


@router.get("/me")
def get_profile(user: User = Depends(require_authenticated_user)):
    return {
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": normalize_role(user.role),
        "created_at": user.created_at,
    }


@router.post("/seed-users")
def seed_default_users(db: Session = Depends(get_db)):
    """
    Seeds default test accounts for all RBAC roles:
    - citizen / citizen123 (Citizen)
    - operator / operator123 (Operator)
    - officer / officer123 (Nodal Officer)
    - viewer / viewer123 (Viewer)
    - admin / admin123 (Admin)
    """
    defaults = [
        ("citizen", "citizen123", ROLE_CITIZEN, "Rajesh Kumar (Citizen)", "citizen@nhaa.gov.in"),
        ("operator", "operator123", ROLE_OPERATOR, "Priya Sharma (Operator 04)", "operator@nhaa.gov.in"),
        ("officer", "officer123", ROLE_NODAL_OFFICER, "Inspector Vikram Singh (Nodal Officer)", "officer@nhaa.gov.in"),
        ("viewer", "viewer123", ROLE_VIEWER, "Sunil Verma (Observer / Auditor)", "viewer@nhaa.gov.in"),
        ("admin", "admin123", ROLE_ADMIN, "NHAA System Administrator", "admin@nhaa.gov.in"),
    ]

    created = []
    for uname, pword, role, fname, email in defaults:
        existing = db.query(User).filter(User.username == uname).first()
        norm_role = normalize_role(role)
        if not existing:
            u = User(
                username=uname,
                hashed_password=hash_password(pword),
                full_name=fname,
                role=norm_role,
                email=email,
            )
            db.add(u)
            db.commit()
            db.refresh(u)
            if norm_role in ("Nodal Officer", "Officer"):
                off = Officer(
                    user_id=u.id,
                    badge_number=f"NHAA-OFF-{u.id:04d}",
                    department="District Emergency Control Room",
                    rank="Senior Nodal Officer",
                )
                db.add(off)
                db.commit()
            created.append(uname)
        else:
            existing.role = norm_role
            db.commit()

    return {"status": "success", "seeded_users": created, "message": "Default RBAC accounts initialized."}
