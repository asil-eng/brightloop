import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "pdf-lib", "bcryptjs"],
};

export default nextConfig;
