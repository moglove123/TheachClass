/**
 * การตั้งค่าความปลอดภัยส่วนกลาง
 * - อ่าน JWT_SECRET จาก process.env เสมอ (รองรับ Environment Variable บน Vercel/Cloud)
 * - กันไม่ให้เปิด production โดยไม่ตั้ง secret หรือใช้ค่าสั้นเกินไป
 * - บล็อกเฉพาะค่าตัวอย่างที่รู้จัก ไม่บล็อกค่าที่ผู้ใช้งานตั้งเอง
 * - รวมนโยบายรหัสผ่านไว้ที่เดียว (production บังคับ 8 ตัว โหมดพัฒนา/ทดสอบ 6 ตัวเพื่อเข้ากับข้อมูลเดิม)
 */
const DEV_SECRET = 'classflow-dev-only-secret-change-me'

// เฉพาะค่าตัวอย่าง/ค่าที่เดารู้ได้ง่ายเท่านั้น — ค่าที่ตั้งเอง (>=24 ตัว) ใช้ได้แม้จะมีคำว่า change-this ปนอยู่
const KNOWN_WEAK_SECRETS = new Set([
  'change-this-secret-in-production',
  'change-this-secret',
  'classflow-dev-only-secret-change-me',
  'example',
  'sample',
  'secret123',
])

export const isProduction = () => process.env.NODE_ENV === 'production'

export function isWeakSecret(secret) {
  if (!secret) return true
  const value = String(secret).trim()
  if (value.length < 24) return true
  return KNOWN_WEAK_SECRETS.has(value.toLowerCase())
}

function invalidSecretError() {
  const error = new Error(
    'JWT_SECRET ไม่ถูกต้อง: กรุณาตั้งค่าใน Vercel → Project → Settings → Environment Variables ให้เป็นรหัสสุ่มอย่างน้อย 24 ตัวอักษร (ห้ามใช้ค่าตัวอย่าง change-this-secret-in-production)',
  )
  error.code = 'JWT_SECRET_INVALID'
  return error
}

export function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (isProduction() && isWeakSecret(secret)) throw invalidSecretError()
  return secret || DEV_SECRET
}

export function assertProductionConfig() {
  if (!isProduction()) return
  if (isWeakSecret(process.env.JWT_SECRET)) throw invalidSecretError()
}

export const minPasswordLength = () => (isProduction() ? 8 : 6)

export const passwordHint = () => `รหัสผ่านต้องมีอย่างน้อย ${minPasswordLength()} ตัวอักษร`
