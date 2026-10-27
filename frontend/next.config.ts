import type { NextConfig } from "next";

// where the Go API lives: localhost while developing on the Pi,
// the "api" container once both run in Docker (set in the Dockerfile and compose.yaml)
const API_URL = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // "standalone": the build produces a minimal server.js plus only the files it needs,
  // so the Docker image doesn't carry all of node_modules
  output: "standalone",
  async rewrites() {
    return [
      {
        // any request to /api/... is passed on to Go, invisibly to the visitor
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
