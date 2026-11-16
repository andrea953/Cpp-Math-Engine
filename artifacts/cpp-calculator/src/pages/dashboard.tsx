import { useListScenarios, useCreateScenario, useDeleteScenario, useDuplicateScenario } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plus, MoreVertical, Trash2, Users, Calculator, GitCompare, Search, X } from "lucide-react";
import { buildDefaultInputs } from "@/cpp";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getListScenariosQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { buildClientIndex, searchClientIndex } from "./dashboard-search";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: scenarios = [], isLoading } = useListScenarios();
  const createScenario = useCreateScenario();
  const deleteScenario = useDeleteScenario();
  const duplicateScenario = useDuplicateScenario();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const allClients = buildClientIndex(scenarios);
  const clients = searchClientIndex(allClients, searchQuery);

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

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this scenario?")) {
      deleteScenario.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
        }
      });
    }
  };

  const handleDuplicate = (id: string) => {
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
      ) : clients.length === 0 ? (
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
        <Card className="divide-y overflow-hidden py-0">
          {searchQuery.trim() && (
            <div className="px-4 py-2 text-sm text-muted-foreground" aria-live="polite">
              Showing {clients.length} of {allClients.length} clients
            </div>
          )}
          {clients.map(({ clientName, scenarios: clientScenarios, matchingScenarios }) => {
            const latestScenario = [...matchingScenarios].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
            )[0];
            const latestUpdatedAt = clientScenarios.reduce(
              (latest, scenario) => scenario.updatedAt > latest ? scenario.updatedAt : latest,
              clientScenarios[0].updatedAt,
            );
            const rowKey = clientName.toLocaleLowerCase() || "__unassigned__";

            return (
              <div
                key={rowKey}
                className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4"
                data-testid={`client-row-${rowKey}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {clientName || "No client assigned"}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {clientScenarios.length} {clientScenarios.length === 1 ? "scenario" : "scenarios"}
                      </span>
                      <span>Updated {format(new Date(latestUpdatedAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setLocation(`/clients/${latestScenario.id}`)}
                  data-testid={`button-open-client-${rowKey}`}
                >
                  Open
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={`Actions for ${clientName || "unassigned scenarios"}`}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
                    <DropdownMenuLabel>Scenarios</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {clientScenarios.map((scenario) => (
                      <DropdownMenuSub key={scenario.id}>
                        <DropdownMenuSubTrigger className="max-w-60 truncate">
                          {scenario.title}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onSelect={() => setLocation(`/clients/${scenario.id}`)}>
                            Open scenario
                          </DropdownMenuItem>
                          <DropdownMenuCheckboxItem
                            checked={selectedIds.has(scenario.id)}
                            onCheckedChange={(checked) => toggleSelect(scenario.id, checked === true)}
                          >
                            Select for comparison
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => handleDuplicate(scenario.id)}>
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleDelete(scenario.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
                    {clientName && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() =>
                            setLocation(`/scenarios/new?client=${encodeURIComponent(clientName)}`)
                          }
                        >
                          <Plus className="h-4 w-4" />
                          Add scenario for client
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

