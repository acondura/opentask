import Head from 'next/head'
import Link from 'next/link'

export default function Home() {
  return (
    <>
      <Head>
        <title>OpenTask — Dashboard</title>
      </Head>
      <main style={{fontFamily: 'system-ui, sans-serif', padding: 24}}>
        <h1>OpenTask</h1>
        <p>A minimal task/project demo. Open the dashboard to create projects and nested tasks with drag and drop.</p>
        <p>
          <Link href="/dashboard">Go to Dashboard</Link>
        </p>
      </main>
    </>
  )
}
