import { useListScenarios, useCreateScenario, useDeleteScenario, useDuplicateScenario } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plus, MoreVertical, Copy, Trash2, Calendar, Users, Calculator, GitCompare } from "lucide-react";
import { buildDefaultInputs } from "@/cpp";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getListScenariosQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: scenarios = [], isLoading } = useListScenarios();
  const createScenario = useCreateScenario();
  const deleteScenario = useDeleteScenario();
  const duplicateScenario = useDuplicateScenario();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <Card key={i} className="animate-pulse h-32" />
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map(scenario => (
            <Link key={scenario.id} href={`/scenarios/${scenario.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer group relative">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div onClick={e => e.stopPropagation()} className="mt-1">
                        <Checkbox 
                          checked={selectedIds.has(scenario.id)} 
                          onCheckedChange={(checked) => toggleSelect(scenario.id, checked as boolean)}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-lg line-clamp-1">{scenario.title}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          Updated {format(new Date(scenario.updatedAt), "MMM d, yyyy")}
                        </CardDescription>
                      </div>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
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
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      Born {scenario.inputs.birthYear}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

