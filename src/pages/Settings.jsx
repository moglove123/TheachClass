import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Save, Download, BellRing, MapPin, Clock3, CalendarDays, Database, ShieldCheck, Info } from 'lucide-react'
import { api, downloadFile } from '../api.js'
import { Button, Card, Input, Loader, PageHeader, toast } from '../components/ui.jsx'

const FIELDS = [
  { key: 'REMINDER_HOURS', label: 'ชั่วโมงแจ้งเตือนก่อนกำหนดส่ง', hint: 'คั่นด้วยเครื่องหมายจุลภาค เช่น 24,12,1', icon: BellRing },
  { key: 'GPS_DEFAULT_RADIUS', label: 'รัศมีเช็กชื่อเริ่มต้น (เมตร)', hint: 'ใช้เป็นค่าเริ่มต้นเมื่อสร้างห้องเรียนใหม่', icon: MapPin },
  { key: 'ATTENDANCE_LATE_MINUTES', label: 'เวลามาสายเริ่มต้น (นาที)', hint: 'นับจากเวลาเปิดเช็กชื่อ', icon: Clock3 },
  { key: 'SUBMISSION_DEFAULT_DAYS', label: 'จำนวนวันกำหนดส่งงานเริ่มต้น', icon: CalendarDays },
  { key: 'ACADEMIC_YEAR', label: 'ปีการศึกษาปัจจุบัน', icon: CalendarDays },
  { key: 'SEMESTER', label: 'ภาคเรียนปัจจุบัน', icon: CalendarDays },
]

export default function Settings() {
  const [values, setValues] = useState(null)
  const [busy, setBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [error, setError] = useState(false)

  const load = () => {
    setError(false)
    api.get('/admin/settings').then((res) => setValues(res.data)).catch(() => setError(true))
  }
  useEffect(load, [])

  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    try { const r = await api.put('/admin/settings', values); setValues(r.data); toast(r.message) }
    catch { /* handled */ } finally { setBusy(false) }
  }
  const backup = async () => {
    setBackupBusy(true)
    try {
      await downloadFile('/admin/backup', `theachclass-backup-${Date.now()}.json`)
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'success', message: 'สำรองข้อมูลสำเร็จ' } }))
    } catch { /* handled */ } finally { setBackupBusy(false) }
  }

  return (
    <>
      <PageHeader title="ตั้งค่าระบบ" subtitle="กำหนดค่าทั่วไป แจ้งเตือน และการสำรองข้อมูล" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><SettingsIcon className="h-5 w-5 text-blue-500" /> การตั้งค่าทั่วไป</h2>
          {error ? <div className="py-8 text-center text-sm text-slate-500">โหลดการตั้งค่าไม่ได้ <Button size="sm" variant="secondary" className="ml-2" onClick={load}>ลองใหม่</Button></div>
            : !values ? <Loader />
              : <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map(({ key, label, hint, icon: Icon }) => (
                <div key={key} className="rounded-xl border border-slate-100 p-4 dark:border-slate-700">
                  <Input label={<span className="flex items-center gap-2"><Icon className="h-4 w-4 text-blue-500" /> {label}</span>}
                    value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} hint={hint} />
                </div>
              ))}
            </div>
            <Button type="submit" loading={busy}><Save className="h-4 w-4" /> บันทึกการตั้งค่า</Button>
          </form>}
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><Database className="h-5 w-5 text-emerald-500" /> สำรองข้อมูล</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">ดาวน์โหลดข้อมูลทั้งระบบเป็นไฟล์ JSON (ไม่รวมรหัสผ่าน) เพื่อเก็บสำรอง</p>
            <Button variant="outline" className="mt-4 w-full" loading={backupBusy} onClick={backup}><Download className="h-4 w-4" /> ดาวน์โหลดสำรองข้อมูล</Button>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><ShieldCheck className="h-5 w-5 text-violet-500" /> ความปลอดภัย</h2>
            <ul className="space-y-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <li>✓ รหัสผ่านแฮชก่อนเก็บ ใช้ cookie ที่ปลอดภัย</li>
              <li>✓ ตรวจสิทธิ์ตามบทบาทในทุกเส้นทาง API</li>
              <li>✓ บันทึกประวัติการแก้ไขและตรวจระยะทาง GPS บนเซิร์ฟเวอร์</li>
            </ul>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Info className="mt-0.5 h-4 w-4 shrink-0" /> ระบบแจ้งเตือนกำหนดส่งทำงานอัตโนมัติทุก 1 นาที โดยอ่านค่าจากการตั้งค่าด้านบน</p>
          </Card>
        </div>
      </div>
    </>
  )
}
