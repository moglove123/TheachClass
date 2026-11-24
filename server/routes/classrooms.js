import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth, userSelect } from './auth.js'
import { ApiError, asyncHandler, ok, audit, notify, notifyMany, randomCode, assertClassroomAccess } from '../utils.js'

export const classroomsRouter = Router()
classroomsRouter.use(requireAuth)

const classroomDetailInclude = {
  teacher: { select: userSelect },
  _count: { select: { enrollments: true, assignments: true, attendances: true } },
}

async function uniqueCodes(subjectCode) {
  let code, joinCode
  do { code = `${subjectCode || 'SUB'}-${randomCode(4)}` }
  while (await prisma.classroom.findUnique({ where: { code } }))
  do { joinCode = randomCode(8) }
  while (await prisma.classroom.findUnique({ where: { joinCode } }))
  return { code, joinCode }
}

const readNumber = (value, label, { min, max, integer } = {}) => {
  if (value === '' || value == null) throw new ApiError(400, `กรุณาระบุ${label}ให้ถูกต้อง`)
  const n = Number(value)
  if (!Number.isFinite(n)) throw new ApiError(400, `กรุณาระบุ${label}ให้ถูกต้อง`)
  if (min !== undefined && n < min) throw new ApiError(400, `${label}ต้องไม่น้อยกว่า ${min}`)
  if (max !== undefined && n > max) throw new ApiError(400, `${label}ต้องไม่มากกว่า ${max}`)
  if (integer && !Number.isInteger(n)) throw new ApiError(400, `${label}ต้องเป็นจำนวนเต็ม`)
  return n
}

classroomsRouter.get('/', asyncHandler(async (req, res) => {
  const where = {}
  if (req.query.search) {
    const q = String(req.query.search).trim()
    where.OR = [{ name: { contains: q } }, { subject: { contains: q } }, { code: { contains: q } }]
  }
  if (req.query.semester) where.semester = String(req.query.semester)
  if (req.query.academicYear) where.academicYear = String(req.query.academicYear)
  if (req.query.subjectCode) where.subjectCode = String(req.query.subjectCode)
  if (req.user.role === 'TEACHER') where.teacherId = req.user.id
  if (req.user.role === 'STUDENT')
    where.enrollments = { some: { userId: req.user.id } }

  const items = await prisma.classroom.findMany({
    where,
    include: classroomDetailInclude,
    orderBy: [{ academicYear: 'desc' }, { semester: 'desc' }, { id: 'desc' }],
  })
  ok(res, items)
}))

classroomsRouter.post('/', asyncHandler(async (req, res) => {
  if (!['ADMIN', 'TEACHER'].includes(req.user.role)) throw new ApiError(403, 'เฉพาะครูและผู้ดูแลระบบเท่านั้น')
  const b = req.body ?? {}
  if (!b.name?.trim() || !b.subject?.trim() || !b.subjectCode?.trim())
    throw new ApiError(400, 'กรุณากรอกชื่อห้องเรียน ชื่อวิชา และรหัสวิชา')
  let teacherId = req.user.role === 'TEACHER' ? req.user.id : Number(b.teacherId || req.user.id)
  const teacher = await prisma.user.findUnique({ where: { id: teacherId } })
  if (!teacher || teacher.role !== 'TEACHER') throw new ApiError(400, 'ครูผู้สอนไม่ถูกต้อง')
  const { code, joinCode } = await uniqueCodes(String(b.subjectCode).trim().toUpperCase())
  const num = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v))
  const classroom = await prisma.classroom.create({
    data: {
      code, joinCode,
      name: String(b.name).trim(), subject: String(b.subject).trim(),
      subjectCode: String(b.subjectCode).trim().toUpperCase(),
      semester: String(b.semester || '1'), academicYear: String(b.academicYear || new Date().getFullYear()),
      teacherId,
      gpsLat: b.gpsLat === '' || b.gpsLat == null ? null : num(b.gpsLat, 0),
      gpsLng: b.gpsLng === '' || b.gpsLng == null ? null : num(b.gpsLng, 0),
      gpsRadius: num(b.gpsRadius, 100),
      attendanceOpen: Boolean(b.attendanceOpen),
      checkinOpenAt: b.checkinOpenAt ? new Date(b.checkinOpenAt) : null,
      checkinCloseAt: b.checkinCloseAt ? new Date(b.checkinCloseAt) : null,
      lateAfterMinutes: num(b.lateAfterMinutes, 15),
      weightAssignment: num(b.weightAssignment, 30), weightCollection: num(b.weightCollection, 20),
      weightMidterm: num(b.weightMidterm, 20), weightFinal: num(b.weightFinal, 30),
      weightActivity: num(b.weightActivity, 0), weightBonus: num(b.weightBonus, 0),
      gradeScales: {
        create: (b.scales?.length ? b.scales : [
          { grade: 'A', minScore: 80, maxScore: 100 }, { grade: 'B+', minScore: 75, maxScore: 79.99 },
          { grade: 'B', minScore: 70, maxScore: 74.99 }, { grade: 'C+', minScore: 65, maxScore: 69.99 },
          { grade: 'C', minScore: 60, maxScore: 64.99 }, { grade: 'D+', minScore: 55, maxScore: 59.99 },
          { grade: 'D', minScore: 50, maxScore: 54.99 }, { grade: 'F', minScore: 0, maxScore: 49.99 },
        ]).map((s) => ({ grade: String(s.grade), minScore: Number(s.minScore), maxScore: Number(s.maxScore) })),
      },
    },
    include: classroomDetailInclude,
  })
  await audit(req.user.id, 'CREATE_CLASSROOM', 'Classroom', classroom.id, { code, joinCode })
  ok(res, classroom, 'สร้างห้องเรียนสำเร็จ')
}))

classroomsRouter.get('/:id', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.id)
  const data = await prisma.classroom.findUnique({
    where: { id: classroom.id },
    include: {
      teacher: { select: userSelect },
      _count: { select: { enrollments: true, assignments: true, attendances: true } },
      gradeScales: { orderBy: { minScore: 'desc' } },
      assignments: {
        orderBy: { dueAt: 'desc' }, take: 30,
        include: { _count: { select: { submissions: true } } },
      },
      announcements: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 20 },
      enrollments: req.user.role === 'STUDENT'
        ? { where: { userId: req.user.id }, include: { user: { select: userSelect } } }
        : { include: { user: { select: userSelect } }, orderBy: { id: 'asc' } },
    },
  })
  if (req.user.role === 'STUDENT') {
    delete data.gradeScales
    data.joinCode = undefined
  }
  ok(res, data)
}))

classroomsRouter.patch('/:id', asyncHandler(async (req, res) => {
  await assertClassroomAccess(req.user, req.params.id, { teacherOnly: true })
  const b = req.body ?? {}
  const data = {}
  for (const key of ['name', 'subject', 'subjectCode', 'semester', 'academicYear']) {
    if (b[key] !== undefined) data[key] = String(b[key]).trim()
  }
  const intFields = {
    gpsRadius: ['รัศมีเช็กชื่อ', 10], lateAfterMinutes: ['นาทีก่อนถือว่าสาย', 0],
    weightAssignment: ['สัดส่วนงาน', 0, 100], weightCollection: ['สัดส่วนคะแนนเก็บ', 0, 100],
    weightMidterm: ['สัดส่วนกลางภาค', 0, 100], weightFinal: ['สัดส่วนปลายภาค', 0, 100],
    weightActivity: ['สัดส่วนกิจกรรม', 0, 100], weightBonus: ['สัดส่วนคะแนนพิเศษ', 0, 100],
  }
  for (const [key, [label, min, max]] of Object.entries(intFields)) {
    if (b[key] !== undefined) data[key] = readNumber(b[key], label, { min, max, integer: true })
  }
  for (const [key, [label, min, max]] of Object.entries({
    gpsLat: ['ละติจูด', -90, 90], gpsLng: ['ลองจิจูด', -180, 180],
  })) {
    if (b[key] === undefined) continue
    data[key] = b[key] === null || b[key] === '' ? null : readNumber(b[key], label, { min, max })
  }
  for (const key of ['checkinOpenAt', 'checkinCloseAt']) {
    if (b[key] !== undefined) data[key] = b[key] ? new Date(b[key]) : null
  }
  if (b.attendanceOpen !== undefined) data.attendanceOpen = Boolean(b.attendanceOpen)
  if (b.teacherId && req.user.role === 'ADMIN') {
    const teacherId = Number(b.teacherId)
    const nextTeacher = await prisma.user.findUnique({ where: { id: teacherId } })
    if (!nextTeacher || nextTeacher.role !== 'TEACHER')
      throw new ApiError(400, 'ครูผู้สอนไม่ถูกต้อง (ต้องเป็นบัญชีครู)')
    data.teacherId = teacherId
  }
  const classroom = await prisma.classroom.update({
    where: { id: Number(req.params.id) }, data, include: classroomDetailInclude,
  })
  await audit(req.user.id, 'UPDATE_CLASSROOM', 'Classroom', classroom.id, b)
  if (b.attendanceOpen === true) {
    const ids = (await prisma.enrollment.findMany({ where: { classroomId: classroom.id }, select: { userId: true } })).map((e) => e.userId)
    await notifyMany(ids, 'CHECKIN_OPEN', 'เปิดเช็กชื่อแล้ว', `${classroom.name} เปิดให้เช็กชื่อแล้ว`, '/attendance')
  }
  ok(res, classroom, 'อัปเดตห้องเรียนสำเร็จ')
}))

classroomsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await assertClassroomAccess(req.user, req.params.id, { teacherOnly: true })
  const id = Number(req.params.id)
  const ids = (await prisma.enrollment.findMany({ where: { classroomId: id }, select: { userId: true } })).map((e) => e.userId)
  await prisma.classroom.delete({ where: { id } })
  await notifyMany(ids, 'CLASSROOM_DELETED', 'ลบห้องเรียน', 'ห้องเรียนที่คุณเข้าร่วมถูกลบโดยครูผู้สอน')
  await audit(req.user.id, 'DELETE_CLASSROOM', 'Classroom', id)
  ok(res, null, 'ลบห้องเรียนสำเร็จ')
}))

async function joinClassroom(req, res) {
  if (req.user.role !== 'STUDENT') throw new ApiError(403, 'เฉพาะนักเรียนเท่านั้นที่เข้าร่วมห้องเรียนด้วยรหัสได้')
  const classroom = await prisma.classroom.findUnique({ where: { joinCode: String(req.body?.joinCode || '').trim().toUpperCase() } })
  if (!classroom) throw new ApiError(404, 'รหัสเข้าห้องเรียนไม่ถูกต้อง')
  const exists = await prisma.enrollment.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: req.user.id } },
  })
  if (exists) throw new ApiError(409, 'คุณอยู่ในห้องเรียนนี้แล้ว')
  await prisma.enrollment.create({ data: { classroomId: classroom.id, userId: req.user.id } })
  await notify(classroom.teacherId, 'NEW_STUDENT', 'มีนักเรียนเข้าห้องเรียน', `${req.user.firstName} ${req.user.lastName} เข้าร่วม ${classroom.name}`, `/classrooms/${classroom.id}/students`)
  await audit(req.user.id, 'JOIN_CLASSROOM', 'Classroom', classroom.id)
  ok(res, { id: classroom.id, name: classroom.name }, 'เข้าร่วมห้องเรียนสำเร็จ')
}

classroomsRouter.post('/join', asyncHandler(joinClassroom))
classroomsRouter.post('/:id/join', asyncHandler(joinClassroom))

classroomsRouter.post('/:id/members', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.id, { teacherOnly: true })
  const q = String(req.body?.identifier || '').trim()
  const user = await prisma.user.findFirst({
    where: { OR: [{ studentId: q }, { email: q.toLowerCase() }], role: 'STUDENT' },
    select: userSelect,
  })
  if (!user) throw new ApiError(404, 'ไม่พบนักเรียนจากรหัสนักเรียนหรืออีเมลนี้')
  const exists = await prisma.enrollment.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
  })
  if (exists) throw new ApiError(409, 'นักเรียนอยู่ในห้องเรียนนี้แล้ว')
  await prisma.enrollment.create({ data: { classroomId: classroom.id, userId: user.id } })
  await notify(user.id, 'ADDED_TO_CLASSROOM', 'เพิ่มเข้าห้องเรียน', `ครูเพิ่มคุณเข้าห้องเรียน ${classroom.name}`, `/classrooms/${classroom.id}`)
  await audit(req.user.id, 'ADD_MEMBER', 'Classroom', classroom.id, { userId: user.id })
  ok(res, user, 'เพิ่มนักเรียนสำเร็จ')
}))

classroomsRouter.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.id, { teacherOnly: true })
  const userId = Number(req.params.userId)
  await prisma.enrollment.delete({ where: { classroomId_userId: { classroomId: classroom.id, userId } } })
  await notify(userId, 'REMOVED_FROM_CLASSROOM', 'นำออกจากห้องเรียน', `คุณถูกนำออกจากห้องเรียน ${classroom.name}`)
  await audit(req.user.id, 'REMOVE_MEMBER', 'Classroom', classroom.id, { userId })
  ok(res, null, 'นำนักเรียนออกสำเร็จ')
}))

classroomsRouter.get('/:id/students', asyncHandler(async (req, res) => {
  const classroom = await assertClassroomAccess(req.user, req.params.id, { teacherOnly: true })
  const enrollments = await prisma.enrollment.findMany({
    where: { classroomId: classroom.id },
    include: {
      user: { select: userSelect },
    },
    orderBy: { user: { studentId: 'asc' } },
  })
  const attendances = await prisma.attendance.findMany({ where: { classroomId: classroom.id } })
  const submissions = await prisma.submission.findMany({
    where: { assignment: { classroomId: classroom.id } },
    include: { assignment: { select: { maxScore: true, bonusScore: true } } },
  })
  const items = enrollments.map((e) => {
    const list = attendances.filter((a) => a.userId === e.userId)
    const count = (s) => list.filter((a) => a.status === s).length
    const present = count('PRESENT'), late = count('LATE'), absent = count('ABSENT'), leave = count('LEAVE')
    const mine = submissions.filter((s) => s.userId === e.userId)
    return {
      ...e.user, joinedAt: e.joinedAt,
      attendance: { present, late, absent, leave, total: list.length, percentage: list.length ? Math.round(((present + late) / list.length) * 100) : 0 },
      assignments: { submitted: new Set(mine.map((s) => s.assignmentId)).size, graded: mine.filter((s) => s.score != null).length },
    }
  })
  ok(res, items)
}))
