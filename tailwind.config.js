export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { ink: '#17212B', paper: '#F2F4F5', accent: '#1F5F5B', line: '#D9DFE2' },
    fontFamily: { serif: ['Newsreader', 'Georgia', 'serif'], sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'] }
  } },
  plugins: []
}
