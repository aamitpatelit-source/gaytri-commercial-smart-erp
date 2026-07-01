# Biometric Pipeline Verification Report

Date: 2026-07-01

## Scope

This audit covered the full biometric path from admin face-photo registration, to backend enrollment persistence in PostgreSQL-facing code, to mobile verification and attendance marking.

## Production Path Now Enforced

1. Real biometric enrollment writes only to `employees.biometric_embedding`.
2. `biometric_enrolled` is treated as valid only when an encrypted embedding actually exists.
3. Admin face registration stores only `profile_photo_url` and clears legacy `face_embedding`.
4. Mobile verification no longer downloads employee embeddings from `/employees`.
5. Backend verification no longer falls back to `face_embedding` and no longer performs anonymous 1:N authentication.
6. Cross-user matches are explicitly rejected when another enrolled employee scores higher than the selected employee.
7. Cosine similarity is computed on normalized vectors on both enrollment and verification paths.
8. Replay/demo/fake biometric code paths were removed from production sources.

## Automated Evidence

### Backend build

Command:

```powershell
cd backend
npm run build
```

Result: Passed

### Web admin build

Command:

```powershell
cd web_admin
npm run build
```

Result: Passed

### Mobile tests

Command:

```powershell
cd mobile_app
flutter test
```

Result: Passed

### Source scan for demo/fake biometric paths

Command:

```powershell
rg -n "demo|mock|fake|simulation|Test environment detected|generateMock|DEMO MODE ACTIVE" backend\src mobile_app\lib web_admin\src -S
```

Result: No matches in production source trees

### Controller-level biometric audit

Command:

```powershell
cd backend
node scripts/biometric_pipeline_audit.js
```

Result:

```json
{
  "results": [
    {
      "name": "enrollment_persists_biometric_embedding",
      "passed": true
    },
    {
      "name": "re_enrollment_approval_archives_and_updates",
      "passed": true
    },
    {
      "name": "no_face_registered_only_when_embedding_missing",
      "passed": true
    },
    {
      "name": "cross_user_match_is_rejected",
      "passed": true
    },
    {
      "name": "only_enrolled_employee_is_authenticated",
      "passed": true
    }
  ]
}
```

## Requirement Verification

### Enrolled faces persist in the database

Verified.

Evidence:

- `backend/src/controllers/employeeController.ts` writes encrypted normalized embeddings into `employees.biometric_embedding`.
- The audit script asserts the enrollment SQL updates `biometric_embedding`, sets `biometric_enrolled = TRUE`, and clears `face_embedding`.

### "No Face Registered" is shown only when no embedding exists

Verified.

Evidence:

- Mobile scanner checks `biometric_enrolled` metadata from `/employees`.
- Backend verification returns `NO_FACE_REGISTERED` only when `biometric_embedding` is missing or enrollment is false.
- Flutter test covers the no-embedding case.

### Wrong faces are rejected

Verified.

Evidence:

- Backend verification compares the live normalized probe against the selected employee embedding.
- Cross-user safeguard rejects the scan if another enrolled employee matches better.
- Audit script covers wrong-face and cross-user rejection.

### Only the enrolled employee is authenticated

Verified.

Evidence:

- Verification requires `employee_id`.
- The backend loads the selected employee's persisted `biometric_embedding` directly from the database-facing layer.
- Anonymous best-match fallback was removed.
- Audit script covers successful authentication only for the enrolled employee.

### Replay/demo/test code is completely removed

Verified for production source paths.

Evidence:

- Web admin deterministic mock embedding generation removed.
- Mobile scanner web/demo simulation removed.
- Mobile face service mock profile-photo embedding path removed.
- Production-source grep returned no demo/mock/fake biometric matches.

### System is production-ready

Production code path readiness: Verified.

Evidence:

- Backend, web admin, and mobile tests/builds pass.
- Verification now uses one strict source of truth: encrypted `employees.biometric_embedding`.
- Legacy fake/template leakage paths were removed.
- Threshold enforcement, replay protection, and cross-user rejection are active in the backend verifier.

## Important Note

This report proves the repository code paths and controller logic are production-only and internally consistent. A final live-environment smoke test with a real PostgreSQL instance and a physical camera device is still recommended before rollout, but no code-level blocker remains in this audit scope.
