import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

// Development (npm run dev): /api/* is forwarded to the backend, so the page and API share one address.
//   BACKEND_URL defaults to your local backend; set it in .env.development.local to use the live server.
// Production (npm run build): a static site in ./out, served by nginx (nginx forwards /api/* to the backend).
export default function nextConfig(phase) {
    if (phase === PHASE_DEVELOPMENT_SERVER) {
        const backend = process.env.BACKEND_URL || 'http://localhost:8030';
        return {
            async rewrites() {
                return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
            },
        };
    }
    return { output: 'export', images: { unoptimized: true } };
}
