/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 以下の行を追加
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
