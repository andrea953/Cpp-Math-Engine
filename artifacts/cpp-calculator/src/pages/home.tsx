import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, TrendingUp, ShieldCheck } from "lucide-react";
import logoUrl from "@assets/WhatsApp_Image_2021-03-10_at_11.22.35_AM_1777058431212.jpeg";

export default function Home() {
  return (
    <div className="relative min-h-[100dvh] flex flex-col overflow-hidden bg-gradient-to-br from-[hsl(215_85%_96%)] via-[hsl(248_75%_97%)] to-[hsl(28_90%_96%)]">
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-[hsl(190_80%_85%)] opacity-40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-[hsl(28_90%_85%)] opacity-40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[hsl(248_75%_88%)] opacity-30 blur-3xl" />

      <header className="relative px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-semibold text-lg text-foreground">
          <img src={logoUrl} alt="Modern CENTS" className="h-9 w-9 rounded-md object-cover shadow-sm" />
          <span className="tracking-tight">Modern CENTS</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="max-w-3xl space-y-8">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-white/70 backdrop-blur px-3 py-1 text-xs font-semibold text-primary shadow-sm">
            Planner-Grade Accuracy
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
            Modern CPP analysis,
            <br />
            <span className="bg-gradient-to-r from-[hsl(215_85%_55%)] via-[hsl(248_75%_60%)] to-[hsl(335_78%_62%)] bg-clip-text text-transparent">
              defensible to the dollar.
            </span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Go beyond simple calculators. Modern CENTS provides an audit-ready breakdown of base, Tier 1, and Tier 2 enhancements. Trace every dollar back to the contributory record.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/sign-up">
              <Button size="lg" className="w-full sm:w-auto text-lg px-8 h-12 shadow-md">
                Start Calculating
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 text-left">
            <FeatureCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              tint="from-[hsl(215_85%_92%)] to-[hsl(190_75%_92%)]"
              title="Audit-Ready Breakdown"
              body="Every assumption visible, every dropout accounted for. Never guess how a number was calculated."
            />
            <FeatureCard
              icon={<TrendingUp className="h-5 w-5" />}
              tint="from-[hsl(248_75%_94%)] to-[hsl(335_78%_94%)]"
              title="Breakeven Analysis"
              body="Interactive charting across start ages helps clients visualize the lifetime impact of taking CPP early or late."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-5 w-5" />}
              tint="from-[hsl(28_90%_92%)] to-[hsl(335_78%_94%)]"
              title="SOC Import"
              body="Paste directly from a Service Canada Statement of Contributions to populate earnings history in seconds."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  tint,
  title,
  body,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white/70 backdrop-blur p-5 shadow-sm space-y-3">
      <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center text-primary`}>
        {icon}
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
    </div>
  );
}
