"""
Authentication API Router.
Handles Registration, Login, Token generation, and Demo User seeding.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.nhaa_models import User, Officer
from app.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_authenticated_user,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = "Citizen"  # Citizen, Operator, Officer, Admin


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    user_id: int
    full_name: Optional[str] = None


@router.post("/register", response_model=TokenResponse)
def register_user(req: RegisterRequest, db: Session = Depends(get_db)):
    # Check if username exists
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered. Please choose another or log in.",
        )

    # Validate role
    role = req.role if req.role in ("Citizen", "Operator", "Officer", "Admin") else "Citizen"

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

    # If role is Officer, create Officer profile record
    if role == "Officer":
        officer = Officer(
            user_id=new_user.id,
            badge_number=f"NHAA-OFF-{new_user.id:04d}",
            department="Emergency Triage & Response",
            rank="Nodal Officer",
        )
        db.add(officer)
        db.commit()

    token = create_access_token({"sub": new_user.username, "role": new_user.role, "id": new_user.id})
    return TokenResponse(
        access_token=token,
        role=new_user.role,
        username=new_user.username,
        user_id=new_user.id,
        full_name=new_user.full_name,
    )


@router.post("/login", response_model=TokenResponse)
def login_user(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify username and password.",
        )

    token = create_access_token({"sub": user.username, "role": user.role, "id": user.id})
    return TokenResponse(
        access_token=token,
        role=user.role,
        username=user.username,
        user_id=user.id,
        full_name=user.full_name,
    )


@router.get("/me")
def get_profile(user: User = Depends(require_authenticated_user)):
    return {
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "created_at": user.created_at,
    }


@router.post("/seed-users")
def seed_default_users(db: Session = Depends(get_db)):
    """
    Seeds default test accounts for each role:
    - citizen / citizen123 (Citizen)
    - operator / operator123 (Operator)
    - officer / officer123 (Officer)
    - admin / admin123 (Admin)
    """
    defaults = [
        ("citizen", "citizen123", "Citizen", "Rajesh Kumar (Citizen)", "citizen@nhaa.gov.in"),
        ("operator", "operator123", "Operator", "Priya Sharma (Operator 04)", "operator@nhaa.gov.in"),
        ("officer", "officer123", "Officer", "Inspector Vikram Singh", "officer@nhaa.gov.in"),
        ("admin", "admin123", "Admin", "NHAA System Administrator", "admin@nhaa.gov.in"),
    ]

    created = []
    for uname, pword, role, fname, email in defaults:
        existing = db.query(User).filter(User.username == uname).first()
        if not existing:
            u = User(
                username=uname,
                hashed_password=hash_password(pword),
                full_name=fname,
                role=role,
                email=email,
            )
            db.add(u)
            db.commit()
            db.refresh(u)
            if role == "Officer":
                off = Officer(
                    user_id=u.id,
                    badge_number="NHAA-OFF-1001",
                    department="District Emergency Control Room",
                    rank="Senior Nodal Officer",
                )
                db.add(off)
                db.commit()
            created.append(uname)

    return {"status": "success", "seeded_users": created, "message": "Default accounts initialized."}
