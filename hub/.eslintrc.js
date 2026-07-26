const defaultExtends = [
    //"eslint:recommended",
    "react-app",
    //"plugin:react/recommended",
    //"plugin:@typescript-eslint/recommended"
]

module.exports = {
    "env": {
        "browser": true,
        "es2021": true,
        "node": true
    },
    "extends": defaultExtends,
    "ignorePatterns": [
        "build/**",
        "dist/**",
    ],
    "overrides": [
        {
            "files": ["cypress/**"],
            "extends": [
                ...defaultExtends,
                "plugin:cypress/recommended",
            ],
        },
        {
            "files": ["src/**/*.spec.*"],
            "extends": [
                ...defaultExtends,
                "react-app/jest",
            ],
        },
        {
            // The split is enforced structurally — nothing under src/client or
            // src/shared imports src/server — but a bundler only notices at
            // build time, and the `events` case not even then (webpack used to
            // polyfill it silently). This fails in ~200ms instead.
            "files": ["src/client/**/*.{ts,tsx}", "src/shared/**/*.{ts,tsx}"],
            "rules": {
                // plain string patterns: the object form ({group, message})
                // needs ESLint 8, and react-scripts 4 pins ESLint 7.
                "no-restricted-imports": ["error", {
                    "patterns": ["**/server/**"],
                    "paths": [
                        { "name": "events", "message": "Node builtin. Use src/client/lib/Emitter.ts — Vite does not polyfill this." },
                        { "name": "fs", "message": "Node builtin — server-only." },
                        { "name": "net", "message": "Node builtin — server-only." },
                        { "name": "dgram", "message": "Node builtin — server-only." },
                        { "name": "http", "message": "Node builtin — server-only." },
                        { "name": "child_process", "message": "Node builtin — server-only." },
                    ],
                }],
            },
        },
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaFeatures": {
            "jsx": true
        },
        "ecmaVersion": 12,
        "sourceType": "module"
    },
    "plugins": [
        "react",
        "@typescript-eslint"
    ],
    "rules": {
    }
};
