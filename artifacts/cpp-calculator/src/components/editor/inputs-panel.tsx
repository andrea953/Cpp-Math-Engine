import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  ClipboardPaste,
  Upload,
  Info,
  AlertCircle,
  Loader2,
  Wand2,
} from "lucide-react";
import {
  parseSoc,
  YMPE_HISTORY,
  buildDefaultSurvivorInputs,
  buildYmpeMaxEarnings,
  type EarningsRecord,
  type DropoutPeriod,
  type ScenarioInputs,
  type SurvivorInputs,
} from "@/cpp";
import { extractPdfText } from "@/cpp/pdfText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface InputsPanelProps {
  inputs: ScenarioInputs;
  onChange: (next: ScenarioInputs) => void;
}

const PROVINCES = [
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PRESET_AGES = [60, 62, 65, 67, 70];

function patch<T>(current: T, partial: Partial<T>): T {
  return { ...current, ...partial };
}

export function InputsPanel({ inputs, onChange }: InputsPanelProps) {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto gap-1 p-1">
          <TabsTrigger value="personal" className="text-xs sm:text-sm py-1.5">Person</TabsTrigger>
          <TabsTrigger value="earnings" className="text-xs sm:text-sm py-1.5">Earnings</TabsTrigger>
          <TabsTrigger value="dropouts" className="text-xs sm:text-sm py-1.5">Dropouts</TabsTrigger>
          <TabsTrigger value="assumptions" className="text-xs sm:text-sm py-1.5">Assumptions</TabsTrigger>
          <TabsTrigger value="takeup" className="text-xs sm:text-sm py-1.5">Take-up</TabsTrigger>
          <TabsTrigger value="survivor" className="text-xs sm:text-sm py-1.5">Survivor</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <PersonForm inputs={inputs} onChange={onChange} />
        </TabsContent>
        <TabsContent value="earnings" className="mt-4">
          <EarningsForm inputs={inputs} onChange={onChange} />
        </TabsContent>
        <TabsContent value="dropouts" className="mt-4">
          <DropoutsForm inputs={inputs} onChange={onChange} />
        </TabsContent>
        <TabsContent value="assumptions" className="mt-4">
          <AssumptionsForm inputs={inputs} onChange={onChange} />
        </TabsContent>
        <TabsContent value="takeup" className="mt-4">
          <TakeUpForm inputs={inputs} onChange={onChange} />
        </TabsContent>
        <TabsContent value="survivor" className="mt-4">
          <SurvivorForm inputs={inputs} onChange={onChange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Person tab
// ---------------------------------------------------------------------------

function PersonForm({ inputs, onChange }: InputsPanelProps) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <h3 className="text-sm font-semibold tracking-tight">Personal information</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="birth-year">Birth year</Label>
          <Input
            id="birth-year"
            type="number"
            min={1900}
            max={2100}
            value={inputs.birthYear}
            onChange={(e) => {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw)) return;
              // Clamp to a sane range so a transient typo (e.g. "19650"
              // while typing "1965") can't blow up the projection loop in
              // calculateCpp by inflating birthYear + stopWorkAge to a
              // 6-digit year.
              const clamped = Math.min(2100, Math.max(1900, Math.trunc(raw)));
              onChange(patch(inputs, { birthYear: clamped }));
            }}
          />
        </div>
        <div>
          <Label htmlFor="birth-month">Birth month</Label>
          <Select
            value={String(inputs.birthMonth)}
            onValueChange={(v) => onChange(patch(inputs, { birthMonth: Number(v) }))}
          >
            <SelectTrigger id="birth-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="province">Province</Label>
          <Select
            value={inputs.province ?? "ON"}
            onValueChange={(v) => onChange(patch(inputs, { province: v }))}
          >
            <SelectTrigger id="province">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {inputs.province === "QC" ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Quebec residents contribute to the Quebec Pension Plan (QPP), not CPP. This calculator uses CPP rules; treat results as an
            approximation only.
          </div>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label htmlFor="self-employed" className="text-sm font-medium">
            Self-employed
          </Label>
          <p className="text-xs text-muted-foreground">
            Self-employed contributors pay both the employee and employer share of CPP
            contributions (2× the rate). This does not change calculated benefits — only the
            annual contribution amount shown in the results.
          </p>
        </div>
        <Switch
          id="self-employed"
          data-testid="switch-self-employed"
          checked={inputs.isSelfEmployed ?? false}
          onCheckedChange={(v) => onChange(patch(inputs, { isSelfEmployed: v }))}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Earnings tab
// ---------------------------------------------------------------------------

function EarningsForm({ inputs, onChange }: InputsPanelProps) {
  const [importOpen, setImportOpen] = useState(false);
  const sorted = useMemo(
    () => [...inputs.earningsHistory].sort((a, b) => a.year - b.year),
    [inputs.earningsHistory],
  );

  function setRecords(next: EarningsRecord[]) {
    onChange(patch(inputs, { earningsHistory: next }));
  }

  function updateYear(idx: number, year: number) {
    const next = [...sorted];
    next[idx] = { ...next[idx], year };
    setRecords(next);
  }
  function updateEarnings(idx: number, val: number) {
    const next = [...sorted];
    next[idx] = { ...next[idx], pensionableEarnings: val };
    setRecords(next);
  }
  function removeRow(idx: number) {
    const next = sorted.filter((_, i) => i !== idx);
    setRecords(next);
  }
  function addRow() {
    const lastYear = sorted.length > 0 ? sorted[sorted.length - 1].year : new Date().getFullYear() - 1;
    setRecords([...sorted, { year: lastYear + 1, pensionableEarnings: 0 }]);
  }

  function handleImport(records: EarningsRecord[]) {
    // Merge: prefer imported values for years present in import
    const byYear = new Map<number, number>();
    for (const r of sorted) byYear.set(r.year, r.pensionableEarnings);
    for (const r of records) byYear.set(r.year, r.pensionableEarnings);
    const merged = Array.from(byYear.entries())
      .map(([year, pensionableEarnings]) => ({ year, pensionableEarnings }))
      .sort((a, b) => a.year - b.year);
    setRecords(merged);
  }

  function fillWithYmpeMax() {
    // Fill in missing years (age 18 -> last published YMPE year) at the YMPE
    // maximum. Existing entries are preserved so planners don't lose any
    // already-entered or already-imported values.
    const maxRecords = buildYmpeMaxEarnings(inputs.birthYear);
    const byYear = new Map<number, number>();
    for (const r of maxRecords) byYear.set(r.year, r.pensionableEarnings);
    for (const r of sorted) byYear.set(r.year, r.pensionableEarnings);
    const merged = Array.from(byYear.entries())
      .map(([year, pensionableEarnings]) => ({ year, pensionableEarnings }))
      .sort((a, b) => a.year - b.year);
    setRecords(merged);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-5">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Pensionable earnings history</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter actual earnings reported on the Service Canada SOC. Future years are projected automatically using the assumptions tab.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={fillWithYmpeMax}>
                <Wand2 className="mr-2 h-4 w-4" /> Fill with YMPE max
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Pre-populate the table with the YMPE maximum from age 18 through the most recent published year. Existing rows are preserved — use this for a quick max-earner baseline, then override individual years (or import a Statement of Contributions).
            </TooltipContent>
          </Tooltip>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ClipboardPaste className="mr-2 h-4 w-4" /> Import SOC
              </Button>
            </DialogTrigger>
            <SocImportDialog
              onImport={(records) => {
                handleImport(records);
                setImportOpen(false);
              }}
              onCancel={() => setImportOpen(false)}
            />
          </Dialog>
          <Button size="sm" onClick={addRow}>
            <Plus className="mr-2 h-4 w-4" /> Add year
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          No earnings entered yet. Click <strong>Fill with YMPE max</strong> for a quick max-earner baseline, add years manually, or import from a Service Canada Statement of Contributions.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Year</th>
                <th className="px-3 py-2 text-right">Pensionable earnings</th>
                <th className="px-3 py-2 text-right">YMPE</th>
                <th className="px-3 py-2 text-right">vs YMPE</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => {
                const ympe = YMPE_HISTORY[row.year];
                const ratio = ympe ? row.pensionableEarnings / ympe : null;
                return (
                  <tr key={idx} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        value={row.year}
                        className="h-8 w-24"
                        onChange={(e) => updateYear(idx, Number(e.target.value) || row.year)}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Input
                        type="number"
                        value={row.pensionableEarnings}
                        className="h-8 w-32 text-right tabular-nums"
                        onChange={(e) => updateEarnings(idx, Number(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {ympe ? `$${ympe.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {ratio !== null ? (
                        <Badge variant={ratio >= 1 ? "default" : "secondary"} className="font-normal">
                          {(ratio * 100).toFixed(0)}%
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeRow(idx)} className="h-8 w-8">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SocImportDialog({
  onImport,
  onCancel,
}: {
  onImport: (records: EarningsRecord[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const parsed = useMemo(() => (text.trim() ? parseSoc(text) : null), [text]);

  async function handleFile(file: File) {
    setFileError(null);
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      setLoading(true);
      try {
        const extracted = await extractPdfText(file);
        setText(extracted);
        if (!extracted.trim()) {
          setFileError(
            "We could not read any text from that PDF. If it is a scanned image, please paste the table manually.",
          );
        }
      } catch (err) {
        setFileError(
          err instanceof Error ? err.message : "Failed to read PDF.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.onerror = () => setFileError("Failed to read file.");
    reader.readAsText(file);
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Import Statement of Contributions</DialogTitle>
        <DialogDescription>
          Upload the SOC PDF from your Service Canada account, paste the earnings table, or upload a CSV with two columns: <code>year, pensionable_earnings</code>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="soc-file"
            data-disabled={loading || undefined}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reading PDF…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Upload PDF or CSV
              </>
            )}
          </Label>
          <input
            id="soc-file"
            type="file"
            accept=".pdf,.csv,.txt,application/pdf,text/plain,text/csv"
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">…or paste below</span>
        </div>
        {fileError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {fileError}
          </div>
        )}

        <Textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"2018, 55900\n2019, 57400\n2020, 58700\n..."}
          className="font-mono text-xs"
        />

        {parsed ? (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span>
                <strong>{parsed.records.length}</strong> records detected
                {parsed.skippedLines > 0 ? (
                  <span className="text-muted-foreground"> · {parsed.skippedLines} lines skipped</span>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {parsed.records.length > 0
                  ? `${parsed.records[0].year}–${parsed.records[parsed.records.length - 1].year}`
                  : "—"}
              </span>
            </div>
            {parsed.warnings.length > 0 && (
              <div className="mt-2 text-amber-600">{parsed.warnings.join(" ")}</div>
            )}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!parsed || parsed.records.length === 0}
          onClick={() => parsed && onImport(parsed.records)}
        >
          Import {parsed?.records.length ?? 0} years
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Dropouts tab
// ---------------------------------------------------------------------------

function DropoutsForm({ inputs, onChange }: InputsPanelProps) {
  const dropouts = inputs.dropoutPeriods ?? [];

  function setDropouts(next: DropoutPeriod[]) {
    onChange(patch(inputs, { dropoutPeriods: next }));
  }

  function update(idx: number, partial: Partial<DropoutPeriod>) {
    const next = dropouts.map((d, i) => (i === idx ? { ...d, ...partial } : d));
    setDropouts(next);
  }

  function add(kind: DropoutPeriod["kind"]) {
    const thisYear = new Date().getFullYear();
    setDropouts([
      ...dropouts,
      {
        kind,
        startYear: thisYear - 5,
        startMonth: 1,
        endYear: thisYear - 4,
        endMonth: 12,
      },
    ]);
  }

  function remove(idx: number) {
    setDropouts(dropouts.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Special drop-outs</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            CRDO removes child-rearing months. Disability drop-out removes months on CPP-D. The general 17% drop-out is always applied automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => add("crdo")}>
            <Plus className="mr-2 h-4 w-4" /> CRDO
          </Button>
          <Button size="sm" variant="outline" onClick={() => add("disability")}>
            <Plus className="mr-2 h-4 w-4" /> Disability
          </Button>
        </div>
      </div>

      {dropouts.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No special drop-out periods.
        </div>
      ) : (
        <div className="space-y-3">
          {dropouts.map((d, idx) => (
            <div key={idx} className="grid grid-cols-1 items-end gap-3 rounded-md border bg-background p-3 md:grid-cols-12">
              <div className="md:col-span-2">
                <Label className="text-xs">Kind</Label>
                <Badge variant={d.kind === "crdo" ? "default" : "secondary"} className="mt-1 capitalize">
                  {d.kind === "crdo" ? "CRDO" : "Disability"}
                </Badge>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Start year</Label>
                <Input
                  type="number"
                  value={d.startYear}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    const n = Number(v);
                    if (Number.isFinite(n)) update(idx, { startYear: Math.trunc(n) });
                  }}
                  className="h-8"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Start month</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={d.startMonth}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    const n = Number(v);
                    if (Number.isFinite(n)) update(idx, { startMonth: Math.min(12, Math.max(1, Math.trunc(n))) });
                  }}
                  className="h-8"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">End year</Label>
                <Input
                  type="number"
                  value={d.endYear}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    const n = Number(v);
                    if (Number.isFinite(n)) update(idx, { endYear: Math.trunc(n) });
                  }}
                  className="h-8"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">End month</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={d.endMonth}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    const n = Number(v);
                    if (Number.isFinite(n)) update(idx, { endMonth: Math.min(12, Math.max(1, Math.trunc(n))) });
                  }}
                  className="h-8"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => remove(idx)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assumptions tab
// ---------------------------------------------------------------------------

function PercentInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <Label className="text-sm">{label}</Label>
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`More info about ${label}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="relative">
        <Input
          type="number"
          step={0.1}
          value={(value * 100).toFixed(2)}
          onChange={(e) => onChange((Number(e.target.value) || 0) / 100)}
          className="pr-8 tabular-nums"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function AssumptionsForm({ inputs, onChange }: InputsPanelProps) {
  const a = inputs.assumptions;
  function setA(partial: Partial<typeof a>) {
    onChange(patch(inputs, { assumptions: { ...a, ...partial } }));
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <h3 className="text-sm font-semibold tracking-tight">Forward-looking assumptions</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PercentInput
          label="YMPE growth rate"
          hint="Used to project the Year's Maximum Pensionable Earnings beyond published values, and to index past earnings to start-year dollars. Drives the AYMPE-indexing lift you see between earlier and later take-up ages on the base CPP and Tier 1 figures — set to 0% to compare ages purely on the actuarial factor (e.g. exactly 1.42× between 65 and 70)."
          value={a.ympeGrowthRate}
          onChange={(n) => setA({ ympeGrowthRate: n })}
        />
        <PercentInput
          label="YAMPE growth rate"
          hint="Annual growth rate of the Year's Additional Maximum Pensionable Earnings (Tier 2 enhancement, 2024+). Independent of YMPE growth — to compare take-up ages purely on the 0.7%/mo actuarial factor, set BOTH YMPE growth and YAMPE growth to 0%. Leaving YAMPE at a positive rate while YMPE is 0% will lift the Tier 2 component above the actuarial ratio between earlier and later take-up ages."
          value={a.yampeGrowthRate}
          onChange={(n) => setA({ yampeGrowthRate: n })}
        />
        <PercentInput
          label="Indexing rate (CPI)"
          hint="Annual indexing rate applied to CPP after benefits start. Historically tracks CPI."
          value={a.indexingRate}
          onChange={(n) => setA({ indexingRate: n })}
        />
        <PercentInput
          label="Future earnings growth"
          hint="Annual growth rate applied to projected future pensionable earnings."
          value={a.futureEarningsGrowthRate}
          onChange={(n) => setA({ futureEarningsGrowthRate: n })}
        />
        <div>
          <Label htmlFor="future-earnings">Assumed earnings (next year)</Label>
          <div className="relative">
            <Input
              id="future-earnings"
              type="number"
              value={a.assumedFutureEarnings}
              onChange={(e) => setA({ assumedFutureEarnings: Number(e.target.value) || 0 })}
              className="pl-6 tabular-nums"
            />
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          </div>
        </div>
        <div>
          <Label htmlFor="stop-work-age">Stop work age</Label>
          <Input
            id="stop-work-age"
            type="number"
            value={a.stopWorkAge}
            onChange={(e) => setA({ stopWorkAge: Number(e.target.value) || 65 })}
            className="tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Take-up tab (start ages + PRB)
// ---------------------------------------------------------------------------

function TakeUpForm({ inputs, onChange }: InputsPanelProps) {
  const [customAge, setCustomAge] = useState<string>("");
  const startAges = inputs.startAges;
  const prb = inputs.postRetirementBenefit ?? { continuesWorkingAfterStart: false };

  function toggleAge(age: number) {
    const set = new Set(startAges);
    if (set.has(age)) set.delete(age);
    else set.add(age);
    const next = Array.from(set).sort((a, b) => a - b);
    onChange(patch(inputs, { startAges: next.length > 0 ? next : [65] }));
  }

  function addCustom() {
    const n = Number(customAge);
    if (!Number.isFinite(n) || n < 60 || n > 70) return;
    if (startAges.includes(n)) return;
    const next = [...startAges, n].sort((a, b) => a - b);
    onChange(patch(inputs, { startAges: next }));
    setCustomAge("");
  }

  function setPrb(partial: Partial<typeof prb>) {
    onChange(patch(inputs, { postRetirementBenefit: { ...prb, ...partial } }));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-card p-5">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">CPP start ages</h3>
          <p className="mt-1 text-xs text-muted-foreground">Calculate the benefit at multiple start ages to compare.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESET_AGES.map((age) => {
            const on = startAges.includes(age);
            return (
              <button
                key={age}
                type="button"
                onClick={() => toggleAge(age)}
                className={
                  "rounded-full border px-3 py-1 text-sm tabular-nums transition-colors " +
                  (on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted")
                }
              >
                {age}
              </button>
            );
          })}
          {startAges
            .filter((a) => !PRESET_AGES.includes(a))
            .map((age) => (
              <button
                key={age}
                type="button"
                onClick={() => toggleAge(age)}
                className="rounded-full border border-primary bg-primary px-3 py-1 text-sm tabular-nums text-primary-foreground"
              >
                {age}
              </button>
            ))}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Input
            type="number"
            min={60}
            max={70}
            step={0.25}
            value={customAge}
            placeholder="Custom (60–70)"
            onChange={(e) => setCustomAge(e.target.value)}
            className="h-9 w-40 tabular-nums"
          />
          <Button size="sm" variant="outline" onClick={addCustom}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Post-Retirement Benefit (PRB)</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Working after CPP starts? Each year of continued contributions earns a small additional monthly benefit.
            </p>
          </div>
          <Switch
            checked={prb.continuesWorkingAfterStart}
            onCheckedChange={(v) => setPrb({ continuesWorkingAfterStart: v })}
          />
        </div>

        {prb.continuesWorkingAfterStart && (
          <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
            <div>
              <Label>Annual earnings after start</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={prb.annualEarningsAfterStart ?? 50000}
                  onChange={(e) => setPrb({ annualEarningsAfterStart: Number(e.target.value) || 0 })}
                  className="pl-6 tabular-nums"
                />
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              </div>
            </div>
            <div>
              <Label>Stop age</Label>
              <Input
                type="number"
                value={prb.stopAge ?? 70}
                onChange={(e) => setPrb({ stopAge: Number(e.target.value) || 70 })}
                className="tabular-nums"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Survivor tab
// ---------------------------------------------------------------------------

function SurvivorForm({ inputs, onChange }: InputsPanelProps) {
  const survivor: SurvivorInputs = inputs.survivor ?? buildDefaultSurvivorInputs(new Date().getFullYear());

  function set(partial: Partial<SurvivorInputs>) {
    onChange(patch(inputs, { survivor: { ...survivor, ...partial } }));
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Survivor benefits</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Treats this contributor as deceased and computes the surviving spouse&rsquo;s pension, plus the death benefit and any children&rsquo;s benefits.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="survivor-enabled" className="text-sm">Enable</Label>
          <Switch
            id="survivor-enabled"
            checked={survivor.enabled}
            onCheckedChange={(v) => set({ enabled: Boolean(v) })}
          />
        </div>
      </div>

      {survivor.enabled ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="survivor-start-year">Year benefits begin</Label>
              <Input
                id="survivor-start-year"
                type="number"
                value={survivor.startYear}
                onChange={(e) => set({ startYear: Number(e.target.value) || survivor.startYear })}
                className="tabular-nums"
              />
              <p className="mt-1 text-xs text-muted-foreground">Typically the year of death.</p>
            </div>
            <div>
              <Label htmlFor="survivor-age">Survivor&rsquo;s age at start</Label>
              <Input
                id="survivor-age"
                type="number"
                min={18}
                max={110}
                value={survivor.survivorAge}
                onChange={(e) => set({ survivorAge: Number(e.target.value) || survivor.survivorAge })}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
              <Switch
                id="survivor-children"
                checked={survivor.hasDependentChildren}
                onCheckedChange={(v) => set({ hasDependentChildren: Boolean(v) })}
              />
              <div className="-mt-0.5">
                <Label htmlFor="survivor-children" className="text-sm">Survivor has dependent children</Label>
                <p className="text-xs text-muted-foreground">Removes the under-45 reduction.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
              <Switch
                id="survivor-disabled"
                checked={survivor.survivorDisabled}
                onCheckedChange={(v) => set({ survivorDisabled: Boolean(v) })}
              />
              <div className="-mt-0.5">
                <Label htmlFor="survivor-disabled" className="text-sm">Survivor is disabled</Label>
                <p className="text-xs text-muted-foreground">Removes the under-45 reduction.</p>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="survivor-num-children">Eligible dependent children of the deceased</Label>
            <Input
              id="survivor-num-children"
              type="number"
              min={0}
              max={20}
              value={survivor.numEligibleChildren}
              onChange={(e) => set({ numEligibleChildren: Math.max(0, Number(e.target.value) || 0) })}
              className="tabular-nums max-w-[120px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Each receives the children&rsquo;s benefit (under 18, or 18&ndash;25 in school full-time).
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Survivor&rsquo;s own CPP retirement (for combined-cap analysis)</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="survivor-own-base">Own base + Tier 1 ($/mo)</Label>
                <div className="relative">
                  <Input
                    id="survivor-own-base"
                    type="number"
                    min={0}
                    step={0.01}
                    value={survivor.survivorOwnBaseTier1Monthly}
                    onChange={(e) => set({ survivorOwnBaseTier1Monthly: Math.max(0, Number(e.target.value) || 0) })}
                    className="pl-6 tabular-nums"
                  />
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                </div>
              </div>
              <div>
                <Label htmlFor="survivor-own-tier2">Own Tier 2 ($/mo)</Label>
                <div className="relative">
                  <Input
                    id="survivor-own-tier2"
                    type="number"
                    min={0}
                    step={0.01}
                    value={survivor.survivorOwnTier2Monthly}
                    onChange={(e) => set({ survivorOwnTier2Monthly: Math.max(0, Number(e.target.value) || 0) })}
                    className="pl-6 tabular-nums"
                  />
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave at zero if the survivor isn&rsquo;t collecting their own CPP yet. The combined-benefit cap only limits the base + Tier 1 portion.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              The deceased&rsquo;s &ldquo;calculated retirement pension at 65&rdquo; (used as the base for the 60% / 37.5% formula) is computed from the earnings history truncated to the year benefits begin.
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enable to model survivor pension, death benefit, and children&rsquo;s benefits payable on the contributor&rsquo;s death.
        </p>
      )}
    </div>
  );
}
