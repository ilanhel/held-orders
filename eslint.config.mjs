import next from 'eslint-config-next'

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...next,
  {
    // next/typescript and next's react config already register the
    // @typescript-eslint and react-hooks plugins for these files.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // React 19 rule errors on the legit `useEffect(() => void loadAll(), [...])`
      // pattern; keep it as a warning rather than mass-refactoring.
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'],
  },
]

export default eslintConfig
