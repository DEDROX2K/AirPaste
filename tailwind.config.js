/* global module, require */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./renderer/index.html",
    "./renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        ap: {
          surface: {
            shell: 'hsl(var(--ap-surface-shell))',
            panel: 'hsl(var(--ap-surface-panel))',
            menu: 'hsl(var(--ap-surface-menu))',
            dialog: 'hsl(var(--ap-surface-dialog))',
            inspector: 'hsl(var(--ap-surface-inspector))',
            muted: 'hsl(var(--ap-surface-muted))',
          },
          border: {
            subtle: 'hsl(var(--ap-border-subtle))',
            strong: 'hsl(var(--ap-border-strong))',
          },
          text: {
            primary: 'hsl(var(--ap-text-primary))',
            secondary: 'hsl(var(--ap-text-secondary))',
          }
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'ap-sm': 'var(--ap-radius-sm)',
        'ap-md': 'var(--ap-radius-md)',
        'ap-lg': 'var(--ap-radius-lg)',
        'ap-xl': 'var(--ap-radius-xl)',
      },
      zIndex: {
        'ap-canvas': '0',
        'ap-panel': '50',
        'ap-menu': '100',
        'ap-overlay': '200',
        'ap-dialog': '300',
        'ap-toast': '400',
        'ap-max': '9999',
      },
      transitionDuration: {
        'ap-fast': 'var(--ap-duration-fast)',
        'ap-normal': 'var(--ap-duration-normal)',
        'ap-slow': 'var(--ap-duration-slow)',
      },
      transitionTimingFunction: {
        'ap-spring': 'var(--ap-ease-spring)',
        'ap-smooth': 'var(--ap-ease-smooth)',
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
}
