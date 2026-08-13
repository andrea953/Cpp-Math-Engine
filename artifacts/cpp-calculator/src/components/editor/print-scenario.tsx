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
  projectedMonthlyInclPrbAtStop,
  type PostRetirementBenefit,
  type ScenarioInputs,
  type StartAgeResult,
  type SurvivorResult,
} from "@/cpp";
import { PrintApplicationChecklist } from "@/components/client/application-checklist";
import {
  translateDeathBenefitTopUp,
  translateSurvivorNote,
  translateWarning,
} from "./print-plain-language";

interface PrintScenarioProps {
  inputs: ScenarioInputs;
  scenarioTitle: string;
  notes?: string;
}

// Brand palette for print, derived from the app's on-screen color tokens
// (primary hsl(248 75% 64%) and --chart-1..5). Slightly deeper than the
// on-screen values so they stay legible at typical printer ink densities.
const BRAND = "#5a4dd0";
const BRAND_SOFT = "#b8b1ec";
const CHART_COLORS = ["#5a99f2", "#4dcce6", "#8b7de8", "#f7a964", "#ef80ae"];

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

  // Today's-dollar conversion — mirrors the on-screen "today's dollars" toggle
  // in results-panel.tsx: deflate start-year figures at the assumed indexing
  // (CPI) rate over the years between now and when payments begin.
  const todayYear = new Date().getFullYear();
  const indexingRate = inputs.assumptions.indexingRate;
  const toToday = useMemo(
    () =>
      (value: number, year: number) =>
        value / Math.pow(1 + indexingRate, Math.max(0, year - todayYear - 1)),
    [indexingRate, todayYear],
  );

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
            toToday={toToday}
          />

          <HowCppWorksSection />

          <MonthlyByAgeSection sortedAges={sortedAges} optimal={optimal} toToday={toToday} />

          <PrbSection
            sortedAges={sortedAges}
            prb={inputs.postRetirementBenefit}
            indexingRate={inputs.assumptions.indexingRate}
            toToday={toToday}
          />

          <GrowthOverTimeSection sortedAges={sortedAges} optimal={optimal} />

          {survivor ? <FamilySection survivor={survivor} /> : null}

          <PrintApplicationChecklist inputs={inputs} />

          {result.warnings.length > 0 ? (
            <section className="print-scenario-section print-scenario-warnings">
              <h2>Good to know</h2>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i}>{translateWarning(w)}</li>
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
  toToday,
}: {
  optimal: StartAgeResult | null;
  earliest: StartAgeResult | null;
  latest: StartAgeResult | null;
  toToday: (value: number, year: number) => number;
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
            {formatMoney(optimal.totalAnnual)} a year) once payments begin,
            worth about{" "}
            {formatMoney(toToday(optimal.totalMonthly, optimal.startYear), true)}{" "}
            a month in today's dollars.
          </p>
        ) : (
          <p>
            Starting your CPP at{" "}
            <strong>age {formatAge(optimal.startAge)}</strong> would pay about{" "}
            <strong>{formatMoney(optimal.totalMonthly, true)} a month</strong> (
            {formatMoney(optimal.totalAnnual)} a year) once payments begin,
            worth about{" "}
            {formatMoney(toToday(optimal.totalMonthly, optimal.startYear), true)}{" "}
            a month in today's dollars.
          </p>
        )}
      </div>

      <table className="print-scenario-table print-scenario-summary-table">
        <tbody>
          <tr>
            <th>Best option reviewed</th>
            <td>
              Start at age <strong>{formatAge(optimal.startAge)}</strong> ·{" "}
              {formatMoney(optimal.totalMonthly, true)}/month (
              {formatMoney(toToday(optimal.totalMonthly, optimal.startYear), true)} in
              today's dollars)
            </td>
          </tr>
          <tr>
            <th>Earliest you could start (age {formatAge(earliest.startAge)})</th>
            <td>
              {formatMoney(earliest.totalMonthly, true)}/month (
              {formatMoney(toToday(earliest.totalMonthly, earliest.startYear), true)} in
              today's dollars)
            </td>
          </tr>
          <tr>
            <th>Latest you could wait (age {formatAge(latest.startAge)})</th>
            <td>
              {formatMoney(latest.totalMonthly, true)}/month (
              {formatMoney(toToday(latest.totalMonthly, latest.startYear), true)} in
              today's dollars)
            </td>
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
        "In today's dollars" shows what each future amount would feel like in
        today's prices, so you can compare options that start in different
        years fairly.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How CPP works — short plain-language explainer for clients
// ---------------------------------------------------------------------------

function HowCppWorksSection() {
  return (
    <section className="print-scenario-section">
      <h2>How CPP works</h2>
      <ul className="print-scenario-list">
        <li>
          The Canada Pension Plan (CPP) is a monthly pension you earned by
          contributing from your paycheques during your working years.
        </li>
        <li>
          The amount you receive is based on how much you earned and how many
          years you contributed.
        </li>
        <li>
          You choose when payments start — any age from 60 to 70. Starting
          before 65 means a smaller monthly payment; waiting past 65 means a
          larger one.
        </li>
        <li>
          Once payments begin, they rise with the cost of living each year and
          continue for the rest of your life.
        </li>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Monthly income by start age
// ---------------------------------------------------------------------------

function MonthlyByAgeSection({
  sortedAges,
  optimal,
  toToday,
}: {
  sortedAges: StartAgeResult[];
  optimal: StartAgeResult | null;
  toToday: (value: number, year: number) => number;
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
            <th className="num">In today's dollars</th>
            <th className="num">Each year</th>
            <th className="num">Compared to the most possible*</th>
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
                <td className="num">
                  {isBest ? (
                    <strong>{formatMoney(toToday(r.totalMonthly, r.startYear), true)}</strong>
                  ) : (
                    formatMoney(toToday(r.totalMonthly, r.startYear), true)
                  )}
                </td>
                <td className="num">{formatMoney(r.totalAnnual)}</td>
                <td className="num">
                  {isBest ? (
                    <strong>{formatPercent(r.percentOfMaximum)}</strong>
                  ) : (
                    formatPercent(r.percentOfMaximum)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="print-scenario-note">
        *This compares your estimate with the most anyone starting CPP at that
        same age could receive.
      </p>

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
          <Bar dataKey="Monthly" radius={[3, 3, 0, 0]} isAnimationActive={false}>
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
// Post-Retirement Benefit (working after you start)
// ---------------------------------------------------------------------------

function PrbSection({
  sortedAges,
  prb,
  indexingRate,
  toToday,
}: {
  sortedAges: StartAgeResult[];
  prb: PostRetirementBenefit | undefined;
  indexingRate: number;
  toToday: (value: number, year: number) => number;
}) {
  // Only the start ages where the client keeps working (and contributing) after
  // their pension begins accrue a PRB. The helper returns null for ages where
  // work stops at/before the start age, so those rows are simply omitted. Figures
  // are in start-year dollars — the same basis as totalMonthly elsewhere in the
  // handout — so they can be compared directly.
  const rows = sortedAges
    .map((r) => {
      const proj = projectedMonthlyInclPrbAtStop(r, prb, indexingRate);
      if (!proj) return null;
      const delta = proj.startYearMonthly - r.totalMonthly;
      if (delta <= 0) return null;
      return {
        startAge: r.startAge,
        startYear: r.startYear,
        atAge: proj.atAge,
        start: r.totalMonthly,
        incl: proj.startYearMonthly,
        delta,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return null;

  return (
    <section className="print-scenario-section">
      <h2>If you keep working after payments start</h2>
      <p className="print-scenario-note">
        If you keep working after your CPP payments begin, your pension grows a
        little each year. Each extra year of work adds a small permanent
        top-up (officially called a "post-retirement benefit") — it builds up
        year by year while you work and then continues for the rest of your
        life.
      </p>
      <table className="print-scenario-table print-scenario-table-list">
        <thead>
          <tr>
            <th>If you start at…</th>
            <th className="num">When payments start</th>
            <th className="num">After the extra work</th>
            <th className="num">Extra each month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.startAge}>
              <td>
                Age {formatAge(row.startAge)} (working to age {row.atAge})
              </td>
              <td className="num">{formatMoney(row.start, true)}</td>
              <td className="num">
                <strong>{formatMoney(row.incl, true)}</strong> (
                {formatMoney(toToday(row.incl, row.startYear), true)} in today's
                dollars)
              </td>
              <td className="num">+{formatMoney(row.delta, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="print-scenario-note">
        The "after the extra work" amount assumes you keep working until the age
        shown, at the earnings your planner entered. If you stop sooner, the
        top-up will be smaller; if you work longer, it will be larger.
      </p>
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
            <th>Monthly income for your spouse</th>
            <td>
              {formatMoney(survivor.survivorMonthlyTotal, true)} (
              {formatMoney(survivor.survivorAnnualTotal)}/year)
            </td>
          </tr>
          <tr>
            <th>One-time payment to help with final costs</th>
            <td>
              {formatMoney(survivor.deathBenefit, true)}
              {survivor.deathBenefitTopUp > 0
                ? ` (includes ${formatMoney(survivor.deathBenefitTopUp)} top-up)`
                : ""}
            </td>
          </tr>
          <tr>
            <th>Monthly income for your children</th>
            <td>{formatMoney(survivor.childrensBenefitMonthlyTotal, true)}</td>
          </tr>
          <tr>
            <th>Your spouse's total from CPP each month (their own pension plus the amounts above)</th>
            <td>{formatMoney(survivor.combinedMonthlyTotal, true)}</td>
          </tr>
        </tbody>
      </table>
      {survivor.deathBenefitTopUpExplanation ? (
        <p className="print-scenario-note">
          {translateDeathBenefitTopUp(survivor.deathBenefitTopUpExplanation)}
        </p>
      ) : null}
      {survivor.notes.length > 0 ? (
        <div className="print-scenario-subblock">
          <h3>Good to know</h3>
          <ul className="print-scenario-list">
            {survivor.notes.map((n, i) => (
              <li key={i}>{translateSurvivorNote(n)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
