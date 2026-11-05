/** Tailwind preset: ranglar CSS o'zgaruvchilari orqali (qorong'i rejim va Telegram mavzusi uchun). */
const v = (n) => `var(--c-${n})`;
module.exports = {
  theme: {
    screens: { sm: "360px", md: "768px", lg: "1024px", xl: "1440px" },
    extend: {
      colors: {
        brand: { DEFAULT: v("brand"), dark: v("brand-dark"), soft: v("brand-soft"), on: v("on-brand") },
        ink: { DEFAULT: v("ink"), 2: v("ink-2") },
        muted: { DEFAULT: v("muted"), 2: v("muted-2") },
        bg: v("bg"), surface: v("surface"), line: { DEFAULT: v("border"), strong: v("border-strong"), soft: v("divider") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
        warning: { DEFAULT: v("warning"), soft: v("warning-soft") },
        danger: { DEFAULT: v("danger"), soft: v("danger-soft") },
      },
      borderRadius: { sm: "6px", md: "10px", lg: "12px", xl: "16px" },
      fontSize: { caption: ["12px", "16px"], "body-sm": ["13px", "18px"], body: ["14px", "20px"], "body-lg": ["16px", "24px"], "title-sm": ["17px", "24px"], title: ["20px", "28px"], h2: ["26px", "32px"], h1: ["30px", "36px"] },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      fontFamily: { sans: ["Manrope Variable", "Manrope", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
};
