import { useMemo } from "react";
import { useSearch, Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
} from "lucide-react";
import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
} from "recharts";
import {
  getScenario,
  getGetScenarioQueryKey,
} from "@workspace/api-client-react";
import {
  calculateCpp,
  formatMoney,
  formatPercent,
  type ScenarioInputs,
  type CalculationResult,
} from "@/cpp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Compare() {
  const search = useSearch();
  const ids = useMemo(() => {
    const params = new URLSearchParams(search);
    const raw = params.get("ids") ?? "";
    return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  }, [search]);

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: getGetScenarioQueryKey(id),
      queryFn: () => getScenario(id),
      enabled: ids.length > 0,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  const scenarios = queries
    .map((q) => q.data)
    .filter((s): s is NonNullable<typeof s> => !!s);

  const computed = useMemo(() => {
    return scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      inputs: s.inputs as unknown as ScenarioInputs,
      result: calculateCpp(s.inputs as unknown as ScenarioInputs),
    }));
  }, [scenarios]);

  if (ids.length === 0) {
    return (
      <div className="container mx-auto p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No scenarios selected. Select two or more scenarios from the dashboard to compare.
        </p>
        <Link href="/scenarios">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to scenarios
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="h-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // Build a comparison-table view: pick one start age per scenario (the first)
  // OR: show full breakdowns for each scenario in columns
  return (
    <div className="container mx-auto p-3 sm:p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-2 sm:gap-3">
        <Link href="/scenarios">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Compare scenarios</h1>
          <p className="text-xs text-muted-foreground">
            {computed.length} scenarios · totals shown in start-year dollars
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
        {computed.map((c, i) => (
          <ScenarioColumn key={c.id} index={i} title={c.title} inputs={c.inputs} result={c.result} />
        ))}
      </div>
      <div
        className="hidden lg:grid gap-4"
        style={{ gridTemplateColumns: `repeat(${computed.length}, minmax(0, 1fr))` }}
      >
        {computed.map((c, i) => (
          <ScenarioColumn key={`lg-${c.id}`} index={i} title={c.title} inputs={c.inputs} result={c.result} />
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4" /> Cumulative lifetime benefit (one line per scenario × start age)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CombinedBreakeven computed={computed} />
        </CardContent>
      </Card>

      <DifferencesTable computed={computed} />
    </div>
  );
}

function ScenarioColumn({
  index,
  title,
  inputs,
  result,
}: {
  index: number;
  title: string;
  inputs: ScenarioInputs;
  result: CalculationResult;
}) {
  const sorted = [...result.byStartAge].sort((a, b) => a.startAge - b.startAge);
  const colorVar = `hsl(var(--chart-${(index % 5) + 1}))`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: colorVar }} />
          <CardTitle className="line-clamp-1 text-base">{title}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Born {inputs.birthYear}/{String(inputs.birthMonth).padStart(2, "0")} · {inputs.province ?? "—"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((r) => (
          <div key={r.startAge} className="rounded-md border bg-background p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">Age {r.startAge}</span>
              <Badge variant="outline" className="font-normal tabular-nums">
                {formatPercent(r.adjustmentFactor - 1)}
              </Badge>
            </div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {formatMoney(r.totalMonthly, true)}
            </div>
            <div className="text-xs text-muted-foreground">/ month</div>
            <div className="mt-2 grid grid-cols-3 text-[11px] tabular-nums">
              <div>
                <div className="text-muted-foreground">Base</div>
                <div>{formatMoney(r.baseMonthly)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Tier 1</div>
                <div>{formatMoney(r.tier1Monthly)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Tier 2</div>
                <div>{formatMoney(r.tier2Monthly)}</div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CombinedBreakeven({
  computed,
}: {
  computed: { id: string; title: string; result: CalculationResult }[];
}) {
  const series: { key: string; color: string; data: { age: number; v: number }[] }[] = [];
  computed.forEach((c, ci) => {
    const sorted = [...c.result.byStartAge].sort((a, b) => a.startAge - b.startAge);
    sorted.forEach((r) => {
      series.push({
        key: `${c.title} · ${r.startAge}`,
        color: `hsl(var(--chart-${(ci % 5) + 1}))`,
        data: r.cumulativeByAge.map((p) => ({ age: p.age, v: Math.round(p.cumulativeNominal) })),
      });
    });
  });

  // Merge into shared age axis
  const ages = new Set<number>();
  series.forEach((s) => s.data.forEach((p) => ages.add(p.age)));
  const sortedAges = Array.from(ages).sort((a, b) => a - b);
  const data = sortedAges.map((age) => {
    const row: Record<string, number> = { age };
    series.forEach((s) => {
      const p = s.data.find((d) => d.age === age);
      if (p) row[s.key] = p.v;
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="age" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
        <ChartTooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={i % 3 === 1 ? "5 3" : i % 3 === 2 ? "2 2" : undefined}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function DifferencesTable({
  computed,
}: {
  computed: { id: string; title: string; inputs: ScenarioInputs }[];
}) {
  // Show a simple side-by-side of key inputs that differ
  const rows: { label: string; values: (string | number)[] }[] = [
    { label: "Birth year", values: computed.map((c) => c.inputs.birthYear) },
    { label: "Stop work age", values: computed.map((c) => c.inputs.assumptions.stopWorkAge) },
    { label: "YMPE growth", values: computed.map((c) => formatPercent(c.inputs.assumptions.ympeGrowthRate)) },
    { label: "Indexing", values: computed.map((c) => formatPercent(c.inputs.assumptions.indexingRate)) },
    { label: "Future earnings (next yr)", values: computed.map((c) => formatMoney(c.inputs.assumptions.assumedFutureEarnings)) },
    { label: "Earnings years entered", values: computed.map((c) => c.inputs.earningsHistory.length) },
    { label: "CRDO periods", values: computed.map((c) => (c.inputs.dropoutPeriods ?? []).filter((d) => d.kind === "crdo").length) },
    { label: "Disability periods", values: computed.map((c) => (c.inputs.dropoutPeriods ?? []).filter((d) => d.kind === "disability").length) },
  ];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm">Input differences</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Field</th>
              {computed.map((c) => (
                <th key={c.id} className="px-4 py-2 text-right">
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2 font-medium">{row.label}</td>
                {row.values.map((v, j) => (
                  <td key={j} className="px-4 py-2 text-right tabular-nums">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
