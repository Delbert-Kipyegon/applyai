import { getAdminSession } from "../../lib/admin-auth";
import { getAdminStats } from "../../lib/admin-stats";

type AdminPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const session = await getAdminSession();

  if (!session) {
    return (
      <main className="shell admin-shell">
        <section className="admin-login card">
          <div>
            <p className="admin-kicker">Boltiply Admin</p>
            <h1>Sign in</h1>
            <span>Minimal private dashboard for usage, spend, and generation checks.</span>
          </div>
          {params?.error ? <div className="alert error">Incorrect admin password.</div> : null}
          <form action="/api/admin/login" method="post">
            <label>
              Admin password
              <input name="password" placeholder="Enter admin password" type="password" />
            </label>
            <button className="primary" type="submit">
              Open dashboard
            </button>
          </form>
        </section>
      </main>
    );
  }

  const stats = await getAdminStats();

  return (
    <main className="shell admin-shell">
      <div className="admin-top">
        <div>
          <p className="admin-kicker">Boltiply Admin</p>
          <h1>Usage overview</h1>
        </div>
        <form action="/api/admin/logout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>

      <section className="admin-metrics">
        <Metric label="Devices" value={stats.deviceCount.toLocaleString()} />
        <Metric label="Generations" value={stats.generationCount.toLocaleString()} />
        <Metric label="Estimated spend" value={`$${stats.tokenTotals.estimatedCostUsd.toFixed(4)}`} />
        <Metric label="Input tokens" value={stats.tokenTotals.inputTokens.toLocaleString()} />
        <Metric label="Output tokens" value={stats.tokenTotals.outputTokens.toLocaleString()} />
      </section>

      <section className="admin-grid">
        <div className="card admin-table-card">
          <h2>Recent generations</h2>
          <div className="admin-table">
            {stats.recentGenerations.map((generation) => (
              <div className="admin-row" key={`${generation.createdAt}-${generation.jobTitle}`}>
                <span>
                  <strong>{generation.jobTitle || "Role"}</strong>
                  {generation.company || "Company"} · {generation.profileName || "Candidate"}
                </span>
                <span className="admin-stat-cell">
                  <small>Match score</small>
                  <strong>{generation.score ?? 0}%</strong>
                </span>
                <span className="admin-stat-cell">
                  <small>Tokens used</small>
                  <strong>
                    {(generation.inputTokens || 0).toLocaleString()} input /{" "}
                    {(generation.outputTokens || 0).toLocaleString()} output
                  </strong>
                </span>
                <span className="admin-stat-cell">
                  <small>Est. API cost</small>
                  <strong>${(generation.estimatedCostUsd || 0).toFixed(4)}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>

      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

