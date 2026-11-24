import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, UserRound, Mail, BadgeCheck, Phone, IdCard, CalendarDays } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Avatar, Badge, Button, Card, Confirm, Input, Modal, PageHeader, toast,
} from '../components/ui.jsx'
import { roleLabel, thaiDate } from '../utils.js'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

export default function Profile() {
  const { user, setUser } = useAuth()
  const fileRef = useRef(null)
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' })
  const [pending, setPending] = useState(null) // { file, previewUrl }
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (user) setForm({
      firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '',
    })
  }, [user])

  // กัน object URL ค้างเมื่อออกจากหน้า
  useEffect(() => () => { if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl) }, [pending])

  const pickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      toast('รองรับเฉพาะรูปภาพ PNG, JPG, GIF, WEBP', 'error'); return
    }
    if (file.size > MAX_BYTES) {
      toast('ขนาดรูปต้องไม่เกิน 5 MB', 'error'); return
    }
    setPending({ file, previewUrl: URL.createObjectURL(file) })
  }

  const closePending = () => {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
  }

  const upload = async () => {
    if (!pending) return
    setBusy('avatar')
    try {
      const fd = new FormData()
      fd.append('avatar', pending.file)
      const res = await api.post('/profile/avatar', fd)
      setUser(res.data)
      toast('อัปเดตรูปโปรไฟล์สำเร็จ')
      closePending()
    } catch { /* toast จาก interceptor */ } finally { setBusy('') }
  }

  const removeAvatar = async () => {
    setBusy('delete')
    try {
      const res = await api.delete('/profile/avatar')
      setUser(res.data)
      toast('ลบรูปโปรไฟล์สำเร็จ')
      setConfirmDelete(false)
    } catch { /* handled */ } finally { setBusy('') }
  }

  const saveInfo = async (e) => {
    e.preventDefault(); setBusy('info')
    try {
      const res = await api.patch('/profile', form)
      setUser(res.data)
      toast('บันทึกข้อมูลส่วนตัวสำเร็จ')
    } catch { /* handled */ } finally { setBusy('') }
  }

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }))

  return (
    <>
      <PageHeader title="โปรไฟล์ของฉัน" subtitle="จัดการรูปโปรไฟล์และข้อมูลส่วนตัว — ใช้ได้กับทุกสิทธิ์ (นักเรียน ครู และผู้ดูแลระบบ)" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <Avatar user={user} size="xl" className="ring-4 ring-blue-100 dark:ring-blue-500/20" />
            <h2 className="mt-4 text-lg font-bold text-slate-800 dark:text-white">{user?.firstName} {user?.lastName}</h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{roleLabel(user?.role)}</Badge>
              <Badge status={user?.status} />
            </div>
            <div className="mt-6 flex w-full flex-col gap-2">
              <input ref={fileRef} type="file" accept={ACCEPT} onChange={pickFile} className="hidden" />
              <Button onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> {user?.avatarUrl ? 'เปลี่ยนรูปโปรไฟล์' : 'อัปโหลดรูปโปรไฟล์'}</Button>
              {user?.avatarUrl && <Button variant="outline" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4 text-rose-500" /> ลบรูปโปรไฟล์</Button>}
            </div>
            <p className="mt-3 text-xs text-slate-400">รองรับ PNG, JPG, GIF, WEBP · ขนาดไม่เกิน 5 MB</p>
          </div>
        </Card>

        <Card className="p-5 sm:p-6 lg:col-span-2">
          <h3 className="mb-5 flex items-center gap-2 font-semibold text-slate-800 dark:text-white"><UserRound className="h-4 w-4 text-blue-500" /> ข้อมูลส่วนตัว</h3>
          <form onSubmit={saveInfo} className="grid gap-4 sm:grid-cols-2">
            <Input label="ชื่อ *" value={form.firstName} onChange={set('firstName')} required />
            <Input label="นามสกุล *" value={form.lastName} onChange={set('lastName')} required />
            <Input label="เบอร์โทรศัพท์" value={form.phone} onChange={set('phone')} placeholder="ไม่ระบุก็ได้" />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">อีเมล</span>
              <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-900/40 dark:text-slate-400"><Mail className="h-4 w-4" /> {user?.email}</p>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">รหัสนักเรียน</span>
              <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-900/40 dark:text-slate-400"><IdCard className="h-4 w-4" /> {user?.studentId || '—'}</p>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">สมาชิกตั้งแต่</span>
              <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-900/40 dark:text-slate-400"><CalendarDays className="h-4 w-4" /> {thaiDate(user?.createdAt, false)}</p>
            </div>
            <div className="flex items-end sm:col-span-2">
              <Button type="submit" loading={busy === 'info'}><BadgeCheck className="h-4 w-4" /> บันทึกข้อมูล</Button>
            </div>
          </form>
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Phone className="h-3.5 w-3.5" /> ข้อมูลของคุณจะแสดงให้ครู/เพื่อนร่วมห้องเห็นตามสิทธิ์ที่กำหนดไว้</p>
        </Card>
      </div>

      <Modal open={Boolean(pending)} onClose={closePending} title="ยืนยันรูปโปรไฟล์"
        footer={<><Button variant="secondary" onClick={closePending}>ยกเลิก</Button><Button loading={busy === 'avatar'} onClick={upload}>บันทึกภาพนี้</Button></>}>
        {pending && <div className="flex flex-col items-center gap-4">
          <img src={pending.previewUrl} alt="ตัวอย่างรูปโปรไฟล์" className="h-44 w-44 rounded-lg object-cover shadow-sm" />
          <div className="text-center">
            <p className="break-all text-sm font-medium text-slate-700 dark:text-slate-200">{pending.file.name}</p>
            <p className="text-xs text-slate-400">{(pending.file.size / 1024).toFixed(0)} KB</p>
          </div>
        </div>}
      </Modal>

      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={removeAvatar}
        title="ลบรูปโปรไฟล์" message="ต้องการลบรูปโปรไฟล์นี้หรือไม่? ระบบจะกลับไปแสดงตัวอักษรย่อแทน"
        loading={busy === 'delete'} confirmLabel="ยืนยันลบรูป" />
    </>
  )
}
