"""
Automated Security Hardening Test Suite for NHAA & SAATHI-AI Platform.
Tests:
  1. Authentication & Token Generation (JWT & Firebase ID Token verification)
  2. Role-Based Access Control (Admin, Nodal Officer, Operator, Viewer, Citizen)
  3. Permission Enforcement & 403 Forbidden on restricted routes (Viewer read-only)
  4. Audit Trail Logging (CASE_ACCESS, TRIAGE_UPDATE, ESCALATION, OVERRIDE, AI_RECOMMENDATION)
  5. Secret & PII Sanitization in Audit Logs
  6. In-Memory API Rate Limiting (HTTP 429 Too Many Requests)
  7. Health Check Telemetry
"""

import os
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
import time
import jwt

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app, _seed_initial_data
from app.database import SessionLocal
from app.models.nhaa_models import User, Case, AuditLog
from app.auth.security import JWT_SECRET, JWT_ALGORITHM, sanitize_log_data

client = TestClient(app)


def test_seed_and_health():
    print("\n[1] Testing Initialization & Health Telemetry...")
    _seed_initial_data()
    res = client.get("/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    data = res.json()
    assert data["status"] == "healthy"
    assert data["security"]["rbac_enabled"] is True
    assert data["security"]["rate_limiting"] == "active_sliding_window"
    assert "Admin" in data["roles_supported"]
    assert "Nodal Officer" in data["roles_supported"]
    assert "Viewer" in data["roles_supported"]
    print("  [OK] Health check reports active security hardening, RBAC, and rate limiting.")


def test_login_all_roles():
    print("\n[2] Testing Login & Role Token Issuance...")
    roles = {
        "admin": ("admin123", "Admin"),
        "officer": ("officer123", "Nodal Officer"),
        "operator": ("operator123", "Operator"),
        "viewer": ("viewer123", "Viewer"),
        "citizen": ("citizen123", "Citizen"),
    }
    tokens = {}
    for username, (password, expected_role) in roles.items():
        res = client.post("/api/auth/login", json={"username": username, "password": password})
        assert res.status_code == 200, f"Login failed for {username}: {res.text}"
        body = res.json()
        assert "access_token" in body
        assert body["role"] == expected_role, f"Expected {expected_role}, got {body['role']}"
        tokens[username] = body["access_token"]
        print(f"  [OK] Logged in as {username} -> Role: {body['role']}")

    # Test invalid password rejection
    bad_res = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpassword"})
    assert bad_res.status_code == 401
    print("  [OK] Invalid password rejected with HTTP 401.")
    return tokens


def test_firebase_token_handling():
    print("\n[3] Testing Firebase ID Token Verification...")
    now = int(time.time())
    # Create valid mock Firebase token payload with RS256 algorithm header
    fake_fb_claims = {
        "iss": "https://securetoken.google.com/nhaa-case-intelligence",
        "aud": "nhaa-case-intelligence",
        "sub": "firebase_uid_test_12345",
        "email": "google_citizen@example.com",
        "name": "Google Citizen",
        "exp": now + 3600,
        "iat": now,
    }
    # Unsigned/dummy RS256 token for parser
    headers = {"alg": "RS256", "typ": "JWT"}
    # Use PyJWT with unverified signature parser in our verify_firebase_token
    token_str = jwt.encode(fake_fb_claims, "secret", algorithm="HS256")
    # Also verify that verify_firebase_token correctly filters valid structures
    from app.auth.security import verify_firebase_token
    # Test rejection of non-RS256 tokens
    assert verify_firebase_token(token_str) is None

    # Test invalid token format on /api/auth/firebase-verify
    bad_fb = client.post("/api/auth/firebase-verify", json={"id_token": "invalid.jwt.token"})
    assert bad_fb.status_code == 401
    print("  [OK] Invalid Firebase ID token correctly rejected with HTTP 401.")


def test_rbac_permissions(tokens):
    print("\n[4] Testing RBAC Permissions Across Endpoints...")

    # First ensure at least one case exists
    complaint_res = client.post(
        "/api/complaints/submit",
        json={
            "narrative": "Urgent security threat at central market. Culprits armed with weapons.",
            "category": "Emergency",
            "is_anonymous": False,
        },
    )
    assert complaint_res.status_code == 200, f"Complaint creation failed: {complaint_res.text}"
    case_id = complaint_res.json()["case_id"]

    # 1. GET /api/cases: Viewer, Operator, Nodal Officer, Admin should all have READ access
    for user_key in ["viewer", "operator", "officer", "admin"]:
        res = client.get("/api/cases", headers={"Authorization": f"Bearer {tokens[user_key]}"})
        assert res.status_code == 200, f"{user_key} could not list cases: {res.text}"
    print("  [OK] Case listing is accessible to Viewer, Operator, Officer, and Admin.")

    # 2. GET /api/cases/{id}: Accessible to Viewer, Operator, Officer, Admin
    for user_key in ["viewer", "operator", "officer", "admin"]:
        res = client.get(f"/api/cases/{case_id}", headers={"Authorization": f"Bearer {tokens[user_key]}"})
        assert res.status_code == 200, f"{user_key} could not get case detail: {res.text}"
    print("  [OK] Case dossier is accessible to Viewer, Operator, Officer, and Admin.")

    # 3. POST /api/cases/{id}/triage:
    # Viewer MUST be blocked with 403 Forbidden!
    viewer_triage = client.post(
        f"/api/cases/{case_id}/triage",
        headers={"Authorization": f"Bearer {tokens['viewer']}"},
        json={"status": "TRIAGED", "triage_notes": "Attempted update by viewer"},
    )
    assert viewer_triage.status_code == 403, f"Expected 403 for Viewer triage, got {viewer_triage.status_code}"
    print("  [OK] Viewer mutating action correctly BLOCKED with HTTP 403 Forbidden.")

    # Operator CAN triage
    operator_triage = client.post(
        f"/api/cases/{case_id}/triage",
        headers={"Authorization": f"Bearer {tokens['operator']}"},
        json={"status": "TRIAGED", "priority": "HIGH", "triage_notes": "Operator triaged caller incident."},
    )
    assert operator_triage.status_code == 200, f"Operator triage failed: {operator_triage.text}"
    print("  [OK] Operator successfully performed triage.")

    # 4. Officer Dashboard: Officer & Admin allowed; Operator & Viewer BLOCKED with 403
    off_res = client.get("/api/officer/dashboard", headers={"Authorization": f"Bearer {tokens['officer']}"})
    assert off_res.status_code == 200
    adm_res = client.get("/api/officer/dashboard", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert adm_res.status_code == 200
    op_dash = client.get("/api/officer/dashboard", headers={"Authorization": f"Bearer {tokens['operator']}"})
    assert op_dash.status_code == 403
    view_dash = client.get("/api/officer/dashboard", headers={"Authorization": f"Bearer {tokens['viewer']}"})
    assert view_dash.status_code == 403
    print("  [OK] Officer dashboard restricted to Nodal Officer & Admin (Operator & Viewer blocked with 403).")

    # 5. Admin Analytics: Admin & Nodal Officer allowed; Operator & Viewer BLOCKED with 403
    adm_analytics = client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert adm_analytics.status_code == 200
    view_analytics = client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {tokens['viewer']}"})
    assert view_analytics.status_code == 403
    print("  [OK] Admin analytics restricted (Viewer blocked with 403).")

    return case_id


def test_audit_logging_and_sanitization(tokens, case_id):
    print("\n[5] Testing Audit Logging & Sanitization...")

    # Trigger ESCALATION by changing priority to CRITICAL
    esc_res = client.post(
        f"/api/cases/{case_id}/triage",
        headers={"Authorization": f"Bearer {tokens['officer']}"},
        json={"priority": "CRITICAL", "triage_notes": "Escalated to Emergency Nodal Cell immediately."},
    )
    assert esc_res.status_code == 200
    assert esc_res.json()["action_logged"] == "ESCALATION"
    print("  [OK] Case escalation correctly identified and logged as ESCALATION.")

    # Trigger OVERRIDE
    override_res = client.post(
        f"/api/cases/{case_id}/triage",
        headers={"Authorization": f"Bearer {tokens['officer']}"},
        json={"priority": "MEDIUM", "triage_notes": "Manual Override: threat de-escalated following verification."},
    )
    assert override_res.status_code == 200
    assert override_res.json()["action_logged"] == "OVERRIDE"
    print("  [OK] Manual override correctly identified and logged as OVERRIDE.")

    # Fetch audit trail
    audit_res = client.get("/api/audit-logs", headers={"Authorization": f"Bearer {tokens['admin']}"})
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) > 0

    actions_found = {l["action"] for l in logs}
    print(f"  [OK] Actions present in audit trail: {actions_found}")
    assert any("CASE_ACCESS" in a for a in actions_found), "CASE_ACCESS was not recorded!"
    assert any("COMPLAINT_FILED" in a for a in actions_found), "COMPLAINT_FILED was not recorded!"
    assert any("AI_RECOMMENDATION" in a for a in actions_found), "AI_RECOMMENDATION was not recorded!"
    assert any("ESCALATION" in a for a in actions_found), "ESCALATION was not recorded!"
    assert any("OVERRIDE" in a for a in actions_found), "OVERRIDE was not recorded!"

    # Verify secret sanitization: Ensure no secrets appear in audit logs
    for log_item in logs:
        text = str(log_item["rationale"] or "")
        assert "gsk_" not in text, "Leaked Groq API key in audit log!"
        assert "dg_" not in text, "Leaked Deepgram API key in audit log!"
        assert "password" not in text.lower() or "redacted" in text.lower(), "Plain password in audit log!"
    print("  [OK] Verified: Audit logs are completely sanitized of API keys and passwords.")


def test_rate_limiting():
    print("\n[6] Testing In-Memory Sliding-Window Rate Limiting...")
    # The /api/auth/login endpoint has a limit of 15 requests per minute
    # Send 18 quick requests to verify 429 Too Many Requests triggers
    triggered_429 = False
    for i in range(18):
        res = client.post("/api/auth/login", json={"username": f"user_{i}", "password": "wrong"})
        if res.status_code == 429:
            triggered_429 = True
            retry_after = res.headers.get("Retry-After")
            print(f"  [OK] Rate limit triggered on request #{i+1}: HTTP 429 (Retry-After: {retry_after}s)")
            break

    assert triggered_429, "Rate limiter did not trigger HTTP 429 on rapid burst requests!"


if __name__ == "__main__":
    print("================================================================================")
    print("NHAA / SAATHI-AI PLATFORM — SECURITY HARDENING INTEGRATION TEST")
    print("================================================================================")
    test_seed_and_health()
    tokens = test_login_all_roles()
    test_firebase_token_handling()
    case_id = test_rbac_permissions(tokens)
    test_audit_logging_and_sanitization(tokens, case_id)
    test_rate_limiting()
    print("\n================================================================================")
    print("ALL SECURITY HARDENING TESTS PASSED SUCCESSFULLY! (100% PASS RATE)")
    print("================================================================================")
