import type { Config } from "tailwindcss";

/**
 * Tailwind config — берёт дизайн-токены из `src/index.css` через CSS-переменные.
 * Это гарантирует, что одни и те же токены работают и в JSX через utility-классы,
 * и в raw CSS (как в `packages/webapp` miniapp).
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-card": "var(--bg-card)",
        "bg-elevated": "var(--bg-elevated)",
        text: "var(--text)",
        "text-secondary": "var(--text-secondary)",
        "text-hint": "var(--text-hint)",
        "text-on-accent": "var(--text-on-accent)",
        accent: "var(--accent)",
        "accent-dark": "var(--accent-dark)",
        "accent-light": "var(--accent-light)",
        "accent-lighter": "var(--accent-lighter)",
        danger: "var(--danger)",
        "danger-bg": "var(--danger-bg)",
        success: "var(--success)",
        "success-bg": "var(--success-bg)",
        border: "var(--border)",
      },
      backgroundImage: {
        "accent-gradient": "var(--accent-gradient)",
      },
      fontFamily: {
        heading: ["Comfortaa", "SF Pro Display", "sans-serif"],
        body: [
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "sans-serif",
        ],
      },
      borderRadius: {
        sm: "10px",
        DEFAULT: "14px",
        lg: "20px",
        xl: "24px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
        md: "0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25)",
        lg: "0 8px 32px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.3)",
        accent: "0 4px 20px rgba(74,141,245,0.25)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      screens: {
        // Tailwind defaults: sm=640, md=768, lg=1024, xl=1280
        // Оставляем дефолтные breakpoint'ы
      },
    },
  },
  plugins: [],
} satisfies Config;
