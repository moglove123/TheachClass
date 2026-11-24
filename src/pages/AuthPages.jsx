import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Button, Input, toast } from '../components/ui.jsx'

const FEATURES = [
  ['01', 'เช็กชื่อตามรอบ', 'ใช้พิกัดของครูเป็นจุดอ้างอิง ตรวจระยะทางฝั่งเซิร์ฟเวอร์'],
  ['02', 'งานและคะแนน', 'มอบหมายงาน ตรวจให้คะแนน พร้อมประวัติการแก้ไข'],
  ['03', 'รายงาน Excel', 'สรุปการเข้าเรียนและผลการเรียนแยกตามห้องเรียน'],
]

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="app-decor flex min-h-screen">
      <div className="relative hidden w-[45%] flex-col justify-between bg-[#1e486b] px-12 py-10 text-[#eaf3fb] lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-white/25">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-display text-lg leading-tight">TheachClass</span>
            <span className="block text-[9px] uppercase leading-tight tracking-[0.18em] text-white/45">ระบบจัดการชั้นเรียน</span>
          </span>
        </div>

        <div className="max-w-md">
          <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/70">ระบบจัดการชั้นเรียน · {new Date().getFullYear() + 543}</p>
          <h2 className="mt-5 font-display text-[32px] leading-[1.3] text-white">
            เข้าสู่ระบบ<br />เพื่อจัดการชั้นเรียน
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            เช็กชื่อ จัดการงาน และติดตามคะแนนได้หลังเข้าสู่ระบบ
          </p>
          <dl className="mt-9 divide-y divide-white/10 border-y border-white/10">
            {FEATURES.map(([n, title, detail]) => (
              <div key={n} className="flex gap-4 py-3.5">
                <dt className="w-6 shrink-0 pt-0.5 font-mono text-[11px] text-sky-200/80">{n}</dt>
                <dd>
                  <p className="text-[13px] font-medium text-white/90">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/45">{detail}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-[11px] text-white/30">© {new Date().getFullYear()} TheachClass · สงวนสิทธิ์</p>
      </div>

      <div className="flex w-full items-center justify-center px-5 py-10 lg:w-[55%]">
        <div className="w-full max-w-[400px]">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-700 text-white"><GraduationCap className="h-[18px] w-[18px]" /></span>
            <span className="font-display text-lg font-semibold text-slate-900 dark:text-white">TheachClass</span>
          </div>
          <h1 className="text-[26px] leading-tight text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      navigate(user.role === 'ADMIN' ? '/dashboard' : '/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Gmail หรือ password ของท่านผิด')
    } finally { setLoading(false) }
  }
  return (
    <AuthShell title="เข้าสู่ระบบ" subtitle="ใช้บัญชีของสถานศึกษาเพื่อเข้าใช้งานระบบ"
      footer={<>ยังไม่มีบัญชี? <Link to="/register" className="font-semibold text-blue-700 hover:underline dark:text-blue-300">สมัครสมาชิก</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="อีเมล" type="email" required placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="รหัสผ่าน" type="password" required placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="flex justify-end"><Link to="/forgot-password" className="text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-300">ลืมรหัสผ่าน?</Link></div>
        {error && <div role="alert" className="rounded-md border-l-2 border-rose-600 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 dark:border-rose-400 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}
        <Button type="submit" loading={loading} className="w-full" size="lg">เข้าสู่ระบบ</Button>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', studentId: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/register', form)
      await login(form.email, form.password, 'สมัครสมาชิกสำเร็จ! กำลังพาไปหน้าหลัก...')
      navigate('/dashboard', { replace: true })
    } catch { /* handled */ } finally { setLoading(false) }
  }
  return (
    <AuthShell title="สมัครสมาชิก" subtitle="สร้างบัญชีนักเรียนเพื่อเข้าร่วมชั้นเรียนออนไลน์"
      footer={<>มีบัญชีแล้ว? <Link to="/login" className="font-semibold text-blue-700 hover:underline dark:text-blue-300">เข้าสู่ระบบ</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="ชื่อ" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Input label="นามสกุล" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <Input label="อีเมล" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="รหัสผ่าน" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="รหัสนักเรียน (ถ้ามี)" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
          <Input label="เบอร์โทร (ถ้ามี)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">หน้านี้สำหรับสมัครบัญชีนักเรียน — หากต้องการเป็นครู ให้ผู้ดูแลระบบมอบสิทธิ์ในหน้า “ผู้ใช้”</p>
        <Button type="submit" loading={loading} className="w-full" size="lg">สมัครสมาชิก</Button>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [mailSent, setMailSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const request = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', { email })
      if (res.data?.token) {
        setToken(res.data.token)
        setSent(true)
      } else {
        // production: ส่งทางอีเมล ไม่คืน token ใน API response
        setMailSent(true)
      }
      toast(res.message)
    } catch { /* handled */ } finally { setLoading(false) }
  }
  const reset = async (e) => {
    e.preventDefault(); setLoading(true)
    try { await api.post('/auth/reset-password', { token, newPassword }); toast('เปลี่ยนรหัสผ่านสำเร็จ'); window.location.href = '/login' }
    catch { /* handled */ } finally { setLoading(false) }
  }
  return (
    <AuthShell title="ลืมรหัสผ่าน" subtitle="ขอรหัสเพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 1 ชั่วโมง)"
      footer={<Link to="/login" className="font-semibold text-blue-700 hover:underline dark:text-blue-300">กลับไปเข้าสู่ระบบ</Link>}>
      {!sent && !mailSent ? (
        <form onSubmit={request} className="space-y-4">
          <Input label="อีเมลที่ลงทะเบียน" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button loading={loading} className="w-full">ขอรหัสเปลี่ยนรหัสผ่าน</Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          {sent ? (
            <div className="rounded-md border-l-2 border-amber-500 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-400 dark:bg-amber-500/10 dark:text-amber-200">
              รหัสของคุณ: <b className="select-all font-mono">{token}</b><br />ระบบแสดงรหัสที่นี่เนื่องจากยังไม่ได้เชื่อมต่อบริการอีเมล (โหมดพัฒนา/สาธิต)
            </div>
          ) : (
            <div className="rounded-md border-l-2 border-blue-600 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200">
              หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งรหัส/ลิงก์ตั้งรหัสผ่านไปแล้ว กรุณาตรวจสอบ inbox และ spam
            </div>
          )}
          <Input label="รหัสเปลี่ยนรหัสผ่าน" required value={token} onChange={(e) => setToken(e.target.value)} />
          <Input label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษรใน production)" type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Button loading={loading} className="w-full">ตั้งรหัสผ่านใหม่</Button>
        </form>
      )}
    </AuthShell>
  )
}
