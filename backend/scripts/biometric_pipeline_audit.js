const assert = require('assert');
const db = require('../dist/config/db');

let currentQueryHandler = async () => {
  throw new Error('No query handler configured.');
};

db.query = async (text, params) => currentQueryHandler(text, params || []);

const employeeController = require('../dist/controllers/employeeController');
const attendanceController = require('../dist/controllers/attendanceController');

const makeVector = (index) => {
  const vector = Array(128).fill(0);
  vector[index] = 1;
  return vector;
};

const makeNearMatchVector = (primaryIndex, secondaryIndex, secondaryWeight) => {
  const vector = Array(128).fill(0);
  vector[primaryIndex] = 1;
  vector[secondaryIndex] = secondaryWeight;
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / magnitude);
};

const makeReq = (overrides = {}) => ({
  body: {},
  params: {},
  headers: {},
  socket: { remoteAddress: '127.0.0.1' },
  user: { id: 'admin-1', role: 'MANAGER', employee_id: 'manager@gaytri.com' },
  ...overrides,
});

const makeRes = () => {
  const result = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return result;
};

const runScenario = async (name, handler, fn) => {
  currentQueryHandler = handler;
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error.message };
  }
};

const run = async () => {
  const results = [];
  const employeeAEmbedding = makeVector(0);
  const employeeBEmbedding = makeVector(1);
  const employeeAProbe = makeNearMatchVector(0, 2, 0.1);
  const encryptedA = employeeController.encryptBiometric(JSON.stringify(employeeAEmbedding));
  const encryptedB = employeeController.encryptBiometric(JSON.stringify(employeeBEmbedding));

  results.push(await runScenario('enrollment_persists_biometric_embedding', async (text, params) => {
    if (text.includes('SELECT id, employee_id, full_name FROM employees')) {
      return { rows: [{ id: 'emp-a-uuid', employee_id: 'EMP-A', full_name: 'Employee A' }] };
    }

    if (text.includes('UPDATE employees') && text.includes('SET biometric_embedding = $1')) {
      const decrypted = employeeController.decryptBiometric(params[0]);
      const vector = JSON.parse(decrypted);
      assert.strictEqual(vector.length, 128);
      assert.strictEqual(params[1], 'emp-a-uuid');
      assert.ok(text.includes('biometric_enrolled = TRUE'));
      assert.ok(text.includes('face_embedding = NULL'));
      return { rows: [] };
    }

    throw new Error(`Unexpected query during enrollment: ${text}`);
  }, async () => {
    const req = makeReq({
      body: {
        employee_id: 'EMP-A',
        embedding: employeeAEmbedding,
      },
    });
    const res = makeRes();
    await employeeController.enrollBiometric(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
  }));

  results.push(await runScenario('re_enrollment_approval_archives_and_updates', async (text, params) => {
    if (text.includes('SELECT id, employee_id, new_embedding, status FROM re_enrollment_requests')) {
      return { rows: [{ id: 'request-1', employee_id: 'emp-a-uuid', new_embedding: encryptedB, status: 'PENDING' }] };
    }

    if (text.includes('SELECT id, biometric_embedding, biometric_enrolled FROM employees')) {
      return { rows: [{ id: 'emp-a-uuid', biometric_embedding: encryptedA, biometric_enrolled: true }] };
    }

    if (text === 'BEGIN' || text === 'COMMIT') {
      return { rows: [] };
    }

    if (text.includes('INSERT INTO biometric_history')) {
      assert.strictEqual(params[0], 'emp-a-uuid');
      assert.strictEqual(params[1], encryptedA);
      return { rows: [] };
    }

    if (text.includes('UPDATE employees') && text.includes('SET biometric_embedding = $1')) {
      assert.strictEqual(params[0], encryptedB);
      assert.ok(text.includes('biometric_enrolled = TRUE'));
      assert.ok(text.includes('face_embedding = NULL'));
      return { rows: [] };
    }

    if (text.includes('UPDATE re_enrollment_requests')) {
      assert.strictEqual(params[0], 'admin-1');
      assert.strictEqual(params[1], 'request-1');
      return { rows: [] };
    }

    throw new Error(`Unexpected query during approval: ${text}`);
  }, async () => {
    const req = makeReq({
      params: { id: 'request-1' },
    });
    const res = makeRes();
    await employeeController.approveReEnrollment(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
  }));

  results.push(await runScenario('no_face_registered_only_when_embedding_missing', async (text, params) => {
    if (text.includes('FROM employees') && text.includes('(id::text = $1 OR employee_id = $1)')) {
      return { rows: [{ id: 'emp-a-uuid', employee_id: 'EMP-A', full_name: 'Employee A', biometric_embedding: null, biometric_enrolled: false }] };
    }

    if (text.includes('SELECT id FROM biometric_audit_logs WHERE nonce = $1')) {
      return { rows: [] };
    }

    if (text.includes('SELECT COUNT(*) FROM biometric_audit_logs')) {
      return { rows: [{ count: '0' }] };
    }

    if (text.includes('INSERT INTO biometric_audit_logs')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query during no-face verification: ${text}`);
  }, async () => {
    const req = makeReq({
      body: {
        employee_id: 'EMP-A',
        face_embedding: employeeAProbe,
        gps_lat: 23.0225,
        gps_lng: 72.5714,
        device_id: 'scanner-1',
        nonce: 'nonce-no-face',
        timestamp: Date.now(),
        liveness_metadata: { success: true, challenge: 'blinkTwice' },
      },
    });
    const res = makeRes();
    await attendanceController.verifyAndRecordAttendance(req, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error_code, 'NO_FACE_REGISTERED');
  }));

  results.push(await runScenario('cross_user_match_is_rejected', async (text, params) => {
    if (text.includes('FROM employees') && text.includes('(id::text = $1 OR employee_id = $1)')) {
      return { rows: [{ id: 'emp-a-uuid', employee_id: 'EMP-A', full_name: 'Employee A', biometric_embedding: encryptedA, biometric_enrolled: true }] };
    }

    if (text.includes('SELECT id FROM biometric_audit_logs WHERE nonce = $1')) {
      return { rows: [] };
    }

    if (text.includes('SELECT COUNT(*) FROM biometric_audit_logs')) {
      return { rows: [{ count: '0' }] };
    }

    if (text.includes('FROM employees') && text.includes('biometric_enrolled = TRUE') && text.includes('biometric_embedding IS NOT NULL')) {
      return {
        rows: [
          { id: 'emp-a-uuid', employee_id: 'EMP-A', full_name: 'Employee A', biometric_embedding: encryptedA, biometric_enrolled: true },
          { id: 'emp-b-uuid', employee_id: 'EMP-B', full_name: 'Employee B', biometric_embedding: encryptedB, biometric_enrolled: true },
        ]
      };
    }

    if (text.includes('INSERT INTO biometric_audit_logs')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query during cross-user verification: ${text}`);
  }, async () => {
    const req = makeReq({
      body: {
        employee_id: 'EMP-A',
        face_embedding: employeeBEmbedding,
        gps_lat: 23.0225,
        gps_lng: 72.5714,
        device_id: 'scanner-1',
        nonce: 'nonce-cross-user',
        timestamp: Date.now(),
        liveness_metadata: { success: true, challenge: 'turnLeft' },
      },
    });
    const res = makeRes();
    await attendanceController.verifyAndRecordAttendance(req, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error_code, 'CROSS_USER_MATCH_DETECTED');
  }));

  results.push(await runScenario('only_enrolled_employee_is_authenticated', async (text, params) => {
    if (text.includes('FROM employees') && text.includes('(id::text = $1 OR employee_id = $1)')) {
      return { rows: [{ id: 'emp-a-uuid', employee_id: 'EMP-A', full_name: 'Employee A', biometric_embedding: encryptedA, biometric_enrolled: true }] };
    }

    if (text.includes('SELECT id FROM biometric_audit_logs WHERE nonce = $1')) {
      return { rows: [] };
    }

    if (text.includes('SELECT COUNT(*) FROM biometric_audit_logs')) {
      return { rows: [{ count: '0' }] };
    }

    if (text.includes('FROM employees') && text.includes('biometric_enrolled = TRUE') && text.includes('biometric_embedding IS NOT NULL')) {
      return {
        rows: [
          { id: 'emp-a-uuid', employee_id: 'EMP-A', full_name: 'Employee A', biometric_embedding: encryptedA, biometric_enrolled: true },
          { id: 'emp-b-uuid', employee_id: 'EMP-B', full_name: 'Employee B', biometric_embedding: encryptedB, biometric_enrolled: true },
        ]
      };
    }

    if (text.includes('SELECT id, check_in_time, check_out FROM attendance_records')) {
      return { rows: [] };
    }

    if (text.includes('SELECT * FROM attendance_settings LIMIT 1')) {
      return { rows: [] };
    }

    if (text.includes('INSERT INTO attendance_records')) {
      assert.strictEqual(params[0], 'emp-a-uuid');
      return { rows: [] };
    }

    if (text.includes('INSERT INTO biometric_audit_logs')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query during successful verification: ${text}`);
  }, async () => {
    const req = makeReq({
      body: {
        employee_id: 'EMP-A',
        face_embedding: employeeAProbe,
        gps_lat: 23.0225,
        gps_lng: 72.5714,
        device_id: 'scanner-1',
        nonce: 'nonce-success',
        timestamp: Date.now(),
        liveness_metadata: { success: true, challenge: 'smile' },
      },
    });
    const res = makeRes();
    await attendanceController.verifyAndRecordAttendance(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.match.employee_id, 'EMP-A');
  }));

  const failures = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ results }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
