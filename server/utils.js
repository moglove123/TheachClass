import crypto from 'node:crypto'
import path from 'node:path'
import { prisma } from './db.js'

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const ok = (res, data, message) => res.json({ ok: true, ...(message ? { message } : {}), data })

export const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ ok: false, message, ...extra })

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const bangkokDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)

export const thaiDateTime = (date) => {
  if (!date) return ''
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(date))
}

export function randomCode(length = 8) {
  return crypto.randomBytes(length).toString('hex').slice(0, length).toUpperCase()
}

export async function audit(actorId, action, entity, entityId, details) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action,
        entity,
        entityId: entityId == null ? null : String(entityId),
        details: details == null ? null : JSON.stringify(details),
      },
    })
  } catch (err) {
    console.error('audit failed', err.message)
  }
}

export async function notify(userId, type, title, body, link) {
  if (!userId) return
  await prisma.notification.create({ data: { userId, type, title, body, link: link ?? null } })
}

export async function notifyMany(userIds, type, title, body, link) {
  if (!userIds.length) return
  await prisma.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({ userId, type, title, body, link: link ?? null })),
  })
}

export function paginate(query) {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  return { skip: (page - 1) * limit, take: limit, page, limit }
}

export const safeJson = (value, fallback = []) => {
  try { return JSON.parse(value) } catch { return fallback }
}

export function sanitizeFileName(name) {
  return path.basename(String(name)).replace(/[^\w.\-[\]()\u0E00-\u0E7F]/g, '_').slice(0, 120)
}

export async function assertClassroomAccess(user, classroomId, { teacherOnly = false } = {}) {
  const classroom = await prisma.classroom.findUnique({ where: { id: Number(classroomId) } })
  if (!classroom) throw new ApiError(404, 'ไม่พบห้องเรียน')
  if (user.role === 'ADMIN') return classroom
  if (teacherOnly) {
    if (user.role !== 'TEACHER' || classroom.teacherId !== user.id)
      throw new ApiError(403, 'คุณไม่มีสิทธิ์จัดการห้องเรียนนี้')
    return classroom
  }
  if (user.role === 'TEACHER' && classroom.teacherId === user.id) return classroom
  const enrolled = await prisma.enrollment.findUnique({
    where: { classroomId_userId: { classroomId: classroom.id, userId: user.id } },
  })
  if (!enrolled) throw new ApiError(403, 'คุณไม่มีสิทธิ์เข้าถึงห้องเรียนนี้')
  return classroom
}

export function computeGrade(total, scales) {
  const sorted = [...scales].sort((a, b) => b.minScore - a.minScore)
  const match = sorted.find((s) => total >= s.minScore && total <= s.maxScore)
  return match?.grade ?? (total >= 80 ? 'A' : 'F')
}

export const defaultScales = [
  { grade: 'A', minScore: 80, maxScore: 100 },
  { grade: 'B+', minScore: 75, maxScore: 79.99 },
  { grade: 'B', minScore: 70, maxScore: 74.99 },
  { grade: 'C+', minScore: 65, maxScore: 69.99 },
  { grade: 'C', minScore: 60, maxScore: 64.99 },
  { grade: 'D+', minScore: 55, maxScore: 59.99 },
  { grade: 'D', minScore: 50, maxScore: 54.99 },
  { grade: 'F', minScore: 0, maxScore: 49.99 },
]
