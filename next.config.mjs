/** @type {import('next').NextConfig} */
const nextConfig = {
  // fit-rules.txt is read from disk at runtime; make sure Vercel ships it with every server route.
  // (A copy is also embedded at build time in lib/fitRulesText.generated.js as a safety net.)
  outputFileTracingIncludes: {
    '/**': ['./fit-rules.txt'],
    '/api/run': ['./fit-rules.txt'],
  },
  serverExternalPackages: ['nodemailer'],
  poweredByHeader: false,
};

export default nextConfig;
