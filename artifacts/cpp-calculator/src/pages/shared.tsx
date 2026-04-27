import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Lock, Printer } from "lucide-react";
import {
  useGetSharedScenario,
  getGetSharedScenarioQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResultsPanel } from "@/components/editor/results-panel";
import { PrintScenario } from "@/components/editor/print-scenario";
import type { ScenarioInputs } from "@/cpp";
import logoUrl from "@assets/WhatsApp_Image_2021-03-10_at_11.22.35_AM_1777058431212.jpeg";

interface SharedPageProps {
  params: { token?: string };
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SharedScenarioPage({ params }: SharedPageProps) {
  const token = params?.token ?? "";

  const { data, isLoading, error } = useGetSharedScenario(token, {
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetSharedScenarioQueryKey(token),
    },
  });

  const inputs = useMemo<ScenarioInputs | null>(() => {
    if (!data) return null;
    return data.inputs as unknown as ScenarioInputs;
  }, [data]);

  // Debounce for chart heaviness when first loaded — also gives a smoother feel
  const debounced = useDebouncedValue(inputs, 50);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-br from-[hsl(215_85%_97%)] via-[hsl(248_70%_98%)] to-[hsl(28_90%_97%)] print:min-h-0 print:bg-none print:bg-white">
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 print:hidden">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-foreground">
            <img src={logoUrl} alt="Modern CENTS" className="h-8 w-8 rounded-md object-cover" />
            <span className="tracking-tight">Modern CENTS</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Read-only client view
            </span>
            {!isLoading && !error && data ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                title="Print client-ready scenario"
                data-testid="button-print-scenario"
              >
                <Printer className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 print:hidden">
        <div className="container mx-auto p-4 lg:p-6">
          {isLoading && (
            <div className="space-y-3">
              <div className="h-8 w-64 animate-pulse rounded bg-muted" />
              <div className="h-96 animate-pulse rounded bg-muted" />
            </div>
          )}

          {!isLoading && error && (
            <Card className="mx-auto max-w-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  This link is no longer available
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  The shared scenario you're trying to view has been revoked or
                  the link is incorrect. Please contact the planner who shared it
                  with you to request a new link.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/">Return home</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && data && debounced && (
            <>
              <div className="mb-5">
                <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Last updated{" "}
                  {new Date(data.sharedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  . This is a read-only summary prepared by your planner.
                </p>
                {data.notes && (
                  <p className="mt-3 max-w-3xl rounded-lg border border-border/70 bg-white/60 p-3 text-sm text-foreground/80">
                    {data.notes}
                  </p>
                )}
              </div>
              <ResultsPanel inputs={debounced} scenarioTitle={data.title} />
              <p className="mt-8 text-xs text-muted-foreground text-center max-w-3xl mx-auto">
                Estimates only. Modern CENTS calculations are based on publicly
                available CPP rules and the inputs entered by your planner. Final
                amounts are determined by Service Canada and may differ.
              </p>
            </>
          )}
        </div>
      </main>

      {!isLoading && !error && data && debounced ? (
        <div className="print-scenario hidden print:block">
          <PrintScenario inputs={debounced} scenarioTitle={data.title} />
        </div>
      ) : null}
    </div>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
