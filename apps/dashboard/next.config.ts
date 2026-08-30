import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/portal/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
