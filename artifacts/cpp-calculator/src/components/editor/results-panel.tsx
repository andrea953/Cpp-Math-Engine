import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Download,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  calculateAnnualContribution,
  calculateCpp,
  calculateSurvivor,
  formatMoney,
  formatPercent,
  YMPE_HISTORY,
  YAMPE_HISTORY,
  exportToCsv,
  type ScenarioInputs,
  type StartAgeResult,
  type SurvivorResult,
} from "@/cpp";
import { Briefcase, HeartHandshake, Users, Wallet, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ResultsPanelProps {
  inputs: ScenarioInputs;
  scenarioTitle: string;
}

export function ResultsPanel({ inputs, scenarioTitle }: ResultsPanelProps) {
  const result = useMemo(() => calculateCpp(inputs), [inputs]);

  const sortedAges = [...result.byStartAge].sort((a, b) => a.startAge - b.startAge);
  const optimal = useMemo(() => {
    if (sortedAges.length === 0) return null;
    let best = sortedAges[0];
    let bestLifetime = best.cumulativeByAge[best.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;
    for (const r of sortedAges) {
      const lifetime = r.cumulativeByAge[r.cumulativeByAge.length - 1]?.cumulativeNominal ?? 0;
      if (lifetime > bestLifetime) {
        best = r;
        bestLifetime = lifetime;
      }
    }
    return best;
  }, [sortedAges]);

  function exportSummary() {
    const rows = sortedAges.map((r) => ({
      start_age: r.startAge,
      start_year: r.startYear,
      adjustment_factor: r.adjustmentFactor.toFixed(4),
      base_monthly: r.baseMonthly.toFixed(2),
      tier1_monthly: r.tier1Monthly.toFixed(2),
      tier2_monthly: r.tier2Monthly.toFixed(2),
      total_monthly: r.totalMonthly.toFixed(2),
      total_annual: r.totalAnnual.toFixed(2),
      max_monthly_at_start: r.maxMonthlyAtStart.toFixed(2),
      percent_of_maximum: r.percentOfMaximum.toFixed(4),
      contributory_months: r.base.contributoryPeriodMonths,
      crdo_dropped: r.base.crdoMonthsDropped,
      disability_dropped: r.base.disabilityMonthsDropped,
      general_dropout_months: r.base.generalDropoutMonths,
      months_retained: r.base.monthsRetained,
      ampe_monthly: r.base.ampe.toFixed(2),
      tier1_years: r.enhancement.tier1ContributionYears,
      tier1_accrual: r.enhancement.tier1AccrualFactor.toFixed(4),
      tier2_years: r.enhancement.tier2ContributionYears,
      tier2_accrual: r.enhancement.tier2AccrualFactor.toFixed(4),
    }));
    exportToCsv(rows, `${scenarioTitle.replace(/[^a-z0-9]/gi, "_")}_summary.csv`);
  }

  function exportEarnings() {
    const ympeFor = (y: number) => YMPE_HISTORY[y] ?? "";
    const yampeFor = (y: number) => YAMPE_HISTORY[y] ?? "";
    const rows = result.effectiveEarnings.map((r) => ({
      year: r.year,
      pensionable_earnings: r.pensionableEarnings.toFixed(2),
      ympe: ympeFor(r.year),
      yampe: yampeFor(r.year),
    }));
    exportToCsv(rows, `${scenarioTitle.replace(/[^a-z0-9]/gi, "_")}_earnings.csv`);
  }

  if (sortedAges.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
        Select at least one start age in the Take-up tab to see results.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {result.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Calculation warnings</div>
            <ul className="mt-1 list-inside list-disc text-xs">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Calculation</h2>
          <p className="text-xs text-muted-foreground">All amounts in start-year dollars unless noted.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportSummary}>
            <Download className="mr-2 h-4 w-4" /> Summary CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportEarnings}>
            <Download className="mr-2 h-4 w-4" /> Earnings CSV
          </Button>
        </div>
      </div>

      <ContributionCard inputs={inputs} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedAges.map((r) => (
          <StartAgeCard key={r.startAge} result={r} isOptimal={optimal?.startAge === r.startAge} />
        ))}
      </div>

      <Tabs defaultValue="comparison" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto gap-1 p-1">
          <TabsTrigger value="comparison" className="text-xs sm:text-sm py-1.5">
            <span className="hidden sm:inline">Monthly comparison</span>
            <span className="sm:hidden">Monthly</span>
          </TabsTrigger>
          <TabsTrigger value="breakeven" className="text-xs sm:text-sm py-1.5">Breakeven</TabsTrigger>
          <TabsTrigger value="earnings" className="text-xs sm:text-sm py-1.5">
            <span className="hidden sm:inline">Earnings vs YMPE</span>
            <span className="sm:hidden">Earnings</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="comparison" className="mt-3">
          <ComparisonChart sortedAges={sortedAges} />
        </TabsContent>
        <TabsContent value="breakeven" className="mt-3">
          <BreakevenChart sortedAges={sortedAges} />
        </TabsContent>
        <TabsContent value="earnings" className="mt-3">
          <EarningsChart inputs={inputs} effectiveEarnings={result.effectiveEarnings} />
        </TabsContent>
      </Tabs>

      <DiagnosticsPanel sortedAges={sortedAges} />

      {inputs.survivor?.enabled ? <SurvivorCard inputs={inputs} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Current-year contribution card
// ---------------------------------------------------------------------------

function ContributionCard({ inputs }: { inputs: ScenarioInputs }) {
  const currentYear = new Date().getFullYear();
  const { breakdown, isCurrentYear } = useMemo(() => {
    const sortedHistory = [...inputs.earningsHistory].sort((a, b) => b.year - a.year);
    const latest = sortedHistory.find((r) => r.year <= currentYear);
    const referenceYear = latest?.year ?? currentYear;
    const referenceEarnings = latest?.pensionableEarnings ?? inputs.assumptions.assumedFutureEarnings;
    return {
      isCurrentYear: referenceYear === currentYear,
      breakdown: calculateAnnualContribution(
        referenceYear,
        referenceEarnings,
        inputs.isSelfEmployed ?? false,
        inputs.assumptions.ympeGrowthRate,
        inputs.assumptions.yampeGrowthRate,
      ),
    };
  }, [inputs, currentYear]);

  const isSelfEmployed = inputs.isSelfEmployed ?? false;
  const oppositeLabel = isSelfEmployed ? "as an employee" : "if self-employed";
  const delta = breakdown.totalContributionAtOppositeStatus - breakdown.totalContribution;
  const titleSuffix = isCurrentYear
    ? `(${breakdown.year})`
    : `(latest known year ${breakdown.year})`;

  return (
    <Card
      className="border-[hsl(var(--chart-2))]/40 bg-gradient-to-br from-card to-[hsl(var(--chart-2))]/5"
      data-testid="card-contributions"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-[hsl(var(--chart-2))]" />
            <CardTitle className="text-base">
              Annual CPP contribution {titleSuffix}
            </CardTitle>
          </div>
          <Badge
            variant={isSelfEmployed ? "default" : "secondary"}
            data-testid="badge-employment-status"
          >
            {isSelfEmployed ? "Self-employed (2× rate)" : "Employee share"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ContributionTile
            label="Base (4.95%)"
            value={breakdown.baseContribution}
            sub={`on ${formatMoney(breakdown.baseBandEarnings)} above YBE`}
          />
          <ContributionTile
            label="Tier 1 enhancement (1%)"
            value={breakdown.tier1Contribution}
            sub={`on ${formatMoney(breakdown.baseBandEarnings)} above YBE`}
          />
          <ContributionTile
            label="Tier 2 enhancement (4%)"
            value={breakdown.tier2Contribution}
            sub={
              breakdown.tier2BandEarnings > 0
                ? `on ${formatMoney(breakdown.tier2BandEarnings)} above YMPE`
                : "no earnings above YMPE"
            }
          />
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md border bg-background/60 p-3">
          <div>
            <div className="text-xs text-muted-foreground">Total annual contribution</div>
            <div
              className="text-2xl font-semibold tracking-tight"
              data-testid="text-total-contribution"
            >
              {formatMoney(breakdown.totalContribution, true)}
            </div>
            <div className="text-xs text-muted-foreground">
              ≈ {formatMoney(breakdown.biweeklyContribution, true)} per biweekly pay period
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{oppositeLabel}:</div>
            <div className="text-sm font-medium text-foreground">
              {formatMoney(breakdown.totalContributionAtOppositeStatus, true)}
            </div>
            <div className={delta >= 0 ? "text-emerald-700" : "text-rose-700"}>
              {delta >= 0 ? "+" : ""}
              {formatMoney(delta, true)} vs. current
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Contributions are <strong>independent of benefits</strong>: your monthly CPP pension is
          calculated identically whether you were employed or self-employed. Toggling
          self-employed only changes the cost shown here.
        </p>
      </CardContent>
    </Card>
  );
}

function ContributionTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tracking-tight">{formatMoney(value, true)}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Survivor benefit card
// ---------------------------------------------------------------------------

function SurvivorCard({ inputs }: { inputs: ScenarioInputs }) {
  const survivor: SurvivorResult | null = useMemo(() => {
    if (!inputs.survivor?.enabled) return null;
    try {
      return calculateSurvivor(inputs, inputs.survivor);
    } catch {
      return null;
    }
  }, [inputs]);

  if (!survivor) return null;

  return (
    <Card className="border-[hsl(var(--chart-3))]/40 bg-gradient-to-br from-card to-[hsl(var(--chart-3))]/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-[hsl(var(--chart-3))]" />
          <CardTitle className="text-base">Survivor benefits ({survivor.startYear})</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SurvivorTile
            icon={<HeartHandshake className="h-4 w-4" />}
            label="Survivor's pension"
            primary={formatMoney(survivor.survivorMonthlyTotal, true)}
            secondary={`per month · ${formatMoney(survivor.survivorAnnualTotal)} per year`}
          />
          <SurvivorTile
            icon={<Wallet className="h-4 w-4" />}
            label="Death benefit"
            primary={formatMoney(survivor.deathBenefit, true)}
            secondary="one-time lump sum"
          />
          <SurvivorTile
            icon={<Users className="h-4 w-4" />}
            label="Children's benefit"
            primary={formatMoney(survivor.childrensBenefitMonthlyTotal, true)}
            secondary={
              survivor.childrensBenefitMonthlyTotal > 0
                ? `${formatMoney(survivor.childrensBenefitPerChild, true)}/mo × ${(survivor.childrensBenefitMonthlyTotal / survivor.childrensBenefitPerChild).toFixed(0)} child(ren)`
                : "no eligible children"
            }
          />
        </div>

        <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">Breakdown (monthly)</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
            <SurvivorRow
              label={`Deceased's calc'd retirement at 65 (base + Tier 1)`}
              value={formatMoney(survivor.deceasedCalculatedRetirementBaseTier1, true)}
            />
            <SurvivorRow
              label={`Deceased's calc'd retirement at 65 (Tier 2)`}
              value={formatMoney(survivor.deceasedCalculatedRetirementTier2, true)}
            />
            <SurvivorRow
              label={`× ${survivor.survivorAge >= 65 ? "60%" : "37.5%"} (survivor rate, age ${survivor.survivorAge})`}
              value={formatMoney(survivor.survivorPensionBaseTier1, true)}
            />
            <SurvivorRow
              label="× 37.5% Tier 2 enhancement"
              value={formatMoney(survivor.survivorPensionTier2, true)}
            />
            {survivor.survivorFlatRate > 0 ? (
              <SurvivorRow
                label="+ flat-rate component (under-65)"
                value={formatMoney(survivor.survivorFlatRate, true)}
              />
            ) : null}
            {survivor.combinedCapReduction > 0 ? (
              <SurvivorRow
                label={`− combined-benefit cap (max @65 = ${formatMoney(survivor.combinedBenefitCap, true)})`}
                value={`-${formatMoney(survivor.combinedCapReduction, true)}`}
                negative
              />
            ) : null}
            <SurvivorRow
              label="= survivor pension payable"
              value={formatMoney(survivor.survivorMonthlyTotal, true)}
              bold
            />
            {survivor.combinedMonthlyTotal !== survivor.survivorMonthlyTotal ? (
              <SurvivorRow
                label="combined: own retirement + survivor pension"
                value={formatMoney(survivor.combinedMonthlyTotal, true)}
              />
            ) : null}
          </div>
        </div>

        {survivor.notes.length > 0 ? (
          <div className="space-y-1.5">
            {survivor.notes.map((n, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SurvivorTile({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight">{primary}</div>
      <div className="text-xs text-muted-foreground">{secondary}</div>
    </div>
  );
}

function SurvivorRow({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <>
      <div className={`text-muted-foreground ${bold ? "font-semibold text-foreground" : ""}`}>{label}</div>
      <div className={`text-right ${bold ? "font-semibold" : ""} ${negative ? "text-red-600" : ""}`}>{value}</div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function StartAgeCard({ result, isOptimal }: { result: StartAgeResult; isOptimal: boolean }) {
  const total = result.totalMonthly;
  const baseShare = total > 0 ? result.baseMonthly / total : 0;
  const t1Share = total > 0 ? result.tier1Monthly / total : 0;
  const t2Share = total > 0 ? result.tier2Monthly / total : 0;

  const adj = result.adjustmentFactor;
  const adjLabel = adj === 1 ? "0%" : adj > 1 ? `+${((adj - 1) * 100).toFixed(0)}%` : `${((adj - 1) * 100).toFixed(0)}%`;

  return (
    <Card className={isOptimal ? "border-primary shadow-md ring-1 ring-primary/30" : ""}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex items-baseline gap-2 shrink-0">
            <CardTitle className="text-base whitespace-nowrap">Age {result.startAge}</CardTitle>
            <Badge variant="outline" className="font-normal tabular-nums whitespace-nowrap">
              {adjLabel}
            </Badge>
          </div>
          {isOptimal && (
            <Badge className="gap-1 shrink-0 whitespace-nowrap">
              <Sparkles className="h-3 w-3" /> Highest lifetime
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
            {formatMoney(result.totalMonthly, true)}
          </div>
          <div className="text-xs text-muted-foreground">
            per month · {formatMoney(result.totalAnnual)} per year
          </div>
        </div>

        {/* Percent of the maximum CPP retirement pension for someone taking
            up at this same age in the same start year. The max is projected
            forward to the start year using YMPE growth and adjusted by the
            actuarial factor for the start age, so the ratio is in the same
            (start-year) dollars as the user's projected benefit. See
            `calculate.ts` and `StartAgeResult.percentOfMaximum`. */}
        {(() => {
          // Single source of truth for the clamped 0–100 value — keeps the
          // visual bar width and the ARIA value in sync, so screen readers
          // never announce an out-of-range progressbar value even if the
          // raw `percentOfMaximum` exceeds 1.0 (rare edge cases noted in
          // the field doc comment).
          const rawPct = result.percentOfMaximum * 100;
          const clampedPct = Math.min(100, Math.max(0, rawPct));
          return (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">% of maximum</span>
                <span className="font-mono font-medium tabular-nums">{rawPct.toFixed(1)}%</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`Projected benefit as a percent of the maximum CPP retirement pension at age ${result.startAge}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(clampedPct)}
              >
                <div className="h-full bg-primary" style={{ width: `${clampedPct}%` }} />
              </div>
              <div className="text-[10px] text-muted-foreground">
                Max at age {result.startAge} in {result.startYear}: {formatMoney(result.maxMonthlyAtStart, true)}/mo
              </div>
            </div>
          );
        })()}

        <div className="space-y-1.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-[hsl(var(--chart-1))]" style={{ width: `${baseShare * 100}%` }} />
            <div className="bg-[hsl(var(--chart-2))]" style={{ width: `${t1Share * 100}%` }} />
            <div className="bg-[hsl(var(--chart-4))]" style={{ width: `${t2Share * 100}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">
            <Legend2 color="chart-1" label="Base" amount={result.baseMonthly} />
            <Legend2 color="chart-2" label="Tier 1" amount={result.tier1Monthly} />
            <Legend2 color="chart-4" label="Tier 2" amount={result.tier2Monthly} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Legend2({ color, label, amount }: { color: string; label: string; amount: number }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={`h-2 w-2 shrink-0 rounded-sm bg-[hsl(var(--${color}))]`} />
        <span className="truncate">{label}</span>
      </div>
      <span className="font-medium">{formatMoney(amount, true)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function ComparisonChart({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  const data = sortedAges.map((r) => ({
    age: `Age ${r.startAge}`,
    Base: Math.round(r.baseMonthly),
    "Tier 1": Math.round(r.tier1Monthly),
    "Tier 2": Math.round(r.tier2Monthly),
  }));
  return (
    <Card>
      <CardContent className="pt-5">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="age" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
            <ChartTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="Base" stackId="a" fill="hsl(var(--chart-1))" />
            <Bar dataKey="Tier 1" stackId="a" fill="hsl(var(--chart-2))" />
            <Bar dataKey="Tier 2" stackId="a" fill="hsl(var(--chart-4))" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function BreakevenChart({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  // Build merged data keyed by age
  const ages = new Set<number>();
  sortedAges.forEach((r) => r.cumulativeByAge.forEach((p) => ages.add(p.age)));
  const sortedAgesAll = Array.from(ages).sort((a, b) => a - b);
  const data = sortedAgesAll.map((age) => {
    const row: Record<string, number> = { age };
    for (const r of sortedAges) {
      const point = r.cumulativeByAge.find((p) => p.age === age);
      if (point) row[`Age ${r.startAge}`] = Math.round(point.cumulativeNominal);
    }
    return row;
  });

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Cumulative lifetime benefit (nominal, indexed)
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="age" tick={{ fontSize: 12 }} label={{ value: "Age", position: "insideBottom", offset: -5, style: { fontSize: 12 } }} />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
            <ChartTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Legend />
            {sortedAges.map((r, i) => (
              <Line
                key={r.startAge}
                type="monotone"
                dataKey={`Age ${r.startAge}`}
                stroke={`hsl(var(--chart-${(i % 5) + 1}))`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function EarningsChart({
  inputs,
  effectiveEarnings,
}: {
  inputs: ScenarioInputs;
  effectiveEarnings: { year: number; pensionableEarnings: number }[];
}) {
  const lastHistYear = useMemo(() => {
    const ys = inputs.earningsHistory.map((r) => r.year);
    return ys.length > 0 ? Math.max(...ys) : -Infinity;
  }, [inputs.earningsHistory]);

  const data = effectiveEarnings
    .filter((r) => r.year >= 1966)
    .map((r) => ({
      year: r.year,
      Earnings: Math.round(r.pensionableEarnings),
      YMPE: YMPE_HISTORY[r.year] ?? null,
      YAMPE: YAMPE_HISTORY[r.year] ?? null,
      isProjected: r.year > lastHistYear,
    }));

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[hsl(var(--chart-1))]" /> Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[hsl(var(--chart-3))]" /> Projected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-[hsl(var(--chart-2))]" /> YMPE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-[hsl(var(--chart-4))]" /> YAMPE
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <ChartTooltip formatter={(v: any) => (typeof v === "number" ? `$${v.toLocaleString()}` : "—")} />
            <Bar dataKey="Earnings" isAnimationActive={false}>
              {data.map((d, idx) => (
                <Cell
                  key={idx}
                  fill={d.isProjected ? "hsl(var(--chart-3))" : "hsl(var(--chart-1))"}
                />
              ))}
            </Bar>
            <Line type="monotone" dataKey="YMPE" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="YAMPE" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            {Number.isFinite(lastHistYear) && (
              <ReferenceLine x={lastHistYear} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopRight", style: { fontSize: 11 } }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Diagnostics drawer
// ---------------------------------------------------------------------------

function DiagnosticsPanel({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Diagnostics</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {sortedAges.map((r) => (
            <AccordionItem key={r.startAge} value={`age-${r.startAge}`}>
              <AccordionTrigger className="text-sm">
                Age {r.startAge} · {formatMoney(r.totalMonthly, true)}/mo · adj {formatPercent(r.adjustmentFactor - 1, true)}
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
                  <div>
                    <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Base CPP</div>
                    <DiagRow label="Contributory months" value={r.base.contributoryPeriodMonths} />
                    <DiagRow label="CRDO months dropped" value={r.base.crdoMonthsDropped} />
                    <DiagRow label="Disability months dropped" value={r.base.disabilityMonthsDropped} />
                    <DiagRow label="General 17% drop-out months" value={r.base.generalDropoutMonths} />
                    <DiagRow label="Months retained" value={r.base.monthsRetained} />
                    <DiagRow label="AMPE (monthly)" value={formatMoney(r.base.ampe, true)} />
                    <DiagRow label="AYMPE start year" value={formatMoney(r.base.aympeStartYear)} />
                    <DiagRow label="Adjustment factor" value={r.adjustmentFactor.toFixed(4)} />
                  </div>
                  <div>
                    <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Enhancement</div>
                    <DiagRow label="Tier 1 contribution years" value={r.enhancement.tier1ContributionYears} />
                    <DiagRow label="Tier 1 accrual" value={formatPercent(r.enhancement.tier1AccrualFactor)} />
                    <DiagRow label="Tier 1 indexed earnings (sum)" value={formatMoney(r.enhancement.tier1IndexedEarningsSum)} />
                    <DiagRow label="Tier 2 contribution years" value={r.enhancement.tier2ContributionYears} />
                    <DiagRow label="Tier 2 accrual" value={formatPercent(r.enhancement.tier2AccrualFactor)} />
                    <DiagRow label="Tier 2 indexed earnings (sum)" value={formatMoney(r.enhancement.tier2IndexedEarningsSum)} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function DiagRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
