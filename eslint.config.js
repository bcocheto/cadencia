import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.es2024,
                global: 'readonly',
                console: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                ARGV: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrors: 'none'}],
            'prefer-const': 'error',
            'eqeqeq': 'error',
            'indent': ['error', 4, {SwitchCase: 0}],
            'semi': ['error', 'always'],
            'no-var': 'error',
        },
    },
];
