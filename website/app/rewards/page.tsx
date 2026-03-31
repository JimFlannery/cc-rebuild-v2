export default function RewardsPage() {
  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Rewards</h1>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Token Rewards</h2>

        <p className="text-sm">
          SSTM Token Rewards are issued to Cover Parties providing cover in SSTM contracts. In
          Standard or Instant Splitting Risk Sharing Contracts the Cover Reward APY is determined by
          the amount the individual Cover Party commits as coverage in a single contract.
        </p>

        <div>
          <p className="text-sm font-medium mb-2">Cover Party Token Rewards Tier Structure</p>
          <div className="overflow-x-auto">
            <table className="border border-border text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-4 py-2 text-left text-blue-800 dark:text-blue-300 font-medium">Tier</th>
                  <th className="px-4 py-2 text-center text-blue-800 dark:text-blue-300 font-medium">1</th>
                  <th className="px-4 py-2 text-center text-blue-800 dark:text-blue-300 font-medium">2</th>
                  <th className="px-4 py-2 text-center text-blue-800 dark:text-blue-300 font-medium">3</th>
                  <th className="px-4 py-2 text-center text-blue-800 dark:text-blue-300 font-medium">4</th>
                  <th className="px-4 py-2 text-center text-blue-800 dark:text-blue-300 font-medium">5</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-2">Qualifying Amount</td>
                  <td className="px-4 py-2 text-center">$0&ndash;$49k</td>
                  <td className="px-4 py-2 text-center">$50k&ndash;$149k</td>
                  <td className="px-4 py-2 text-center">$150k&ndash;$499k</td>
                  <td className="px-4 py-2 text-center">$500k&ndash;$999k</td>
                  <td className="px-4 py-2 text-center">$1MM+</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">SSTM Cover Reward APY</td>
                  <td className="px-4 py-2 text-center">7%</td>
                  <td className="px-4 py-2 text-center">10%</td>
                  <td className="px-4 py-2 text-center">13%</td>
                  <td className="px-4 py-2 text-center">15%</td>
                  <td className="px-4 py-2 text-center">17%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-sm">
          In Enrollment Risk Sharing Contracts the Cover Rewards APY Tier is determined by the amount
          of cover that all participating Cover Parties collectively commit during the enrollment
          period, and is not based on individual contribution amounts. The greater the coverage
          enrolled collectively, the greater the Cover Reward APY Tier may be achieved for all
          participating cover parties. It is advantageous for participating Cover Parties in
          Enrollment Risk Sharing Orders to share news of the Enrollment Order during the enrollment
          period in an effort to increase Cover participation and maximize the contract return for all
          participating Cover Parties.
        </p>
      </section>
    </main>
  );
}
