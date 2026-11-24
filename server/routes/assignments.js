import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import { ApiError, asyncHandler, ok, audit, notifyMany, safeJson, assertClassroomAccess, thaiDateTime } from '../utils.js'
import { getMissedAssignments } from '../services/missed.js'

export const assignmentsRouter = Router()
assignmentsRouter.use(requireAuth)

const includeSummary = {
  classroom: { select: { id: true, name: true, subject: true, code: true } },
  creator: { select: { firstName: true, lastName: true } },
  _count: { select: { submissions: true } },
}

assignmentsRouter.get('/', asyncHandler(async (req, res) => {
  const where = {}
  if (req.query.classroomId) where.classroomId = Number(req.query.classroomId)
  if (req.user.role === 'STUDENT')
    where.classroom = { enrollments: { some: { userId: req.user.id } } }
  if (req.user.role === 'TEACHER')
    where.classroom = { teacherId: req.user.id }
  const items = await prisma.assignment.findMany({
    where, include: includeSummary, orderBy: { dueAt: 'desc' }, take: 200,
  })
  const list = items.map((a) => ({ ...a, attachments: safeJson(a.attachments) }))

  // แนบสถานะการส่งของนักเรียนคนที่ล็อกอินมาด้วย เพื่อให้เห็นบนการ์ดงานเลย
  // (ไม่ต้องกดเข้าไปดูในหน้ารายละเอียดงาน) — query เดียวสำหรับทุกงานในหน้า
  if (req.user.role === 'STUDENT' && list.length) {
    const submissions = await prisma.submission.findMany({
      where: { userId: req.user.id, assignmentId: { in: list.map((a) => a.id) } },
      orderBy: { attempt: 'desc' },
    })
    const latest = new Map()
    for (const s of submissions) if (!latest.has(s.assignmentId)) latest.set(s.assignmentId, s)
    for (const a of list) {
      const s = latest.get(a.id)
      a.mySubmission = s ? {
        id: s.id, status: s.status, isLate: s.isLate, attempt: s.attempt,
        submittedAt: s.submittedAt, score: s.score, feedback: s.feedback,
      } : null
    }
  }
  ok(res, list)
}))

assignmentsRouter.get('/missed', asyncHandler(async (req, res) => {
  if (req.user.role !== 'STUDENT') throw new ApiError(403, 'เฉพาะนักเรียนเท่านั้นที่ดูงานที่ขาดส่งได้')
  ok(res, await getMissedAssignments(req.user.id))
}))

assignmentsRouter.get('/:id', asyncHandler(async (req, res) => {
  const assignment = await prisma.assignment.findUnique({
    where: { id: Number(req.params.id) },
    include: { ...includeSummary, classroom: { select: { id: true, name: true, subject: true, code: true, enrollments: { select: { userId: true } } } } },
  })
  if (!assignment) throw new ApiError(404, 'ไม่พบงาน')
  await assertClassroomAccess(req.user, assignment.classroomId)
  const mySubmission = req.user.role === 'STUDENT'
    ? await prisma.submission.findFirst({
        where: { assignmentId: assignment.id, userId: req.user.id },
        orderBy: { attempt: 'desc' },
      })
    : null
  ok(res, {
    ...assignment,
    attachments: safeJson(assignment.attachments),
    mySubmission: mySubmission ? { ...mySubmission, files: safeJson(mySubmission.files) } : null,
    studentCount: assignment.classroom.enrollments.length,
  })
}))

assignmentsRouter.post('/', asyncHandler(async (req, res) => {
  const b = req.body ?? {}
  const classroom = await assertClassroomAccess(req.user, b.classroomId, { teacherOnly: true })
  if (!b.title?.trim()) throw new ApiError(400, 'กรุณากรอกชื่องาน')
  if (!b.dueAt || Number.isNaN(new Date(b.dueAt).getTime())) throw new ApiError(400, 'กรุณาระบุกำหนดส่งงานให้ถูกต้อง')
  const assignment = await prisma.assignment.create({
    data: {
      classroomId: classroom.id,
      title: String(b.title).trim(),
      description: String(b.description || ''),
      attachments: JSON.stringify(b.attachments || []),
      startAt: b.startAt ? new Date(b.startAt) : null,
      dueAt: new Date(b.dueAt),
      maxScore: Number(b.maxScore ?? 100),
      bonusScore: Number(b.bonusScore ?? 0),
      allowLate: Boolean(b.allowLate),
      latePenaltyPercent: Number(b.latePenaltyPercent ?? 0),
      extensionMinutes: Number(b.extensionMinutes ?? 0),
      isOpen: b.isOpen !== false,
      createdBy: req.user.id,
    },
    include: includeSummary,
  })
  const ids = (await prisma.enrollment.findMany({ where: { classroomId: classroom.id }, select: { userId: true } })).map((e) => e.userId)
  await notifyMany(ids, 'NEW_ASSIGNMENT', 'มีงานใหม่',
    `${classroom.name}: ${assignment.title} กำหนดส่ง ${thaiDateTime(assignment.dueAt)}`,
    `/assignments/${assignment.id}`)
  await audit(req.user.id, 'CREATE_ASSIGNMENT', 'Assignment', assignment.id, { title: assignment.title })
  ok(res, { ...assignment, attachments: safeJson(assignment.attachments) }, 'สร้างงานสำเร็จ')
}))

assignmentsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const before = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } })
  if (!before) throw new ApiError(404, 'ไม่พบงาน')
  await assertClassroomAccess(req.user, before.classroomId, { teacherOnly: true })
  const b = req.body ?? {}
  const data = {}
  for (const key of ['title', 'description']) if (b[key] !== undefined) data[key] = String(b[key])
  if (b.attachments !== undefined) data.attachments = JSON.stringify(b.attachments || [])
  for (const key of ['startAt', 'dueAt']) if (b[key] !== undefined) data[key] = b[key] ? new Date(b[key]) : null
  for (const key of ['maxScore', 'bonusScore', 'latePenaltyPercent', 'extensionMinutes'])
    if (b[key] !== undefined) data[key] = Number(b[key])
  for (const key of ['allowLate', 'isOpen']) if (b[key] !== undefined) data[key] = Boolean(b[key])
  if (data.dueAt && Number.isNaN(data.dueAt.getTime())) throw new ApiError(400, 'วันที่ส่งงานไม่ถูกต้อง')
  const assignment = await prisma.assignment.update({ where: { id: before.id }, data, include: includeSummary })
  const ids = (await prisma.enrollment.findMany({ where: { classroomId: before.classroomId }, select: { userId: true } })).map((e) => e.userId)
  const changes = []
  for (const key of ['title', 'description', 'dueAt', 'maxScore', 'isOpen']) {
    if (JSON.stringify(before[key]) !== JSON.stringify(assignment[key])) changes.push(key)
  }
  if (changes.length) {
    await notifyMany(ids, 'ASSIGNMENT_UPDATED', 'มีการแก้ไขงาน',
      `${assignment.title}: เปลี่ยนแปลง ${changes.join(', ')}`, `/assignments/${assignment.id}`)
  }
  await audit(req.user.id, 'UPDATE_ASSIGNMENT', 'Assignment', assignment.id, b)
  ok(res, { ...assignment, attachments: safeJson(assignment.attachments) }, 'อัปเดตงานสำเร็จ')
}))

assignmentsRouter.post('/:id/toggle', asyncHandler(async (req, res) => {
  const assignment = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } })
  if (!assignment) throw new ApiError(404, 'ไม่พบงาน')
  await assertClassroomAccess(req.user, assignment.classroomId, { teacherOnly: true })
  const isOpen = req.body?.isOpen !== undefined ? Boolean(req.body.isOpen) : !assignment.isOpen
  const updated = await prisma.assignment.update({ where: { id: assignment.id }, data: { isOpen } })
  await audit(req.user.id, 'TOGGLE_ASSIGNMENT', 'Assignment', assignment.id, { isOpen })
  ok(res, updated, isOpen ? 'เปิดรับงานแล้ว' : 'ปิดรับงานแล้ว')
}))

assignmentsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const assignment = await prisma.assignment.findUnique({ where: { id: Number(req.params.id) } })
  if (!assignment) throw new ApiError(404, 'ไม่พบงาน')
  await assertClassroomAccess(req.user, assignment.classroomId, { teacherOnly: true })
  const ids = (await prisma.enrollment.findMany({ where: { classroomId: assignment.classroomId }, select: { userId: true } })).map((e) => e.userId)
  await notifyMany(ids, 'ASSIGNMENT_DELETED', 'ลบงาน', `ครูลบงาน "${assignment.title}" แล้ว`)
  await prisma.assignment.delete({ where: { id: assignment.id } })
  await audit(req.user.id, 'DELETE_ASSIGNMENT', 'Assignment', assignment.id)
  ok(res, null, 'ลบงานสำเร็จ')
}))
