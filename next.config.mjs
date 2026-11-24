/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  reactStrictMode: false, // the dashboard modules draw charts into canvases once; strict-mode double mounting is handled in mount(), but keep dev output predictable
};
export default nextConfig;
