import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Calculator, CheckCircle2, TrendingUp, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-white">
      <header className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xl text-primary">
          <Calculator className="h-6 w-6" />
          <span>Plannerly CPP</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="max-w-3xl space-y-8">
          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground">
            Planner-Grade Accuracy
          </div>
          
          <h1 className="text-5xl font-extrabold tracking-tight text-primary sm:text-6xl">
            Defensible CPP analysis for professional advisors.
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Go beyond simple calculators. Plannerly provides an audit-ready breakdown of base, Tier 1, and Tier 2 enhancements. Trace every dollar back to the contributory record.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto text-lg px-8 h-12">
                Start Calculating
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-16 text-left">
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">Audit-Ready Breakdown</h3>
              <p className="text-muted-foreground text-sm">Every assumption visible, every dropout accounted for. Never guess how a number was calculated.</p>
            </div>
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">Breakeven Analysis</h3>
              <p className="text-muted-foreground text-sm">Interactive charting across start ages helps clients visualize the lifetime impact of taking CPP early or late.</p>
            </div>
            <div className="space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg">SOC Import</h3>
              <p className="text-muted-foreground text-sm">Paste directly from a Service Canada Statement of Contributions to populate earnings history in seconds.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
