import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 60000,
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const url = String(error.config?.url || '')
    // /auth/me เรียกตอน bootstrap ทุกครั้งที่เปิดหน้า guest → 401 ที่นี่เป็นเรื่องปกติ
    const bootstrap = url.includes('/auth/me')
    const guestPage = ['/login', '/register', '/forgot-password', '/reset-password']
      .some((p) => window.location.pathname.startsWith(p))
    // 401 ตอนล็อกอินหน้า guest จัดการ error ในฟอร์มอยู่แล้ว ไม่ต้องซ้ำ toast
    const silentToast = bootstrap || (guestPage && error.response?.status === 401)
    if (!silentToast) {
      const message = error.response?.data?.message || (error.code === 'ECONNABORTED' ? 'การเชื่อมต่อใช้เวลานานเกินไป' : 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้')
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'error', message } }))
    }
    if (error.response?.status === 401 && !bootstrap && !guestPage) {
      window.dispatchEvent(new CustomEvent('app-unauthorized'))
    }
    return Promise.reject(error)
  },
)

/**
 * ดาวน์โหลดไฟล์จริง (Excel/JSON) ผ่าน fetch โดยตรง
 * - ไม่ผ่าน response interceptor ที่แปลงเป็น response.data เสมอ → ได้ Blob ของจริง
 * - ใช้ filename* (UTF-8) จากเซิร์ฟเวอร์เป็น fallback ถ้าไม่ได้ส่งชื่อมา
 * - หน่วง revokeObjectURL เพื่อไม่ให้เบราว์เซอร์ยกเลิกไฟล์ก่อนบันทึกเสร็จ
 */
export const downloadFile = async (url, filename) => {
  const fullUrl = url.startsWith('/api/') ? url : `/api${url.startsWith('/') ? '' : '/'}${url}`
  const res = await fetch(fullUrl, { credentials: 'include' })

  if (!res.ok) {
    let message = 'ดาวน์โหลดไฟล์ไม่สำเร็จ'
    try {
      const body = await res.json()
      message = body.message || message
    } catch { /* ไม่ใช่ JSON */ }
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { type: 'error', message } }))
    throw new Error(message)
  }

  const blob = await res.blob()
  const contentType = blob.type || res.headers.get('content-type') || 'application/octet-stream'
  const fileBlob = blob.type ? blob : new Blob([blob], { type: contentType })

  let serverName = ''
  const disposition = res.headers.get('content-disposition') || ''
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) {
    try { serverName = decodeURIComponent(utf8[1]) } catch { /* ใช้ชื่อที่ส่งมาแทน */ }
  }
  const finalName = filename || serverName || 'download'

  const href = URL.createObjectURL(fileBlob)
  const a = document.createElement('a')
  a.href = href
  a.download = finalName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // อย่า revoke ทันทีหลัง click — บางเบราว์เซอร์บันทึกไม่เสร็จ
  setTimeout(() => URL.revokeObjectURL(href), 2000)
}
