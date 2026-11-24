// เขตเวลาประเทศไทยใช้สำหรับทุกการแสดงผลวันที่/เวลาให้ตรงกับฝั่งเซิร์ฟเวอร์ (Asia/Bangkok)
export const THAI_TIMEZONE = 'Asia/Bangkok'

export const thaiDate = (value, withTime = true) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('th-TH', {
    calendar: 'gregory', timeZone: THAI_TIMEZONE,
    dateStyle: 'medium', timeStyle: withTime ? 'short' : undefined,
  }).format(new Date(value))
}

/** วันที่ "วันนี้" ตามเวลาประเทศไทย (ใช้เป็นค่าเริ่มต้นของฟอร์ม/ตัวกรอง) */
export const bangkokToday = (value = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: THAI_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))

/** ปีปัจจุบันตามเวลาประเทศไทย (กันกรณีข้ามปีใกล้เที่ยงคืน) */
export const bangkokYear = () => Number(bangkokToday().slice(0, 4))

export const thaiDateTime = (value) => thaiDate(value, true)

/**
 * กันการพังทั้งหน้าเมื่อค่าเวลาที่ได้จาก API เป็นข้อความภาษาไทยที่จัดรูปแบบไว้แล้ว
 * (เช่น "23 พ.ย. 2569 06:22" จาก /api/admin/usage) ซึ่ง new Date() ไม่สามารถแปลงได้
 */
export const safeThaiDateTime = (value) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : thaiDateTime(value)
}

export const thaiDay = (value) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('th-TH', {
    calendar: 'gregory', timeZone: THAI_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(value))
}

export const roleLabel = (role) => ({ ADMIN: 'ผู้ดูแลระบบ', TEACHER: 'ครู', STUDENT: 'นักเรียน' }[role] || role)
export const statusLabel = (s) => ({
  PENDING: 'รออนุมัติ', ACTIVE: 'เปิดใช้งาน', SUSPENDED: 'ระงับการใช้งาน',
  PRESENT: 'มาเรียน', LATE: 'มาสาย', ABSENT: 'ขาดเรียน', LEAVE: 'ลา',
  SUBMITTED: 'ส่งแล้ว', GRADED: 'ตรวจแล้ว', PENDING_SUB: 'ยังไม่ส่ง',
}[s] || s)

export const statusColor = (s) => ({
  PRESENT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  LATE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  ABSENT: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  LEAVE: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  SUSPENDED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  SUBMITTED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  GRADED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}[s] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')

export function countdown(target) {
  if (!target) return { text: '—', urgent: false, done: false }
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return { text: 'หมดเวลาส่งแล้ว', urgent: true, done: true }
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return {
    text: d > 0 ? `${d} วัน ${h} ชม.` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    urgent: diff < 86400000,
    done: false,
  }
}

export const initials = (first, last) => `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase()
