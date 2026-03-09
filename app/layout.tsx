import type { Metadata } from 'next'
import '../client/index.css'

export const metadata: Metadata = {
	title: 'Agent Canvas',
	description: 'Visual AI Agent powered by tldraw',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}
