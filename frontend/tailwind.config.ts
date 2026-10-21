import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // FloodSense Official Brand Tokens
        cyan: {
          DEFAULT: "#00D4FF", // primary interactive cyan
          deep: "#00B8D9",    // secondary deep cyan accent
          hover: "#33DDFF",
          glow: "rgba(0, 212, 255, 0.25)",
        },
        dark: {
          bg: "#05080D",       // primary dark background
          surface: "#0B1118",  // secondary dark background
          card: "#111923",     // card & panel background
          border: "#243341",   // crisp dark border
          text: "#F5FAFF",     // primary text in dark mode
          textMuted: "#91A3B5",// secondary text
        },
        light: {
          bg: "#F5F9FC",       // light mode background
          surface: "#FFFFFF",  // surface / card
          text: "#101820",     // primary text
          textMuted: "#64748B",
          border: "#E2E8F0",   // light mode border
          accent: "#00B8D9",   // light mode accent
        },
        abyss: {
          950: "#05080D",
          900: "#0B1118",
          800: "#111923",
          700: "#1A2533",
          600: "#243341",
          500: "#00B8D9",
        },
        silt: {
          50: "#FAF8F5",
          100: "#F5FAFF",
          200: "#E9F2F9",
          300: "#CBD5E1",
          400: "#91A3B5",
          500: "#64748B",
          700: "#334155",
          900: "#0F172A",
        },
        severity: {
          rust: "#D9822B",
          dark: "#8C4A0E",
          light: "#F5A352",
        },
      },
      fontFamily: {
        sans: ["Roboto", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        serif: ["Roboto", "system-ui", "sans-serif"],
        mono: ["Roboto Mono", "Courier New", "monospace"],
      },
      borderRadius: {
        DEFAULT: "2px",
        sm: "2px",
        md: "4px",
        lg: "4px",
      },
      transitionTimingFunction: {
        water: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      borderWidth: {
        hairline: "1px",
      },
      boxShadow: {
        subtle: "0 1px 3px rgba(0, 0, 0, 0.4)",
        depth: "0 10px 30px -10px rgba(2, 11, 13, 0.8)",
      },
    },
  },
  plugins: [],
};

export default config;
