import { testDbConnection } from './_actions/testDb';

export default async function Home() {
  const result = await testDbConnection();

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold">ConditionCover</h1>
      <div className={`rounded-lg border px-6 py-4 text-sm ${result.ok ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-800'}`}>
        <p className="font-medium">{result.ok ? 'MySQL connected' : 'MySQL connection failed'}</p>
        <p className="mt-1 font-mono text-xs">{result.message}</p>
      </div>
    </main>
  );
}
