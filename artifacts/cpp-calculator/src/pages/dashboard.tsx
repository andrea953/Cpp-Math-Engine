import { useListScenarios, useCreateScenario, useDeleteScenario, useDuplicateScenario } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plus, MoreVertical, Copy, Trash2, Calendar, Users, Calculator, GitCompare, Search, X } from "lucide-react";
import { buildDefaultInputs } from "@/cpp";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getListScenariosQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { filterScenarios } from "./dashboard-search";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: scenarios = [], isLoading } = useListScenarios();
  const createScenario = useCreateScenario();
  const deleteScenario = useDeleteScenario();
  const duplicateScenario = useDuplicateScenario();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const filteredScenarios = filterScenarios(scenarios, searchQuery);

  const handleCreate = () => {
    createScenario.mutate({
      data: {
        title: "Untitled Scenario",
        inputs: buildDefaultInputs(),
      }
    }, {
      onSuccess: (scenario) => {
        queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
        setLocation(`/scenarios/${scenario.id}`);
      }
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm("Are you sure you want to delete this scenario?")) {
      deleteScenario.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
        }
      });
    }
  };

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    duplicateScenario.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
      }
    });
  };

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  // Group scenarios by client so one client (e.g. "Lindsay B") can hold
  // several scenarios — different stop-work ages, start ages, etc.
  const groups = (() => {
    const map = new Map<string, typeof scenarios>();
    for (const s of filteredScenarios) {
      const key = s.clientName?.trim() || "";
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    const entries = [...map.entries()].map(([client, list]) => ({
      client,
      list: [...list].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      ),
    }));
    entries.sort((a, b) => {
      if (!a.client) return 1; // ungrouped scenarios sink to the bottom
      if (!b.client) return -1;
      return a.client.localeCompare(b.client, undefined, { sensitivity: "base" });
    });
    return entries;
  })();

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Scenarios</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">Manage client CPP analyses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {selectedIds.size >= 2 && (
            <Button
              variant="secondary"
              size="sm"
              className="sm:h-10 sm:px-4 sm:text-sm"
              onClick={() => setLocation(`/compare?ids=${Array.from(selectedIds).join(",")}`)}
            >
              <GitCompare className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Compare Selected ({selectedIds.size})</span>
              <span className="sm:hidden">Compare ({selectedIds.size})</span>
            </Button>
          )}
          <Button onClick={handleCreate} size="sm" className="sm:h-10 sm:px-4 sm:text-sm">
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">New Scenario</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {!isLoading && scenarios.length > 0 && (
        <div className="relative max-w-xl">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search clients and scenarios"
            placeholder="Search by client, scenario, or birth year"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9 pr-10"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse h-14" />
          ))}
        </div>
      ) : scenarios.length === 0 ? (
        <Card className="flex flex-col items-center justify-center h-64 text-center border-dashed">
          <CardContent className="pt-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <Calculator className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-lg">No scenarios yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-2 mb-4">
              Create your first scenario to start analyzing CPP benefits for a client.
            </p>
            <Button onClick={handleCreate}>Create Scenario</Button>
          </CardContent>
        </Card>
      ) : filteredScenarios.length === 0 ? (
        <Card className="flex flex-col items-center justify-center border-dashed px-6 py-12 text-center">
          <CardContent className="p-0">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Search className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">No matching clients or scenarios</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another name, scenario title, or birth year.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearchQuery("")}>
              Clear search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {searchQuery.trim() && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Showing {filteredScenarios.length} of {scenarios.length} scenarios
            </p>
          )}
          {groups.map(({ client, list }) => (
            <div key={client || "__ungrouped__"} className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold truncate" data-testid={`client-group-${client || "none"}`}>
                    {client || "No client assigned"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {list.length} {list.length === 1 ? "scenario" : "scenarios"}
                  </span>
                </div>
                {client ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setLocation(`/scenarios/new?client=${encodeURIComponent(client)}`)}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add scenario
                  </Button>
                ) : null}
              </div>
              <Card className="divide-y overflow-hidden py-0">
                {list.map(scenario => (
            <Link key={scenario.id} href={`/scenarios/${scenario.id}`}>
              <div
                className="flex items-center gap-3 px-3 py-3 sm:px-4 hover:bg-muted/50 transition-colors cursor-pointer"
                data-testid={`row-scenario-${scenario.id}`}
              >
                <div onClick={e => e.stopPropagation()} className="shrink-0">
                  <Checkbox
                    checked={selectedIds.has(scenario.id)}
                    onCheckedChange={(checked) => toggleSelect(scenario.id, checked as boolean)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{scenario.title}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden mt-0.5">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> Born {scenario.inputs.birthYear}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {format(new Date(scenario.updatedAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground w-28 shrink-0">
                  <Users className="h-4 w-4" /> Born {scenario.inputs.birthYear}
                </div>
                <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground w-44 shrink-0">
                  <Calendar className="h-4 w-4" /> Updated {format(new Date(scenario.updatedAt), "MMM d, yyyy")}
                </div>
                <div onClick={e => e.stopPropagation()} className="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => handleDuplicate(scenario.id, e)}>
                        <Copy className="mr-2 h-4 w-4" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => handleDelete(scenario.id, e)} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Link>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

