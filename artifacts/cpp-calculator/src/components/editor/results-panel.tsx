import React, { useState, useMemo, useEffect, createContext, useContext } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  ChevronDown,
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
  projectedMonthlyInclPrbAtStop,
  type ScenarioInputs,
  type StartAgeResult,
  type SurvivorResult,
  type PostRetirementBenefit,
} from "@/cpp";
import { Briefcase, HeartHandshake, Users, Wallet, Info } from "lucide-react";
import {
  translateDeathBenefitTopUp,
  translateSurvivorNote,
  translateWarning,
} from "./print-plain-language";
import {
  caregivingCreditNote,
  comparisonChartData,
  comparisonChartSeries,
  prbHeadlineLabel,
  prbSubtext,
  resultsPanelSections,
  survivorCardTitle,
  survivorTileLabels,
  warningsHeading,
} from "./client-view-content";
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
  /**
   * When true, engine notes/warnings are run through the plain-language
   * translation layer and family/PRB labels use the same friendly wording as
   * the printed client report. Advisor-facing views leave this off to keep
   * the technical text.
   */
  clientView?: boolean;
}

// ---------------------------------------------------------------------------
// Display-mode context: lets every sub-card (cards, charts, diagnostics)
// reframe start-year nominal $ into today's dollars on demand.
//
// PWL's CPP calculator and most client-facing planning tools default to
// today's-dollars. Our engine returns start-year nominal, which is the right
// number for breakeven math (it's what the cheque actually says) but feels
// inflated to a 60-year-old looking at age-70 numbers. The toggle lets a
// planner switch between the two without re-running the engine.
//
// Deflator convention: divide by (1 + indexingRate) ^ max(0, targetYear -
// todayYear - 1). The minus-one matches PWL's convention where the first
// deflation step begins the calendar year *after* today (i.e. "year 0" is
// next year, not this year). This reproduces PWL's $1,342 against our
// $1,491.78 to within $3 for a 1967-born client retiring at 65 with
// indexing = 2.1%.
// ---------------------------------------------------------------------------

type DisplayMode = "nominal" | "today";

interface DisplayCtxValue {
  mode: DisplayMode;
  todayYear: number;
  indexingRate: number;
  /** Deflate a start-year nominal $ amount to today's dollars (no-op in "nominal" mode). */
  deflate: (value: number, targetYear: number) => number;
  /** The deflation divisor for a target year (for chart axis labelling, etc.) */
  deflator: (targetYear: number) => number;
}

const DisplayCtx = createContext<DisplayCtxValue>({
  mode: "nominal",
  todayYear: new Date().getFullYear(),
  indexingRate: 0,
  deflate: (v) => v,
  deflator: () => 1,
});

function useDisplay(): DisplayCtxValue {
  return useContext(DisplayCtx);
}

export function ResultsPanel({ inputs, scenarioTitle, clientView = false }: ResultsPanelProps) {
  const result = useMemo(() => calculateCpp(inputs), [inputs]);
  const sections = resultsPanelSections(clientView);

  const todayYear = useMemo(() => new Date().getFullYear(), []);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    if (typeof window === "undefined") return "nominal";
    const stored = window.localStorage.getItem("cpp:display-mode");
    return stored === "today" ? "today" : "nominal";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("cpp:display-mode", displayMode);
  }, [displayMode]);

  const displayCtxValue = useMemo<DisplayCtxValue>(() => {
    const rate = inputs.assumptions.indexingRate;
    const deflator = (targetYear: number) =>
      Math.pow(1 + rate, Math.max(0, targetYear - todayYear - 1));
    const deflate =
      displayMode === "today"
        ? (v: number, year: number) => v / deflator(year)
        : (v: number) => v;
    return { mode: displayMode, todayYear, indexingRate: rate, deflate, deflator };
  }, [displayMode, todayYear, inputs.assumptions.indexingRate]);

  const sortedAges = [...result.byStartAge].sort((a, b) => a.startAge - b.startAge);
  const caregivingNote = useMemo(
    () =>
      caregivingCreditNote(
        result.byStartAge.map((r) => r.enhancement.appliedCaregivingDropIns),
      ),
    [result],
  );
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
    <DisplayCtx.Provider value={displayCtxValue}>
    <div className="space-y-4">
      {result.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{warningsHeading(clientView)}</div>
            <ul className="mt-1 list-inside list-disc text-xs">
              {result.warnings.map((w, i) => (
                <li key={i}>{clientView ? translateWarning(w) : w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Calculation</h2>
          <p className="text-xs text-muted-foreground">
            {displayMode === "today"
              ? `All amounts shown in today's dollars (${todayYear}), deflated at ${(inputs.assumptions.indexingRate * 100).toFixed(2)}% CPI.`
              : `All amounts in start-year (future) dollars unless noted.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-md border bg-background p-0.5 text-xs"
            role="group"
            aria-label="Display mode"
          >
            <button
              type="button"
              onClick={() => setDisplayMode("today")}
              className={`rounded-sm px-2.5 py-1 font-medium transition-colors ${
                displayMode === "today"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={displayMode === "today"}
              data-testid="button-display-today"
            >
              Today&rsquo;s $
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("nominal")}
              className={`rounded-sm px-2.5 py-1 font-medium transition-colors ${
                displayMode === "nominal"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={displayMode === "nominal"}
              data-testid="button-display-nominal"
            >
              Future $
            </button>
          </div>
          {sections.showCsvExports ? (
            <>
              <Button variant="outline" size="sm" onClick={exportSummary}>
                <Download className="mr-2 h-4 w-4" /> Summary CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportEarnings}>
                <Download className="mr-2 h-4 w-4" /> Earnings CSV
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {caregivingNote ? (
        <div
          className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
          data-testid="note-caregiving-credit"
        >
          <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{caregivingNote}</p>
        </div>
      ) : null}

      {sections.showContributionCard ? <ContributionCard inputs={inputs} /> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedAges.map((r) => (
          <StartAgeCard
            key={r.startAge}
            result={r}
            isOptimal={optimal?.startAge === r.startAge}
            prb={inputs.postRetirementBenefit}
            clientView={clientView}
          />
        ))}
      </div>

      <Tabs defaultValue="comparison" className="w-full">
        <TabsList
          className={`grid w-full ${sections.showEarningsTab ? "grid-cols-3" : "grid-cols-2"} h-auto gap-1 p-1`}
        >
          <TabsTrigger value="comparison" className="text-xs sm:text-sm py-1.5">
            <span className="hidden sm:inline">Monthly comparison</span>
            <span className="sm:hidden">Monthly</span>
          </TabsTrigger>
          <TabsTrigger value="breakeven" className="text-xs sm:text-sm py-1.5">Breakeven</TabsTrigger>
          {sections.showEarningsTab ? (
            <TabsTrigger value="earnings" className="text-xs sm:text-sm py-1.5">
              <span className="hidden sm:inline">Earnings vs YMPE</span>
              <span className="sm:hidden">Earnings</span>
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="comparison" className="mt-3">
          <ComparisonChart sortedAges={sortedAges} clientView={clientView} />
        </TabsContent>
        <TabsContent value="breakeven" className="mt-3">
          <BreakevenChart sortedAges={sortedAges} />
        </TabsContent>
        {sections.showEarningsTab ? (
          <TabsContent value="earnings" className="mt-3">
            <EarningsChart inputs={inputs} effectiveEarnings={result.effectiveEarnings} />
          </TabsContent>
        ) : null}
      </Tabs>

      {sections.showDiagnostics ? <DiagnosticsPanel sortedAges={sortedAges} /> : null}

      {inputs.survivor?.enabled ? (
        <SurvivorCard inputs={inputs} clientView={clientView} />
      ) : null}
    </div>
    </DisplayCtx.Provider>
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

function SurvivorCard({
  inputs,
  clientView = false,
}: {
  inputs: ScenarioInputs;
  clientView?: boolean;
}) {
  const { deflate } = useDisplay();
  const survivor: SurvivorResult | null = useMemo(() => {
    if (!inputs.survivor?.enabled) return null;
    try {
      return calculateSurvivor(inputs, inputs.survivor);
    } catch {
      return null;
    }
  }, [inputs]);

  if (!survivor) return null;
  // Survivor numbers are denominated in the survivor's start year. Use that
  // year as the deflation target. The $2,500 death benefit is a fixed
  // statutory lump sum (not indexed), so we leave it nominal.
  const sy = survivor.startYear;
  const d = (v: number) => deflate(v, sy);

  return (
    <Card className="border-[hsl(var(--chart-3))]/40 bg-gradient-to-br from-card to-[hsl(var(--chart-3))]/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-[hsl(var(--chart-3))]" />
          <CardTitle className="text-base">
            {survivorCardTitle(clientView, survivor.startYear)}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SurvivorTile
            icon={<HeartHandshake className="h-4 w-4" />}
            label={survivorTileLabels(clientView).pension}
            primary={formatMoney(d(survivor.survivorMonthlyTotal), true)}
            secondary={`per month · ${formatMoney(d(survivor.survivorAnnualTotal))} per year`}
          />
          <SurvivorTile
            icon={<Wallet className="h-4 w-4" />}
            label={survivorTileLabels(clientView).deathBenefit}
            primary={formatMoney(survivor.deathBenefit, true)}
            secondary={
              survivor.deathBenefitTopUp > 0
                ? `one-time lump sum · incl. ${formatMoney(survivor.deathBenefitTopUp)} top-up`
                : "one-time lump sum"
            }
          />
          <SurvivorTile
            icon={<Users className="h-4 w-4" />}
            label={survivorTileLabels(clientView).children}
            primary={formatMoney(d(survivor.childrensBenefitMonthlyTotal), true)}
            secondary={
              survivor.childrensBenefitMonthlyTotal > 0
                ? `${formatMoney(d(survivor.childrensBenefitPerChild), true)}/mo × ${(survivor.childrensBenefitMonthlyTotal / survivor.childrensBenefitPerChild).toFixed(0)} child(ren)`
                : "no eligible children"
            }
          />
        </div>

        {survivor.deathBenefitTopUpExplanation ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="text-death-benefit-topup-explanation"
          >
            {clientView
              ? translateDeathBenefitTopUp(survivor.deathBenefitTopUpExplanation)
              : survivor.deathBenefitTopUpExplanation}
          </p>
        ) : null}

        {/* The step-by-step calculation grid is actuary-speak; the printed
            client report omits it, so the client view does too. */}
        {clientView ? null : (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">Breakdown (monthly)</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
            <SurvivorRow
              label={`Deceased's calc'd retirement at 65 (base + Tier 1)`}
              value={formatMoney(d(survivor.deceasedCalculatedRetirementBaseTier1), true)}
            />
            <SurvivorRow
              label={`Deceased's calc'd retirement at 65 (Tier 2)`}
              value={formatMoney(d(survivor.deceasedCalculatedRetirementTier2), true)}
            />
            <SurvivorRow
              label={`× ${survivor.survivorAge >= 65 ? "60%" : "37.5%"} (survivor rate, age ${survivor.survivorAge})`}
              value={formatMoney(d(survivor.survivorPensionBaseTier1), true)}
            />
            <SurvivorRow
              label="× 37.5% Tier 2 enhancement"
              value={formatMoney(d(survivor.survivorPensionTier2), true)}
            />
            {survivor.survivorFlatRate > 0 ? (
              <SurvivorRow
                label="+ flat-rate component (under-65)"
                value={formatMoney(d(survivor.survivorFlatRate), true)}
              />
            ) : null}
            {survivor.combinedCapReduction > 0 ? (
              <SurvivorRow
                label={`− combined-benefit cap (max @65 = ${formatMoney(d(survivor.combinedBenefitCap), true)})`}
                value={`-${formatMoney(d(survivor.combinedCapReduction), true)}`}
                negative
              />
            ) : null}
            <SurvivorRow
              label="= survivor pension payable"
              value={formatMoney(d(survivor.survivorMonthlyTotal), true)}
              bold
            />
            {survivor.combinedMonthlyTotal !== survivor.survivorMonthlyTotal ? (
              <SurvivorRow
                label="combined: own retirement + survivor pension"
                value={formatMoney(d(survivor.combinedMonthlyTotal), true)}
              />
            ) : null}
          </div>
        </div>
        )}

        {clientView && survivor.combinedMonthlyTotal !== survivor.survivorMonthlyTotal ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <span className="text-muted-foreground">
              Your spouse's total from CPP each month (their own pension plus
              the amounts above):{" "}
            </span>
            <span className="font-semibold tabular-nums">
              {formatMoney(d(survivor.combinedMonthlyTotal), true)}
            </span>
          </div>
        ) : null}

        {survivor.notes.length > 0 ? (
          <div className="space-y-1.5">
            {survivor.notes.map((n, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{clientView ? translateSurvivorNote(n) : n}</span>
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

function StartAgeCard({
  result,
  isOptimal,
  prb,
  clientView = false,
}: {
  result: StartAgeResult;
  isOptimal: boolean;
  prb?: PostRetirementBenefit;
  clientView?: boolean;
}) {
  const { deflate, indexingRate } = useDisplay();
  // All headline $ amounts are start-year nominal from the engine. Deflating
  // by the same start-year divisor preserves all ratios (% of max, tier
  // shares), so only the displayed currency values change.
  const baseMonthly = deflate(result.baseMonthly, result.startYear);
  const tier1Monthly = deflate(result.tier1Monthly, result.startYear);
  const tier2Monthly = deflate(result.tier2Monthly, result.startYear);
  const totalMonthly = deflate(result.totalMonthly, result.startYear);
  const totalAnnual = deflate(result.totalAnnual, result.startYear);
  const maxMonthlyAtStart = deflate(result.maxMonthlyAtStart, result.startYear);
  const maxMonthlyAtAge65 = deflate(result.maxMonthlyAtAge65, result.startYear);

  const total = totalMonthly;
  const baseShare = total > 0 ? baseMonthly / total : 0;
  const t1Share = total > 0 ? tier1Monthly / total : 0;
  const t2Share = total > 0 ? tier2Monthly / total : 0;

  // Per-tier breakdown of "% of max at this age". Each slice is that tier's
  // monthly amount divided by the SAME max-at-this-age denominator used by
  // the headline % bar, so the three add up to that overall percentage.
  // See src/cpp/__tests__/tierBreakdown.test.ts.
  const max = maxMonthlyAtStart;
  const basePctOfMax = max > 0 ? (baseMonthly / max) * 100 : 0;
  const t1PctOfMax = max > 0 ? (tier1Monthly / max) * 100 : 0;
  const t2PctOfMax = max > 0 ? (tier2Monthly / max) * 100 : 0;
  const totalPctOfMax = max > 0 ? (totalMonthly / max) * 100 : 0;
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const adj = result.adjustmentFactor;
  const adjLabel = adj === 1 ? "0%" : adj > 1 ? `+${((adj - 1) * 100).toFixed(0)}%` : `${((adj - 1) * 100).toFixed(0)}%`;

  // Post-Retirement Benefit: when the client keeps working after starting CPP,
  // the engine accrues extra benefit year by year until the stop age. The PRB
  // never changes the headline monthly AT START (it builds up afterward), so we
  // surface the fully-accrued monthly here to make the toggle's effect visible.
  // The helper handles the start-year-dollar conversion and edge cases (engine-
  // consistent stop-age default, fractional stop ages, projection clamping);
  // we deflate its result the same way the headline is deflated so the
  // today's-$/future-$ toggle stays consistent.
  const prbProjection = projectedMonthlyInclPrbAtStop(result, prb, indexingRate);
  const prbInclMonthly = prbProjection
    ? deflate(prbProjection.startYearMonthly, result.startYear)
    : 0;
  const prbDeltaMonthly = prbProjection ? prbInclMonthly - totalMonthly : 0;
  const prbStopAge = prbProjection?.atAge ?? 0;

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
            {formatMoney(totalMonthly, true)}
          </div>
          <div className="text-xs text-muted-foreground">
            per month · {formatMoney(totalAnnual)} per year
          </div>
        </div>

        {prbProjection && prbDeltaMonthly > 0 && (
          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Briefcase className="h-3 w-3 shrink-0" />
                {prbHeadlineLabel(clientView, prbStopAge)}
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatMoney(prbInclMonthly, true)}/mo
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {prbSubtext(clientView, formatMoney(prbDeltaMonthly, true), prbStopAge)}
            </div>
          </div>
        )}

        {/* Percent of the maximum CPP retirement pension for someone taking
            up at this same age in the same start year. The max is projected
            forward to the start year using YMPE growth and adjusted by the
            actuarial factor for the start age, so the ratio is in the same
            (start-year) dollars as the user's projected benefit. See
            `calculate.ts` and `StartAgeResult.percentOfMaximum`. */}
        {(() => {
          // Two framings of "% of maximum" (see calculate.ts and
          // StartAgeResult). The "at this age" ratio is invariant across
          // start ages because numerator and denominator both scale by the
          // same actuarial factor — it isolates earnings-record strength.
          // The "vs. age-65 max" ratio scales with the actuarial factor and
          // visualises the timing decision (≈64% at 60, ≈142% at 70).
          const atAgePct = result.percentOfMaximum * 100;
          const vs65Pct = result.percentOfAge65Maximum * 100;
          // Single source of truth for the clamped 0–100 value — keeps the
          // visual bar width and the ARIA value in sync, so screen readers
          // never announce an out-of-range progressbar value even if either
          // raw percentage exceeds 1.0 (rare edge cases noted in the field
          // doc comment, and the common ≈142% case at age 70).
          const atAgeClamped = Math.min(100, Math.max(0, atAgePct));
          const vs65Clamped = Math.min(100, Math.max(0, vs65Pct));
          return (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">% of max at this age</span>
                  <span className="font-mono font-medium tabular-nums">{atAgePct.toFixed(1)}%</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`Projected benefit as a percent of the maximum CPP retirement pension at age ${result.startAge}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(atAgeClamped)}
                >
                  <div className="h-full bg-primary" style={{ width: `${atAgeClamped}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Max at age {result.startAge} in {result.startYear}: {formatMoney(maxMonthlyAtStart, true)}/mo
                </div>
                {clientView ? null : (
                <Collapsible open={breakdownOpen} onOpenChange={setBreakdownOpen}>
                  <CollapsibleTrigger
                    className="mt-1 flex w-full items-center justify-between gap-1 rounded text-[10px] text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-tier-breakdown"
                  >
                    <span>{breakdownOpen ? "Hide" : "Show"} per-tier breakdown</span>
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${breakdownOpen ? "rotate-180" : ""}`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1.5 space-y-1">
                    <TierPctRow
                      label="Base"
                      color="chart-1"
                      monthly={baseMonthly}
                      pct={basePctOfMax}
                    />
                    <TierPctRow
                      label="Tier 1"
                      color="chart-2"
                      monthly={tier1Monthly}
                      pct={t1PctOfMax}
                    />
                    <TierPctRow
                      label="Tier 2"
                      color="chart-4"
                      monthly={tier2Monthly}
                      pct={t2PctOfMax}
                    />
                    <div className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-1 text-[11px] font-medium tabular-nums">
                      <span>Total</span>
                      <span className="font-mono">{totalPctOfMax.toFixed(2)}%</span>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">% of age-65 max</span>
                  <span className="font-mono font-medium tabular-nums">{vs65Pct.toFixed(1)}%</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`Projected benefit as a percent of the age-65 maximum CPP retirement pension in ${result.startYear}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(vs65Clamped)}
                >
                  <div className="h-full bg-primary/60" style={{ width: `${vs65Clamped}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Age-65 max in {result.startYear}: {formatMoney(maxMonthlyAtAge65, true)}/mo
                </div>
              </div>
            </div>
          );
        })()}

        {/* Base/Tier 1/Tier 2 jargon — advisor-only, like the print report. */}
        {clientView ? null : (
        <div className="space-y-1.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-[hsl(var(--chart-1))]" style={{ width: `${baseShare * 100}%` }} />
            <div className="bg-[hsl(var(--chart-2))]" style={{ width: `${t1Share * 100}%` }} />
            <div className="bg-[hsl(var(--chart-4))]" style={{ width: `${t2Share * 100}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">
            <Legend2 color="chart-1" label="Base" amount={baseMonthly} />
            <Legend2 color="chart-2" label="Tier 1" amount={tier1Monthly} />
            <Legend2 color="chart-4" label="Tier 2" amount={tier2Monthly} />
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function TierPctRow({
  label,
  color,
  monthly,
  pct,
}: {
  label: string;
  color: string;
  monthly: number;
  pct: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={`h-2 w-2 shrink-0 rounded-sm bg-[hsl(var(--${color}))]`} />
        <span>{label}</span>
      </span>
      <span className="font-mono">
        <span className="text-muted-foreground">{formatMoney(monthly, true)} · </span>
        <span className="font-medium">{pct.toFixed(2)}%</span>
      </span>
    </div>
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

function ComparisonChart({
  sortedAges,
  clientView = false,
}: {
  sortedAges: StartAgeResult[];
  clientView?: boolean;
}) {
  const { deflate, mode, todayYear } = useDisplay();
  const series = comparisonChartSeries(clientView);
  const data = useMemo(
    () =>
      comparisonChartData(
        clientView,
        sortedAges.map((r) => ({
          startAge: r.startAge,
          base: deflate(r.baseMonthly, r.startYear),
          tier1: deflate(r.tier1Monthly, r.startYear),
          tier2: deflate(r.tier2Monthly, r.startYear),
        })),
      ),
    [sortedAges, deflate, clientView],
  );
  const unitLabel = mode === "today" ? `today's $ (${todayYear})` : "start-year nominal $";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-2 text-xs text-muted-foreground">Monthly benefit at start age — {unitLabel}</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="age" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
            <ChartTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
            <Legend />
            {series.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="a"
                fill={`hsl(var(--chart-${[1, 2, 4][i % 3]}))`}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function BreakevenChart({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  const { deflate, mode, todayYear } = useDisplay();
  // Build merged data keyed by age. In today's-dollars mode we re-cumulate
  // each year's `annualNominal` after deflating by the year-at-age divisor.
  // Because the engine grows the monthly benefit at exactly indexingRate and
  // we deflate at the same rate, today's-dollars cumulative grows linearly
  // (each year contributes a constant real amount).
  const data = useMemo(() => {
    const ages = new Set<number>();
    sortedAges.forEach((r) => r.cumulativeByAge.forEach((p) => ages.add(p.age)));
    const sortedAgesAll = Array.from(ages).sort((a, b) => a - b);

    // Pre-compute today's-dollars running totals per start-age series so we
    // don't redo the O(n) sum inside the outer O(ages) loop.
    const realCumulativeBySeries = new Map<number, Map<number, number>>();
    if (mode === "today") {
      for (const r of sortedAges) {
        const m = new Map<number, number>();
        let acc = 0;
        for (const p of r.cumulativeByAge) {
          const yearAtAge = r.startYear + (p.age - r.startAge);
          acc += deflate(p.annualNominal, yearAtAge);
          m.set(p.age, acc);
        }
        realCumulativeBySeries.set(r.startAge, m);
      }
    }

    return sortedAgesAll.map((age) => {
      const row: Record<string, number> = { age };
      for (const r of sortedAges) {
        const point = r.cumulativeByAge.find((p) => p.age === age);
        if (!point) continue;
        if (mode === "today") {
          const real = realCumulativeBySeries.get(r.startAge)?.get(age) ?? 0;
          row[`Age ${r.startAge}`] = Math.round(real);
        } else {
          row[`Age ${r.startAge}`] = Math.round(point.cumulativeNominal);
        }
      }
      return row;
    });
  }, [sortedAges, mode, deflate]);

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          {mode === "today"
            ? `Cumulative lifetime benefit (today's dollars, ${todayYear})`
            : `Cumulative lifetime benefit (nominal, indexed)`}
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

  const data = useMemo(
    () =>
      effectiveEarnings
        .filter((r) => r.year >= 1966)
        .map((r) => ({
          year: r.year,
          Earnings: Math.round(r.pensionableEarnings),
          YMPE: YMPE_HISTORY[r.year] ?? null,
          YAMPE: YAMPE_HISTORY[r.year] ?? null,
          isProjected: r.year > lastHistYear,
        })),
    [effectiveEarnings, lastHistYear],
  );

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

export function DiagnosticsPanel({ sortedAges }: { sortedAges: StartAgeResult[] }) {
  const { deflate } = useDisplay();
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
                Age {r.startAge} · {formatMoney(deflate(r.totalMonthly, r.startYear), true)}/mo · adj {formatPercent(r.adjustmentFactor - 1, true)}
              </AccordionTrigger>
              <AccordionContent forceMount>
                <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
                  <div>
                    <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Base CPP</div>
                    <DiagRow label="Contributory months" value={r.base.contributoryPeriodMonths} />
                    <DiagRow label="CRDO months dropped" value={r.base.crdoMonthsDropped} />
                    <div className="mt-2">
                      <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                        CRDO months set aside by year (CRDO only)
                      </div>
                      {r.base.crdoMonthsDroppedByYear.length > 0 ? (
                        r.base.crdoMonthsDroppedByYear.map((d) => (
                          <DiagRow
                            key={d.year}
                            label={String(d.year)}
                            value={`${d.months} ${d.months === 1 ? "month" : "months"}`}
                          />
                        ))
                      ) : (
                        <p className="py-1 text-muted-foreground">
                          No CRDO months were set aside for this start age.
                        </p>
                      )}
                    </div>
                    <DiagRow label="Disability months dropped" value={r.base.disabilityMonthsDropped} />
                    <DiagRow label="General 17% drop-out months" value={r.base.generalDropoutMonths} />
                    <DiagRow label="Post-65 drop-out months" value={r.base.post65DropoutMonths} />
                    <DiagRow label="Months retained" value={r.base.monthsRetained} />
                    <DiagRow label="AMPE (monthly)" value={formatMoney(deflate(r.base.ampe, r.startYear), true)} />
                    <DiagRow label="AYMPE in start year" value={formatMoney(deflate(r.base.aympeStartYear, r.startYear))} />
                    <DiagRow label="Adjustment factor" value={r.adjustmentFactor.toFixed(4)} />
                  </div>
                  <div>
                    <div className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">Enhancement</div>
                    <DiagRow label="Tier 1 contribution years" value={r.enhancement.tier1ContributionYears} />
                    <DiagRow label="Tier 1 accrual" value={formatPercent(r.enhancement.tier1AccrualFactor)} />
                    <DiagRow label="Tier 1 indexed earnings (sum)" value={formatMoney(deflate(r.enhancement.tier1IndexedEarningsSum, r.startYear))} />
                    <DiagRow label="Tier 2 contribution years" value={r.enhancement.tier2ContributionYears} />
                    <DiagRow label="Tier 2 accrual" value={formatPercent(r.enhancement.tier2AccrualFactor)} />
                    <DiagRow label="Tier 2 indexed earnings (sum)" value={formatMoney(deflate(r.enhancement.tier2IndexedEarningsSum, r.startYear))} />
                    <DiagRow label="Tier 1 drop-in years" value={r.enhancement.tier1DropInYears} />
                    <DiagRow label="Tier 2 drop-in years" value={r.enhancement.tier2DropInYears} />
                    {r.enhancement.dropInAmountsByYear.length > 0 && (
                      <div className="mt-2">
                        <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                          Potential imputed earnings by year
                        </div>
                        <p className="mb-1 text-muted-foreground">
                          Candidate amounts only—not necessarily credited. Tier 1 starts in 2019 and Tier 2 in 2024; eligible years use the higher of actual or imputed earnings, never a lower amount.
                        </p>
                        {r.enhancement.dropInAmountsByYear.map((d) => (
                          <DiagRow
                            key={d.year}
                            label={String(d.year)}
                            value={formatMoney(d.amount, true)}
                          />
                        ))}
                      </div>
                    )}
                    <div className="mt-2">
                      <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                        CRDO drop-in credits actually applied
                      </div>
                      {r.enhancement.appliedCaregivingDropIns.length > 0 ? (
                        r.enhancement.appliedCaregivingDropIns.map((d) => (
                          <DiagRow
                            key={d.year}
                            label={String(d.year)}
                            value={formatMoney(d.amount, true)}
                          />
                        ))
                      ) : (
                        <p className="py-1 text-muted-foreground">
                          No child-rearing drop-in credits were applied for this start age.
                        </p>
                      )}
                    </div>
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
