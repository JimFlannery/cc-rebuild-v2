import { testDbConnection } from './_actions/testDb';

export default async function Home() {
  const result = await testDbConnection();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-16">
      <h1 className="text-2xl font-semibold">ConditionCover</h1>
      <div className={`rounded-lg border px-6 py-4 text-sm ${result.ok ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-800'}`}>
        <p className="font-medium">{result.ok ? 'MySQL connected' : 'MySQL connection failed'}</p>
        <p className="mt-1 font-mono text-xs">{result.message}</p>
      </div>
    </main>
  );
}
