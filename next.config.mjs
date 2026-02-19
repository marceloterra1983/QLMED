/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs', 'node-forge', 'xml-crypto', 'xml2js'],
  },
};

export default nextConfig;
