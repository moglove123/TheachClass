import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import {
  ApiError, asyncHandler, ok, haversine, bangkokDateKey, thaiDateTime,
  audit, notify, notifyMany, assertClassroomAccess,
} from '../utils.js'

export const attendanceRouter = Router()
attendanceRouter.use(requireAuth)

const statuses = ['PRESENT', 'LATE', 'ABSENT', 'LEAVE']

const openSessionFilter = (now = new Date()) => ({
  status: 'OPEN',
  openedAt: { lte: now },
  OR: [{ closesAt: null }, { closesAt: { gte: now } }],
})

export async function findActiveSession(classroomId, now = new Date()) {
  return prisma.attendanceSession.findFirst({
    where: { classroomId, ...openSessionFilter(now) },
    orderBy: { openedAt: 'desc' },
  })
}

async function scopedClassroomIds(user) {
  if (user.role === 'ADMIN') return null
  if (user.role === 'TEACHER') {
    const rows = await prisma.classroom.findMany({ where: { teacherId: user.id }, select: { id: true } })
    return rows.map((c) => c.id)
  }
  const rows = await prisma.enrollment.findMany({ where: { userId: user.id }, select: { classroomId: true } })
  return rows.map((e) => e.classroomId)
}

/** นักเรียนเช็กชื่อใน “รอบที่ครูเปิดตอนนี้” โดยระบบใช้พิกัดที่ส่งมาจากอุปกรณ์โดยตรง */
attendanceRouter.post('/checkin', asyncHandler(async (req, res) => {
  if (req.user.role !== 'STUDENT') throw new ApiError(403, 'เฉพาะนักเรียนเท่านั้นที่เช็กชื่อได้')
  const classroomId = Number(req.body?.classroomId)
  const lat = Number(req.body?.lat)
  const lng = Number(req.body?.lng)
  const accuracy = Number(req.body?.accuracy || 0)
  if (!classroomId || !Number.isFinite(lat) || !Number.isFinite(lng))
    throw new ApiError(400, 'ข้อมูลตำแหน่งไม่ถูกต้อง กรุณาอนุญาตการเข้าถึง GPS')

  const classroom = await assertClassroomAccess(req.user, classroomId)
  const now = new Date()
  const session = await findActiveSession(classroomId, now)

  let gpsLat, gpsLng, radius, lateAfterMinutes
  if (session) {
    gpsLat = session.gpsLat
    gpsLng = session.gpsLng
    radius = session.gpsRadius
    lateAfterMinutes = session.lateAfterMinutes
  } else {
    // รองรับข้อมูล/สคริปต์เดิมที่ยังใช้ปุ่มเปิดเช็กชื่อแบบเก่า
    if (classroom.gpsLat == null || classroom.gpsLng == null)
      throw new ApiError(400, 'ครูยังไม่ได้เปิดรอบเช็กชื่อ หรือยังไม่ได้กำหนดตำแหน่งสถานที่เรียน')
    if (!classroom.attendanceOpen) throw new ApiError(403, 'ครูยังไม่เปิดรอบเช็กชื่อในขณะนี้')
    if (classroom.checkinOpenAt && now < new Date(classroom.checkinOpenAt))
      throw new ApiError(403, 'ยังไม่ถึงเวลาเปิดเช็กชื่อ')
    if (classroom.checkinCloseAt && now > new Date(classroom.checkinCloseAt))
      throw new ApiError(403, 'ปิดเช็กชื่อแล้ว')
    gpsLat = classroom.gpsLat
    gpsLng = classroom.gpsLng
    radius = classroom.gpsRadius
    lateAfterMinutes = classroom.lateAfterMinutes
  }

  const distanceM = haversine(lat, lng, gpsLat, gpsLng)
  if (distanceM > radius)
    throw new ApiError(403, 'คุณอยู่นอกพื้นที่เช็กชื่อ', { code: 'OUT_OF_RANGE', distanceM: Math.round(distanceM) })

  const date = bangkokDateKey(now)
  const existing = await prisma.attendance.findUnique({
    where: { classroomId_userId_date: { classroomId, userId: req.user.id, date } },
  })
  if (existing) throw new ApiError(409, 'คุณเช็กชื่อไปแล้วสำหรับวันนี้', { code: 'DUPLICATE', checkinAt: existing.checkinAt })

  const warnings = []
  if (accuracy > 150) warnings.push(`ความคลาดเคลื่อน GPS สูง (${Math.round(accuracy)} เมตร)`)
  const previous = await prisma.attendance.findFirst({
    where: { userId: req.user.id, checkinAt: { not: null } },
    orderBy: { checkinAt: 'desc' },
    select: { lat: true, lng: true, checkinAt: true },
  })
  if (previous?.lat != null && previous?.lng != null && previous.checkinAt) {
    const hours = (now.getTime() - new Date(previous.checkinAt).getTime()) / 3600000
    if (hours > 0 && hours < 24) {
      const speedKmh = haversine(previous.lat, previous.lng, lat, lng) / 1000 / hours
      if (speedKmh > 800) warnings.push(`ความเร็วการเดินทางผิดปกติ (${Math.round(speedKmh)} กม./ชม.)`)
    }
  }

  const openedAt = session?.openedAt ?? classroom.checkinOpenAt
  const late = openedAt
    ? now.getTime() > new Date(openedAt).getTime() + lateAfterMinutes * 60000
    : false
  const status = late ? 'LATE' : 'PRESENT'
  const record = await prisma.attendance.create({
    data: {
      classroomId, userId: req.user.id, date, status, checkinAt: now,
      lat, lng, distanceM, sessionId: session?.id ?? null,
      note: warnings.length ? `ตรวจจับความผิดปกติ: ${warnings.join(', ')}` : null,
    },
  })
  if (warnings.length)
    await notify(classroom.teacherId, 'GPS_ANOMALY', 'ตรวจพบความผิดปกติของตำแหน่ง GPS',
      `${req.user.firstName} ${req.user.lastName}: ${warnings.join(', ')} (ระบบตรวจจับเบื้องต้น ไม่สามารถยืนยันการปลอม GPS ได้ 100%)`,
      '/attendance')
  await audit(req.user.id, 'CHECKIN', 'Attendance', record.id, {
    classroomId, sessionId: session?.id ?? null, distanceM: Math.round(distanceM), status,
  })
  ok(res, { ...record, distanceM: Math.round(distanceM), warnings, sessionId: session?.id ?? null }, 'เช็กชื่อสำเร็จ')
}))

/** ครูเปิดรอบเช็กชื่อโดยระบบใช้ “ตำแหน่งปัจจุบันของครู” เป็นจุดอ้างอิง */
attendanceRouter.post('/sessions', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.body?.classroomId, { teacherOnly: true })
  const b = req.body ?? {}
  const lat = Number(b.lat)
  const lng = Number(b.lng)
  const accuracy = Number(b.accuracy || 0)
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    throw new ApiError(400, 'ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาอนุญาต GPS ในเบราว์เซอร์')

  const now = new Date()
  const existing = await findActiveSession(classroom.id, now)
  if (existing) throw new ApiError(409, 'มีรอบเช็กชื่อเปิดอยู่แล้ว กรุณาปิดรอบก่อนเปิดรอบใหม่')

  const radius = Number(b.gpsRadius ?? classroom.gpsRadius ?? 100)
  if (!Number.isFinite(radius) || radius < 10 || radius > 5000)
    throw new ApiError(400, 'รัศมีเช็กชื่อต้องอยู่ระหว่าง 10 ถึง 5000 เมตร')
  const lateAfterMinutes = Number(b.lateAfterMinutes ?? classroom.lateAfterMinutes ?? 15)
  if (!Number.isFinite(lateAfterMinutes) || lateAfterMinutes < 0)
    throw new ApiError(400, 'เวลามาสายไม่ถูกต้อง')

  let closesAt
  if (b.closesAt) {
    closesAt = new Date(b.closesAt)
    if (Number.isNaN(closesAt.getTime()) || closesAt <= now)
      throw new ApiError(400, 'เวลาปิดรอบต้องอยู่ในอนาคต')
  } else {
    const minutes = Number(b.durationMinutes ?? 30)
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480)
      throw new ApiError(400, 'ระยะเวลาเปิดรอบต้องอยู่ระหว่าง 1 ถึง 480 นาที')
    closesAt = new Date(now.getTime() + minutes * 60000)
  }

  const date = bangkokDateKey(now)
  const session = await prisma.attendanceSession.create({
    data: {
      classroomId: classroom.id,
      title: String(b.title || `รอบเช็กชื่อ ${date}`),
      date, status: 'OPEN', gpsLat: lat, gpsLng: lng, gpsRadius: radius,
      lateAfterMinutes, openedAt: now, closesAt, createdById: req.user.id,
    },
  })
  await prisma.classroom.update({
    where: { id: classroom.id },
    data: {
      gpsLat: lat, gpsLng: lng, gpsRadius: radius, lateAfterMinutes,
      attendanceOpen: true, checkinOpenAt: now, checkinCloseAt: closesAt,
    },
  })
  const ids = (await prisma.enrollment.findMany({
    where: { classroomId: classroom.id }, select: { userId: true },
  })).map((e) => e.userId)
  await notifyMany(ids, 'CHECKIN_OPEN', 'เปิดรอบเช็กชื่อแล้ว',
    `${classroom.name}: ${session.title} เปิดถึง ${thaiDateTime(closesAt)} (พิกัดอ้างอิงจากตำแหน่งปัจจุบันของครู)`,
    `/attendance?session=${session.id}`)
  await audit(req.user.id, 'OPEN_ATTENDANCE_SESSION', 'AttendanceSession', session.id, {
    classroomId: classroom.id, gpsLat: lat, gpsLng: lng, gpsRadius: radius,
    accuracy: Math.round(accuracy), closesAt,
  })
  ok(res, { session, classroomId: classroom.id }, 'เปิดรอบเช็กชื่อแล้ว นักเรียนจะได้รับการแจ้งเตือน')
}))

attendanceRouter.post('/sessions/:id/close', asyncHandler(async (req, res) => {
  const existing = await prisma.attendanceSession.findUnique({ where: { id: Number(req.params.id) } })
  if (!existing) throw new ApiError(404, 'ไม่พบรอบเช็กชื่อ')
  const classroom = await assertClassroomAccess(req.user, existing.classroomId, { teacherOnly: true })
  if (existing.status === 'OPEN') {
    await prisma.attendanceSession.update({
      where: { id: existing.id }, data: { status: 'CLOSED', closedAt: new Date() },
    })
    const stillOpen = await findActiveSession(existing.classroomId)
    if (!stillOpen) {
      await prisma.classroom.update({
        where: { id: classroom.id },
        data: { attendanceOpen: false, checkinCloseAt: new Date() },
      })
    }
    const ids = (await prisma.enrollment.findMany({
      where: { classroomId: classroom.id }, select: { userId: true },
    })).map((e) => e.userId)
    await notifyMany(ids, 'CHECKIN_CLOSED', 'ปิดรอบเช็กชื่อแล้ว',
      `${classroom.name}: ${existing.title} ปิดแล้ว`, `/attendance?session=${existing.id}`)
    await audit(req.user.id, 'CLOSE_ATTENDANCE_SESSION', 'AttendanceSession', existing.id, { classroomId: classroom.id })
  }
  ok(res, { id: existing.id, status: 'CLOSED' }, 'ปิดรอบเช็กชื่อแล้ว')
}))

attendanceRouter.get('/sessions/active', asyncHandler(async (req, res) => {
  const now = new Date()
  const ids = await scopedClassroomIds(req.user)
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      ...openSessionFilter(now),
      ...(ids === null ? {} : { classroomId: { in: ids.length ? ids : [-1] } }),
    },
    include: { classroom: { select: { id: true, name: true, subject: true } } },
    orderBy: { openedAt: 'desc' },
  })
  ok(res, sessions.map((s) => ({
    ...s,
    remainingMs: s.closesAt ? Math.max(0, new Date(s.closesAt).getTime() - now.getTime()) : null,
  })))
}))

attendanceRouter.get('/sessions', asyncHandler(async (req, res) => {
  const where = {}
  if (req.query.classroomId) {
    const classroom = await assertClassroomAccess(req.user, req.query.classroomId, { teacherOnly: true })
    where.classroomId = classroom.id
  } else {
    const ids = await scopedClassroomIds(req.user)
    if (ids !== null) where.classroomId = { in: ids.length ? ids : [-1] }
  }
  if (req.query.status) where.status = String(req.query.status)
  const items = await prisma.attendanceSession.findMany({
    where,
    include: {
      classroom: { select: { id: true, name: true } },
      creator: { select: { firstName: true, lastName: true } },
      _count: { select: { attendances: true } },
    },
    orderBy: { openedAt: 'desc' },
    take: 100,
  })
  ok(res, items)
}))

attendanceRouter.post('/', asyncHandler(async (req, res) => {
  if (!req.body?.classroomId) throw new ApiError(400, 'กรุณาระบุห้องเรียน')
  const classroom = await assertClassroomAccess(req.user, req.body.classroomId, { teacherOnly: true })
  const { userId, date, status, note } = req.body ?? {}
  if (!statuses.includes(status)) throw new ApiError(400, 'สถานะไม่ถูกต้อง')
  const target = await prisma.enrollment.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: Number(userId) } },
  })
  if (!target) throw new ApiError(404, 'ไม่พบนักเรียนในห้องเรียนนี้')
  const day = String(date || bangkokDateKey())
  const existing = await prisma.attendance.findUnique({
    where: { classroomId_userId_date: { classroomId: classroom.id, userId: Number(userId), date: day } },
  })
  if (existing) throw new ApiError(409, 'มีข้อมูลเช็กชื่อของวันนี้อยู่แล้ว กรุณาแก้ไขสถานะแทน')
  const record = await prisma.attendance.create({
    data: {
      classroomId: classroom.id, userId: Number(userId), date: day, status, note: note || null,
      recordedBy: req.user.id,
    },
  })
  await notify(Number(userId), 'ATTENDANCE_UPDATED', 'อัปเดตสถานะการเข้าเรียน',
    `ครูบันทึกสถานะ ${status} เมื่อ ${day}`)
  await audit(req.user.id, 'MANUAL_ATTENDANCE', 'Attendance', record.id, { userId, status, date: day })
  ok(res, record, 'บันทึกการเข้าเรียนสำเร็จ')
}))

attendanceRouter.get('/classroom/:classroomId', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.classroomId, { teacherOnly: true })
  const date = String(req.query.date || bangkokDateKey())
  const enrollments = await prisma.enrollment.findMany({
    where: { classroomId: classroom.id },
    include: { user: { select: { id: true, studentId: true, firstName: true, lastName: true, email: true } } },
    orderBy: { user: { studentId: 'asc' } },
  })
  const records = await prisma.attendance.findMany({
    where: { classroomId: classroom.id, date },
    include: { logs: { orderBy: { createdAt: 'desc' } } },
  })
  const byUser = new Map(records.map((r) => [r.userId, r]))
  const items = enrollments.map((e) => ({
    user: e.user,
    record: byUser.get(e.userId) ?? null,
    status: byUser.get(e.userId)?.status ?? 'ABSENT',
  }))
  const summary = {
    PRESENT: items.filter((i) => i.status === 'PRESENT').length,
    LATE: items.filter((i) => i.status === 'LATE').length,
    ABSENT: items.filter((i) => i.status === 'ABSENT').length,
    LEAVE: items.filter((i) => i.status === 'LEAVE').length,
    total: items.length,
  }
  const [sessions, activeSession] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { classroomId: classroom.id },
      include: { _count: { select: { attendances: true } } },
      orderBy: { openedAt: 'desc' }, take: 10,
    }),
    findActiveSession(classroom.id),
  ])
  ok(res, {
    date,
    classroom: {
      id: classroom.id, name: classroom.name, attendanceOpen: classroom.attendanceOpen,
      checkinOpenAt: classroom.checkinOpenAt, checkinCloseAt: classroom.checkinCloseAt,
      gpsLat: classroom.gpsLat, gpsLng: classroom.gpsLng, gpsRadius: classroom.gpsRadius,
    },
    sessions, activeSession, items, summary,
  })
}))

attendanceRouter.get('/me', asyncHandler(async (req, res) => {
  const where = { userId: req.user.id }
  if (req.query.classroomId) where.classroomId = Number(req.query.classroomId)
  const items = await prisma.attendance.findMany({
    where,
    include: {
      classroom: { select: { id: true, name: true, subject: true } },
      session: { select: { id: true, title: true, openedAt: true, status: true } },
    },
    orderBy: { date: 'desc' },
  })
  ok(res, items)
}))

attendanceRouter.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.attendance.findUnique({ where: { id: Number(req.params.id) } })
  if (!existing) throw new ApiError(404, 'ไม่พบข้อมูลการเข้าเรียน')
  await assertClassroomAccess(req.user, existing.classroomId, { teacherOnly: true })
  const status = String(req.body?.status || '')
  if (!statuses.includes(status)) throw new ApiError(400, 'สถานะไม่ถูกต้อง')
  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: { status, note: req.body.note ?? existing.note, recordedBy: req.user.id },
  })
  await prisma.attendanceLog.create({
    data: {
      attendanceId: record.id, classroomId: record.classroomId, userId: record.userId,
      oldStatus: existing.status, newStatus: status, reason: req.body.reason || req.body.note || null,
      changedBy: req.user.id,
    },
  })
  await notify(record.userId, 'ATTENDANCE_CHANGED', 'เปลี่ยนสถานะการเข้าเรียน',
    `ครูเปลี่ยนสถานะวันที่ ${record.date} เป็น ${status}`)
  await audit(req.user.id, 'UPDATE_ATTENDANCE', 'Attendance', record.id, { from: existing.status, to: status })
  ok(res, record, 'อัปเดตสถานะการเข้าเรียนสำเร็จ')
}))

attendanceRouter.get('/:id/history', asyncHandler(async (req, res) => {
  const record = await prisma.attendance.findUnique({ where: { id: Number(req.params.id) } })
  if (!record) throw new ApiError(404, 'ไม่พบข้อมูลการเข้าเรียน')
  await assertClassroomAccess(req.user, record.classroomId)
  const logs = await prisma.attendanceLog.findMany({
    where: { attendanceId: record.id }, include: { editor: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  })
  ok(res, logs)
}))

attendanceRouter.get('/report/:classroomId', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.classroomId, { teacherOnly: true })
  const records = await prisma.attendance.findMany({ where: { classroomId: classroom.id } })
  const enrollments = await prisma.enrollment.count({ where: { classroomId: classroom.id } })
  const byUser = {}
  for (const r of records) {
    byUser[r.userId] ??= { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0, total: 0 }
    byUser[r.userId][r.status] = (byUser[r.userId][r.status] || 0) + 1
    byUser[r.userId].total++
  }
  const users = await prisma.user.findMany({
    where: { enrollments: { some: { classroomId: classroom.id } } },
    select: { id: true, studentId: true, firstName: true, lastName: true },
    orderBy: { studentId: 'asc' },
  })
  const items = users.map((u) => ({
    ...u, ...(byUser[u.id] || { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0, total: 0 }),
    percentage: byUser[u.id]?.total ? Math.round(((byUser[u.id].PRESENT + byUser[u.id].LATE) / byUser[u.id].total) * 100) : 0,
  }))
  const overall = items.reduce((acc, i) => {
    acc.PRESENT += i.PRESENT; acc.LATE += i.LATE; acc.ABSENT += i.ABSENT; acc.LEAVE += i.LEAVE; acc.total += i.total
    return acc
  }, { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0, total: 0 })
  ok(res, { items, overall, enrollments, checkedAt: thaiDateTime(new Date()) })
}))
