import { ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScenarioInputs } from "@/cpp";
import {
  buildApplicationBlocks,
  CLOSING,
  INTRO,
} from "./application-checklist-content";

/**
 * Client-facing "what to do when you apply" guidance.
 *
 * Selection logic and copy live in `application-checklist-content.ts` (React-free
 * so it can be unit-tested); this module only renders it. On-screen and print
 * variants share the same blocks so the two outputs never drift.
 */

/** On-screen (read-only client view) variant. */
export function ApplicationChecklist({ inputs }: { inputs: ScenarioInputs }) {
  const blocks = buildApplicationBlocks(inputs);
  if (blocks.length === 0) return null;

  return (
    <Card
      className="mt-4 border-[hsl(var(--chart-3))]/40 bg-gradient-to-br from-card to-[hsl(var(--chart-3))]/5"
      data-testid="card-application-checklist"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5 text-[hsl(var(--chart-3))]" />
          What you&apos;ll need to do when you apply
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <p className="text-muted-foreground">{INTRO}</p>
        {blocks.map((block) => (
          <div key={block.heading} className="space-y-2">
            <h4 className="font-semibold text-foreground">{block.heading}</h4>
            <p className="text-muted-foreground">{block.intro}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-foreground/90">
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{CLOSING}</p>
      </CardContent>
    </Card>
  );
}

/** Print variant, styled to match the rest of the print handout. */
export function PrintApplicationChecklist({ inputs }: { inputs: ScenarioInputs }) {
  const blocks = buildApplicationBlocks(inputs);
  if (blocks.length === 0) return null;

  return (
    <section className="print-scenario-section">
      <h2>What you&apos;ll need to do when you apply</h2>
      <p className="print-scenario-note">{INTRO}</p>
      {blocks.map((block) => (
        <div key={block.heading} className="print-scenario-subblock">
          <h3>{block.heading}</h3>
          <p className="print-scenario-note">{block.intro}</p>
          <ul className="print-scenario-list">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="print-scenario-note">{CLOSING}</p>
    </section>
  );
}
