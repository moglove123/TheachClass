import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import bcrypt from 'bcryptjs'
import ExcelJS from 'exceljs'

// ใช้ฐานข้อมูล SQLite ชั่วคราวแยกจาก prisma/dev.db เพื่อไม่ให้การทดสอบกระทบข้อมูลจริง
const root = path.resolve(import.meta.dirname, '..')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classflow-test-'))
const dbPath = path.join(tmpDir, 'test.db')
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`
process.env.JWT_SECRET = 'integration-test-secret'
process.env.MAX_FILE_SIZE_MB = '20'

// ใช้ schema SQLite แยกต่างหาก เพราะ schema.prisma หลักเป็น PostgreSQL สำหรับ production
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js')
const testSchema = path.join(root, 'prisma', 'schema.test.prisma')

const generate = spawnSync(process.execPath, [prismaCli, 'generate', '--schema', testSchema], {
  cwd: root, env: process.env, encoding: 'utf8',
})
if (generate.status !== 0) throw new Error(`Prisma generate failed:\n${generate.stdout}\n${generate.stderr}`)

const push = spawnSync(
  process.execPath,
  [prismaCli, 'db', 'push', '--schema', testSchema, '--skip-generate', '--accept-data-loss'],
  { cwd: root, env: process.env, encoding: 'utf8' },
)
if (push.status !== 0) throw new Error(`Prisma db push failed:\n${push.stdout}\n${push.stderr}`)

const { app } = await import('../server/index.js')
const { prisma } = await import('../server/db.js')
const { runReminders } = await import('../server/reminders.js')

const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`

function client() {
  let cookie = ''
  const request = async (method, url, opts = {}) => {
    const headers = { ...(opts.headers || {}) }
    let body
    if (opts.form !== undefined) body = opts.form
    else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(opts.body)
    }
    if (cookie) headers.cookie = cookie
    const res = await fetch(base + url, { method, headers, body, redirect: 'manual' })
    for (const raw of res.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';')
      const idx = pair.indexOf('=')
      const key = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      if (key === 'token') cookie = value ? `token=${value}` : ''
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    return {
      status: res.status,
      headers: res.headers,
      buffer,
      text: () => buffer.toString('utf8'),
      json: () => JSON.parse(buffer.toString('utf8')),
    }
  }
  return {
    request,
    get: (url, opts) => request('GET', url, opts),
    post: (url, body, opts) => request('POST', url, { ...opts, body }),
    patch: (url, body, opts) => request('PATCH', url, { ...opts, body }),
    put: (url, body, opts) => request('PUT', url, { ...opts, body }),
    del: (url, opts) => request('DELETE', url, opts),
    delete: (url, opts) => request('DELETE', url, opts),
    clearCookie: () => { cookie = '' },
  }
}

const state = {}
const expectOk = (res, status = 200) => {
  assert.equal(res.status, status, `${res.status}: ${res.text()}`)
  const json = res.json()
  assert.equal(json.ok, true, JSON.stringify(json))
  return json
}
const expectBinary = (res, status = 200) => {
  assert.equal(res.status, status, `${res.status}: ${res.text()}`)
  assert.match(res.headers.get('content-type') || '', /spreadsheetml|octet-stream/)
  return res
}
const expectFail = (res, status) => {
  assert.equal(res.status, status, `${res.status}: ${res.text()}`)
  const json = res.json()
  assert.equal(json.ok, false, JSON.stringify(json))
  return json
}
async function login(c, email, password) {
  const json = expectOk(await c.post('/api/auth/login', { email, password }))
  assert.equal(json.data.email, email)
  return json.data
}
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()
const DAY = 86400000

test('TheachClass integration suite', async (t) => {
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await prisma.$disconnect()
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) } catch { /* best effort */ }
  })

  await t.test('health, authentication gate and bootstrap users', async () => {
    const health = expectOk(await client().get('/api/health'))
    assert.equal(health.service, 'TheachClass API')
    expectFail(await client().get('/api/classrooms'), 401)
    expectFail(await client().get('/api/auth/me'), 401)

    await prisma.user.create({
      data: {
        firstName: 'ผู้ดูแล', lastName: 'ทดสอบ', email: 'admin@test.local',
        passwordHash: await bcrypt.hash('admin123', 4), role: 'ADMIN', status: 'ACTIVE',
      },
    })
    state.adminC = client()
    state.admin = await login(state.adminC, 'admin@test.local', 'admin123')

    const mk = async (firstName, role, email, studentId) =>
      expectOk(await state.adminC.post('/api/users', {
        firstName, lastName: 'ทดสอบ', email, password: 'pass123',
        studentId, role, status: 'ACTIVE',
      })).data
    state.teacher = await mk('ครูเอก', 'TEACHER', 'teacher@test.local')
    state.teacher2 = await mk('ครูสอง', 'TEACHER', 'teacher2@test.local')
    state.student1 = await mk('นักเรียนหนึ่ง', 'STUDENT', 'student1@test.local', 'S001')
    state.student2 = await mk('นักเรียนสอง', 'STUDENT', 'student2@test.local', 'S002')
    state.student4 = await mk('นักเรียนสี่', 'STUDENT', 'student4@test.local', 'S004')
    state.teacherC = client()
    state.teacher2C = client()
    state.studentC = client()
    state.student2C = client()
    await login(state.teacherC, 'teacher@test.local', 'pass123')
    await login(state.teacher2C, 'teacher2@test.local', 'pass123')
    await login(state.studentC, 'student1@test.local', 'pass123')
    await login(state.student2C, 'student2@test.local', 'pass123')
  })

  await t.test('register, immediate login, suspension and password reset', async () => {
    const regC = client()
    const reg = expectOk(await regC.post('/api/auth/register', {
      firstName: 'นักเรียน', lastName: 'สาม', email: 'student3@test.local',
      password: 'pass123', role: 'STUDENT', studentId: 'S003',
    }), 200)
    assert.equal(reg.data.status, 'ACTIVE')
    assert.equal(reg.data.role, 'STUDENT')

    // สมัครด้วยตนเองต้องเป็นนักเรียนเสมอ แม้ส่ง role: 'TEACHER' มาใน body
    const forged = expectOk(await client().post('/api/auth/register', {
      firstName: 'พยายาม', lastName: 'สมัครครู', email: 'forged-teacher@test.local',
      password: 'pass123', role: 'TEACHER',
    }), 200)
    assert.equal(forged.data.role, 'STUDENT')
    assert.equal(forged.data.status, 'ACTIVE')

    // สมัครแล้วเข้าสู่ระบบได้ทันที ไม่ต้องรออนุมัติ
    state.student3 = await login(regC, 'student3@test.local', 'pass123')
    state.student3C = regC
    const welcomeNote = expectOk(await regC.get('/api/notifications')).data.items.find((n) => n.type === 'WELCOME')
    assert.ok(welcomeNote)

    // รหัสผิดต้องขึ้นข้อความตามที่กำหนด
    const badLogin = expectFail(await client().post('/api/auth/login', { email: 'student3@test.local', password: 'wrongpass' }), 401)
    assert.equal(badLogin.message, 'Gmail หรือ password ของท่านผิด')

    expectFail(await state.adminC.post('/api/auth/register', {
      firstName: 'ซ้ำ', lastName: 'อีเมล', email: 'student1@test.local', password: 'pass123',
    }), 409)
    expectFail(await state.adminC.patch(`/api/users/${state.student3.id}`, { status: 'SUSPENDED' }).then(() =>
      state.student3C.get('/api/auth/me')), 403)
    expectOk(await state.adminC.patch(`/api/users/${state.student3.id}`, { status: 'ACTIVE' }))
    // เปลี่ยนสถานะ -> tokenVersion เพิ่ม -> ต้องล็อกอินใหม่ (บังคับออกจากทุกอุปกรณ์)
    await login(state.student3C, 'student3@test.local', 'pass123')

    const forgot = expectOk(await client().post('/api/auth/forgot-password', { email: 'student1@test.local' }))
    assert.ok(forgot.data.token)
    expectFail(await client().post('/api/auth/reset-password', { token: forgot.data.token, newPassword: 'short' }), 400)
    expectOk(await client().post('/api/auth/reset-password', { token: forgot.data.token, newPassword: 'newpass123' }))
    expectFail(await client().post('/api/auth/reset-password', { token: forgot.data.token, newPassword: 'newpass123' }), 400)
    expectFail(await client().post('/api/auth/login', { email: 'student1@test.local', password: 'pass123' }), 401)
    await login(state.studentC, 'student1@test.local', 'newpass123')
  })

  await t.test('role checks on every protected area', async () => {
    expectFail(await state.studentC.get('/api/users'), 403)
    expectFail(await state.teacherC.get('/api/users'), 403)
    expectFail(await state.studentC.get('/api/admin/stats'), 403)
    expectFail(await state.teacherC.get('/api/admin/stats'), 403)
    expectFail(await state.studentC.get('/api/exports/full'), 403)
    expectFail(await state.studentC.post('/api/classrooms', { name: 'X' }), 403)
    expectFail(await state.teacherC.post('/api/attendance/checkin', { classroomId: 1, lat: 0, lng: 0 }), 403)
  })

  await t.test('classroom CRUD, join code, members and academic isolation', async () => {
    const created = expectOk(await state.teacherC.post('/api/classrooms', {
      name: 'วิทยาศาสตร์ ม.5/1', subject: 'วิทยาศาสตร์', subjectCode: 'SCI301',
      semester: '1', academicYear: '2026', gpsLat: 13.7563, gpsLng: 100.5018,
      gpsRadius: 100, attendanceOpen: true,
      weightAssignment: 30, weightCollection: 20, weightMidterm: 20, weightFinal: 30,
    }), 200)
    state.classroom = created.data
    assert.equal(state.classroom.joinCode.length, 8)
    assert.equal(state.classroom.gpsRadius, 100)

    const other = expectOk(await state.teacher2C.post('/api/classrooms', {
      name: 'คณิตศาสตร์ ม.5/2', subject: 'คณิตศาสตร์', subjectCode: 'MAT302',
      semester: '2', academicYear: '2025',
    }))
    state.otherClassroom = other.data

    const joined = expectOk(await state.studentC.post('/api/classrooms/join', { joinCode: state.classroom.joinCode.toLowerCase() }))
    assert.equal(joined.data.id, state.classroom.id)
    expectFail(await state.studentC.post('/api/classrooms/join', { joinCode: state.classroom.joinCode }), 409)
    expectFail(await state.studentC.post('/api/classrooms/join', { joinCode: 'BADCODE' }), 404)
    expectOk(await state.student2C.post('/api/classrooms/join', { joinCode: state.classroom.joinCode }))
    expectOk(await state.student3C.post('/api/classrooms/join', { joinCode: state.classroom.joinCode }))
    expectFail(await state.teacherC.post(`/api/classrooms/${state.classroom.id}/members`, { identifier: 'S001' }), 409)
    const added = expectOk(await state.teacherC.post(`/api/classrooms/${state.classroom.id}/members`, { identifier: 'S004' }))
    assert.equal(added.data.id, state.student4.id)
    expectFail(await state.teacherC.post(`/api/classrooms/${state.classroom.id}/members`, { identifier: 'student4@test.local' }), 409)
    expectOk(await state.teacherC.delete(`/api/classrooms/${state.classroom.id}/members/${state.student4.id}`))
    const members = expectOk(await state.teacherC.get(`/api/classrooms/${state.classroom.id}/students`)).data
    assert.equal(members.length, 3)

    expectFail(await state.teacher2C.get(`/api/classrooms/${state.classroom.id}`), 403)
    expectFail(await state.student2C.get(`/api/classrooms/${state.otherClassroom.id}`), 403)
    expectFail(await state.studentC.patch(`/api/classrooms/${state.classroom.id}`, { name: 'Hack' }), 403)
    expectFail(await state.teacher2C.patch(`/api/classrooms/${state.classroom.id}`, { name: 'Hack' }), 403)

    // แยกห้องตามเจ้าของ: ครูแต่ละคนเห็นเฉพาะห้องของตัวเอง ผู้ดูแลเห็นทุกห้อง
    const teacher1List = expectOk(await state.teacherC.get('/api/classrooms')).data.map((c) => c.id)
    const teacher2List = expectOk(await state.teacher2C.get('/api/classrooms')).data.map((c) => c.id)
    assert.ok(teacher1List.includes(state.classroom.id))
    assert.ok(!teacher1List.includes(state.otherClassroom.id))
    assert.deepEqual(teacher2List, [state.otherClassroom.id])
    const adminList = expectOk(await state.adminC.get('/api/classrooms')).data.map((c) => c.id)
    assert.ok(adminList.includes(state.classroom.id) && adminList.includes(state.otherClassroom.id))

    const filtered = expectOk(await state.teacherC.get('/api/classrooms?semester=1&academicYear=2026&subjectCode=SCI301')).data
    assert.deepEqual(filtered.map((c) => c.id), [state.classroom.id])
    assert.equal(expectOk(await state.teacherC.get('/api/classrooms?semester=2')).data.length, 0)
    const mine = expectOk(await state.studentC.get('/api/classrooms')).data
    assert.deepEqual(mine.map((c) => c.id), [state.classroom.id])

    expectOk(await state.teacherC.patch(`/api/classrooms/${state.classroom.id}`, { gpsRadius: 120, lateAfterMinutes: 15 }))
    assert.equal(expectOk(await state.teacherC.get(`/api/classrooms/${state.classroom.id}`)).data.gpsRadius, 120)

    const temp = expectOk(await state.adminC.post('/api/classrooms', {
      name: 'ห้องลบทดสอบ', subject: 'ทดสอบ', subjectCode: 'TMP001', teacherId: state.teacher.id,
    })).data
    expectFail(await state.adminC.patch(`/api/classrooms/${temp.id}`, { teacherId: state.student1.id }), 400)
    expectOk(await state.adminC.delete(`/api/classrooms/${temp.id}`))
    expectFail(await state.teacherC.get(`/api/classrooms/${temp.id}`), 404)
  })

  await t.test('GPS check-in: radius, duplicate, window, anomaly, manual status and history', async () => {
    const cid = state.classroom.id
    expectFail(await state.studentC.post('/api/attendance/checkin', { classroomId: cid }), 400)
    const inside = expectOk(await state.studentC.post('/api/attendance/checkin', {
      classroomId: cid, lat: 13.75631, lng: 100.50181, accuracy: 12,
    }))
    assert.equal(inside.data.status, 'PRESENT')
    assert.ok(inside.data.distanceM < 5)
    assert.equal(inside.data.warnings.length, 0)
    const duplicate = expectFail(await state.studentC.post('/api/attendance/checkin', {
      classroomId: cid, lat: 13.75631, lng: 100.50181,
    }), 409)
    assert.equal(duplicate.code, 'DUPLICATE')

    const outside = expectFail(await state.student2C.post('/api/attendance/checkin', {
      classroomId: cid, lat: 13.8, lng: 100.6,
    }), 403)
    assert.equal(outside.message, 'คุณอยู่นอกพื้นที่เช็กชื่อ')
    assert.equal(outside.code, 'OUT_OF_RANGE')
    assert.ok(outside.distanceM > 100)

    expectOk(await state.teacherC.patch(`/api/classrooms/${cid}`, { checkinOpenAt: iso(DAY) }))
    expectFail(await state.student3C.post('/api/attendance/checkin', {
      classroomId: cid, lat: 13.7563, lng: 100.5018,
    }), 403)
    expectOk(await state.teacherC.patch(`/api/classrooms/${cid}`, { checkinOpenAt: iso(-2 * 3600000), checkinCloseAt: iso(-3600000) }))
    expectFail(await state.student3C.post('/api/attendance/checkin', {
      classroomId: cid, lat: 13.7563, lng: 100.5018,
    }), 403)
    expectOk(await state.teacherC.patch(`/api/classrooms/${cid}`, {
      checkinOpenAt: iso(-30 * 60000), checkinCloseAt: null, lateAfterMinutes: 15,
    }))
    const late = expectOk(await state.student3C.post('/api/attendance/checkin', {
      classroomId: cid, lat: 13.7563, lng: 100.5018,
    }))
    assert.equal(late.data.status, 'LATE')

    const anomaly = expectOk(await state.student2C.post('/api/attendance/checkin', {
      classroomId: cid, lat: 13.7563, lng: 100.5018, accuracy: 400,
    }))
    assert.ok(anomaly.data.warnings.some((w) => w.includes('ความคลาดเคลื่อน GPS สูง')))
    assert.match(anomaly.data.note, /ตรวจจับความผิดปกติ/)
    const teacherNotes = expectOk(await state.teacherC.get('/api/notifications?limit=100')).data.items
    const anomalyNote = teacherNotes.find((n) => n.type === 'GPS_ANOMALY')
    assert.ok(anomalyNote)
    assert.match(anomalyNote.body, /ไม่สามารถยืนยันการปลอม GPS ได้ 100%/)

    expectFail(await state.studentC.get(`/api/attendance/classroom/${cid}`), 403)
    const own = expectOk(await state.studentC.get('/api/attendance/me')).data
    assert.ok(own.length >= 1)
    assert.ok(own.every((r) => r.userId === state.student1.id))

    const manual = expectOk(await state.teacherC.post('/api/attendance', {
      classroomId: cid, userId: state.student1.id, date: '2026-01-15', status: 'ABSENT', note: 'ทดสอบ',
    }))
    expectFail(await state.teacherC.post('/api/attendance', {
      classroomId: cid, userId: state.student1.id, date: '2026-01-15', status: 'ABSENT',
    }), 409)
    const changed = expectOk(await state.teacherC.patch(`/api/attendance/${manual.data.id}`, {
      status: 'LEAVE', reason: 'มีใบรับรองแพทย์',
    }))
    assert.equal(changed.data.status, 'LEAVE')
    const history = expectOk(await state.teacherC.get(`/api/attendance/${manual.data.id}/history`)).data
    assert.equal(history.length, 1)
    assert.equal(history[0].oldStatus, 'ABSENT')
    assert.equal(history[0].newStatus, 'LEAVE')
    assert.equal(history[0].reason, 'มีใบรับรองแพทย์')
    expectFail(await state.studentC.patch(`/api/attendance/${manual.data.id}`, { status: 'PRESENT' }), 403)

    const board = expectOk(await state.teacherC.get(`/api/attendance/classroom/${cid}?date=2026-01-15`)).data
    assert.equal(board.summary.total, 3)
    assert.equal(board.summary.LEAVE, 1)
    const report = expectOk(await state.teacherC.get(`/api/attendance/report/${cid}`)).data
    assert.equal(report.items.length, 3)
    assert.ok(report.overall.total >= 4)
  })

  await t.test('round-based check-in, leave requests and student leave notifications', async () => {
    const round = expectOk(await state.teacherC.post('/api/classrooms', {
      name: 'รอบเช็กชื่อทดสอบ', subject: 'การเช็กชื่อตามรอบ', subjectCode: 'RND101',
      semester: '1', academicYear: '2026', gpsRadius: 100, lateAfterMinutes: 15,
      attendanceOpen: false,
      weightAssignment: 30, weightCollection: 20, weightMidterm: 20, weightFinal: 30,
    })).data
    state.roundClassroom = round
    assert.equal(round.attendanceOpen, false)
    expectOk(await state.student2C.post('/api/classrooms/join', { joinCode: round.joinCode }))
    expectOk(await state.student3C.post('/api/classrooms/join', { joinCode: round.joinCode }))

    // ยังไม่มีรอบ → นักเรียนเช็กไม่ได้แม้ห้องจะมีพิกัดสำรอง
    const before = expectFail(await state.student2C.post('/api/attendance/checkin', {
      classroomId: round.id, lat: 13.75, lng: 100.5,
    }), 400)
    assert.match(before.message, /ครูยังไม่ได้เปิดรอบเช็กชื่อ/)
    expectFail(await state.student2C.post('/api/attendance/sessions', {
      classroomId: round.id, lat: 13.75, lng: 100.5,
    }), 403)

    const opened = expectOk(await state.teacherC.post('/api/attendance/sessions', {
      classroomId: round.id, title: 'คาบเช็กชื่อรอบที่ 1', lat: 13.75, lng: 100.5,
      accuracy: 12, gpsRadius: 80, durationMinutes: 30,
    })).data
    assert.equal(opened.session.status, 'OPEN')
    assert.equal(opened.session.gpsLat, 13.75)
    assert.equal(opened.session.gpsRadius, 80)
    assert.equal(expectOk(await state.teacherC.get(`/api/classrooms/${round.id}`)).data.attendanceOpen, true)

    const active = expectOk(await state.student2C.get('/api/attendance/sessions/active')).data
    assert.ok(active.some((s) => s.id === opened.session.id))
    expectFail(await state.teacherC.post('/api/attendance/sessions', {
      classroomId: round.id, lat: 13.75, lng: 100.5,
    }), 409)

    const checked = expectOk(await state.student2C.post('/api/attendance/checkin', {
      classroomId: round.id, lat: 13.75001, lng: 100.50001, accuracy: 15,
    })).data
    assert.equal(checked.sessionId, opened.session.id)
    assert.ok(checked.distanceM < 5)
    const duplicate = expectFail(await state.student2C.post('/api/attendance/checkin', {
      classroomId: round.id, lat: 13.75, lng: 100.5,
    }), 409)
    assert.equal(duplicate.code, 'DUPLICATE')
    const outside = expectFail(await state.student3C.post('/api/attendance/checkin', {
      classroomId: round.id, lat: 13.8, lng: 100.6,
    }), 403)
    assert.equal(outside.code, 'OUT_OF_RANGE')

    const leave = expectOk(await state.student2C.post('/api/leaves', {
      classroomId: round.id, reason: 'ลาป่วย มีใบรับรองแพทย์',
    })).data
    assert.equal(leave.status, 'PENDING')
    expectFail(await state.student2C.post('/api/leaves', {
      classroomId: round.id, reason: 'ลาซ้ำวันเดียวกัน',
    }), 409)
    const teacherNotes = expectOk(await state.teacherC.get('/api/notifications?limit=100')).data.items
    assert.ok(teacherNotes.some((n) => n.type === 'LEAVE_REQUEST' && n.link === `/attendance?leave=${leave.id}`))
    expectFail(await state.teacher2C.patch(`/api/leaves/${leave.id}/review`, { status: 'APPROVED' }), 403)
    assert.equal(expectOk(await state.student3C.get('/api/leaves')).data.items.length, 0)
    // ต้องไม่ให้ครูคนอื่นใช้ ?classroomId= อ่านคำร้องลาของห้องที่ตนไม่ได้สอน
    const ownLeaves = expectOk(await state.teacherC.get(`/api/leaves?classroomId=${round.id}`)).data
    assert.ok(ownLeaves.items.some((i) => i.id === leave.id))
    expectFail(await state.teacher2C.get(`/api/leaves?classroomId=${round.id}`), 404)

    expectOk(await state.teacherC.post(`/api/attendance/sessions/${opened.session.id}/close`, {}))
    const afterClose = expectFail(await state.student3C.post('/api/attendance/checkin', {
      classroomId: round.id, lat: 13.75, lng: 100.5,
    }), 403)
    assert.match(afterClose.message, /ครูยังไม่เปิดรอบเช็กชื่อ/)
    assert.equal(expectOk(await state.teacherC.get(`/api/attendance/sessions?classroomId=${round.id}`)).data[0].status, 'CLOSED')

    const approved = expectOk(await state.teacherC.patch(`/api/leaves/${leave.id}/review`, {
      status: 'APPROVED', reviewNote: 'ได้รับการลาแล้ว',
    })).data
    assert.equal(approved.status, 'APPROVED')
    assert.ok(approved.attendanceId)
    const board = expectOk(await state.teacherC.get(`/api/attendance/classroom/${round.id}?date=${leave.date}`)).data
    assert.equal(board.items.find((i) => i.user.id === state.student2.id).status, 'LEAVE')
    const leaveNotes = expectOk(await state.student2C.get('/api/notifications?limit=100')).data.items
    assert.ok(leaveNotes.some((n) => n.type === 'LEAVE_APPROVED'))
  })

  await t.test('leave attachments: image-only validation, storage and access control', async () => {
    // PNG 1x1 จริง (ตรวจ signature ได้)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const imageForm = new FormData()
    imageForm.append('files', new Blob([png], { type: 'image/png' }), 'ใบรับรองแพทย์.png')
    const image = expectOk(await state.studentC.request('POST', '/api/upload', { form: imageForm })).data[0]
    assert.match(image.url, /^\/api\/files\/.+\.png$/)

    const textForm = new FormData()
    textForm.append('files', new Blob(['ไม่ใช่รูปภาพ'], { type: 'text/plain' }), 'note.txt')
    const textFile = expectOk(await state.adminC.request('POST', '/api/upload', { form: textForm })).data[0]
    expectFail(await state.studentC.post('/api/leaves', {
      classroomId: state.classroom.id, reason: 'ลาป่วยแนบเอกสาร', attachments: [textFile],
    }), 400)
    expectFail(await state.studentC.post('/api/leaves', {
      classroomId: state.classroom.id, reason: 'ลาป่วยแนบเอกสาร',
      attachments: [{ ...image, url: '/api/files/../secret.png' }],
    }), 400)
    expectFail(await state.studentC.post('/api/leaves', {
      classroomId: state.classroom.id, reason: 'ลาป่วยแนบเอกสาร',
      attachments: [image, image, image, image],
    }), 400)

    const leave = expectOk(await state.studentC.post('/api/leaves', {
      classroomId: state.classroom.id, reason: 'ลาป่วยแนบใบรับรองแพทย์', attachments: [image],
    })).data
    assert.equal(leave.attachments.length, 1)
    assert.equal(leave.attachments[0].url, image.url)

    const teacherView = expectOk(await state.teacherC.get(`/api/leaves?classroomId=${state.classroom.id}`))
      .data.items.find((i) => i.id === leave.id)
    assert.equal(teacherView.attachments[0].url, image.url)
    const studentView = expectOk(await state.studentC.get('/api/leaves')).data.items.find((i) => i.id === leave.id)
    assert.equal(studentView.attachments[0].url, image.url)

    const shown = await state.teacherC.get(image.url)
    assert.equal(shown.status, 200)
    assert.match(shown.headers.get('content-type') || '', /image\/png/)
    assert.match(shown.headers.get('content-disposition') || '', /inline/)
    assert.equal((await state.studentC.get(image.url)).status, 200)
    // นักเรียนคนอื่น (แม้เรียนห้องเดียวกัน) ต้องไม่เห็นรูปคำร้องของผู้อื่น
    expectFail(await state.student2C.get(image.url), 403)
  })

  await t.test('leave types and hourly leave during the day', async () => {
    const hourlyClass = expectOk(await state.teacherC.post('/api/classrooms', {
      name: 'ลารายชั่วโมงทดสอบ', subject: 'การลารายชั่วโมง', subjectCode: 'HR101',
      semester: '1', academicYear: '2026',
      weightAssignment: 30, weightCollection: 20, weightMidterm: 20, weightFinal: 30,
    })).data
    expectOk(await state.student2C.post('/api/classrooms/join', { joinCode: hourlyClass.joinCode }))
    const send = (body) => state.student2C.post('/api/leaves', { classroomId: hourlyClass.id, reason: 'ไปพบแพทย์ช่วงเช้า', ...body })

    expectFail(await send({ leaveType: 'VACATION', reason: 'ประเภทลาไม่ถูกต้อง' }), 400)
    expectFail(await send({ leaveType: 'SICK', isHourly: true }), 400)
    expectFail(await send({ leaveType: 'SICK', isHourly: true, startTime: '9:00', endTime: '11:00' }), 400)
    expectFail(await send({ leaveType: 'SICK', isHourly: true, startTime: '11:00', endTime: '10:00' }), 400)
    expectFail(await send({ leaveType: 'SICK', isHourly: true, startTime: '00:00', endTime: '23:00' }), 400)

    const sick = expectOk(await send({ leaveType: 'SICK', isHourly: true, startTime: '09:00', endTime: '11:00' })).data
    assert.equal(sick.leaveType, 'SICK')
    assert.equal(sick.isHourly, true)
    assert.equal(sick.startTime, '09:00')
    assert.equal(sick.endTime, '11:00')
    // ช่วงต่อเนื่องขอเพิ่มได้ แต่ช่วงที่ทับกันต้องถูกปฏิเสธ
    const personal = expectOk(await send({ leaveType: 'PERSONAL', reason: 'ลากิจช่วงเที่ยง', isHourly: true, startTime: '11:00', endTime: '12:00' })).data
    assert.equal(personal.leaveType, 'PERSONAL')
    expectFail(await send({ leaveType: 'SICK', isHourly: true, startTime: '10:30', endTime: '11:30' }), 409)
    // ยังไม่สามารถส่งลาทั้งวันซ้ำกับวันที่มีคำร้องรายชั่วโมงอยู่แล้ว
    expectFail(await send({ leaveType: 'SICK', reason: 'ลาทั้งวันซ้ำ' }), 409)

    const teacherView = expectOk(await state.teacherC.get(`/api/leaves?classroomId=${hourlyClass.id}`))
      .data.items.find((i) => i.id === sick.id)
    assert.equal(teacherView.leaveType, 'SICK')
    assert.deepEqual([teacherView.startTime, teacherView.endTime], ['09:00', '11:00'])

    // อนุมัติลารายชั่วโมงต้องไม่เปลี่ยนสถานะการเข้าเรียนทั้งวัน
    const approved = expectOk(await state.teacherC.patch(`/api/leaves/${sick.id}/review`, { status: 'APPROVED' })).data
    assert.equal(approved.status, 'APPROVED')
    let board = expectOk(await state.teacherC.get(`/api/attendance/classroom/${hourlyClass.id}?date=${sick.date}`)).data
    assert.notEqual(board.items.find((i) => i.user.id === state.student2.id).status, 'LEAVE')

    // ถ้ามีบันทึกเข้าเรียนอยู่แล้ว ให้ผูกช่วงเวลาเป็นหมายเหตุโดยคงสถานะเดิม
    expectOk(await state.teacherC.post('/api/attendance', {
      classroomId: hourlyClass.id, userId: state.student2.id, date: sick.date,
      status: 'PRESENT', note: 'เข้าเรียนคาบแรก',
    }))
    const afternoon = expectOk(await send({ leaveType: 'PERSONAL', reason: 'ลากิจช่วงบ่าย', isHourly: true, startTime: '13:00', endTime: '14:00' })).data
    const afternoonApproved = expectOk(await state.teacherC.patch(`/api/leaves/${afternoon.id}/review`, { status: 'APPROVED' })).data
    assert.ok(afternoonApproved.attendanceId)
    board = expectOk(await state.teacherC.get(`/api/attendance/classroom/${hourlyClass.id}?date=${sick.date}`)).data
    const row = board.items.find((i) => i.user.id === state.student2.id)
    assert.equal(row.status, 'PRESENT')
    assert.match(row.record?.note || '', /ลารายชั่วโมง 13:00–14:00 น\./)
    const history = expectOk(await state.teacherC.get(`/api/attendance/${afternoonApproved.attendanceId}/history`)).data
    assert.ok(history.some((log) => log.reason?.includes('ลารายชั่วโมง')))
    // อนุมัติซ้ำต้องไม่บันทึกหมายเหตุ/ประวัติซ้ำ
    expectOk(await state.teacherC.patch(`/api/leaves/${afternoon.id}/review`, { status: 'APPROVED' }))
    board = expectOk(await state.teacherC.get(`/api/attendance/classroom/${hourlyClass.id}?date=${sick.date}`)).data
    const note = board.items.find((i) => i.user.id === state.student2.id).record?.note || ''
    assert.equal(note.match(/ลารายชั่วโมง 13:00–14:00 น\./g)?.length, 1)
    assert.equal(expectOk(await state.teacherC.get(`/api/attendance/${afternoonApproved.attendanceId}/history`)).data.length, history.length)

    // คำร้องเก่าที่ไม่ส่งประเภทยังใช้ OTHER ได้ (ย้อนหลัง)
    const legacy = expectOk(await state.student3C.post('/api/leaves', {
      classroomId: state.roundClassroom.id, reason: 'ลาทั่วไปแบบเก่า',
    })).data
    assert.equal(legacy.leaveType, 'OTHER')
    assert.equal(legacy.isHourly, false)
  })

  await t.test('file upload/download restrictions and assignment submission/grading', async () => {
    const fd = new FormData()
    fd.append('files', new Blob(['เนื้อหางานทดสอบ'], { type: 'text/plain' }), 'homework.txt')
    const upload = expectOk(await state.studentC.request('POST', '/api/upload', { form: fd }))
    assert.equal(upload.data.length, 1)
    assert.equal(upload.data[0].name, 'homework.txt')
    assert.match(upload.data[0].url, /^\/api\/files\//)
    state.file = upload.data[0]

    const bad = new FormData()
    bad.append('files', new Blob(['MZ'], { type: 'application/octet-stream' }), 'virus.exe')
    expectFail(await state.studentC.request('POST', '/api/upload', { form: bad }), 400)

    const privateFd = new FormData()
    privateFd.append('files', new Blob(['งานส่วนตัวของนักเรียนหนึ่ง'], { type: 'text/plain' }), 'private.txt')
    const privateUpload = expectOk(await state.studentC.request('POST', '/api/upload', { form: privateFd }))
    state.privateFile = privateUpload.data[0]

    const assignment = expectOk(await state.teacherC.post('/api/assignments', {
      classroomId: state.classroom.id, title: 'งานที่ 1: ปฏิบัติการ',
      description: 'ส่งรายงาน', dueAt: iso(2 * DAY), maxScore: 100,
      attachments: [state.file],
    }))
    state.assignment = assignment.data
    assert.equal(state.assignment.attachments.length, 1)

    expectFail(await state.teacher2C.patch(`/api/assignments/${state.assignment.id}`, { title: 'Hack' }), 403)
    const assignments = expectOk(await state.studentC.get('/api/assignments')).data
    assert.ok(assignments.some((a) => a.id === state.assignment.id))
    expectOk(await state.teacherC.post(`/api/assignments/${state.assignment.id}/toggle`, { isOpen: false }))
    expectFail(await state.studentC.post('/api/submissions', {
      assignmentId: state.assignment.id, note: 'ส่งช้าปิดรับแล้ว',
    }), 403)
    expectOk(await state.teacherC.post(`/api/assignments/${state.assignment.id}/toggle`, { isOpen: true }))
    expectOk(await state.teacherC.patch(`/api/assignments/${state.assignment.id}`, { description: 'ส่งรายงานฉบับแก้ไข' }))
    const updatedNote = expectOk(await state.studentC.get(`/api/assignments/${state.assignment.id}`)).data
    assert.equal(updatedNote.description, 'ส่งรายงานฉบับแก้ไข')

    const submitted = expectOk(await state.studentC.post('/api/submissions', {
      assignmentId: state.assignment.id, files: [state.privateFile], note: 'ส่งงานตามกำหนด',
    }))
    assert.equal(submitted.data.attempt, 1)
    assert.equal(submitted.data.isLate, false)
    expectFail(await state.studentC.post('/api/submissions', { assignmentId: state.assignment.id }), 400)
    const resubmit = expectOk(await state.studentC.post('/api/submissions', {
      assignmentId: state.assignment.id, note: 'ส่งใหม่',
    }))
    assert.equal(resubmit.data.attempt, 2)

    // หน้ารายการงานต้องบอกสถานะการส่งของนักเรียนได้เลย โดยไม่ต้องกดเข้าดูรายละเอียด
    const listWithStatus = expectOk(await state.studentC.get('/api/assignments')).data
    const myRow = listWithStatus.find((a) => a.id === state.assignment.id)
    assert.equal(myRow.mySubmission.attempt, 2)
    assert.equal(myRow.mySubmission.status, 'SUBMITTED')
    assert.equal(myRow.mySubmission.score, null)
    const otherRow = expectOk(await state.student2C.get('/api/assignments')).data
      .find((a) => a.id === state.assignment.id)
    assert.equal(otherRow.mySubmission, null)

    const lateAssignment = expectOk(await state.teacherC.post('/api/assignments', {
      classroomId: state.classroom.id, title: 'งานส่งช้า', dueAt: iso(-DAY),
      allowLate: true, latePenaltyPercent: 20, maxScore: 100,
    }))
    const lateSubmission = expectOk(await state.studentC.post('/api/submissions', {
      assignmentId: lateAssignment.data.id, note: 'ส่งช้า',
    }))
    assert.equal(lateSubmission.data.isLate, true)

    // นักเรียนเห็นเฉพาะงานที่ตนขาดส่ง (กำหนดส่งผ่านแล้วและยังไม่ส่ง)
    const missed = expectOk(await state.student2C.get('/api/assignments/missed')).data
    assert.ok(missed.some((a) => a.id === lateAssignment.data.id && a.isMissed))
    assert.ok(!missed.some((a) => a.id === state.assignment.id))
    const missedAlt = expectOk(await state.student2C.get('/api/submissions/missed')).data
    assert.deepEqual(missedAlt.map((a) => a.id), missed.map((a) => a.id))
    expectFail(await state.teacherC.get('/api/assignments/missed'), 403)

    const ownSubs = expectOk(await state.student2C.get('/api/submissions/me')).data
    assert.equal(ownSubs.length, 0)

    const grading = expectOk(await state.teacherC.get(`/api/submissions/assignment/${state.assignment.id}`)).data
    assert.equal(grading.stats.submitted, 1)
    assert.equal(grading.stats.missing, 2)
    expectFail(await state.studentC.post(`/api/submissions/${submitted.data.id}/grade`, { score: 90 }), 403)
    expectFail(await state.teacherC.post(`/api/submissions/${submitted.data.id}/grade`, { score: 150 }), 400)
    expectOk(await state.teacherC.post(`/api/submissions/${submitted.data.id}/grade`, { score: 90, feedback: 'ดีมาก' }))
    expectOk(await state.teacherC.post(`/api/submissions/${submitted.data.id}/grade`, { score: 80, feedback: 'ปรับคะแนน' }))
    const gradedRow = expectOk(await state.studentC.get('/api/assignments')).data
      .find((a) => a.id === state.assignment.id)
    // ครูตรวจความพยายามครั้งที่ 1 ส่วนการ์ดต้องสะท้อนครั้งล่าสุด (ครั้งที่ 2)
    assert.equal(gradedRow.mySubmission.attempt, 2)
    assert.equal(gradedRow.mySubmission.status, 'SUBMITTED')
    const scoreHistory = expectOk(await state.teacherC.get(`/api/submissions/${submitted.data.id}/history`)).data
    assert.equal(scoreHistory.length, 2)
    assert.equal(scoreHistory[0].newScore, 80)
    assert.equal(scoreHistory[0].oldScore, 90)
    assert.equal(scoreHistory[1].oldScore, null)

    const studentNotifications = expectOk(await state.studentC.get('/api/notifications?limit=100')).data.items
    assert.ok(studentNotifications.some((n) => n.type === 'GRADED' && n.body.includes('80/100')))

    // เมื่อครูตรวจความพยายามล่าสุด การ์ดงานต้องเปลี่ยนเป็น “ตรวจแล้ว” พร้อมคะแนนทันที
    expectOk(await state.teacherC.post(`/api/submissions/${resubmit.data.id}/grade`, { score: 80, feedback: 'ตรวจครั้งล่าสุด' }))
    const latestGradedRow = expectOk(await state.studentC.get('/api/assignments')).data
      .find((a) => a.id === state.assignment.id)
    assert.equal(latestGradedRow.mySubmission.status, 'GRADED')
    assert.equal(latestGradedRow.mySubmission.score, 80)

    const download = await state.studentC.request('GET', state.privateFile.url)
    assert.equal(download.status, 200)
    assert.equal(download.text(), 'งานส่วนตัวของนักเรียนหนึ่ง')
    expectFail(await state.student2C.request('GET', state.privateFile.url), 403)
    assert.equal((await state.student2C.request('GET', state.file.url)).status, 200)
    // ครูเห็นไฟล์ในห้องตัวเองเท่านั้น
    expectFail(await state.teacher2C.request('GET', state.privateFile.url), 403)
    assert.equal((await state.teacherC.request('GET', state.privateFile.url)).status, 200)
    expectFail(await state.studentC.get('/api/files/not-exist.txt'), 404)
  })

  await t.test('scores, weights, grade scales, auto recalculation and announcements', async () => {
    const cid = state.classroom.id
    expectFail(await state.studentC.get(`/api/grades/classroom/${cid}`), 403)
    for (const [category, score] of [['COLLECTION', 90], ['MIDTERM', 80], ['FINAL', 100]]) {
      expectOk(await state.teacherC.post(`/api/grades/classroom/${cid}/score`, {
        userId: state.student1.id, category, score, maxScore: 100, note: 'ทดสอบ',
      }))
    }
    expectFail(await state.teacherC.post(`/api/grades/classroom/${cid}/score`, {
      userId: state.student2.id, category: 'BAD', score: 10,
    }), 400)
    expectFail(await state.teacherC.post(`/api/grades/classroom/${cid}/score`, {
      userId: 99999, category: 'MIDTERM', score: 10,
    }), 404)

    const grades = expectOk(await state.teacherC.get(`/api/grades/classroom/${cid}`)).data
    const row1 = grades.items.find((r) => r.id === state.student1.id)
    // งาน 80/200 × 30 = 12, เก็บ 18, กลางภาค 16, ปลายภาค 30 = 76
    assert.equal(row1.assignmentRaw, 80)
    assert.equal(row1.assignmentWeighted, 12)
    assert.equal(row1.categories.COLLECTION, 18)
    assert.equal(row1.categories.MIDTERM, 16)
    assert.equal(row1.categories.FINAL, 30)
    assert.equal(row1.total, 76)
    assert.equal(row1.grade, 'B+')
    assert.equal(row1.passed, true)
    const row2 = grades.items.find((r) => r.id === state.student2.id)
    assert.equal(row2.total, 0)
    assert.equal(row2.grade, 'F')

    const mine = expectOk(await state.studentC.get(`/api/grades/me?classroomId=${cid}`)).data
    assert.equal(mine.id, state.student1.id)
    assert.equal(mine.total, 76)
    const allMine = expectOk(await state.studentC.get('/api/grades/me')).data
    assert.equal(allMine.length, 1)
    assert.equal(allMine[0].result.total, 76)

    expectFail(await state.teacherC.patch(`/api/grades/classroom/${cid}/weights`, {
      ASSIGNMENT: 50, COLLECTION: 20, MIDTERM: 20, FINAL: 30,
    }), 400)
    expectOk(await state.teacherC.patch(`/api/grades/classroom/${cid}/weights`, {
      ASSIGNMENT: 40, COLLECTION: 20, MIDTERM: 20, FINAL: 20, ACTIVITY: 0, BONUS: 0,
    }))
    assert.equal(expectOk(await state.studentC.get(`/api/grades/me?classroomId=${cid}`)).data.total, 70)
    expectOk(await state.teacherC.patch(`/api/grades/classroom/${cid}/weights`, {
      ASSIGNMENT: 30, COLLECTION: 20, MIDTERM: 20, FINAL: 30, ACTIVITY: 0, BONUS: 0,
    }))

    expectOk(await state.teacherC.put(`/api/grades/classroom/${cid}/scales`, {
      scales: [{ grade: 'A', minScore: 90, maxScore: 100 }, { grade: 'B', minScore: 75, maxScore: 89.99 }, { grade: 'F', minScore: 0, maxScore: 74.99 }],
    }))
    assert.equal(expectOk(await state.studentC.get(`/api/grades/me?classroomId=${cid}`)).data.grade, 'B')
    expectOk(await state.teacherC.put(`/api/grades/classroom/${cid}/scales`, {
      scales: [
        { grade: 'A', minScore: 80, maxScore: 100 }, { grade: 'B+', minScore: 75, maxScore: 79.99 },
        { grade: 'B', minScore: 70, maxScore: 74.99 }, { grade: 'C+', minScore: 65, maxScore: 69.99 },
        { grade: 'C', minScore: 60, maxScore: 64.99 }, { grade: 'D+', minScore: 55, maxScore: 59.99 },
        { grade: 'D', minScore: 50, maxScore: 54.99 }, { grade: 'F', minScore: 0, maxScore: 49.99 },
      ],
    }))

    const gradeHistory = expectOk(await state.teacherC.get(`/api/grades/classroom/${cid}/history?userId=${state.student1.id}`)).data
    assert.equal(gradeHistory.length, 3)
    const scoreNote = expectOk(await state.studentC.get('/api/notifications?unread=true&limit=100')).data.items
      .find((n) => n.type === 'SCORE_UPDATED')
    assert.ok(scoreNote)

    const announcement = expectOk(await state.teacherC.post('/api/announcements', {
      classroomId: cid, title: 'ประกาศสอบ', body: 'สอบวันศุกร์', pinned: true,
    }))
    assert.equal(announcement.data.pinned, true)
    const studentAnnouncements = expectOk(await state.studentC.get('/api/announcements')).data
    assert.ok(studentAnnouncements.some((a) => a.id === announcement.data.id))
    assert.equal(expectOk(await state.student2C.get('/api/announcements')).data.length >= 1, true)
    assert.equal(expectOk(await state.teacher2C.get('/api/announcements')).data.length, 0)
    expectOk(await state.teacherC.patch(`/api/announcements/${announcement.data.id}`, { pinned: false }))
    expectOk(await state.teacherC.delete(`/api/announcements/${announcement.data.id}`))
  })

  await t.test('notifications isolation and read state', async () => {
    const before = expectOk(await state.studentC.get('/api/notifications')).data
    assert.ok(before.unread > 0)
    const otherNote = before.items.find((n) => n.userId !== state.student1.id)
    assert.equal(otherNote, undefined)
    const first = before.items[0]
    expectFail(await state.student2C.post(`/api/notifications/${first.id}/read`), 404)
    expectOk(await state.studentC.post(`/api/notifications/${first.id}/read`))
    assert.equal(expectOk(await state.studentC.get('/api/notifications')).data.items.find((n) => n.id === first.id).isRead, true)
    expectOk(await state.studentC.post('/api/notifications/read-all'))
    assert.equal(expectOk(await state.studentC.get('/api/notifications')).data.unread, 0)
    const count = expectOk(await state.studentC.get('/api/notifications')).data.total
    expectOk(await state.studentC.del(`/api/notifications/${first.id}`))
    assert.equal(expectOk(await state.studentC.get('/api/notifications')).data.total, count - 1)
  })

  await t.test('dashboards for student, teacher and admin', async () => {
    const student = expectOk(await state.studentC.get('/api/dashboard')).data
    assert.equal(student.role, 'STUDENT')
    assert.equal(student.classrooms.length, 1)
    assert.ok(student.stats.upcoming >= 0)
    assert.equal(typeof student.stats.missed, 'number')
    assert.ok(Array.isArray(student.missed))
    assert.equal(student.grades[0].total, 76)
    const teacher = expectOk(await state.teacherC.get('/api/dashboard')).data
    assert.equal(teacher.role, 'TEACHER')
    assert.equal(teacher.stats.classrooms, expectOk(await state.teacherC.get('/api/classrooms')).data.length)
    assert.equal(typeof teacher.stats.pendingLeaves, 'number')
    assert.ok(Array.isArray(teacher.pendingLeaves))
    assert.equal(teacher.attendanceTrend.length, 7)
    const admin = expectOk(await state.adminC.get('/api/dashboard')).data
    assert.equal(admin.role, 'ADMIN')
    assert.ok(admin.stats.pending >= 0)
    assert.ok(Array.isArray(admin.auditLogs))
  })

  await t.test('admin stats, settings, audit, academics, usage and backup', async () => {
    const stats = expectOk(await state.adminC.get('/api/admin/stats')).data
    assert.ok(stats.users >= 6)
    assert.equal(stats.teachers, 2)
    assert.ok(stats.classrooms >= 3)
    const settings = expectOk(await state.adminC.put('/api/admin/settings', {
      REMINDER_HOURS: '24,12,1', GPS_DEFAULT_RADIUS: '150', ATTENDANCE_LATE_MINUTES: '20',
    })).data
    assert.equal(settings.GPS_DEFAULT_RADIUS, '150')
    assert.equal(expectOk(await state.adminC.get('/api/admin/settings')).data.ATTENDANCE_LATE_MINUTES, '20')
    const academics = expectOk(await state.adminC.get('/api/admin/academics')).data
    assert.ok(academics.semesters.includes('1'))
    assert.ok(academics.subjects.some((s) => s.code === 'SCI301'))
    const usage = expectOk(await state.adminC.get('/api/admin/usage')).data
    assert.ok(usage.logins > 0)
    const logs = expectOk(await state.adminC.get('/api/admin/audit-logs?limit=200')).data
    assert.ok(logs.total > 10)
    assert.ok(logs.items.some((l) => l.action === 'CHECKIN'))
    const searchedLogs = expectOk(await state.adminC.get('/api/admin/audit-logs?search=CHECKIN&limit=200')).data
    assert.ok(searchedLogs.total > 0)
    assert.ok(searchedLogs.items.every((l) => /CHECKIN/.test(l.action)))
    expectFail(await state.adminC.delete(`/api/users/${state.teacher.id}`), 400)
    expectFail(await state.adminC.delete(`/api/users/${state.admin.id}`), 400)

    const backup = await state.adminC.get('/api/admin/backup')
    assert.equal(backup.status, 200)
    assert.match(backup.headers.get('content-disposition'), /theachclass-backup/)
    const data = backup.json()
    assert.ok(data.tables.users.length >= 6)
    assert.equal('passwordHash' in data.tables.users[0], false)
    assert.ok(data.tables.attendance.length >= 4)
    assert.ok(data.tables.attendanceSessions.length >= 1)
    assert.ok(data.tables.leaveRequests.length >= 1)
    assert.ok(data.tables.auditLogs.length > 10)
  })

  await t.test('Excel exports: 6 sheets, correct pass status and filters', async () => {
    const full = expectBinary(await state.teacherC.get(`/api/exports/full?classroomId=${state.classroom.id}`))
    assert.equal(full.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    assert.match(full.headers.get('content-disposition'), /\.xlsx/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(full.buffer)
    assert.deepEqual(wb.worksheets.map((ws) => ws.name).sort(), [
      'ข้อมูลนักเรียน', 'สรุปการเข้าเรียน', 'สรุปภาพรวม', 'สรุปผลการเรียน', 'คะแนนสอบ', 'คะแนนงาน',
    ].sort())
    const resultWs = wb.getWorksheet('สรุปผลการเรียน')
    let s1, s2
    resultWs.eachRow((row) => {
      if (row.values[2] === 'S001') s1 = row
      if (row.values[2] === 'S002') s2 = row
    })
    assert.ok(s1 && s2)
    assert.equal(s1.values[6].result, 'B+')
    assert.equal(s1.values[7].result, 'ผ่าน')
    assert.equal(s2.values[7].result, 'ไม่ผ่าน')
    const summary = wb.getWorksheet('สรุปภาพรวม')
    assert.ok(summary)
    assert.equal(summary.getCell('B5').value, 3)

    const attendance = expectBinary(await state.teacherC.get(`/api/exports/attendance?classroomId=${state.classroom.id}`))
    const grades = expectBinary(await state.teacherC.get(`/api/exports/grades?classroomId=${state.classroom.id}`))
    const grading = expectBinary(await state.teacherC.get(`/api/exports/grading?classroomId=${state.classroom.id}`))
    for (const res of [attendance, grades, grading]) assert.ok(res.buffer.length > 5000)
    const adminFull = expectBinary(await state.adminC.get('/api/exports/full'))
    assert.ok(adminFull.buffer.length > 5000)
    expectFail(await state.teacherC.get('/api/exports/full?classroomId=99999'), 404)
    expectFail(await state.teacher2C.get(`/api/exports/full?classroomId=${state.classroom.id}`), 404)

    // ตัวกรองรายวิชาต้องมาจากห้องที่ครูคนนั้นสอนเท่านั้น
    const teacherOptions = expectOk(await state.teacherC.get('/api/exports/options')).data
    assert.equal(teacherOptions.scope, 'OWN')
    assert.ok(teacherOptions.subjects.some((s) => s.code === 'SCI301'))
    assert.ok(!teacherOptions.subjects.some((s) => s.code === 'MAT302'))
    const adminOptions = expectOk(await state.adminC.get('/api/exports/options')).data
    assert.equal(adminOptions.scope, 'ALL')
    assert.ok(adminOptions.subjects.some((s) => s.code === 'MAT302'))

    // แม้ส่งวิชาของครูคนอื่นมาตรง ๆ ก็ต้องไม่ได้ไฟล์
    expectFail(await state.teacherC.get('/api/exports/full?subjectCode=MAT302'), 404)
    expectBinary(await state.teacherC.get('/api/exports/full?subjectCode=SCI301'))
  })

  await t.test('classroom score Excel filename and admin role/bulk management', async () => {
    // สรุปคะแนนทุกคนในห้องเรียน ชื่อไฟล์ต้องเป็นชื่อห้องเรียน
    const scoreFile = expectBinary(await state.teacherC.get(`/api/exports/student-scores?classroomId=${state.classroom.id}`))
    const rawDisposition = scoreFile.headers.get('content-disposition') || ''
    const disposition = decodeURIComponent(rawDisposition)
    assert.match(disposition, /วิทยาศาสตร์_ม\.5-1_สรุปคะแนน\.xlsx/)
    assert.match(disposition, /filename\*=UTF-8''/)
    assert.match(rawDisposition, /filename="classroom-\d+-scores\.xlsx"/)
    assert.equal(scoreFile.buffer.subarray(0, 2).toString(), 'PK', 'ต้องเป็นไฟล์ .xlsx (ZIP) จริง ๆ')
    const scoreWb = new ExcelJS.Workbook()
    await scoreWb.xlsx.load(scoreFile.buffer)
    const sheet = scoreWb.getWorksheet('สรุปคะแนนทั้งหมด')
    assert.ok(sheet)
    const header = sheet.getRow(1).values
    const totalCol = header.findIndex((v) => v === 'คะแนนรวมทั้งหมด')
    const gradeCol = header.findIndex((v) => v === 'เกรด')
    let s1
    sheet.eachRow((row) => { if (row.values[2] === 'S001') s1 = row })
    assert.ok(s1)
    assert.equal(s1.values[totalCol], 76)
    assert.equal(s1.values[gradeCol], 'B+')
    expectFail(await state.teacherC.get('/api/exports/student-scores'), 400)
    expectFail(await state.teacher2C.get(`/api/exports/student-scores?classroomId=${state.classroom.id}`), 404)
    expectFail(await state.studentC.get(`/api/exports/student-scores?classroomId=${state.classroom.id}`), 403)

    // ผู้ดูแลมอบสิทธิ์/เปลี่ยนสถานะได้ทั้งแบบรายคนและหลายบัญชี
    const secondAdmin = expectOk(await state.adminC.post('/api/users', {
      firstName: 'ผู้ดูแลสอง', lastName: 'ทดสอบ', email: 'admin2@test.local',
      password: 'pass123', role: 'ADMIN', status: 'ACTIVE',
    })).data
    expectFail(await state.teacherC.post('/api/users/bulk', { ids: [state.student4.id], role: 'TEACHER' }), 403)
    expectFail(await state.adminC.patch(`/api/users/${state.admin.id}`, { role: 'STUDENT' }), 400)
    expectFail(await state.adminC.patch(`/api/users/${state.admin.id}`, { status: 'SUSPENDED' }), 400)

    const promoted = expectOk(await state.adminC.patch(`/api/users/${state.student4.id}`, { role: 'TEACHER' })).data
    assert.equal(promoted.role, 'TEACHER')
    const student4C = client()
    await login(student4C, 'student4@test.local', 'pass123')
    const roleNotes = expectOk(await student4C.get('/api/notifications?limit=100')).data.items
    assert.ok(roleNotes.some((n) => n.type === 'ROLE_CHANGED'))
    const roleLogs = expectOk(await state.adminC.get('/api/admin/audit-logs?action=CHANGE_ROLE&limit=20')).data.items
    assert.ok(roleLogs.every((l) => l.action === 'CHANGE_ROLE'))

    const bulk = expectOk(await state.adminC.post('/api/users/bulk', {
      ids: [state.student4.id, state.admin.id], role: 'STUDENT',
    }))
    assert.equal(bulk.data.updated, 1)
    assert.deepEqual(bulk.data.skipped, [state.admin.id])
    assert.equal(expectOk(await state.adminC.get(`/api/users?search=student4@test.local`)).data.items[0].role, 'STUDENT')
    const bulkStatus = expectOk(await state.adminC.post('/api/users/bulk', {
      ids: [state.student4.id], status: 'SUSPENDED',
    }))
    assert.equal(bulkStatus.data.updated, 1)
    expectOk(await state.adminC.post('/api/users/bulk', { ids: [state.student4.id], status: 'ACTIVE' }))
    const bulkLogs = expectOk(await state.adminC.get('/api/admin/audit-logs?action=BULK_UPDATE_USER&limit=20')).data.items
    assert.ok(bulkLogs.length >= 2)
    expectOk(await state.adminC.delete(`/api/users/${secondAdmin.id}`))
  })

  await t.test('reminder scheduler: configurable deadline and overdue notifications', async () => {
    const soon = expectOk(await state.teacherC.post('/api/assignments', {
      classroomId: state.classroom.id, title: 'งานแจ้งเตือน 1 ชม.', dueAt: iso(3600000), maxScore: 10,
    }))
    await runReminders()
    let notes = expectOk(await state.studentC.get('/api/notifications?limit=100')).data.items
    assert.ok(notes.some((n) => n.type === 'DEADLINE_1H' && n.link === `/assignments/${soon.data.id}`))
    await runReminders()
    notes = expectOk(await state.studentC.get('/api/notifications?limit=100')).data.items
    assert.equal(notes.filter((n) => n.type === 'DEADLINE_1H' && n.link === `/assignments/${soon.data.id}`).length, 1)

    const overdue = expectOk(await state.teacherC.post('/api/assignments', {
      classroomId: state.classroom.id, title: 'งานเกินกำหนด', dueAt: iso(-DAY), maxScore: 10,
    }))
    await runReminders()
    notes = expectOk(await state.studentC.get('/api/notifications?limit=100')).data.items
    assert.ok(notes.some((n) => n.type === 'OVERDUE' && n.link === `/assignments/${overdue.data.id}`))

    expectOk(await state.adminC.put('/api/admin/settings', { REMINDER_HOURS: '2' }))
    const twoHours = expectOk(await state.teacherC.post('/api/assignments', {
      classroomId: state.classroom.id, title: 'งานแจ้งเตือน 2 ชม.', dueAt: iso(2 * 3600000), maxScore: 10,
    }))
    await runReminders()
    notes = expectOk(await state.studentC.get('/api/notifications?limit=100')).data.items
    assert.ok(notes.some((n) => n.type === 'DEADLINE_2H' && n.link === `/assignments/${twoHours.data.id}`))
  })

  await t.test('profile and avatar upload for all three roles', async () => {
    // PNG 1x1 จริง (ตรวจ signature ได้) ใช้อัปโหลดทดสอบ
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const avatarForm = () => {
      const fd = new FormData()
      fd.append('avatar', new Blob([png], { type: 'image/png' }), 'avatar.png')
      return fd
    }

    const roles = [
      ['ADMIN', state.adminC], ['TEACHER', state.teacherC], ['STUDENT', state.studentC],
    ]
    for (const [label, c] of roles) {
      // แก้ข้อมูลส่วนตัวได้ทุกสิทธิ์
      const updated = expectOk(await c.patch('/api/profile', { phone: '0810000123', firstName: `ชื่อ${label}` })).data
      assert.equal(updated.phone, '0810000123')
      assert.equal(updated.firstName, `ชื่อ${label}`)
      assert.equal(expectOk(await c.get('/api/auth/me')).data.phone, '0810000123')

      // อัปโหลดรูปได้ทุกสิทธิ์
      const uploaded = expectOk(await c.request('POST', '/api/profile/avatar', { form: avatarForm() })).data
      assert.match(uploaded.avatarUrl, /^\/api\/profile\/avatar\/avatar-\d+-/)
      assert.equal(expectOk(await c.get('/api/auth/me')).data.avatarUrl, uploaded.avatarUrl)
      state[`${label.toLowerCase()}Avatar`] = uploaded.avatarUrl

      // เสิร์ฟรูปให้ผู้ใช้ที่ล็อกอินคนอื่นเห็นได้
      const image = await c.get(uploaded.avatarUrl)
      assert.equal(image.status, 200)
      assert.match(image.headers.get('content-type'), /image\/png/)
      assert.equal(image.buffer.subarray(0, 4).toString('hex'), '89504e47')
    }

    // ครูเห็นชื่อ-นามสกุลและรูปโปรไฟล์ของนักเรียนในหน้าสมาชิกของห้องเรียน
    const memberView = expectOk(await state.teacherC.get(`/api/classrooms/${state.classroom.id}/students`)).data
      .find((m) => m.id === state.student1.id)
    assert.ok(memberView)
    assert.equal(memberView.firstName, 'ชื่อSTUDENT')
    assert.equal(memberView.lastName, state.student1.lastName)
    assert.equal(memberView.avatarUrl, state.studentAvatar)

    // ปฏิเสธไฟล์ที่ไม่ใช่รูป / ของปลอมที่renameเป็น .png
    const badForm = new FormData()
    badForm.append('avatar', new Blob([Buffer.from('not an image')], { type: 'image/png' }), 'fake.png')
    expectFail(await state.studentC.request('POST', '/api/profile/avatar', { form: badForm }), 400)
    const pdfForm = new FormData()
    pdfForm.append('avatar', new Blob([png], { type: 'application/pdf' }), 'avatar.pdf')
    expectFail(await state.studentC.request('POST', '/api/profile/avatar', { form: pdfForm }), 400)
    expectFail(await state.studentC.request('POST', '/api/profile/avatar', { form: new FormData() }), 400)

    // ต้องล็อกอินก่อนถึงจะดูรูปได้
    const anon = client()
    expectFail(await anon.get(state.adminAvatar), 401)

    // ผู้ดูแลลบรูปของคนอื่นได้ / นักเรียนลบของคนอื่นไม่ได้
    expectFail(await state.studentC.delete(`/api/users/${state.teacher.id}/avatar`), 403)
    expectOk(await state.adminC.delete(`/api/users/${state.teacher.id}/avatar`))
    assert.equal(expectOk(await state.teacherC.get('/api/auth/me')).data.avatarUrl, null)

    // ลบรูปตัวเองแล้วไฟล์หายไปจริง
    expectOk(await state.studentC.delete('/api/profile/avatar'))
    assert.equal(expectOk(await state.studentC.get('/api/auth/me')).data.avatarUrl, null)
    expectFail(await state.studentC.get(state.studentAvatar), 404)

    const avatarLogs = expectOk(await state.adminC.get('/api/admin/audit-logs?action=UPLOAD_AVATAR&limit=50')).data.items
    assert.equal(avatarLogs.length, 3)
    assert.ok(expectOk(await state.adminC.get('/api/admin/audit-logs?action=DELETE_AVATAR&limit=50')).data.items.length >= 2)
  })

  await t.test('logout invalidates the session', async () => {
    const c = client()
    await login(c, 'student2@test.local', 'pass123')
    expectOk(await c.get('/api/auth/me'))
    expectOk(await c.post('/api/auth/logout'))
    expectFail(await c.get('/api/auth/me'), 401)
  })
})
