import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	serverExternalPackages: ['@anthropic-ai/claude-agent-sdk', 'tldraw', '@tldraw/tlschema'],

	turbopack: {
		resolveAlias: {
			'zod/v4/locales/index.js': './scripts/zod-locales-shim.js',
		},
	},
}

export default nextConfig
