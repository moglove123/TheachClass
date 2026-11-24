/**
 * การตั้งค่าความปลอดภัยส่วนกลาง
 * - กันไม่ให้เปิด production ด้วย JWT_SECRET ตัวอย่าง/สั้นเกินไป
 * - รวมนโยบายรหัสผ่านไว้ที่เดียว (production บังคับ 8 ตัว โหมดพัฒนา/ทดสอบ 6 ตัวเพื่อเข้ากับข้อมูลเดิม)
 */
const DEV_SECRET = 'classflow-dev-only-secret-change-me'
const WEAK_PATTERN = /change[-_ ]?this|dev[-_ ]?only|example|sample|secret123/i

export const isProduction = () => process.env.NODE_ENV === 'production'

export function isWeakSecret(secret) {
  return !secret || String(secret).length < 24 || WEAK_PATTERN.test(String(secret))
}

export function jwtSecret() {
  const secret = process.env.JWT_SECRET
  if (isProduction() && isWeakSecret(secret)) {
    throw new Error('JWT_SECRET ไม่ปลอดภัย: กรุณาตั้งค่ารหัสลับสุ่มอย่างน้อย 24 ตัวอักษรใน .env ก่อนเปิดใช้งาน production')
  }
  return secret || DEV_SECRET
}

export function assertProductionConfig() {
  if (!isProduction()) return
  if (isWeakSecret(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET ไม่ปลอดภัย: กรุณาตั้งค่ารหัสลับสุ่มอย่างน้อย 24 ตัวอักษรใน .env ก่อนเปิดใช้งาน production (ห้ามใช้ค่า change-this-secret-in-production)')
  }
}

export const minPasswordLength = () => (isProduction() ? 8 : 6)

export const passwordHint = () => `รหัสผ่านต้องมีอย่างน้อย ${minPasswordLength()} ตัวอักษร`
