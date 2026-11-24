import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, requireRole, userSelect } from './auth.js'
import { ApiError, asyncHandler, ok, paginate, audit, thaiDateTime } from '../utils.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireRole('ADMIN'))

const defaultSettings = {
  REMINDER_HOURS: '24,12,1',
  GPS_DEFAULT_RADIUS: '100',
  ATTENDANCE_LATE_MINUTES: '15',
  SUBMISSION_DEFAULT_DAYS: '7',
  ACADEMIC_YEAR: String(new Date().getFullYear()),
  SEMESTER: '1',
}

async function getSettings() {
  const rows = await prisma.setting.findMany()
  return { ...defaultSettings, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }
}

adminRouter.get('/stats', asyncHandler(async (req, res) => {
  const [users, teachers, students, pending, classrooms, assignments, submissions, attendance, notifications] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { status: 'PENDING' } }),
      prisma.classroom.count(),
      prisma.assignment.count(),
      prisma.submission.count(),
      prisma.attendance.count(),
      prisma.notification.count(),
    ])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const todayAttendance = await prisma.attendance.count({ where: { date: today } })
  const byRole = await prisma.user.groupBy({ by: ['role'], _count: { _all: true } })
  ok(res, {
    users, teachers, students, pending, classrooms, assignments, submissions, attendance,
    todayAttendance, notifications,
    byRole: byRole.map((r) => ({ role: r.role, count: r._count._all })),
    generatedAt: thaiDateTime(new Date()),
  })
}))

adminRouter.get('/settings', asyncHandler(async (req, res) => {
  ok(res, await getSettings())
}))

adminRouter.put('/settings', asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body ?? {}).filter(([, v]) => v !== undefined && v !== null)
  await prisma.$transaction(entries.map(([key, value]) =>
    prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } })))
  await audit(req.user.id, 'UPDATE_SETTINGS', 'Setting', null, Object.fromEntries(entries))
  ok(res, await getSettings(), 'อัปเดตการตั้งค่าระบบสำเร็จ')
}))

adminRouter.get('/audit-logs', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query)
  const search = String(req.query?.search || '').trim()
  const action = String(req.query?.action || '').trim()
  const where = action ? { action: { contains: action } } : {}
  if (search) Object.assign(where, {
    OR: [
      { action: { contains: search } },
      { entity: { contains: search } },
      { actor: { is: { firstName: { contains: search } } } },
      { actor: { is: { lastName: { contains: search } } } },
      { actor: { is: { email: { contains: search } } } },
    ],
  })
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' }, skip, take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])
  ok(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
}))

adminRouter.get('/academics', asyncHandler(async (req, res) => {
  const classrooms = await prisma.classroom.findMany({
    select: { semester: true, academicYear: true, subject: true, subjectCode: true },
  })
  ok(res, {
    semesters: [...new Set(classrooms.map((c) => c.semester))].sort(),
    years: [...new Set(classrooms.map((c) => c.academicYear))].sort().reverse(),
    subjects: [...new Map(classrooms.map((c) => [c.subjectCode, { code: c.subjectCode, name: c.subject }])).values()],
  })
}))

adminRouter.get('/usage', asyncHandler(async (req, res) => {
  const [logins, checkins, submissions, gradeChanges] = await Promise.all([
    prisma.auditLog.count({ where: { action: 'LOGIN' } }),
    prisma.auditLog.count({ where: { action: 'CHECKIN' } }),
    prisma.auditLog.count({ where: { action: 'SUBMIT_ASSIGNMENT' } }),
    prisma.gradeLog.count(),
  ])
  ok(res, { logins, checkins, submissions, gradeChanges, generatedAt: thaiDateTime(new Date()) })
}))

async function backupData(req, res) {
  const tables = {
    users: await prisma.user.findMany({ select: userSelect }),
    classrooms: await prisma.classroom.findMany(),
    enrollments: await prisma.enrollment.findMany(),
    attendance: await prisma.attendance.findMany(),
    attendanceLogs: await prisma.attendanceLog.findMany(),
    attendanceSessions: await prisma.attendanceSession.findMany(),
    leaveRequests: await prisma.leaveRequest.findMany(),
    assignments: await prisma.assignment.findMany(),
    submissions: await prisma.submission.findMany(),
    scoreLogs: await prisma.scoreLog.findMany(),
    gradeRecords: await prisma.gradeRecord.findMany(),
    gradeLogs: await prisma.gradeLog.findMany(),
    gradeScales: await prisma.gradeScale.findMany(),
    announcements: await prisma.announcement.findMany(),
    notifications: await prisma.notification.findMany(),
    auditLogs: await prisma.auditLog.findMany(),
    settings: await prisma.setting.findMany(),
  }
  await audit(req.user.id, 'BACKUP', 'System', null)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="theachclass-backup-${Date.now()}.json"`)
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), tables }, null, 2))
}

adminRouter.get('/backup', asyncHandler(backupData))
adminRouter.post('/backup', asyncHandler(backupData))
