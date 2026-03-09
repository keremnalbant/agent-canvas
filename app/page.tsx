'use client'

import dynamic from 'next/dynamic'

const App = dynamic(() => import('../client/App'), { ssr: false })

export default function Page() {
	return <App />
}
