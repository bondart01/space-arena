
export default [
  {
    files: ['client/**/*.js'],
    ignores: ['**/node_modules/**', '**/dist/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        URL: 'readonly',
        WebSocket: 'readonly',
        EventTarget: 'readonly',
        CustomEvent: 'readonly',

        // Timers
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',

        // Animation and performance
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        devicePixelRatio: 'readonly',

        // Browser APIs
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        AudioContext: 'readonly',
        Image: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
