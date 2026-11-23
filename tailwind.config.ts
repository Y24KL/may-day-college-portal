import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#101C35", 900: "#0A1226", 800: "#101C35", 700: "#1A2A4D" },
        royal: { DEFAULT: "#3157C8", 600: "#2847A8", 500: "#3157C8", 400: "#5677D6" },
        sky: { DEFAULT: "#73B9F5", 300: "#A5D3FA" },
        soft: "#F8FAFF",
        lavender: "#E9ECFF",
        gold: { DEFAULT: "#E8B75A", 600: "#C9973A" },
        ink: "#202B45",
        muted: "#8993A8",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(16, 28, 53, 0.10)",
        "glass-lg": "0 20px 60px rgba(16, 28, 53, 0.16)",
      },
      borderRadius: { "2xl": "1.25rem", "3xl": "1.75rem" },
    },
  },
  plugins: [],
} satisfies Config;
