/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sarabun', 'system-ui', 'sans-serif'],
        display: ['Noto Serif Thai', 'Sarabun', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      // น้ำหนักตัวอักษรหนาขึ้นอีกระดับ + ขนาดใหญ่ขึ้นนิดนึง đểอ่านง่ายขึ้น
      fontWeight: {
        light: '500',
        normal: '600',
        medium: '700',
        semibold: '800',
        bold: '900',
        extrabold: '900',
        black: '900',
      },
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],   // 12 → 13px
        sm: ['0.9375rem', { lineHeight: '1.45rem' }],   // 14 → 15px
        base: ['1.0625rem', { lineHeight: '1.65rem' }], // 16 → 17px
        lg: ['1.1875rem', { lineHeight: '1.75rem' }],
        xl: ['1.375rem', { lineHeight: '1.9rem' }],
        '2xl': ['1.625rem', { lineHeight: '2.1rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.3rem' }],
      },
      colors: {
        // สีหลัก: น้ำเงินทะเลสดใสขึ้น แต่ยังเข้มพอให้ตัวอักษรขาวอ่านชัด
        brand: {
          50: '#eef5fc', 100: '#dcebf8', 200: '#bad7f0', 300: '#8fbde5',
          400: '#5e9ad3', 500: '#3d7db8', 600: '#2d6ba6', 700: '#245784',
          800: '#1e486b', 900: '#1a3b57', 950: '#112838',
        },
        blue: {
          50: '#eef5fc', 100: '#dcebf8', 200: '#bad7f0', 300: '#8fbde5',
          400: '#5e9ad3', 500: '#3d7db8', 600: '#2d6ba6', 700: '#245784',
          800: '#1e486b', 900: '#1a3b57', 950: '#112838',
        },
        // เทาโทนเย็นออกฟ้า: พื้นหลังสีฟ้าอ่อน + ตัวอักษรเข้มขึ้นเพื่อความคมชัด
        slate: {
          50: '#f7fafc', 100: '#edf3f8', 200: '#dbe5ee', 300: '#c2d0dd',
          400: '#76899d', 500: '#637689', 600: '#43576d', 700: '#32445a',
          800: '#243346', 900: '#182534', 950: '#101a25',
        },
      },
      // มุมโค้งสั้นลงทั้งระบบ ให้ความรู้สึกเป็นงานพิมพ์/งานเอกสาร ไม่ใช่การ์ดแอปสำเร็จรูป
      borderRadius: {
        md: '0.25rem', lg: '0.375rem', xl: '0.5rem',
        '2xl': '0.625rem', '3xl': '0.75rem',
      },
      // เงาแบบบางมาก ใช้เส้นขอบเป็นตัวแบ่งชั้นแทนเงาฟุ้ง
      boxShadow: {
        sm: '0 1px 2px rgba(36, 33, 27, 0.05)',
        DEFAULT: '0 1px 2px rgba(36, 33, 27, 0.06)',
        md: '0 1px 3px rgba(36, 33, 27, 0.07)',
        lg: '0 8px 20px -12px rgba(36, 33, 27, 0.25)',
        xl: '0 14px 32px -18px rgba(36, 33, 27, 0.3)',
        '2xl': '0 22px 44px -22px rgba(36, 33, 27, 0.32)',
      },
    },
  },
  plugins: [],
}
