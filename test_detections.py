#!/usr/bin/env python3
"""Test script to verify all detection endpoints work with proper JSON serialization."""

import requests
import cv2
import numpy as np
import json
import os
import uuid

BACKEND_URL = "http://localhost:5000"
AI_URL = "http://localhost:8000"
AUTH_TOKEN = None

def get_auth_token():
    """Login and get JWT token."""
    global AUTH_TOKEN
    print("\n[TEST] Getting authentication token...")
    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/auth/login",
            json={"email": "admin@school.com", "password": "admin123"},
            timeout=5
        )
        if resp.status_code != 200:
            print(f"✗ Login failed: {resp.status_code} - {resp.text}")
            return False
        
        data = resp.json()
        AUTH_TOKEN = data.get("token")
        if not AUTH_TOKEN:
            print(f"✗ No token in response: {data}")
            return False
        
        print(f"✓ Authenticated successfully")
        return True
    except Exception as e:
        print(f"✗ Auth failed: {e}")
        return False

def test_health():
    """Test AI server health."""
    print("\n[TEST] Checking AI health...")
    try:
        resp = requests.get(f"{AI_URL}/health", timeout=5)
        data = resp.json()
        print(f"✓ AI Health: {data}")
        return data.get("pipeline") == True
    except Exception as e:
        print(f"✗ AI Health failed: {e}")
        return False

def test_face_db_structure():
    """Test face_db.json structure."""
    print("\n[TEST] Checking face_db.json structure...")
    try:
        with open("d:\\FYP\\ai\\face_db.json", "r") as f:
            db = json.load(f)
        print(f"✓ Face DB loaded, {len(db)} entries")
        if len(db) == 0:
            print(f"  (Empty - ready for re-enrollment)")
        for key in db:
            entry = db[key]
            print(f"  - Key: {key} (type: {type(key).__name__})")
            print(f"    Name: {entry.get('name')}")
            print(f"    Student ID: {entry.get('student_id')}")
            print(f"    Embedding dims: {len(entry.get('embedding', []))}")
        return True
    except Exception as e:
        print(f"✗ Face DB check failed: {e}")
        return False

def create_test_enrollment():
    """Verify test enrollment exists."""
    print("\n[TEST] Verifying test enrollment...")
    try:
        with open("d:\\FYP\\ai\\face_db.json", "r") as f:
            db = json.load(f)
        
        test_uuid = "550e8400-e29b-41d4-a716-446655440000"
        if test_uuid not in db:
            print(f"✗ Test enrollment not found in face_db.json")
            return False
        
        entry = db[test_uuid]
        if len(entry.get('embedding', [])) != 128:
            print(f"✗ Embedding has wrong dimension: {len(entry.get('embedding', []))}")
            return False
        
        print(f"✓ Test enrollment verified: {test_uuid}")
        print(f"  - Name: {entry.get('name')}")
        print(f"  - Embedding dims: 128")
        return True
    except Exception as e:
        print(f"✗ Failed to verify test enrollment: {e}")
        return False

def test_recognize_live():
    """Test /api/recognition/live endpoint with sample frame."""
    print("\n[TEST] Testing /api/recognition/live endpoint...")
    try:
        if not AUTH_TOKEN:
            print("✗ No auth token available")
            return False
        
        # Create a simple test frame (640x480, BGR)
        frame = np.ones((480, 640, 3), dtype=np.uint8) * 200
        
        # Encode frame as JPEG and then base64
        success, encoded_jpg = cv2.imencode(".jpg", frame)
        if not success:
            print("✗ Failed to encode frame")
            return False
        
        import base64
        image_base64 = base64.b64encode(encoded_jpg).decode('utf-8')
        
        # Send to backend with auth header and imageBase64 in body
        headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
        payload = {"imageBase64": f"data:image/jpeg;base64,{image_base64}"}
        resp = requests.post(
            f"{BACKEND_URL}/api/recognition/live",
            json=payload,
            headers=headers,
            timeout=30
        )
        
        if resp.status_code != 200:
            print(f"✗ Request failed with status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        print(f"✓ Recognition response received")
        print(f"  - Status code: {resp.status_code}")
        print(f"  - Response keys: {list(data.keys())}")
        
        # Verify all values are JSON-serializable (no numpy types)
        json_str = json.dumps(data)
        print(f"✓ Response is JSON-serializable ({len(json_str)} bytes)")
        
        # Print detection counts
        if "results" in data:
            print(f"  - Faces: {len(data.get('results', []))}")
        if "weapon_detections" in data:
            print(f"  - Weapons: {len(data.get('weapon_detections', []))}")
        if "fight_detection" in data:
            print(f"  - Fight: {data.get('fight_detection') is not None}")
        if "dresscode_violations" in data:
            print(f"  - Dresscode violations: {len(data.get('dresscode_violations', []))}")
        
        return True
    except requests.exceptions.Timeout:
        print("✗ Request timeout (check AI server)")
        return False
    except Exception as e:
        print(f"✗ Recognition test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("=" * 60)
    print("FYP Detection System Test Suite")
    print("=" * 60)
    
    tests = [
        ("Authentication", get_auth_token),
        ("AI Health", test_health),
        ("Face DB Structure", test_face_db_structure),
        ("Test Enrollment", create_test_enrollment),
        ("Live Recognition", test_recognize_live),
    ]
    
    results = {}
    for name, test_fn in tests:
        try:
            results[name] = test_fn()
        except Exception as e:
            print(f"\n✗ Test '{name}' crashed: {e}")
            import traceback
            traceback.print_exc()
            results[name] = False
    
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    for name, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {name}")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓ All tests passed! System is ready for live testing.")
    else:
        print(f"\n✗ {total - passed} test(s) failed. Check output above.")

if __name__ == "__main__":
    main()
