import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../server/db.js'

/**
 * กู้คืนข้อมูลจากไฟล์ที่ได้จาก GET/POST /api/admin/backup
 * ใช้งาน: node scripts/restore-backup.js <backup.json> --force
 * ข้อมูลทั้งหมดใน DATABASE_URL จะถูกแทนที่ (ห้ามลืมสำรองก่อนกู้คืน)
 */
const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file || !args.includes('--force')) {
  console.error('ใช้งาน: node scripts/restore-backup.js <backup.json> --force')
  process.exit(1)
}

const TABLES = {
  users: { keys: ['id', 'studentId', 'firstName', 'lastName', 'email', 'role', 'status', 'phone', 'avatarUrl', 'createdAt', 'updatedAt'], dates: ['createdAt', 'updatedAt'] },
  classrooms: { keys: ['id', 'code', 'name', 'subject', 'subjectCode', 'semester', 'academicYear', 'teacherId', 'joinCode', 'gpsLat', 'gpsLng', 'gpsRadius', 'checkinOpenAt', 'checkinCloseAt', 'attendanceOpen', 'lateAfterMinutes', 'weightAssignment', 'weightCollection', 'weightMidterm', 'weightFinal', 'weightActivity', 'weightBonus', 'createdAt', 'updatedAt'], dates: ['checkinOpenAt', 'checkinCloseAt', 'createdAt', 'updatedAt'] },
  enrollments: { keys: ['id', 'classroomId', 'userId', 'joinedAt'], dates: ['joinedAt'] },
  attendanceSessions: { keys: ['id', 'classroomId', 'title', 'date', 'status', 'gpsLat', 'gpsLng', 'gpsRadius', 'lateAfterMinutes', 'openedAt', 'closesAt', 'closedAt', 'createdById', 'createdAt', 'updatedAt'], dates: ['openedAt', 'closesAt', 'closedAt', 'createdAt', 'updatedAt'] },
  attendance: { keys: ['id', 'classroomId', 'userId', 'date', 'status', 'checkinAt', 'lat', 'lng', 'distanceM', 'note', 'recordedBy', 'sessionId', 'createdAt', 'updatedAt'], dates: ['checkinAt', 'createdAt', 'updatedAt'] },
  attendanceLogs: { keys: ['id', 'attendanceId', 'classroomId', 'userId', 'oldStatus', 'newStatus', 'reason', 'changedBy', 'createdAt'], dates: ['createdAt'] },
  leaveRequests: { keys: ['id', 'classroomId', 'userId', 'date', 'reason', 'status', 'attendanceId', 'reviewedBy', 'reviewedAt', 'reviewNote', 'createdAt', 'updatedAt'], dates: ['reviewedAt', 'createdAt', 'updatedAt'] },
  assignments: { keys: ['id', 'classroomId', 'title', 'description', 'attachments', 'startAt', 'dueAt', 'maxScore', 'bonusScore', 'allowLate', 'latePenaltyPercent', 'extensionMinutes', 'isOpen', 'createdBy', 'createdAt', 'updatedAt'], dates: ['startAt', 'dueAt', 'createdAt', 'updatedAt'] },
  submissions: { keys: ['id', 'assignmentId', 'userId', 'files', 'note', 'submittedAt', 'isLate', 'status', 'score', 'feedback', 'gradedAt', 'gradedBy', 'attempt'], dates: ['submittedAt', 'gradedAt'] },
  scoreLogs: { keys: ['id', 'submissionId', 'changedBy', 'oldScore', 'newScore', 'note', 'createdAt'], dates: ['createdAt'] },
  gradeRecords: { keys: ['id', 'classroomId', 'userId', 'category', 'score', 'maxScore', 'updatedBy', 'updatedAt'], dates: ['updatedAt'] },
  gradeLogs: { keys: ['id', 'gradeRecordId', 'changedBy', 'oldScore', 'newScore', 'note', 'createdAt'], dates: ['createdAt'] },
  gradeScales: { keys: ['id', 'classroomId', 'grade', 'minScore', 'maxScore'] },
  announcements: { keys: ['id', 'classroomId', 'authorId', 'title', 'body', 'pinned', 'createdAt'], dates: ['createdAt'] },
  notifications: { keys: ['id', 'userId', 'type', 'title', 'body', 'link', 'isRead', 'createdAt'], dates: ['createdAt'] },
  auditLogs: { keys: ['id', 'actorId', 'action', 'entity', 'entityId', 'details', 'createdAt'], dates: ['createdAt'] },
  settings: { keys: ['key', 'value'] },
}

const DELETE_ORDER = [
  'notification', 'auditLog', 'passwordResetToken', 'scoreLog', 'gradeLog',
  'gradeRecord', 'submission', 'attendanceLog', 'leaveRequest', 'attendance',
  'attendanceSession', 'assignment', 'enrollment', 'gradeScale', 'announcement',
  'setting', 'classroom', 'user',
]
const CREATE_ORDER = [
  'users', 'classrooms', 'enrollments', 'gradeScales', 'assignments',
  'attendanceSessions', 'attendance', 'attendanceLogs', 'leaveRequests',
  'submissions', 'scoreLogs', 'gradeRecords', 'gradeLogs', 'announcements',
  'notifications', 'auditLogs', 'settings',
]

function toData(table, row) {
  const spec = TABLES[table]
  const data = {}
  for (const key of spec.keys) {
    if (row[key] === undefined) continue
    data[key] = (spec.dates || []).includes(key) && row[key] ? new Date(row[key]) : row[key]
  }
  return data
}

const backup = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const tables = backup?.tables
if (!tables || typeof tables !== 'object') throw new Error('ไฟล์ backup ไม่ถูกต้อง (ไม่พบ tables)')
for (const name of Object.keys(TABLES)) {
  if (!Array.isArray(tables[name])) throw new Error(`ไฟล์ backup ขาดตาราง ${name} หรือมีรูปแบบไม่ถูกต้อง`)
}

const fallbackHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
const summary = {}

await prisma.$transaction(async (tx) => {
  for (const model of DELETE_ORDER) await tx[model].deleteMany()

  for (const name of CREATE_ORDER) {
    for (const row of tables[name]) {
      const data = toData(name, row)
      // ไฟล์ backup ไม่เก็บ passwordHash (ตามนโยบายความเป็นส่วนตัว)
      // ผู้ใช้ที่กู้คืนจะต้องขอเปลี่ยนรหัสผ่านใหม่ผ่าน forgot-password
      if (name === 'users') {
        data.passwordHash = typeof row.passwordHash === 'string' && row.passwordHash
          ? row.passwordHash
          : fallbackHash
        data.tokenVersion = row.tokenVersion ?? 0
      }
      await tx[{
        users: 'user', classrooms: 'classroom', enrollments: 'enrollment',
        gradeScales: 'gradeScale', assignments: 'assignment', attendanceSessions: 'attendanceSession',
        attendance: 'attendance', attendanceLogs: 'attendanceLog', leaveRequests: 'leaveRequest',
        submissions: 'submission', scoreLogs: 'scoreLog', gradeRecords: 'gradeRecord',
        gradeLogs: 'gradeLog', announcements: 'announcement', notifications: 'notification',
        auditLogs: 'auditLog', settings: 'setting',
      }[name]].create({ data })
    }
    summary[name] = tables[name].length
  }

  await tx.auditLog.create({
    data: {
      action: 'RESTORE_BACKUP', entity: 'System', entityId: null,
      details: JSON.stringify({ source: path.basename(file), exportedAt: backup.exportedAt, summary }),
    },
  })
}, { timeout: 300000 })

await prisma.$disconnect()
console.log('กู้คืนข้อมูลสำเร็จ:', JSON.stringify(summary))
