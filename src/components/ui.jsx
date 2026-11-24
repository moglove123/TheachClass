import { useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, X, Loader2, Search, ChevronLeft, ChevronRight, Inbox, CircleHelp, ChevronDown, Paperclip } from 'lucide-react'
import { countdown, initials, statusColor, statusLabel } from '../utils.js'

export function toast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { type, message } }))
}

export function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const onToast = (e) => {
      const id = Math.random().toString(36).slice(2)
      setItems((prev) => [...prev, { ...e.detail, id }])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000)
    }
    window.addEventListener('app-toast', onToast)
    return () => window.removeEventListener('app-toast', onToast)
  }, [])
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={`flex items-start gap-3 rounded-md border border-l-2 bg-white p-3.5 shadow-lg animate-[slideIn_.18s_ease-out] dark:bg-slate-800 ${t.type === 'error'
          ? 'border-rose-200 border-l-rose-600 text-rose-800 dark:border-rose-500/25 dark:border-l-rose-400 dark:text-rose-200'
          : 'border-emerald-200 border-l-emerald-600 text-emerald-900 dark:border-emerald-500/25 dark:border-l-emerald-400 dark:text-emerald-200'}`}>
          {t.type === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
          <span className="flex-1 text-sm font-medium">{t.message}</span>
          <button onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} aria-label="ปิดการแจ้งเตือน" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}

/** รูปโปรไฟล์ที่ใช้ได้ทุกสิทธิ์ ถ้าโหลดรูปไม่ได้จะถอยกลับไปแสดงตัวอักษรย่ออัตโนมัติ */
export function Avatar({ user, src, size = 'md', className = '' }) {
  const url = src || user?.avatarUrl
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [url])
  const sizes = {
    xs: 'h-7 w-7 text-[10px]', sm: 'h-8 w-8 text-[11px]', md: 'h-9 w-9 text-xs',
    lg: 'h-14 w-14 text-base', xl: 'h-28 w-28 text-3xl sm:h-32 sm:w-32',
  }
  return (
    <span className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-blue-700 font-semibold text-white ${sizes[size] || sizes.md} ${className}`}>
      {url && !failed
        ? <img src={url} alt={`รูปโปรไฟล์ ${user?.firstName || ''}`} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : initials(user?.firstName, user?.lastName)}
    </span>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${className}`}>{children}</div>
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'border-l-blue-600 text-blue-700 dark:border-l-blue-400 dark:text-blue-300',
    green: 'border-l-emerald-600 text-emerald-700 dark:border-l-emerald-400 dark:text-emerald-300',
    amber: 'border-l-amber-500 text-amber-700 dark:border-l-amber-400 dark:text-amber-300',
    rose: 'border-l-rose-600 text-rose-700 dark:border-l-rose-400 dark:text-rose-300',
    violet: 'border-l-violet-600 text-violet-700 dark:border-l-violet-400 dark:text-violet-300',
  }
  // การ์ดสถิติแบบ "บัญชีแยกประเภท": เส้นนำสายตาด้านซ้าย + ตัวเลขเรียงหลักตรงกัน
  return (
    <div className={`rounded-lg border border-l-2 border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 ${tones[tone] || tones.blue}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-slate-500 dark:text-slate-400">{label}</p>
        <Icon className="h-4 w-4 shrink-0 opacity-60" />
      </div>
      <p className="mt-2 font-display text-[26px] leading-none tabular-nums text-slate-900 dark:text-white">{value ?? 0}</p>
      {sub && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}

export function Button({ children, variant = 'primary', size = 'md', className = '', loading, ...props }) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
    danger: 'bg-rose-700 text-white hover:bg-rose-800',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white',
    outline: 'border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/50',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-4 py-2.5 text-sm' }
  return (
    <button {...props} disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  )
}

export function Input({ label, hint, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>}
      <input {...props} className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 ${className}`} />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>}
      <select {...props} className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-white ${className}`}>{children}</select>
    </label>
  )
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>}
      <textarea {...props} className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-white dark:placeholder:text-slate-500 ${className}`} />
    </label>
  )
}

export function Badge({ status, children, labels, className = '' }) {
  const text = children || labels?.[status] || statusLabel(status)
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ring-slate-900/[0.06] dark:ring-white/10 ${status ? statusColor(status) : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'} ${className}`}>{text}</span>
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    const panel = panelRef.current
    const focusable = () => [...(panel?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || [])]
    focusable()[0]?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 animate-[fadeIn_.12s_ease-out]" onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current?.()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl animate-[popIn_.16s_ease-out] dark:border-slate-700 dark:bg-slate-800 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-700">
          <h3 id={titleId} className="font-display text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} aria-label="ปิดหน้าต่าง" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 dark:border-slate-700 dark:bg-slate-900/30">{footer}</div>}
      </div>
    </div>
  )
}

export function Confirm({ open, onClose, onConfirm, title = 'ยืนยันการลบ', message = 'ข้อมูลนี้จะถูกลบถาวร ต้องการดำเนินการต่อหรือไม่?', loading, variant = 'danger', confirmLabel = 'ยืนยันลบ' }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant={variant} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </Modal>
  )
}

export function SearchBox({ value, onChange, placeholder = 'ค้นหา...', label }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder}
        className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-white" />
    </div>
  )
}

export function Pagination({ page, pages, total, onChange }) {
  if (pages <= 1) return <p className="text-xs text-slate-400">ทั้งหมด {total} รายการ</p>
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span>ทั้งหมด {total} รายการ · หน้า {page}/{pages}</span>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="หน้าก่อนหน้า" className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"><ChevronLeft className="h-4 w-4" /></button>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="หน้าถัดไป" className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50"><ChevronRight className="h-4 w-4" /></button>
    </div>
  )
}

export function Table({ headers, children, empty, className = '' }) {
  return (
    <>
      <div className={`overflow-x-auto ${className}`}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>{headers.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">{children}</tbody>
        </table>
        {empty && <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400"><Inbox className="h-8 w-8" /><p className="text-sm">ไม่พบข้อมูล</p></div>}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400 sm:hidden">← เลื่อนตารางเพื่อดูข้อมูลเพิ่ม →</p>
    </>
  )
}

export function Loader({ label = 'กำลังโหลด...' }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" />{label}</div>
}

/** แยก "โหลดไม่ได้" ออกจาก "ไม่มีข้อมูล" เสมอ เพื่อไม่ให้หน้าเวียนโหลดค้างหรือโกหกผู้ใช้ */
export function ErrorState({ message = 'โหลดข้อมูลไม่ได้', onRetry, retryLabel = 'ลองใหม่' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
      <AlertCircle className="h-8 w-8 text-rose-400" />
      <p>{message}</p>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>{retryLabel}</Button>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-tight text-slate-900 dark:text-white sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** กล่องวิธีใช้งานแบบย่อ เข้าใจง่าย ไม่บังคับอ่าน */
export function Guide({ title = 'วิธีใช้งานหน้านี้', steps = [], children }) {
  return (
    <details className="group mb-5 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
        <CircleHelp className="h-4 w-4 text-slate-400" /> {title}
        <ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300">
        {steps.length ? (
          <ol className="space-y-2">
            {steps.map((s, i) => <li key={i} className="flex gap-3"><span className="w-4 shrink-0 pt-0.5 font-mono text-[11px] text-slate-400">{String(i + 1).padStart(2, '0')}</span><span>{s}</span></li>)}
          </ol>
        ) : children}
      </div>
    </details>
  )
}

/** ซ่อนตัวเลือกที่ใช้งานไม่บ่อย เพื่อให้ฟอร์มดูไม่ซับซ้อน */
export function Advanced({ title = 'ตัวเลือกขั้นสูง', hint, children }) {
  return (
    <details className="group rounded-md border border-slate-200 dark:border-slate-700">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
        {title}
        {hint && <span className="text-xs font-normal text-slate-400">· {hint}</span>}
        <ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">{children}</div>
    </details>
  )
}

export function EmptyState({ icon: Icon = Inbox, title = 'ยังไม่มีข้อมูล', description, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-slate-400">
      <Icon className="h-9 w-9" />
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      {description && <p className="max-w-md text-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Countdown({ dueAt, className = '' }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const c = countdown(dueAt)
  void now
  return <span className={`font-semibold ${c.done ? 'text-rose-600 dark:text-rose-400' : c.urgent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'} ${className}`}>{c.text}</span>
}

export function FileList({ files = [] }) {
  if (!files.length) return <span className="text-slate-400">ไม่มีไฟล์แนบ</span>
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-200"><Paperclip className="h-3 w-3" />{f.name}</a>)}
    </div>
  )
}
