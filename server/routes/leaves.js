import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAuth } from './auth.js'
import { uploadDir } from './files.js'
import { IMAGE_EXT, assertRealImage } from '../fileValidation.js'
import {
  ApiError, asyncHandler, ok, bangkokDateKey, audit, notify, assertClassroomAccess, paginate,
  safeJson, sanitizeFileName,
} from '../utils.js'

export const leavesRouter = Router()
leavesRouter.use(requireAuth)

const reviewStatuses = ['APPROVED', 'REJECTED']
const readableStatuses = ['PENDING', 'APPROVED', 'REJECTED']
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_LEAVE_IMAGES = 3
const leaveFilePattern = /^\/api\/files\/[A-Za-z0-9._-]+$/
const leaveTypes = ['SICK', 'PERSONAL', 'OTHER']
const leaveTypeLabel = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', OTHER: 'ลาทั่วไป' }
const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
const leaveDescription = (leave) => `${leaveTypeLabel[leave.leaveType] || leaveTypeLabel.OTHER}${leave.isHourly ? ` ${leave.startTime}–${leave.endTime} น.` : ''}`

/** ประเภทการลา + ช่วงเวลา (ลารายชั่วโมง) — OTHER ใช้กับคำร้องเก่าที่ยังไม่มีประเภท */
const parseLeaveDetails = (b) => {
  const leaveType = b.leaveType == null || b.leaveType === '' ? 'OTHER' : String(b.leaveType)
  if (!leaveTypes.includes(leaveType)) throw new ApiError(400, 'ประเภทการลาไม่ถูกต้อง')
  const isHourly = b.isHourly === true || b.isHourly === 'true'
  if (!isHourly) return { leaveType, isHourly: false, startTime: null, endTime: null }
  const startTime = String(b.startTime || '')
  const endTime = String(b.endTime || '')
  if (!timePattern.test(startTime) || !timePattern.test(endTime))
    throw new ApiError(400, 'กรุณาระบุช่วงเวลาที่ลาให้ถูกต้อง (HH:MM)')
  if (toMinutes(endTime) <= toMinutes(startTime))
    throw new ApiError(400, 'เวลาสิ้นสุดการลาต้องอยู่หลังเวลาเริ่มต้น')
  if (toMinutes(endTime) - toMinutes(startTime) > 12 * 60)
    throw new ApiError(400, 'ลารายชั่วโมงต้องไม่เกิน 12 ชั่วโมงต่อครั้ง')
  return { leaveType, isHourly, startTime, endTime }
}

/**
 * รับเฉพาะรูปภาพที่อัปโหลดผ่าน /api/upload แล้วจริง ๆ
 * กันการส่ง URL มั่ว / path traversal / ไฟล์ที่ไม่ใช่รูปภาพมาแนบกับคำร้อง
 */
const parseLeaveImages = (value) => {
  const raw = typeof value === 'string' ? safeJson(value) : value
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new ApiError(400, 'ข้อมูลรูปภาพแนบคำร้องลาไม่ถูกต้อง')
  if (raw.length > MAX_LEAVE_IMAGES) throw new ApiError(400, `แนบรูปภาพได้ไม่เกิน ${MAX_LEAVE_IMAGES} รูป`)
  return raw.map((item) => {
    const url = String(item?.url || '')
    const filename = url.startsWith('/api/files/') ? path.basename(url) : ''
    const ext = path.extname(filename).toLowerCase()
    if (!leaveFilePattern.test(url) || !IMAGE_EXT.has(ext))
      throw new ApiError(400, 'แนบได้เฉพาะรูปภาพ (PNG, JPG, GIF, WEBP)')
    const filePath = path.join(uploadDir, filename)
    if (!fs.existsSync(filePath)) throw new ApiError(400, 'ไม่พบรูปภาพที่แนบ กรุณาอัปโหลดใหม่')
    const fd = fs.openSync(filePath, 'r')
    try {
      const header = Buffer.alloc(16)
      const read = fs.readSync(fd, header, 0, 16, 0)
      assertRealImage(header.subarray(0, read), ext)
    } finally { fs.closeSync(fd) }
    return {
      name: sanitizeFileName(item.name || filename), url,
      size: Number(item.size) || 0, type: String(item.type || ''),
    }
  })
}

const withImages = (leave) => ({ ...leave, attachments: safeJson(leave.attachments) })

const leaveInclude = {
  student: { select: { id: true, studentId: true, firstName: true, lastName: true, email: true } },
  classroom: { select: { id: true, name: true, subject: true } },
  reviewer: { select: { id: true, firstName: true, lastName: true } },
}

/** นักเรียนส่งคำร้องลา → ครูของห้องนั้นได้รับการแจ้งเตือน */
leavesRouter.post('/', asyncHandler(async (req, res) => {
  if (req.user.role !== 'STUDENT') throw new ApiError(403, 'เฉพาะนักเรียนเท่านั้นที่แจ้งลาได้')
  const b = req.body ?? {}
  const classroom = await assertClassroomAccess(req.user, b.classroomId)
  const reason = String(b.reason || '').trim()
  if (reason.length < 5) throw new ApiError(400, 'กรุณาระบุเหตุผลการลาให้ชัดเจน (อย่างน้อย 5 ตัวอักษร)')
  const date = datePattern.test(String(b.date || '')) ? String(b.date) : bangkokDateKey()
  const details = parseLeaveDetails(b)
  const attachments = parseLeaveImages(b.attachments)

  // ลาทั้งวันยังคงจำกัด 1 คำร้อง/วัน/วิชา ส่วนลารายชั่วโมงขอเพิ่มได้หลายช่วงแต่ต้องไม่ทับกัน
  const existing = await prisma.leaveRequest.findMany({
    where: { classroomId: classroom.id, userId: req.user.id, date, status: { in: ['PENDING', 'APPROVED'] } },
    select: { isHourly: true, startTime: true, endTime: true },
  })
  const conflict = existing.find((item) => {
    if (!details.isHourly || !item.isHourly) return true
    const start = toMinutes(details.startTime)
    const end = toMinutes(details.endTime)
    const takenStart = toMinutes(item.startTime || '00:00')
    const takenEnd = toMinutes(item.endTime || '23:59')
    return start < takenEnd && takenStart < end
  })
  if (conflict) throw new ApiError(409, details.isHourly
    ? 'ช่วงเวลาที่ลาทับกับคำร้องลาที่มีอยู่แล้วในวันนี้'
    : 'คุณมีคำร้องลาสำหรับวันและวิชานี้อยู่แล้ว')

  const leave = await prisma.leaveRequest.create({
    data: {
      classroomId: classroom.id, userId: req.user.id, date, reason, ...details,
      attachments: JSON.stringify(attachments),
    },
    include: leaveInclude,
  })
  await notify(classroom.teacherId, 'LEAVE_REQUEST', 'มีคำร้องลาใหม่',
    `${req.user.firstName} ${req.user.lastName} แจ้ง${leaveDescription(leave)} ${classroom.name} วันที่ ${date}: ${reason}`,
    `/attendance?leave=${leave.id}`)
  await audit(req.user.id, 'CREATE_LEAVE_REQUEST', 'LeaveRequest', leave.id, {
    classroomId: classroom.id, date, leaveType: details.leaveType,
    isHourly: details.isHourly, startTime: details.startTime, endTime: details.endTime,
    images: attachments.length,
  })
  ok(res, withImages(leave), 'ส่งคำร้องลาให้ครูแล้ว')
}))

leavesRouter.get('/', asyncHandler(async (req, res) => {
  const where = {}
  if (req.user.role === 'STUDENT') where.userId = req.user.id
  else if (req.user.role === 'TEACHER') {
    const classrooms = await prisma.classroom.findMany({ where: { teacherId: req.user.id }, select: { id: true } })
    where.classroomId = { in: classrooms.map((c) => c.id) }
  }
  if (req.query.classroomId) {
    const classroomId = Number(req.query.classroomId)
    // ต้องตรวจสิทธิ์ก่อนเสมอ มิเช่นนั้น query parameter จะไปทับเงื่อนไข
    // where.classroomId = { in: [ห้องของครูคนนี้] } และอ่านข้อมูลห้องครูคนอื่นได้
    try {
      await assertClassroomAccess(req.user, classroomId, { teacherOnly: req.user.role === 'TEACHER' })
    } catch (err) {
      if (err.status === 403) throw new ApiError(404, 'ไม่พบห้องเรียน')
      throw err
    }
    where.classroomId = classroomId
  }
  if (req.query.status && readableStatuses.includes(String(req.query.status)))
    where.status = String(req.query.status)

  const { skip, take, page, limit } = paginate(req.query)
  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where, include: leaveInclude, orderBy: { createdAt: 'desc' }, skip, take,
    }),
    prisma.leaveRequest.count({ where }),
  ])
  ok(res, {
    items: items.map(withImages), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
  })
}))

leavesRouter.patch('/:id/review', asyncHandler(async (req, res) => {
  const leave = await prisma.leaveRequest.findUnique({ where: { id: Number(req.params.id) } })
  if (!leave) throw new ApiError(404, 'ไม่พบคำร้องลา')
  const classroom = await assertClassroomAccess(req.user, leave.classroomId, { teacherOnly: true })
  const status = String(req.body?.status || '')
  if (!reviewStatuses.includes(status)) throw new ApiError(400, 'สถานะการพิจารณาไม่ถูกต้อง')
  if (leave.status !== 'PENDING' && leave.status !== status)
    throw new ApiError(409, 'คำร้องนี้ถูกพิจารณาแล้ว')

  const reviewNote = String(req.body?.reviewNote || '').trim() || null
  let attendanceId = leave.attendanceId

  if (status === 'APPROVED') {
    const existing = await prisma.attendance.findUnique({
      where: {
        classroomId_userId_date: {
          classroomId: leave.classroomId, userId: leave.userId, date: leave.date,
        },
      },
    })
    if (leave.isHourly) {
      // ลารายชั่วโมงไม่เปลี่ยนสถานะรายวัน (นักเรียนยังมาเรียนคาบอื่นได้)
      // บันทึกช่วงเวลาเป็นหมายเหตุและประวัติของบันทึกเดิมเท่านั้น
      if (existing) {
        const period = `ลารายชั่วโมง ${leave.startTime}–${leave.endTime} น. (${leaveTypeLabel[leave.leaveType] || leaveTypeLabel.OTHER})`
        attendanceId = existing.id
        // กดอนุมัติซ้ำต้องไม่เพิ่มหมายเหตุ/ประวัติซ้ำ
        if (!existing.note?.includes(period)) {
          await prisma.attendance.update({
            where: { id: existing.id },
            data: { note: [existing.note, period].filter(Boolean).join(' · '), recordedBy: req.user.id },
          })
          await prisma.attendanceLog.create({
            data: {
              attendanceId: existing.id, classroomId: existing.classroomId, userId: existing.userId,
              oldStatus: existing.status, newStatus: existing.status,
              reason: `อนุมัติ${period}`, changedBy: req.user.id,
            },
          })
        }
      }
      await notify(leave.userId, 'ATTENDANCE_CHANGED', 'อนุมัติลารายชั่วโมง',
        `ครูอนุมัติ${leaveDescription(leave)} วันที่ ${leave.date} ในวิชา ${classroom.name}`)
    } else if (existing) {
      if (existing.status !== 'LEAVE') {
        const updated = await prisma.attendance.update({
          where: { id: existing.id },
          data: { status: 'LEAVE', note: reviewNote || existing.note, recordedBy: req.user.id },
        })
        await prisma.attendanceLog.create({
          data: {
            attendanceId: existing.id, classroomId: existing.classroomId, userId: existing.userId,
            oldStatus: existing.status, newStatus: 'LEAVE',
            reason: reviewNote || `อนุมัติคำร้องลา #${leave.id}`, changedBy: req.user.id,
          },
        })
        attendanceId = updated.id
        await notify(existing.userId, 'ATTENDANCE_CHANGED', 'เปลี่ยนสถานะการเข้าเรียน',
          `ครูอนุมัติการลา วันที่ ${leave.date} ในวิชา ${classroom.name}`)
      } else {
        attendanceId = existing.id
      }
    } else {
      const created = await prisma.attendance.create({
        data: {
          classroomId: leave.classroomId, userId: leave.userId, date: leave.date,
          status: 'LEAVE', note: reviewNote || `อนุมัติคำร้องลา #${leave.id}`, recordedBy: req.user.id,
        },
      })
      attendanceId = created.id
      await notify(leave.userId, 'ATTENDANCE_CHANGED', 'บันทึกการลา',
        `ครูอนุมัติการลา วันที่ ${leave.date} ในวิชา ${classroom.name}`)
    }
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: { status, reviewNote, attendanceId, reviewedBy: req.user.id, reviewedAt: new Date() },
    include: leaveInclude,
  })
  await notify(leave.userId, status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    status === 'APPROVED' ? 'อนุมัติคำร้องลา' : 'ปฏิเสธคำร้องลา',
    `${classroom.name} วันที่ ${leave.date} · ${leaveDescription(leave)}${reviewNote ? ` · ${reviewNote}` : ''}`,
    `/attendance?leave=${leave.id}`)
  await audit(req.user.id, 'REVIEW_LEAVE_REQUEST', 'LeaveRequest', leave.id, {
    classroomId: classroom.id, status, attendanceId, leaveType: leave.leaveType,
  })
  ok(res, withImages(updated), status === 'APPROVED' ? 'อนุมัติคำร้องลาแล้ว' : 'ปฏิเสธคำร้องลาแล้ว')
}))

leavesRouter.delete('/:id', asyncHandler(async (req, res) => {
  const leave = await prisma.leaveRequest.findUnique({ where: { id: Number(req.params.id) } })
  if (!leave) throw new ApiError(404, 'ไม่พบคำร้องลา')
  if (req.user.role !== 'STUDENT' || leave.userId !== req.user.id)
    throw new ApiError(403, 'คุณไม่มีสิทธิ์ยกเลิกคำร้องนี้')
  if (leave.status !== 'PENDING') throw new ApiError(409, 'ไม่สามารถยกเลิกคำร้องที่ครูพิจารณาแล้ว')
  await prisma.leaveRequest.delete({ where: { id: leave.id } })
  await audit(req.user.id, 'CANCEL_LEAVE_REQUEST', 'LeaveRequest', leave.id)
  ok(res, null, 'ยกเลิกคำร้องลาแล้ว')
}))
