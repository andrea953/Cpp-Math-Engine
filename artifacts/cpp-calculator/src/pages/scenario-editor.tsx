import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronDown, Calculator, Columns2, Copy, Printer, Save, Share2, Trash2, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetScenario,
  useUpdateScenario,
  useCreateScenario,
  useDeleteScenario,
  useDuplicateScenario,
  useListScenarios,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { emptyClientWorkspaceKey, scenariosForClient, setActiveAnchor, setEditorDirty, useActiveAnchor } from "@/lib/client-session";

interface ScenarioEditorProps {
  params: { id?: string };
}

export default function ScenarioEditor({ params }: ScenarioEditorProps) {
  const id = params?.id;
  const isNew = !id;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: scenario, isLoading, isError, refetch } = useGetScenario(id ?? "", {
    query: { enabled: !!id, queryKey: getGetScenarioQueryKey(id ?? "") },
  });

  const [title, setTitle] = useState("Untitled Scenario");
  const [clientName, setClientName] = useState(() => {
    // Allow the dashboard to prefill the client when adding another scenario
    // for an existing client (e.g. /scenarios/new?client=Lindsay%20B).
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("client") ?? "";
  });
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

  // Opening a scenario (including old deep links) pins this tab to its client.
  useEffect(() => {
    if (id) setActiveAnchor(id);
  }, [id]);
  const anchor = useActiveAnchor();
  const workspaceHref = anchor ? `/clients/${anchor}` : id ? `/clients/${id}` : "/scenarios";
  const { data: allScenarios } = useListScenarios();
  const siblings = useMemo(
    () => (scenario && allScenarios ? scenariosForClient(scenario, allScenarios) : []),
    [scenario, allScenarios],
  );

  // Initialize from server once per scenario id; later refetches never clobber edits.
  const initializedFor = useRef<string | null>(null);
  useEffect(() => {
    if (scenario && scenario.id === id && initializedFor.current !== id) {
      initializedFor.current = id;
      setTitle(scenario.title);
      setClientName(scenario.clientName ?? "");
      setInputs(scenario.inputs as unknown as ScenarioInputs);
      setDirty(false);
    }
  }, [scenario, id]);

  useEffect(() => {
    setEditorDirty(dirty);
    return () => setEditorDirty(false);
  }, [dirty]);

  function navigateSafely(to: string) {
    if (dirty && !window.confirm("Discard unsaved changes to this scenario?")) return;
    setEditorDirty(false);
    setLocation(to);
  }

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
  function setClientNameAndDirty(next: string) {
    setClientName(next);
    setDirty(true);
  }

  function handleSave() {
    if (isNew) {
      createMutation.mutate(
        { data: { title, clientName: clientName.trim() || undefined, inputs } },
        {
          onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
            toast({ title: "Scenario created" });
            setDirty(false);
            setEditorDirty(false);
            setActiveAnchor(created.id);
            setLocation(`/scenarios/${created.id}`);
          },
          onError: () => toast({ title: "Could not save", variant: "destructive" }),
        },
      );
    } else if (id) {
      updateMutation.mutate(
        { id, data: { title, clientName: clientName.trim() || undefined, inputs } },
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
          queryClient.removeQueries({ queryKey: getGetScenarioQueryKey(id) });
          setDirty(false);
          setEditorDirty(false);
          const next = siblings.find((s) => s.id !== id);
          if (!next) {
            queryClient.setQueryData(emptyClientWorkspaceKey(id), {
              clientName: scenario?.clientName?.trim() ?? "",
            });
          }
          if (anchor === id) setActiveAnchor(next ? next.id : id);
          setLocation(anchor === id && next ? `/clients/${next.id}` : workspaceHref);
        },
        onError: () => toast({ title: "Could not delete", variant: "destructive" }),
      },
    );
  }

  function handleDuplicate() {
    if (!id) return;
    if (dirty && !window.confirm("The copy is made from the last saved version. Discard unsaved changes and open the copy?")) return;
    duplicateMutation.mutate(
      { id },
      {
        onSuccess: (copy) => {
          queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
          toast({ title: "Duplicated" });
          setEditorDirty(false);
          setLocation(`/scenarios/${copy.id}`);
        },
        onError: () => toast({ title: "Could not duplicate", variant: "destructive" }),
      },
    );
  }

  const saving = updateMutation.isPending || createMutation.isPending;
  const busy = saving || deleteMutation.isPending || duplicateMutation.isPending;

  if (id && (isLoading || (scenario && initializedFor.current !== id))) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-3">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-96 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (id && (isError || !scenario)) {
    return (
      <div className="container mx-auto space-y-4 p-6" role="alert">
        <h1 className="text-xl font-semibold">Could not load this scenario</h1>
        <p className="text-sm text-muted-foreground">
          It may have been removed, or the connection was interrupted. Other clients remain hidden.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-editor-retry">Retry</Button>
          <Button onClick={() => navigateSafely(workspaceHref)} data-testid="button-error-workspace">
            Return to client workspace
          </Button>
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
            onClick={() => navigateSafely(workspaceHref)}
            title="Back to client workspace"
            aria-label="Back to client workspace"
            data-testid="button-back-workspace"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <Input
              value={clientName}
              onChange={(e) => setClientNameAndDirty(e.target.value)}
              className="h-9 w-full min-w-0 sm:w-44 border-transparent text-sm font-medium focus-visible:border-input"
              placeholder="Client name"
              aria-label="Client name"
              data-testid="input-client-name"
            />
            <Input
              value={title}
              onChange={(e) => setTitleAndDirty(e.target.value)}
              className="h-9 w-full min-w-0 sm:w-72 border-transparent text-base sm:text-lg font-semibold tracking-tight focus-visible:border-input"
              placeholder="Scenario title"
              aria-label="Scenario title"
              data-testid="input-scenario-title"
            />
          </div>
          {!isNew && siblings.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0" data-testid="button-switch-scenario" aria-label="Switch to another scenario for this client">
                  <span className="hidden md:inline">Scenarios ({siblings.length})</span>
                  <span className="md:hidden">{siblings.length}</span>
                  <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
                <DropdownMenuLabel>This client</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {siblings.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    disabled={s.id === id}
                    onSelect={() => navigateSafely(`/scenarios/${s.id}`)}
                    data-testid={`menu-switch-scenario-${s.id}`}
                  >
                    <span className="truncate">{s.title}{s.id === id ? " (current)" : ""}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigateSafely(workspaceHref)} data-testid="menu-open-workspace">
                  Open client workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
                disabled={busy}
                title="Duplicate"
                data-testid="button-duplicate-scenario"
              >
                <Copy className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Duplicate</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={busy}
                data-testid="button-delete-scenario"
                className="text-destructive hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </>
          )}
          <Button size="sm" onClick={handleSave} disabled={busy || (!isNew && !dirty)} data-testid="button-save-scenario">
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
