import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import logoUrl from "@assets/WhatsApp_Image_2021-03-10_at_11.22.35_AM_1777058431212.jpeg";
import {
  calculateCpp,
  calculateSurvivor,
  formatAge,
  formatMoney,
  formatPercent,
  type ScenarioInputs,
  type StartAgeResult,
  type SurvivorResult,
} from "@/cpp";

interface PrintScenarioProps {
  inputs: ScenarioInputs;
  scenarioTitle: string;
  notes?: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Brand palette for print, derived from the app's on-screen color tokens
// (primary hsl(248 75% 64%) and --chart-1..5). Slightly deeper than the
// on-screen values so they stay legible at typical printer ink densities.
const BRAND = "#5a4dd0";
const BRAND_SOFT = "#b8b1ec";
const CHART_COLORS = ["#5a99f2", "#4dcce6", "#8b7de8", "#f7a964", "#ef80ae"];

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

function lifetimeOf(r: StartAgeResult): number {
  return r.cumulativeByAge[r.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;
}

function projectionAge(r: StartAgeResult | null): number | null {
  if (!r) return null;
  return r.cumulativeByAge[r.cumulativeByAge.length - 1]?.age ?? null;
}

export function PrintScenario({
  inputs,
  scenarioTitle,
  notes,
}: PrintScenarioProps) {
  const result = useMemo(() => calculateCpp(inputs), [inputs]);

  const sortedAges = useMemo(
    () => [...result.byStartAge].sort((a, b) => a.startAge - b.startAge),
    [result.byStartAge],
  );

  const optimal = useMemo(() => {
    if (sortedAges.length === 0) return null;
    let best = sortedAges[0];
    let bestLifetime = lifetimeOf(best);
    for (const r of sortedAges) {
      const lifetime = lifetimeOf(r);
      if (lifetime > bestLifetime) {
        best = r;
        bestLifetime = lifetime;
      }
    }
    return best;
  }, [sortedAges]);

  const earliest = sortedAges[0] ?? null;
  const latest = sortedAges[sortedAges.length - 1] ?? null;

  const trimmedNotes = notes?.trim() ?? "";

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
        <div className="print-scenario-brandrow">
          <img src={logoUrl} alt="Modern Cents" className="print-scenario-logo" />
          <div className="print-scenario-brand">Modern Cents · Your CPP Retirement Estimate</div>
        </div>
        <h1 className="print-scenario-title">{scenarioTitle || "Untitled scenario"}</h1>
        <div className="print-scenario-meta">
          <span>Prepared {todayLong()}</span>
        </div>
      </header>

      {trimmedNotes ? (
        <aside className="print-scenario-planner-note">
          <div className="print-scenario-planner-note-label">Note from your planner</div>
          <p className="print-scenario-planner-note-body">{trimmedNotes}</p>
        </aside>
      ) : null}

      {sortedAges.length === 0 ? (
        <p className="print-scenario-empty">
          No start ages were selected for this scenario, so there is nothing to
          summarize yet.
        </p>
      ) : (
        <>
          <HeadlineSummary
            optimal={optimal}
            earliest={earliest}
            latest={latest}
          />

          <MonthlyByAgeSection sortedAges={sortedAges} optimal={optimal} />

          <GrowthOverTimeSection sortedAges={sortedAges} optimal={optimal} />

          {survivor ? <FamilySection survivor={survivor} /> : null}

          <YourDetailsSection inputs={inputs} />

          <EarningsHistorySection inputs={inputs} />

          {result.warnings.length > 0 ? (
            <section className="print-scenario-section print-scenario-warnings">
              <h2>Things to keep in mind</h2>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className="print-scenario-footer">
            These are estimates only, based on current CPP rules and the
            information provided by your planner. Your actual pension is
            determined by Service Canada and may differ.
          </footer>
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Headline — the result, in plain language
// ---------------------------------------------------------------------------

function HeadlineSummary({
  optimal,
  earliest,
  latest,
}: {
  optimal: StartAgeResult | null;
  earliest: StartAgeResult | null;
  latest: StartAgeResult | null;
}) {
  if (!optimal || !earliest || !latest) return null;

  const projAge = projectionAge(optimal);
  const optimalLifetime = lifetimeOf(optimal);
  const showRecommendation = optimal.startAge !== earliest.startAge;

  return (
    <section className="print-scenario-section print-scenario-summary">
      <h2>Your estimate at a glance</h2>

      <div className="print-scenario-headline">
        {showRecommendation ? (
          <p>
            Of the options reviewed, starting your CPP at{" "}
            <strong>age {formatAge(optimal.startAge)}</strong> gives you the
            most money over your lifetime — about{" "}
            <strong>{formatMoney(optimal.totalMonthly, true)} a month</strong> (
            {formatMoney(optimal.totalAnnual)} a year) once payments begin.
          </p>
        ) : (
          <p>
            Starting your CPP at{" "}
            <strong>age {formatAge(optimal.startAge)}</strong> would pay about{" "}
            <strong>{formatMoney(optimal.totalMonthly, true)} a month</strong> (
            {formatMoney(optimal.totalAnnual)} a year) once payments begin.
          </p>
        )}
      </div>

      <table className="print-scenario-table print-scenario-summary-table">
        <tbody>
          <tr>
            <th>Best option reviewed</th>
            <td>
              Start at age <strong>{formatAge(optimal.startAge)}</strong> ·{" "}
              {formatMoney(optimal.totalMonthly, true)}/month
            </td>
          </tr>
          <tr>
            <th>Earliest you could start (age {formatAge(earliest.startAge)})</th>
            <td>{formatMoney(earliest.totalMonthly, true)}/month</td>
          </tr>
          <tr>
            <th>Latest you could wait (age {formatAge(latest.startAge)})</th>
            <td>{formatMoney(latest.totalMonthly, true)}/month</td>
          </tr>
          {projAge !== null ? (
            <tr>
              <th>Total received by age {projAge} (best option)</th>
              <td>{formatMoney(optimalLifetime)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="print-scenario-note">
        Waiting longer means a larger monthly cheque, but fewer years of
        payments. The right choice depends on your health, savings and income
        needs — your planner can help you weigh these.
      </p>
      <p className="print-scenario-note">
        Dollar amounts are shown for the year each payment would begin (they
        include expected cost-of-living increases up to that point), so figures
        for later start ages reflect future, not today's, dollars.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Monthly income by start age
// ---------------------------------------------------------------------------

function MonthlyByAgeSection({
  sortedAges,
  optimal,
}: {
  sortedAges: StartAgeResult[];
  optimal: StartAgeResult | null;
}) {
  const data = sortedAges.map((r) => ({
    age: `Age ${formatAge(r.startAge)}`,
    Monthly: Math.round(r.totalMonthly),
    isBest: optimal?.startAge === r.startAge,
  }));

  return (
    <section className="print-scenario-section">
      <h2>What you'd receive at each start age</h2>
      <table className="print-scenario-table print-scenario-table-list">
        <thead>
          <tr>
            <th>If you start at…</th>
            <th>Year payments begin</th>
            <th className="num">Each month</th>
            <th className="num">Each year</th>
          </tr>
        </thead>
        <tbody>
          {sortedAges.map((r) => {
            const isBest = optimal?.startAge === r.startAge;
            return (
              <tr key={r.startAge}>
                <td>
                  Age {formatAge(r.startAge)}
                  {isBest ? " (best option)" : ""}
                </td>
                <td>{r.startYear}</td>
                <td className="num">
                  {isBest ? (
                    <strong>{formatMoney(r.totalMonthly, true)}</strong>
                  ) : (
                    formatMoney(r.totalMonthly, true)
                  )}
                </td>
                <td className="num">{formatMoney(r.totalAnnual)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="print-scenario-chart">
        <BarChart
          width={680}
          height={260}
          data={data}
          margin={{ top: 10, right: 16, bottom: 10, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#cccccc" />
          <XAxis dataKey="age" tick={{ fontSize: 11, fill: "#000" }} stroke="#000" />
          <YAxis
            tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(1)}k`}
            tick={{ fontSize: 11, fill: "#000" }}
            stroke="#000"
          />
          <Bar dataKey="Monthly" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.age} fill={d.isBest ? BRAND : BRAND_SOFT} />
            ))}
          </Bar>
        </BarChart>
        <p className="print-scenario-caption">
          Estimated monthly CPP payment for each age you could start — the best
          option is highlighted.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Growth over time (formerly "Breakeven")
// ---------------------------------------------------------------------------

const BREAKEVEN_DASH = ["", "5 4", "2 3", "8 4 2 4", "1 3"];

function GrowthOverTimeSection({
  sortedAges,
  optimal,
}: {
  sortedAges: StartAgeResult[];
  optimal: StartAgeResult | null;
}) {
  const ages = new Set<number>();
  sortedAges.forEach((r) => r.cumulativeByAge.forEach((p) => ages.add(p.age)));
  const sortedAgesAll = Array.from(ages).sort((a, b) => a - b);
  const data = sortedAgesAll.map((age) => {
    const row: Record<string, number> = { age };
    for (const r of sortedAges) {
      const point = r.cumulativeByAge.find((p) => p.age === age);
      if (point) row[`Start at ${formatAge(r.startAge)}`] = Math.round(point.cumulativeNominal);
    }
    return row;
  });

  return (
    <section className="print-scenario-section">
      <h2>How your total adds up over time</h2>
      <p className="print-scenario-note">
        Each line shows the total CPP you'd have received as the years go by, for
        each possible start age. Where a line that started later climbs above one
        that started earlier, that's the age at which waiting has "paid off."
      </p>
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
              value: "Your age",
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
          {sortedAges.map((r, i) => {
            const isBest = optimal?.startAge === r.startAge;
            return (
              <Line
                key={r.startAge}
                type="monotone"
                dataKey={`Start at ${formatAge(r.startAge)}`}
                stroke={isBest ? BRAND : CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={isBest ? 2.75 : 1.75}
                strokeDasharray={BREAKEVEN_DASH[i % BREAKEVEN_DASH.length]}
                dot={false}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Benefits for your family (survivor)
// ---------------------------------------------------------------------------

function FamilySection({ survivor }: { survivor: SurvivorResult }) {
  return (
    <section className="print-scenario-section">
      <h2>Benefits for your family</h2>
      <p className="print-scenario-note">
        If something happens to you, CPP may provide the following support to
        your spouse and children.
      </p>
      <table className="print-scenario-table">
        <tbody>
          <tr>
            <th>Monthly survivor's pension</th>
            <td>
              {formatMoney(survivor.survivorMonthlyTotal, true)} (
              {formatMoney(survivor.survivorAnnualTotal)}/year)
            </td>
          </tr>
          <tr>
            <th>One-time death benefit</th>
            <td>{formatMoney(survivor.deathBenefit, true)}</td>
          </tr>
          <tr>
            <th>Monthly children's benefit</th>
            <td>{formatMoney(survivor.childrensBenefitMonthlyTotal, true)}</td>
          </tr>
          <tr>
            <th>Survivor's combined monthly total</th>
            <td>{formatMoney(survivor.combinedMonthlyTotal, true)}</td>
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

// ---------------------------------------------------------------------------
// Your details & assumptions (plain language)
// ---------------------------------------------------------------------------

function YourDetailsSection({ inputs }: { inputs: ScenarioInputs }) {
  const a = inputs.assumptions;
  const dropouts = inputs.dropoutPeriods ?? [];
  const worksAfterStart = inputs.postRetirementBenefit?.continuesWorkingAfterStart;

  return (
    <section className="print-scenario-section">
      <h2>The details behind this estimate</h2>
      <p className="print-scenario-note">
        These are the personal details and assumptions your planner used. If any
        of these change, your estimate may change too.
      </p>

      <table className="print-scenario-table">
        <tbody>
          <tr>
            <th>Date of birth</th>
            <td>{formatBirth(inputs.birthYear, inputs.birthMonth)}</td>
          </tr>
          {inputs.province ? (
            <tr>
              <th>Province</th>
              <td>{inputs.province}</td>
            </tr>
          ) : null}
          <tr>
            <th>When you stop working</th>
            <td>Age {formatAge(a.stopWorkAge)}</td>
          </tr>
          <tr>
            <th>Expected earnings next year</th>
            <td>{formatMoney(a.assumedFutureEarnings)}</td>
          </tr>
          {worksAfterStart ? (
            <tr>
              <th>Working after CPP starts</th>
              <td>
                Yes — about{" "}
                {formatMoney(
                  inputs.postRetirementBenefit?.annualEarningsAfterStart ?? 0,
                )}
                /year until age{" "}
                {formatAge(
                  inputs.postRetirementBenefit?.stopAge ?? a.stopWorkAge,
                )}
              </td>
            </tr>
          ) : null}
          <tr>
            <th>Assumed annual inflation (cost-of-living increases)</th>
            <td>{formatPercent(a.indexingRate)}</td>
          </tr>
          <tr>
            <th>Assumed annual wage growth</th>
            <td>{formatPercent(a.futureEarningsGrowthRate)}</td>
          </tr>
        </tbody>
      </table>

      {dropouts.length > 0 ? (
        <div className="print-scenario-subblock">
          <h3>Special periods included</h3>
          <p className="print-scenario-note">
            CPP lets certain low- or no-earning years be set aside so they don't
            lower your pension. The following were applied:
          </p>
          <ul className="print-scenario-list">
            {dropouts.map((d, i) => (
              <li key={i}>
                {d.kind === "crdo"
                  ? "Time at home raising young children"
                  : "A period of disability"}
                {d.notes ? ` — ${d.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
    <section className="print-scenario-section">
      <h2>Your earnings on record</h2>
      <p className="print-scenario-note">
        The yearly earnings used in this estimate, as provided to your planner.
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
          <th className="num">Earnings</th>
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
