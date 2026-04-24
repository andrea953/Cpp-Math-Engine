import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, Save, Trash2 } from "lucide-react";
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
    <div className="container mx-auto p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/scenarios")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={title}
            onChange={(e) => setTitleAndDirty(e.target.value)}
            className="h-9 w-72 border-transparent text-lg font-semibold tracking-tight focus-visible:border-input"
            placeholder="Scenario title"
          />
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <>
              <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || (!isNew && !dirty)}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <InputsPanel inputs={inputs} onChange={setInputsAndDirty} />
        </div>
        <ResultsWrapper inputs={inputs} title={title} />
      </div>
    </div>
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
