/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,OPTIONS,PATCH,DELETE,POST,PUT",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
    ];
  },
};

// @next/bundle-analyzer は devDependency のため、devDependencies を含めない
// 本番インストールでも起動できるよう ANALYZE=true のときだけ require する
module.exports =
  process.env.ANALYZE === "true"
    ? require("@next/bundle-analyzer")({ enabled: true, openAnalyzer: false })(
        nextConfig,
      )
    : nextConfig;
