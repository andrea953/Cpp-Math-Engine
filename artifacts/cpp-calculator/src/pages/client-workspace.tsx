import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, FileText, GitCompare, Plus, RotateCw, Trash2, UserRound } from "lucide-react";
import {
  useGetScenario,
  useListScenarios,
  useCreateScenario,
  useDeleteScenario,
  useDuplicateScenario,
  getGetScenarioQueryKey,
  getListScenariosQueryKey,
  type Scenario,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { buildDefaultInputs } from "@/cpp";
import { AllClientsExitButton } from "@/components/client-guard";
import { emptyClientWorkspaceKey, scenariosForClient, setActiveAnchor } from "@/lib/client-session";

export default function ClientWorkspace({ params }: { params: { id?: string } }) {
  const anchorId = params.id ?? "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (anchorId) setActiveAnchor(anchorId);
  }, [anchorId]);

  const anchorQ = useGetScenario(anchorId, {
    query: { enabled: !!anchorId, queryKey: getGetScenarioQueryKey(anchorId), retry: false },
  });
  const listQ = useListScenarios();
  const createM = useCreateScenario();
  const deleteM = useDeleteScenario();
  const duplicateM = useDuplicateScenario();
  const busy = createM.isPending || deleteM.isPending || duplicateM.isPending;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Scenario | null>(null);

  const anchor = anchorQ.data;
  // Retain the client's identity only in the existing in-memory query cache
  // after the last scenario is deleted, so a replacement stays assigned.
  const emptyClient = queryClient.getQueryData<{ clientName: string }>(emptyClientWorkspaceKey(anchorId));
  const scenarios = useMemo(
    () => (anchor && listQ.data ? scenariosForClient(anchor, listQ.data) : []),
    [anchor, listQ.data],
  );
  const clientName = emptyClient?.clientName ?? anchor?.clientName?.trim() ?? "";

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
    if (id) queryClient.invalidateQueries({ queryKey: getGetScenarioQueryKey(id) });
  };

  const handleNew = () => {
    createM.mutate(
      { data: { title: "Untitled Scenario", clientName: clientName || undefined, inputs: buildDefaultInputs() } },
      {
        onSuccess: (created) => {
          setActiveAnchor(created.id);
          invalidate();
          setLocation(`/scenarios/${created.id}`);
        },
        onError: () => toast({ title: "Could not create scenario", variant: "destructive" }),
      },
    );
  };

  const handleDuplicate = (id: string) => {
    duplicateM.mutate(
      { id },
      {
        onSuccess: (copy) => {
          invalidate();
          toast({ title: "Scenario duplicated" });
          if (!clientName) {
            setActiveAnchor(copy.id);
            setLocation(`/scenarios/${copy.id}`);
          }
        },
        onError: () => toast({ title: "Could not duplicate", variant: "destructive" }),
      },
    );
  };

  const confirmDelete = () => {
    const target = toDelete;
    if (!target) return;
    deleteM.mutate(
      { id: target.id },
      {
        onSuccess: () => {
          setSelected((prev) => {
            const n = new Set(prev);
            n.delete(target.id);
            return n;
          });
          toast({ title: "Scenario deleted" });
          if (target.id === anchorId) {
            const next = scenarios.find((s) => s.id !== target.id);
            if (!next) {
              queryClient.setQueryData(emptyClientWorkspaceKey(anchorId), { clientName });
            }
            setActiveAnchor(next?.id ?? anchorId);
            queryClient.removeQueries({ queryKey: getGetScenarioQueryKey(target.id) });
            queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
            // Keep the workspace pinned on this client (or a safe empty state).
            setLocation(`/clients/${next ? next.id : target.id}`, { replace: true });
          } else invalidate(target.id);
          setToDelete(null);
        },
        onError: () => {
          toast({ title: "Could not delete", variant: "destructive" });
          setToDelete(null);
        },
      },
    );
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const selectedIds = scenarios.filter((s) => selected.has(s.id)).map((s) => s.id);

  // ----- states (never fall back to a global list) -----
  if (!emptyClient && (anchorQ.isLoading || (anchor && listQ.isLoading))) {
    return (
      <div className="container mx-auto space-y-3 p-4 sm:p-6" aria-busy="true" data-testid="status-workspace-loading">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/70" />
        ))}
      </div>
    );
  }

  const notFound = anchorQ.isError && (anchorQ.error as { status?: number } | null)?.status === 404;
  if (emptyClient || (!anchor && (notFound || !anchorQ.isError))) {
    return (
      <div className="container mx-auto p-4 sm:p-6">
        <Card className="mx-auto max-w-lg border-dashed p-8 text-center" data-testid="panel-workspace-empty">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold">No scenarios here</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {clientName ? `${clientName} has no saved scenarios. ` : "This workspace has no available saved scenarios. "}
            Other clients stay hidden.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={handleNew} disabled={busy} data-testid="button-workspace-empty-new">
              <Plus className="mr-2 h-4 w-4" /> Start a new scenario
            </Button>
            <AllClientsExitButton />
          </div>
        </Card>
      </div>
    );
  }

  if (anchorQ.isError || listQ.isError || !anchor) {
    return (
      <div className="container mx-auto p-4 sm:p-6">
        <Card className="mx-auto max-w-lg p-8 text-center" role="alert" data-testid="panel-workspace-error">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Could not load this client</h1>
          <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => {
              anchorQ.refetch();
              listQ.refetch();
            }}
            data-testid="button-workspace-retry"
          >
            <RotateCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-5 p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-2xl border bg-white/80 p-5 shadow-sm sm:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[hsl(var(--chart-3)/0.18)]"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <UserRound className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Client workspace</p>
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl" data-testid="text-client-name">
                {clientName || "Unassigned scenario"}
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="text-scenario-count">
                {scenarios.length} {scenarios.length === 1 ? "scenario" : "scenarios"}
                {!clientName && " · add a client name in the editor to group more scenarios here"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy || selectedIds.length < 2}
              onClick={() => setLocation(`/compare?ids=${selectedIds.slice(0, 4).join(",")}`)}
              data-testid="button-workspace-compare"
            >
              <GitCompare className="mr-2 h-4 w-4" /> Compare{selectedIds.length ? ` (${selectedIds.length})` : ""}
            </Button>
            <Button onClick={handleNew} disabled={busy} data-testid="button-workspace-new">
              <Plus className="mr-2 h-4 w-4" /> {createM.isPending ? "Creating…" : "New scenario"}
            </Button>
          </div>
        </div>
      </section>

      <p className="text-xs text-muted-foreground" id="compare-hint">
        Tick two to four scenarios to compare them side by side.
      </p>

      <Card className="divide-y overflow-hidden py-0" data-testid="list-client-scenarios">
        {scenarios.map((s) => (
          <div key={s.id} className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-5" data-testid={`row-scenario-${s.id}`}>
            <Checkbox
              checked={selected.has(s.id)}
              disabled={busy || (!selected.has(s.id) && selectedIds.length >= 4)}
              onCheckedChange={(c) => toggle(s.id, c === true)}
              aria-label={`Select ${s.title} for comparison`}
              aria-describedby="compare-hint"
              data-testid={`checkbox-compare-${s.id}`}
            />
            <button
              type="button"
              onClick={() => setLocation(`/scenarios/${s.id}`)}
              disabled={busy}
              className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`button-open-scenario-${s.id}`}
            >
              <div className="truncate font-medium hover:text-primary">{s.title}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>Born {s.inputs.birthYear}</span>
                <span>Updated {format(new Date(s.updatedAt), "MMM d, yyyy")}</span>
                {s.shareToken && <span className="text-primary">Shared</span>}
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={() => handleDuplicate(s.id)}
              aria-label={`Duplicate ${s.title}`}
              data-testid={`button-duplicate-${s.id}`}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              className="text-destructive hover:text-destructive"
              onClick={() => setToDelete(s)}
              aria-label={`Delete ${s.title}`}
              data-testid={`button-delete-${s.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !deleteM.isPending && setToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-scenario">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.title}" will be permanently removed. You will stay in this client workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteM.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteM.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
