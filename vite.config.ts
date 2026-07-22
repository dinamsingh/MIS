/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

function mockApiPlugin(): Plugin {
  return {
    name: 'mock-api-plugin',
    configureServer(server) {
      server.middlewares.use('/api/generate-quiz', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const numQuestions = parsed.numQuestions || 5;
              const unitName = parsed.unitName || 'Unit';
              const questions = Array.from({ length: numQuestions }).map((_, i) => ({
                text: `[Local Mock] AI-generated question ${i + 1} for ${unitName}?`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctIndex: 0,
                marks: 1
              }));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ questions, rejected: 0 }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Bad Request' }));
            }
          });
        }
      });

      // LOCAL-DEV-ONLY stub for /api/admin-create-teacher. Plain `npm run dev`
      // does not execute Cloudflare Pages Functions, so this fakes a success
      // response for any POST. The REAL function (functions/api/admin-create-
      // teacher.ts) — with actual admin authorization + Supabase Auth user
      // creation — only runs under `wrangler pages dev` or in production.
      server.middlewares.use('/api/admin-create-teacher', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const email = parsed.email || 'teacher@example.com';
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                status: 'created',
                email,
                temporaryPassword: 'Mock-Temp-Pass-1234!',
              }));
            } catch (e) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Bad Request' }));
            }
          });
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  resolve: {
    alias: {
      '@presentation': fileURLToPath(new URL('./src/presentation', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
    },
  },
  build: {
    // Cloudflare Pages output directory (Requirement 22.2)
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion';
          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('@remix-run') ||
            id.includes('scheduler')
          ) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
