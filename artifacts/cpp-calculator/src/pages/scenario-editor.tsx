import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Calculator, Columns2, Copy, Printer, Save, Share2, Trash2, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetScenario,
  useUpdateScenario,
  useCreateScenario,
  useDeleteScenario,
  useDuplicateScenario,
  getListScenariosQueryKey,
  getGetScenarioQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { buildDefaultInputs, type ScenarioInputs } from "@/cpp";
import { InputsPanel } from "@/components/editor/inputs-panel";
import { ResultsPanel } from "@/components/editor/results-panel";
import { ShareDialog } from "@/components/editor/share-dialog";
import { PrintScenario } from "@/components/editor/print-scenario";
import { printWithTitle } from "@/lib/print";

interface ScenarioEditorProps {
  params: { id?: string };
}

export default function ScenarioEditor({ params }: ScenarioEditorProps) {
  const id = params?.id;
  const isNew = !id;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: scenario, isLoading } = useGetScenario(id ?? "", {
    query: { enabled: !!id, queryKey: getGetScenarioQueryKey(id ?? "") },
  });

  const [title, setTitle] = useState("Untitled Scenario");
  const [inputs, setInputs] = useState<ScenarioInputs>(() => buildDefaultInputs());
  const [dirty, setDirty] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Split-pane focus mode. "both" = side-by-side (default on wide screens),
  // "person" = inputs only, "calc" = results only. Persists across the
  // session so a planner who works in focus mode stays there.
  const [paneMode, setPaneMode] = useState<"both" | "person" | "calc">(() => {
    if (typeof window === "undefined") return "both";
    const stored = window.localStorage.getItem("cpp:editor-pane-mode");
    return stored === "person" || stored === "calc" ? stored : "both";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("cpp:editor-pane-mode", paneMode);
  }, [paneMode]);

  useEffect(() => {
    if (scenario) {
      setTitle(scenario.title);
      setInputs(scenario.inputs as unknown as ScenarioInputs);
      setDirty(false);
    }
  }, [scenario]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const updateMutation = useUpdateScenario();
  const createMutation = useCreateScenario();
  const deleteMutation = useDeleteScenario();
  const duplicateMutation = useDuplicateScenario();

  function setInputsAndDirty(next: ScenarioInputs) {
    setInputs(next);
    setDirty(true);
  }
  function setTitleAndDirty(next: string) {
    setTitle(next);
    setDirty(true);
  }

  function handleSave() {
    if (isNew) {
      createMutation.mutate(
        { data: { title, inputs } },
        {
          onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
            toast({ title: "Scenario created" });
            setLocation(`/scenarios/${created.id}`);
          },
          onError: () => toast({ title: "Could not save", variant: "destructive" }),
        },
      );
    } else if (id) {
      updateMutation.mutate(
        { id, data: { title, inputs } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetScenarioQueryKey(id) });
            toast({ title: "Saved" });
            setDirty(false);
          },
          onError: () => toast({ title: "Could not save", variant: "destructive" }),
        },
      );
    }
  }

  function handleDelete() {
    if (!id) return;
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
          toast({ title: "Scenario deleted" });
          setLocation("/scenarios");
        },
      },
    );
  }

  function handleDuplicate() {
    if (!id) return;
    duplicateMutation.mutate(
      { id },
      {
        onSuccess: (copy) => {
          queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
          toast({ title: "Duplicated" });
          setLocation(`/scenarios/${copy.id}`);
        },
      },
    );
  }

  const saving = updateMutation.isPending || createMutation.isPending;

  if (id && isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-3">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-96 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="container mx-auto p-3 sm:p-4 lg:p-6 print:hidden">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setLocation("/scenarios")}
            title="Back to scenarios"
            aria-label="Back to scenarios"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitleAndDirty(e.target.value)}
            className="h-9 w-full min-w-0 sm:w-72 border-transparent text-base sm:text-lg font-semibold tracking-tight focus-visible:border-input"
            placeholder="Scenario title"
          />
          {dirty && <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">Unsaved changes</span>}
        </div>
        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <div
            className="inline-flex rounded-md border bg-card p-0.5"
            role="group"
            aria-label="Pane view"
          >
            <PaneButton
              active={paneMode === "person"}
              onClick={() => setPaneMode("person")}
              label="Person only"
              testid="button-pane-person"
            >
              <User className="h-4 w-4" />
            </PaneButton>
            <PaneButton
              active={paneMode === "both"}
              onClick={() => setPaneMode("both")}
              label="Split view"
              testid="button-pane-both"
            >
              <Columns2 className="h-4 w-4" />
            </PaneButton>
            <PaneButton
              active={paneMode === "calc"}
              onClick={() => setPaneMode("calc")}
              label="Calculation only"
              testid="button-pane-calc"
            >
              <Calculator className="h-4 w-4" />
            </PaneButton>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => printWithTitle(title)}
            title="Print client-ready scenario"
            data-testid="button-print-scenario"
          >
            <Printer className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          {!isNew && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
                data-testid="button-share"
                title={scenario?.shareToken ? "Sharing" : "Share"}
              >
                <Share2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{scenario?.shareToken ? "Sharing" : "Share"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                disabled={duplicateMutation.isPending}
                title="Duplicate"
              >
                <Copy className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Duplicate</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="text-destructive hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || (!isNew && !dirty)}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </div>
        {dirty && <span className="sm:hidden text-xs text-muted-foreground">Unsaved changes</span>}
      </div>

      {!isNew && id && scenario && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          scenarioId={id}
          scenarioTitle={title}
          currentToken={scenario.shareToken ?? null}
        />
      )}

      <div
        className={
          paneMode === "both"
            ? "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
            : "grid grid-cols-1 gap-6"
        }
      >
        {paneMode !== "calc" && (
          <div>
            <InputsPanel inputs={inputs} onChange={setInputsAndDirty} />
          </div>
        )}
        {paneMode !== "person" && <ResultsWrapper inputs={inputs} title={title} />}
      </div>
    </div>

    <div className="print-scenario hidden print:block">
      <PrintScenario inputs={inputs} scenarioTitle={title} />
    </div>
    </>
  );
}

function PaneButton({
  active,
  onClick,
  label,
  testid,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-testid={testid}
      className={`inline-flex h-7 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground ${
        active ? "bg-primary text-primary-foreground hover:text-primary-foreground" : ""
      }`}
    >
      {children}
    </button>
  );
}

function ResultsWrapper({ inputs, title }: { inputs: ScenarioInputs; title: string }) {
  // Debounce inputs for heavy recalc
  const debounced = useDebouncedValue(inputs, 150);
  const stable = useMemo(() => debounced, [debounced]);
  return <ResultsPanel inputs={stable} scenarioTitle={title} />;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
