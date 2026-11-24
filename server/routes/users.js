import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'
import { requireAuth, requireRole, userSelect } from './auth.js'
import { removeAvatarFile } from './profile.js'
import { ApiError, asyncHandler, ok, paginate, audit, notify, notifyMany } from '../utils.js'

export const usersRouter = Router()
usersRouter.use(requireAuth, requireRole('ADMIN'))

const ROLES = ['ADMIN', 'TEACHER', 'STUDENT']
const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED']
const ROLE_LABEL = { ADMIN: 'ผู้ดูแลระบบ', TEACHER: 'ครู', STUDENT: 'นักเรียน' }

function roleChanged(current, nextRole) {
  return Boolean(nextRole && nextRole !== current.role)
}

// กันไม่ให้ผู้ดูแลล็อกตัวเองออกจากระบบ หรือปล่อยให้ระบบไม่มี ADMIN ที่ใช้งานได้
async function assertSafeAdminChange(actorId, changes) {
  const self = changes.find((c) => c.id === actorId && (roleChanged(c.current, c.nextRole) || (c.nextStatus && c.nextStatus !== c.current.status)))
  if (self) throw new ApiError(400, 'ไม่สามารถเปลี่ยนสิทธิ์หรือสถานะของบัญชีตัวเองได้ ให้ใช้บัญชีผู้ดูแลอื่น')

  const demotedAdmins = changes
    .filter((c) => c.current.role === 'ADMIN' && c.current.status === 'ACTIVE' &&
      (c.nextRole !== 'ADMIN' || c.nextStatus !== 'ACTIVE'))
    .map((c) => c.id)
  if (demotedAdmins.length) {
    const remaining = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE', id: { notIn: demotedAdmins } },
    })
    if (!remaining) throw new ApiError(400, 'ต้องคงผู้ดูแลระบบที่เปิดใช้งานอย่างน้อย 1 บัญชี')
  }
}

usersRouter.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query)
  const where = {}
  if (req.query.role) where.role = String(req.query.role)
  if (req.query.status) where.status = String(req.query.status)
  if (req.query.search) {
    const q = String(req.query.search).trim()
    where.OR = [
      { firstName: { contains: q } }, { lastName: { contains: q } },
      { email: { contains: q } }, { studentId: { contains: q } },
    ]
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where, select: userSelect, orderBy: { id: 'desc' }, skip, take: limit,
    }),
    prisma.user.count({ where }),
  ])
  ok(res, { items, total, page, limit, pages: Math.ceil(total / limit) })
}))

usersRouter.post('/', asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, studentId, phone, role, status } = req.body ?? {}
  if (!firstName?.trim() || !lastName?.trim() || !/^\S+@\S+\.\S+$/.test(String(email || '')))
    throw new ApiError(400, 'กรุณากรอกชื่อ นามสกุล และอีเมลให้ถูกต้อง')
  if (!password || String(password).length < 6) throw new ApiError(400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
  if (await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } }))
    throw new ApiError(409, 'อีเมลนี้มีอยู่แล้ว')
  const user = await prisma.user.create({
    data: {
      firstName: String(firstName).trim(), lastName: String(lastName).trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash: await bcrypt.hash(String(password), 10),
      studentId: studentId?.trim() || null, phone: phone || null,
      role: ['ADMIN', 'TEACHER', 'STUDENT'].includes(role) ? role : 'STUDENT',
      status: status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
    },
    select: userSelect,
  })
  await audit(req.user.id, 'CREATE_USER', 'User', user.id)
  await notify(user.id, 'ACCOUNT_CREATED', 'บัญชีถูกสร้างโดยผู้ดูแลระบบ', status === 'ACTIVE' ? 'บัญชีของคุณเปิดใช้งานแล้ว' : 'บัญชีของคุณรอการอนุมัติ')
  ok(res, user, 'สร้างบัญชีสำเร็จ')
}))

usersRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const before = await prisma.user.findUnique({ where: { id } })
  if (!before) throw new ApiError(404, 'ไม่พบผู้ใช้งาน')
  const data = {}
  for (const key of ['firstName', 'lastName', 'phone', 'studentId']) {
    if (req.body[key] !== undefined) data[key] = req.body[key] ? String(req.body[key]).trim() : null
  }
  if (req.body.email !== undefined && /^\S+@\S+\.\S+$/.test(String(req.body.email))) {
    data.email = String(req.body.email).toLowerCase().trim()
  }
  if (req.body.role && ['ADMIN', 'TEACHER', 'STUDENT'].includes(req.body.role)) data.role = req.body.role
  if (req.body.status && ['PENDING', 'ACTIVE', 'SUSPENDED'].includes(req.body.status)) data.status = req.body.status
  if (req.body.password && String(req.body.password).length >= 6)
    data.passwordHash = await bcrypt.hash(String(req.body.password), 10)
  if (data.role !== undefined || data.status !== undefined) {
    await assertSafeAdminChange(req.user.id, [{
      id, current: before,
      nextRole: data.role ?? before.role,
      nextStatus: data.status ?? before.status,
    }])
  }
  // เปลี่ยนรหัส/สิทธิ์/สถานะ → บังคับ token เก่าของบัญชีนี้ใช้ไม่ได้ทุกอุปกรณ์
  const revokeSessions = Boolean(data.passwordHash || data.role !== undefined || data.status !== undefined)
  try {
    const user = await prisma.user.update({
      where: { id },
      data: { ...data, ...(revokeSessions ? { tokenVersion: { increment: 1 } } : {}) },
      select: userSelect,
    })
    await audit(req.user.id, 'UPDATE_USER', 'User', id, { before: { role: before.role, status: before.status }, after: { role: user.role, status: user.status } })
    if (before.status !== 'ACTIVE' && user.status === 'ACTIVE')
      await notify(id, 'ACCOUNT_APPROVED', 'บัญชีได้รับการอนุมัติ', 'คุณสามารถเข้าสู่ระบบและใช้งานระบบได้แล้ว')
    if (before.status === 'ACTIVE' && user.status === 'SUSPENDED')
      await notify(id, 'ACCOUNT_SUSPENDED', 'บัญชีถูกระงับการใช้งาน', 'กรุณาติดต่อผู้ดูแลระบบ')
    if (roleChanged(before, user.role)) {
      await notify(id, 'ROLE_CHANGED', 'เปลี่ยนสิทธิ์การใช้งาน',
        `ผู้ดูแลระบบเปลี่ยนสิทธิ์ของคุณเป็น${ROLE_LABEL[user.role]}`, '/dashboard')
      await audit(req.user.id, 'CHANGE_ROLE', 'User', id, { from: before.role, to: user.role })
    }
    ok(res, user, 'อัปเดตบัญชีสำเร็จ')
  } catch (err) {
    if (err.code === 'P2002') throw new ApiError(409, 'อีเมลหรือรหัสนักเรียนซ้ำในระบบ')
    throw err
  }
}))

// มอบสิทธิ์/เปลี่ยนสถานะหลายบัญชีในครั้งเดียว (ผู้ดูแลเท่านั้น)
usersRouter.post('/bulk', asyncHandler(async (req, res) => {
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : []
  const ids = [...new Set(rawIds.map(Number))].filter((id) => Number.isInteger(id))
  if (!ids.length || ids.length > 100) throw new ApiError(400, 'กรุณาเลือกบัญชีอย่างน้อย 1 บัญชี และไม่เกิน 100 บัญชี')
  const { role, status } = req.body ?? {}
  if (role === undefined && status === undefined) throw new ApiError(400, 'กรุณาระบุสิทธิ์หรือสถานะที่ต้องการเปลี่ยน')
  if (role !== undefined && !ROLES.includes(role)) throw new ApiError(400, 'สิทธิ์ไม่ถูกต้อง')
  if (status !== undefined && !STATUSES.includes(status)) throw new ApiError(400, 'สถานะไม่ถูกต้อง')

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } }, select: { id: true, role: true, status: true },
  })
  const changes = targets
    .map((current) => ({
      id: current.id, current,
      nextRole: role ?? current.role, nextStatus: status ?? current.status,
    }))
    .filter((c) => c.nextRole !== c.current.role || c.nextStatus !== c.current.status)
  const skipped = [
    ...ids.filter((id) => !targets.some((t) => t.id === id)),
    ...changes.filter((c) => c.id === req.user.id).map((c) => c.id),
  ]
  const applicable = changes.filter((c) => c.id !== req.user.id)
  await assertSafeAdminChange(req.user.id, applicable)

  const updated = await prisma.$transaction(applicable.map((c) => prisma.user.update({
    where: { id: c.id },
    data: { role: c.nextRole, status: c.nextStatus, tokenVersion: { increment: 1 } },
    select: userSelect,
  })))

  for (const c of applicable.filter((c) => c.nextRole !== c.current.role)) {
    await notify(c.id, 'ROLE_CHANGED', 'เปลี่ยนสิทธิ์การใช้งาน',
      `ผู้ดูแลระบบเปลี่ยนสิทธิ์ของคุณเป็น${ROLE_LABEL[c.nextRole]}`, '/dashboard')
  }
  await notifyMany(
    applicable.filter((c) => c.current.status !== 'ACTIVE' && c.nextStatus === 'ACTIVE').map((c) => c.id),
    'ACCOUNT_APPROVED', 'บัญชีได้รับการอนุมัติ', 'คุณสามารถเข้าสู่ระบบและใช้งานระบบได้แล้ว')
  await notifyMany(
    applicable.filter((c) => c.current.status === 'ACTIVE' && c.nextStatus === 'SUSPENDED').map((c) => c.id),
    'ACCOUNT_SUSPENDED', 'บัญชีถูกระงับการใช้งาน', 'กรุณาติดต่อผู้ดูแลระบบ')
  await audit(req.user.id, 'BULK_UPDATE_USER', 'User', null, {
    ids,
    changes: applicable.map((c) => ({ id: c.id, fromRole: c.current.role, toRole: c.nextRole, fromStatus: c.current.status, toStatus: c.nextStatus })),
    skipped,
  })
  ok(res, { updated: updated.length, skipped }, `อัปเดต ${updated.length} บัญชีสำเร็จ`)
}))

// ผู้ดูแลสามารถลบรูปโปรไฟล์ของบัญชีอื่นได้ (กฎห้ามเปลี่ยนสิทธิ์/สถานะตัวเองยังคงเดิม)
usersRouter.delete('/:id/avatar', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const target = await prisma.user.findUnique({ where: { id }, select: userSelect })
  if (!target) throw new ApiError(404, 'ไม่พบผู้ใช้งาน')
  if (!target.avatarUrl) throw new ApiError(400, 'บัญชีนี้ยังไม่มีรูปโปรไฟล์')
  const user = await prisma.user.update({
    where: { id }, data: { avatarUrl: null }, select: userSelect,
  })
  await removeAvatarFile(target.avatarUrl, id)
  await audit(req.user.id, 'DELETE_AVATAR', 'User', id, { byAdmin: true })
  ok(res, user, 'ลบรูปโปรไฟล์ของผู้ใช้สำเร็จ')
}))

usersRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id) throw new ApiError(400, 'ไม่สามารถลบบัญชีตัวเองได้')
  const target = await prisma.user.findUnique({ where: { id }, include: { taughtClassrooms: true } })
  if (!target) throw new ApiError(404, 'ไม่พบผู้ใช้งาน')
  if (target.taughtClassrooms.length)
    throw new ApiError(400, 'ไม่สามารถลบครูที่ยังมีห้องเรียนอยู่ กรุณาโอนห้องเรียนก่อน')

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { userId: id } })
    await tx.passwordResetToken.deleteMany({ where: { userId: id } })
    await tx.enrollment.deleteMany({ where: { userId: id } })
    await tx.attendanceLog.deleteMany({ where: { changedBy: id } })
    await tx.attendance.deleteMany({ where: { userId: id } })
    await tx.scoreLog.deleteMany({ where: { changedBy: id } })
    await tx.submission.deleteMany({ where: { userId: id } })
    await tx.gradeLog.deleteMany({ where: { changedBy: id } })
    await tx.gradeRecord.deleteMany({ where: { userId: id } })
    await tx.announcement.deleteMany({ where: { authorId: id } })
    await tx.assignment.deleteMany({ where: { createdBy: id } })
    await tx.auditLog.updateMany({ where: { actorId: id }, data: { actorId: null } })
    await tx.user.delete({ where: { id } })
  })
  await audit(req.user.id, 'DELETE_USER', 'User', id)
  ok(res, null, 'ลบบัญชีสำเร็จ')
}))
