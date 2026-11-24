import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import {
  ApiError, asyncHandler, ok, audit, notify, notifyMany, safeJson,
  assertClassroomAccess,
} from '../utils.js'
import { getMissedAssignments } from '../services/missed.js'

export const submissionsRouter = Router()
submissionsRouter.use(requireAuth)

const latestFor = (assignmentId, userId) =>
  prisma.submission.findFirst({ where: { assignmentId, userId }, orderBy: { attempt: 'desc' } })

submissionsRouter.post('/', asyncHandler(async (req, res) => {
  if (req.user.role !== 'STUDENT') throw new ApiError(403, 'เฉพาะนักเรียนเท่านั้นที่ส่งงานได้')
  const assignment = await prisma.assignment.findUnique({ where: { id: Number(req.body?.assignmentId) } })
  if (!assignment) throw new ApiError(404, 'ไม่พบงาน')
  await assertClassroomAccess(req.user, assignment.classroomId)
  if (!assignment.isOpen) throw new ApiError(403, 'ครูปิดรับงานนี้แล้ว')
  if (assignment.startAt && new Date() < new Date(assignment.startAt)) throw new ApiError(403, 'ยังไม่ถึงเวลาเริ่มส่งงาน')
  const due = new Date(new Date(assignment.dueAt).getTime() + assignment.extensionMinutes * 60000)
  const now = new Date()
  if (now > due && !assignment.allowLate)
    throw new ApiError(403, 'หมดเวลาส่งงานแล้ว')

  const files = Array.isArray(req.body?.files) ? req.body.files : []
  if (!files.length && !String(req.body?.note || '').trim())
    throw new ApiError(400, 'กรุณาอัปโหลดไฟล์งานหรือระบุข้อความส่งงาน')
  const previous = await latestFor(assignment.id, req.user.id)
  const attempt = (previous?.attempt || 0) + 1
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id, userId: req.user.id,
      files: JSON.stringify(files), note: String(req.body?.note || '').trim() || null,
      submittedAt: now, isLate: now > due, attempt,
    },
  })
  const classroom = await prisma.classroom.findUnique({ where: { id: assignment.classroomId }, select: { teacherId: true, name: true } })
  await notify(classroom.teacherId, 'NEW_SUBMISSION', 'มีงานส่งใหม่',
    `${req.user.firstName} ${req.user.lastName} ส่งงาน "${assignment.title}"`, `/assignments/${assignment.id}/submissions`)
  await audit(req.user.id, 'SUBMIT_ASSIGNMENT', 'Submission', submission.id, { assignmentId: assignment.id, attempt, isLate: submission.isLate })
  ok(res, { ...submission, files }, 'ส่งงานสำเร็จ')
}))

/** รายการงานที่กำหนดส่งผ่านแล้วแต่ยังไม่ส่ง (เฉพาะของนักเรียนที่ล็อกอิน) */
submissionsRouter.get('/missed', asyncHandler(async (req, res) => {
  if (req.user.role !== 'STUDENT') throw new ApiError(403, 'เฉพาะนักเรียนเท่านั้นที่ดูงานที่ขาดส่งได้')
  ok(res, await getMissedAssignments(req.user.id))
}))

submissionsRouter.get('/me', asyncHandler(async (req, res) => {
  const where = { userId: req.user.id }
  if (req.query.assignmentId) where.assignmentId = Number(req.query.assignmentId)
  const all = await prisma.submission.findMany({
    where,
    include: { assignment: { select: { id: true, title: true, maxScore: true, bonusScore: true, dueAt: true, classroomId: true } } },
    orderBy: { submittedAt: 'desc' },
  })
  const latest = new Map()
  for (const s of all) if (!latest.has(s.assignmentId)) latest.set(s.assignmentId, s)
  ok(res, [...latest.values()].map((s) => ({ ...s, files: safeJson(s.files) })))
}))

submissionsRouter.get('/assignment/:assignmentId', asyncHandler(async (req, res) => {
  const assignment = await prisma.assignment.findUnique({ where: { id: Number(req.params.assignmentId) } })
  if (!assignment) throw new ApiError(404, 'ไม่พบงาน')
  await assertClassroomAccess(req.user, assignment.classroomId, { teacherOnly: true })
  const enrollments = await prisma.enrollment.findMany({
    where: { classroomId: assignment.classroomId },
    include: { user: { select: { id: true, studentId: true, firstName: true, lastName: true, email: true } } },
    orderBy: { user: { studentId: 'asc' } },
  })
  const submissions = await prisma.submission.findMany({
    where: { assignmentId: assignment.id },
    include: { scoreLogs: { orderBy: { createdAt: 'desc' } } },
    orderBy: { attempt: 'desc' },
  })
  const latest = new Map()
  for (const s of submissions) if (!latest.has(s.userId)) latest.set(s.userId, s)
  const items = enrollments.map((e) => {
    const s = latest.get(e.userId)
    return {
      user: e.user,
      submission: s ? { ...s, files: safeJson(s.files) } : null,
      status: !s ? 'PENDING' : s.status === 'GRADED' ? 'GRADED' : s.isLate ? 'LATE' : 'SUBMITTED',
      submittedCount: submissions.filter((x) => x.userId === e.userId).length,
    }
  })
  const scores = items.map((i) => i.submission?.score).filter((s) => typeof s === 'number')
  const stats = {
    submitted: items.filter((i) => i.submission).length,
    missing: items.filter((i) => !i.submission).length,
    graded: scores.length,
    average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
    max: scores.length ? Math.max(...scores) : 0,
    min: scores.length ? Math.min(...scores) : 0,
  }
  ok(res, { assignment: { ...assignment, attachments: safeJson(assignment.attachments) }, items, stats })
}))

submissionsRouter.get('/:id/history', asyncHandler(async (req, res) => {
  const submission = await prisma.submission.findUnique({ where: { id: Number(req.params.id) } })
  if (!submission) throw new ApiError(404, 'ไม่พบงานที่ส่ง')
  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } })
  await assertClassroomAccess(req.user, assignment.classroomId)
  const logs = await prisma.scoreLog.findMany({
    where: { submissionId: submission.id },
    include: { editor: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  })
  ok(res, logs)
}))

submissionsRouter.post('/:id/grade', asyncHandler(async (req, res) => {
  const submission = await prisma.submission.findUnique({ where: { id: Number(req.params.id) } })
  if (!submission) throw new ApiError(404, 'ไม่พบงานที่ส่ง')
  const assignment = await prisma.assignment.findUnique({ where: { id: submission.assignmentId } })
  await assertClassroomAccess(req.user, assignment.classroomId, { teacherOnly: true })
  const score = Number(req.body?.score)
  if (!Number.isFinite(score) || score < 0 || score > assignment.maxScore + assignment.bonusScore)
    throw new ApiError(400, `คะแนนต้องอยู่ระหว่าง 0 ถึง ${assignment.maxScore + assignment.bonusScore}`)
  const updated = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      score, feedback: String(req.body?.feedback || ''), status: 'GRADED',
      gradedAt: new Date(), gradedBy: req.user.id,
    },
  })
  await prisma.scoreLog.create({
    data: {
      submissionId: submission.id, changedBy: req.user.id,
      oldScore: submission.score, newScore: score, note: req.body?.note || req.body?.feedback || null,
    },
  })
  await notify(submission.userId, 'GRADED', 'ตรวจงานเสร็จแล้ว',
    `งาน "${assignment.title}" ได้คะแนน ${score}/${assignment.maxScore + assignment.bonusScore}`,
    `/assignments/${assignment.id}`)
  await audit(req.user.id, 'GRADE_SUBMISSION', 'Submission', submission.id, { from: submission.score, to: score })
  ok(res, updated, 'ให้คะแนนสำเร็จ')
}))
