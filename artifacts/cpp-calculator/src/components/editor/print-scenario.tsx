import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  calculateCpp,
  calculateSurvivor,
  formatAge,
  formatMoney,
  formatPercent,
  formatYearMonth,
  type ScenarioInputs,
  type StartAgeResult,
  type SurvivorResult,
} from "@/cpp";

interface PrintScenarioProps {
  inputs: ScenarioInputs;
  scenarioTitle: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatBirth(year: number, month: number): string {
  const m = MONTHS[(month - 1) % 12] ?? "";
  return `${m} ${year}`;
}

function todayLong(): string {
  return new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function PrintScenario({
  inputs,
  scenarioTitle,
}: PrintScenarioProps) {
  const result = useMemo(() => calculateCpp(inputs), [inputs]);

  const sortedAges = useMemo(
    () => [...result.byStartAge].sort((a, b) => a.startAge - b.startAge),
    [result.byStartAge],
  );

  const optimal = useMemo(() => {
    if (sortedAges.length === 0) return null;
    let best = sortedAges[0];
    let bestLifetime =
      best.cumulativeByAge[best.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;
    for (const r of sortedAges) {
      const lifetime =
        r.cumulativeByAge[r.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;
      if (lifetime > bestLifetime) {
        best = r;
        bestLifetime = lifetime;
      }
    }
    return best;
  }, [sortedAges]);

  const earliest = sortedAges[0] ?? null;
  const latest = sortedAges[sortedAges.length - 1] ?? null;

  const survivor: SurvivorResult | null = useMemo(() => {
    if (!inputs.survivor?.enabled) return null;
    try {
      return calculateSurvivor(inputs, inputs.survivor);
    } catch {
      return null;
    }
  }, [inputs]);

  return (
    <article className="print-scenario-article">
      {/* ---------- COVER / SUMMARY PAGE ---------- */}
      <header className="print-scenario-header">
        <div className="print-scenario-brand">Modern CENTS · CPP Scenario</div>
        <h1 className="print-scenario-title">{scenarioTitle || "Untitled scenario"}</h1>
        <div className="print-scenario-meta">
          <span>Generated: {todayLong()}</span>
        </div>
      </header>

      {sortedAges.length === 0 ? (
        <p className="print-scenario-empty">
          No start ages were selected for this scenario, so there is nothing to
          summarize. Add at least one start age in the calculator and try again.
        </p>
      ) : (
        <>
          <RecommendationSummary
            optimal={optimal}
            earliest={earliest}
            latest={latest}
            sortedAges={sortedAges}
          />

          <ClientInputsSection inputs={inputs} />

          <BreakdownSection sortedAges={sortedAges} />

          <DiagnosticsSection sortedAges={sortedAges} />

          <BreakevenSection sortedAges={sortedAges} />

          <EarningsHistorySection inputs={inputs} />

          {survivor ? <SurvivorSection survivor={survivor} /> : null}

          {result.warnings.length > 0 ? (
            <section className="print-scenario-section print-scenario-warnings">
              <h2>Warnings</h2>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className="print-scenario-footer">
            Estimates only. Modern CENTS calculations are based on publicly
            available CPP rules and the inputs entered by the planner. Final
            amounts are determined by Service Canada and may differ.
          </footer>
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Recommendation summary
// ---------------------------------------------------------------------------

function RecommendationSummary({
  optimal,
  earliest,
  latest,
  sortedAges,
}: {
  optimal: StartAgeResult | null;
  earliest: StartAgeResult | null;
  latest: StartAgeResult | null;
  sortedAges: StartAgeResult[];
}) {
  if (!optimal || !earliest || !latest) return null;
  const optimalLifetime =
    optimal.cumulativeByAge[optimal.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;
  const earliestLifetime =
    earliest.cumulativeByAge[earliest.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;
  const latestLifetime =
    latest.cumulativeByAge[latest.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;

  return (
    <section className="print-scenario-section print-scenario-summary">
      <h2>At a glance</h2>
      <table className="print-scenario-table print-scenario-summary-table">
        <tbody>
          <tr>
            <th>Highest projected lifetime benefit</th>
            <td>
              Start at age <strong>{formatAge(optimal.startAge)}</strong> ·{" "}
              {formatMoney(optimal.totalMonthly, true)}/mo (
              {formatMoney(optimal.totalAnnual)}/yr)
            </td>
          </tr>
          <tr>
            <th>Adjustment factor at recommended age</th>
            <td>
              {formatPercent(optimal.adjustmentFactor - 1, true)} (factor{" "}
              {optimal.adjustmentFactor.toFixed(4)})
            </td>
          </tr>
          <tr>
            <th>Earliest take-up considered</th>
            <td>
              Age {formatAge(earliest.startAge)} ·{" "}
              {formatMoney(earliest.totalMonthly, true)}/mo · lifetime{" "}
              {formatMoney(earliestLifetime)}
            </td>
          </tr>
          <tr>
            <th>Latest take-up considered</th>
            <td>
              Age {formatAge(latest.startAge)} ·{" "}
              {formatMoney(latest.totalMonthly, true)}/mo · lifetime{" "}
              {formatMoney(latestLifetime)}
            </td>
          </tr>
          <tr>
            <th>Spread (latest − earliest, lifetime)</th>
            <td>
              {formatMoney(latestLifetime - earliestLifetime)} (
              {formatMoney(optimalLifetime)} at recommended age)
            </td>
          </tr>
          <tr>
            <th>Start ages compared</th>
            <td>
              {sortedAges.map((r) => formatAge(r.startAge)).join(", ")}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Client inputs
// ---------------------------------------------------------------------------

function ClientInputsSection({ inputs }: { inputs: ScenarioInputs }) {
  const sex =
    inputs.sex && inputs.sex !== "unspecified"
      ? inputs.sex.charAt(0).toUpperCase() + inputs.sex.slice(1)
      : "—";
  const a = inputs.assumptions;
  const dropouts = inputs.dropoutPeriods ?? [];

  return (
    <section className="print-scenario-section">
      <h2>Client inputs</h2>

      <div className="print-scenario-twocol">
        <table className="print-scenario-table">
          <tbody>
            <tr>
              <th>Date of birth</th>
              <td>{formatBirth(inputs.birthYear, inputs.birthMonth)}</td>
            </tr>
            <tr>
              <th>Sex</th>
              <td>{sex}</td>
            </tr>
            <tr>
              <th>Province</th>
              <td>{inputs.province ?? "—"}</td>
            </tr>
            <tr>
              <th>Stop-work age</th>
              <td>{formatAge(a.stopWorkAge)}</td>
            </tr>
            <tr>
              <th>Assumed next-year earnings</th>
              <td>{formatMoney(a.assumedFutureEarnings)}</td>
            </tr>
          </tbody>
        </table>

        <table className="print-scenario-table">
          <tbody>
            <tr>
              <th>YMPE growth (pre-start)</th>
              <td>{formatPercent(a.ympeGrowthRate)}</td>
            </tr>
            <tr>
              <th>YAMPE growth (pre-start)</th>
              <td>{formatPercent(a.yampeGrowthRate)}</td>
            </tr>
            <tr>
              <th>Indexing (post-start)</th>
              <td>{formatPercent(a.indexingRate)}</td>
            </tr>
            <tr>
              <th>Future earnings growth</th>
              <td>{formatPercent(a.futureEarningsGrowthRate)}</td>
            </tr>
            <tr>
              <th>Continues working after start</th>
              <td>
                {inputs.postRetirementBenefit?.continuesWorkingAfterStart
                  ? `Yes — ${formatMoney(
                      inputs.postRetirementBenefit.annualEarningsAfterStart ?? 0,
                    )}/yr until age ${formatAge(
                      inputs.postRetirementBenefit.stopAge ?? a.stopWorkAge,
                    )}`
                  : "No"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {dropouts.length > 0 ? (
        <div className="print-scenario-subblock">
          <h3>Drop-out periods on file</h3>
          <table className="print-scenario-table print-scenario-table-list">
            <thead>
              <tr>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {dropouts.map((d, i) => (
                <tr key={i}>
                  <td>
                    {d.kind === "crdo"
                      ? "Child-Rearing (CRDO)"
                      : "Disability"}
                  </td>
                  <td>{formatYearMonth(d.startYear, d.startMonth)}</td>
                  <td>{formatYearMonth(d.endYear, d.endMonth)}</td>
                  <td>{d.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="print-scenario-note">
          No CRDO or disability drop-out periods were entered for this client.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Component breakdown (per start age)
// ---------------------------------------------------------------------------

function BreakdownSection({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  const data = sortedAges.map((r) => ({
    age: `Age ${formatAge(r.startAge)}`,
    Base: Math.round(r.baseMonthly),
    "Tier 1": Math.round(r.tier1Monthly),
    "Tier 2": Math.round(r.tier2Monthly),
  }));

  return (
    <section className="print-scenario-section print-scenario-pagebreak">
      <h2>Monthly breakdown by start age</h2>
      <table className="print-scenario-table print-scenario-table-list">
        <thead>
          <tr>
            <th>Start age</th>
            <th>Year</th>
            <th>Adjustment</th>
            <th className="num">Base</th>
            <th className="num">Tier 1</th>
            <th className="num">Tier 2</th>
            <th className="num">Total / mo</th>
            <th className="num">Total / yr</th>
          </tr>
        </thead>
        <tbody>
          {sortedAges.map((r) => (
            <tr key={r.startAge}>
              <td>{formatAge(r.startAge)}</td>
              <td>{r.startYear}</td>
              <td>{formatPercent(r.adjustmentFactor - 1, true)}</td>
              <td className="num">{formatMoney(r.baseMonthly, true)}</td>
              <td className="num">{formatMoney(r.tier1Monthly, true)}</td>
              <td className="num">{formatMoney(r.tier2Monthly, true)}</td>
              <td className="num">
                <strong>{formatMoney(r.totalMonthly, true)}</strong>
              </td>
              <td className="num">{formatMoney(r.totalAnnual)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-scenario-chart">
        <BarChart
          width={680}
          height={260}
          data={data}
          stackOffset="sign"
          margin={{ top: 10, right: 16, bottom: 10, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cccccc" />
          <XAxis dataKey="age" tick={{ fontSize: 11, fill: "#000" }} stroke="#000" />
          <YAxis
            tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: "#000" }}
            stroke="#000"
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#000" }} />
          <Bar dataKey="Base" stackId="a" fill="#000000" />
          <Bar dataKey="Tier 1" stackId="a" fill="#666666" />
          <Bar dataKey="Tier 2" stackId="a" fill="#bbbbbb" stroke="#000" />
        </BarChart>
        <p className="print-scenario-caption">
          Stacked monthly CPP at each take-up age, showing the Base, Tier 1
          and Tier 2 components in start-year dollars.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function DiagnosticsSection({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  return (
    <section className="print-scenario-section print-scenario-pagebreak">
      <h2>Calculation diagnostics</h2>
      <p className="print-scenario-note">
        Drop-out months and accrual factors used to produce the figures above.
      </p>
      {sortedAges.map((r) => (
        <div key={r.startAge} className="print-scenario-diag-block">
          <h3>
            Age {formatAge(r.startAge)} — {formatMoney(r.totalMonthly, true)}/mo
          </h3>
          <div className="print-scenario-twocol">
            <table className="print-scenario-table">
              <thead>
                <tr>
                  <th colSpan={2}>Base CPP</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Contributory months</th>
                  <td>{r.base.contributoryPeriodMonths}</td>
                </tr>
                <tr>
                  <th>CRDO months dropped</th>
                  <td>{r.base.crdoMonthsDropped}</td>
                </tr>
                <tr>
                  <th>Disability months dropped</th>
                  <td>{r.base.disabilityMonthsDropped}</td>
                </tr>
                <tr>
                  <th>General 17% drop-out months</th>
                  <td>{r.base.generalDropoutMonths}</td>
                </tr>
                <tr>
                  <th>Months retained for AMPE</th>
                  <td>{r.base.monthsRetained}</td>
                </tr>
                <tr>
                  <th>AMPE (monthly)</th>
                  <td>{formatMoney(r.base.ampe, true)}</td>
                </tr>
                <tr>
                  <th>AYMPE in start year</th>
                  <td>{formatMoney(r.base.aympeStartYear)}</td>
                </tr>
                <tr>
                  <th>Adjustment factor</th>
                  <td>{r.adjustmentFactor.toFixed(4)}</td>
                </tr>
              </tbody>
            </table>

            <table className="print-scenario-table">
              <thead>
                <tr>
                  <th colSpan={2}>Enhancement (Tier 1 / Tier 2)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Tier 1 contribution years</th>
                  <td>{r.enhancement.tier1ContributionYears}</td>
                </tr>
                <tr>
                  <th>Tier 1 accrual factor</th>
                  <td>{formatPercent(r.enhancement.tier1AccrualFactor)}</td>
                </tr>
                <tr>
                  <th>Tier 1 indexed earnings (sum)</th>
                  <td>{formatMoney(r.enhancement.tier1IndexedEarningsSum)}</td>
                </tr>
                <tr>
                  <th>Tier 2 contribution years</th>
                  <td>{r.enhancement.tier2ContributionYears}</td>
                </tr>
                <tr>
                  <th>Tier 2 accrual factor</th>
                  <td>{formatPercent(r.enhancement.tier2AccrualFactor)}</td>
                </tr>
                <tr>
                  <th>Tier 2 indexed earnings (sum)</th>
                  <td>{formatMoney(r.enhancement.tier2IndexedEarningsSum)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Breakeven chart
// ---------------------------------------------------------------------------

const BREAKEVEN_DASH = ["", "5 4", "2 3", "8 4 2 4", "1 3"];

function BreakevenSection({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  const ages = new Set<number>();
  sortedAges.forEach((r) => r.cumulativeByAge.forEach((p) => ages.add(p.age)));
  const sortedAgesAll = Array.from(ages).sort((a, b) => a - b);
  const data = sortedAgesAll.map((age) => {
    const row: Record<string, number> = { age };
    for (const r of sortedAges) {
      const point = r.cumulativeByAge.find((p) => p.age === age);
      if (point) row[`Age ${formatAge(r.startAge)}`] = Math.round(point.cumulativeNominal);
    }
    return row;
  });

  return (
    <section className="print-scenario-section print-scenario-pagebreak">
      <h2>Breakeven — cumulative lifetime benefit</h2>
      <div className="print-scenario-chart">
        <LineChart
          width={680}
          height={300}
          data={data}
          margin={{ top: 10, right: 16, bottom: 24, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cccccc" />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 11, fill: "#000" }}
            stroke="#000"
            label={{
              value: "Age",
              position: "insideBottom",
              offset: -8,
              style: { fontSize: 11, fill: "#000" },
            }}
          />
          <YAxis
            tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: "#000" }}
            stroke="#000"
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#000" }} />
          {sortedAges.map((r, i) => (
            <Line
              key={r.startAge}
              type="monotone"
              dataKey={`Age ${formatAge(r.startAge)}`}
              stroke="#000"
              strokeWidth={1.5}
              strokeDasharray={BREAKEVEN_DASH[i % BREAKEVEN_DASH.length]}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </div>
      <p className="print-scenario-caption">
        Each line shows total CPP received over time (nominal, indexed) for a
        given start age. Lines that cross indicate the age at which one start
        choice overtakes another.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Earnings history
// ---------------------------------------------------------------------------

function EarningsHistorySection({ inputs }: { inputs: ScenarioInputs }) {
  const sorted = [...inputs.earningsHistory].sort((a, b) => a.year - b.year);
  if (sorted.length === 0) return null;

  // Two-column layout for compactness
  const half = Math.ceil(sorted.length / 2);
  const left = sorted.slice(0, half);
  const right = sorted.slice(half);

  return (
    <section className="print-scenario-section print-scenario-pagebreak">
      <h2>Reported pensionable earnings</h2>
      <p className="print-scenario-note">
        Figures as entered by the planner — projected years (after the last
        reported year) are not shown here.
      </p>
      <div className="print-scenario-twocol">
        <EarningsMiniTable rows={left} />
        {right.length > 0 ? <EarningsMiniTable rows={right} /> : null}
      </div>
    </section>
  );
}

function EarningsMiniTable({
  rows,
}: {
  rows: { year: number; pensionableEarnings: number }[];
}) {
  return (
    <table className="print-scenario-table print-scenario-table-list">
      <thead>
        <tr>
          <th>Year</th>
          <th className="num">Pensionable earnings</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.year}>
            <td>{r.year}</td>
            <td className="num">{formatMoney(r.pensionableEarnings)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Survivor benefits
// ---------------------------------------------------------------------------

function SurvivorSection({ survivor }: { survivor: SurvivorResult }) {
  return (
    <section className="print-scenario-section print-scenario-pagebreak">
      <h2>Survivor benefits ({survivor.startYear})</h2>
      <table className="print-scenario-table">
        <tbody>
          <tr>
            <th>Survivor's pension (monthly)</th>
            <td>
              {formatMoney(survivor.survivorMonthlyTotal, true)} ·{" "}
              {formatMoney(survivor.survivorAnnualTotal)}/yr
            </td>
          </tr>
          <tr>
            <th>Death benefit</th>
            <td>{formatMoney(survivor.deathBenefit, true)} (one-time)</td>
          </tr>
          <tr>
            <th>Children's benefit (monthly)</th>
            <td>{formatMoney(survivor.childrensBenefitMonthlyTotal, true)}</td>
          </tr>
          <tr>
            <th>Combined w/ own retirement</th>
            <td>{formatMoney(survivor.combinedMonthlyTotal, true)}/mo</td>
          </tr>
        </tbody>
      </table>
      {survivor.notes.length > 0 ? (
        <ul className="print-scenario-list">
          {survivor.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
