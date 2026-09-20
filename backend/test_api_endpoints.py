"""
Test Suite for NHAA REST API Endpoints using FastAPI TestClient.
Tests Citizen Complaint Submission, Anonymous Tracking, Officer Dashboard,
Admin Analytics, and RBAC Token Protection.
"""

import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    print("\n[API TEST 1] Testing /health Endpoint...")
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "services" in data
    print(f"  -> Health: {data['services']}")
    print("  [OK] /health passed.")


def test_complaint_submission_and_tracking():
    print("\n[API TEST 2] Testing Complaint Submission & Anonymous Tracking...")
    narrative = "Rohit threatened me near my college yesterday, he said he will harm me."
    payload = {
        "narrative": narrative,
        "channel": "voice",
        "category": "Threat & Intimidation",
        "location": "Central College Gate",
        "district": "Lucknow",
        "is_anonymous": True,
    }

    res = client.post("/api/complaints/submit", json=payload)
    assert res.status_code == 200, f"Submit failed: {res.text}"
    data = res.json()
    assert data["status"] == "success"
    case_id = data["case_id"]
    anon_id = data["anonymous_id"]
    assert case_id.startswith("NHAA-CASE-")
    assert anon_id.startswith("CITIZEN-ANON-")
    print(f"  -> Case Created: {case_id}, Anon ID: {anon_id}")
    print(f"  -> Risk Level: {data['risk_level']}, Summary: {data['summary']}")

    # Track by Case ID
    track_res = client.get(f"/api/cases/track/{case_id}")
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["case_id"] == case_id
    print(f"  -> Tracked Status: {track_data['status']}, Unit: {track_data['assigned_unit']}")

    # Track by Anonymous ID
    track_anon_res = client.get(f"/api/cases/track/{anon_id}")
    assert track_anon_res.status_code == 200
    print("  [OK] Complaint submission and anonymous tracking passed.")


def test_auth_login_and_rbac():
    print("\n[API TEST 3] Testing Authentication & RBAC Enforcement...")
    # Login as Officer
    login_res = client.post("/api/auth/login", json={"username": "officer", "password": "officer123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Access Officer Dashboard
    dash_res = client.get("/api/officer/dashboard", headers=headers)
    assert dash_res.status_code == 200
    dash_data = dash_res.json()
    print(f"  -> Officer: {dash_data['officer_name']}, Open Cases: {dash_data['stats']['total_open_cases']}")

    # Citizen trying to access Officer Dashboard should get 403 Forbidden
    citizen_login = client.post("/api/auth/login", json={"username": "citizen", "password": "citizen123"})
    assert citizen_login.status_code == 200
    c_token = citizen_login.json()["access_token"]
    c_headers = {"Authorization": f"Bearer {c_token}"}

    forbidden_res = client.get("/api/officer/dashboard", headers=c_headers)
    assert forbidden_res.status_code == 403, f"Expected 403, got {forbidden_res.status_code}"
    print("  -> RBAC enforcement verified: Citizen blocked from Officer endpoints (403 Forbidden).")
    print("  [OK] Auth and RBAC tests passed.")


def test_admin_analytics():
    print("\n[API TEST 4] Testing Admin Analytics Endpoint...")
    admin_login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert admin_login.status_code == 200
    a_token = admin_login.json()["access_token"]
    a_headers = {"Authorization": f"Bearer {a_token}"}

    analytics_res = client.get("/api/admin/analytics", headers=a_headers)
    assert analytics_res.status_code == 200
    adata = analytics_res.json()
    assert "summary" in adata
    assert "risk_distribution" in adata
    assert "sla_metrics" in adata
    print(f"  -> Total Cases: {adata['summary']['total_cases']}, SLA Compliance: {adata['sla_metrics']['sla_compliance_rate']}")
    print("  [OK] Admin analytics passed.")


if __name__ == "__main__":
    print("=" * 60)
    print("NHAA REST API ENDPOINTS TEST SUITE")
    print("=" * 60)
    test_health_endpoint()
    test_complaint_submission_and_tracking()
    test_auth_login_and_rbac()
    test_admin_analytics()
    print("\n" + "=" * 60)
    print("ALL API ENDPOINT TESTS PASSED SUCCESSFULLY (100% PASS RATE)")
    print("=" * 60)
