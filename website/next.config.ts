import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      { source: "/join", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
