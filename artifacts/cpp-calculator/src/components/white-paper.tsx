import { Children, useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "./ui/button";
import {
  BookOpen,
  Calculator,
  ChevronRight,
  ClipboardList,
  FileText,
  Layers,
  Lightbulb,
  Printer,
  ScrollText,
  ShieldCheck,
  Sigma,
  Target,
  Users,
} from "lucide-react";
import { whitePaperExamples as ex } from "@/cpp/whitePaperExamples";
import { formatMoney } from "@/cpp/format";
import { estimateWhitePaperPageCount } from "./whitePaperPrintEstimator";

const fmt0 = (n: number) => formatMoney(n, false);
const fmt2 = (n: number) => formatMoney(n, true);
const pct1 = (n: number) =>
  `${(n * 100).toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;

interface TocItem {
  id: string;
  label: string;
  part?: 1 | 2;
}

const TOC: TocItem[] = [
  { id: "wp-overview", label: "Overview", part: 1 },
  { id: "wp-problem", label: "The problem with public CPP calculators", part: 1 },
  { id: "wp-difference", label: "How the Modern Cents CPP Calculator is different", part: 1 },
  { id: "wp-audience", label: "Who benefits and typical use cases", part: 1 },
  { id: "wp-methodology", label: "Methodology overview", part: 2 },
  { id: "wp-contributory", label: "Contributory period, YMPE & YAMPE", part: 2 },
  { id: "wp-ampe", label: "AMPE and earnings indexing", part: 2 },
  { id: "wp-base", label: "Base CPP", part: 2 },
  { id: "wp-tier1", label: "Tier 1 enhancement (post-2018)", part: 2 },
  { id: "wp-tier2", label: "Tier 2 enhancement (post-2023)", part: 2 },
  { id: "wp-dropouts", label: "Drop-out provisions", part: 2 },
  { id: "wp-adjustments", label: "Early / late take-up adjustments", part: 2 },
  { id: "wp-percent-of-maximum", label: "Percent of the maximum CPP retirement pension", part: 2 },
  { id: "wp-prb", label: "Post-Retirement Benefit (PRB)", part: 2 },
  { id: "wp-survivor", label: "Survivor, children & death benefit", part: 2 },
  { id: "wp-soc", label: "SOC import", part: 2 },
];

function formatGeneratedDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function usePrintDate(): string {
  const [date, setDate] = useState<string>(() => formatGeneratedDate(new Date()));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const iso = formatGeneratedDate(new Date());
      setDate(iso);
      // Set a CSS custom property on :root so the @page @bottom-right margin
      // box can read it via `var(--print-date)`. The value is a CSS string
      // token, so it must include its own quotes.
      document.documentElement.style.setProperty(
        "--print-date",
        `"Generated ${iso} \u00B7 "`,
      );
    };
    update();
    window.addEventListener("beforeprint", update);
    return () => {
      window.removeEventListener("beforeprint", update);
    };
  }, []);
  return date;
}

/**
 * Chrome/Edge render `@page @top-left` / `@bottom-right` margin boxes for
 * running headers and "Page N of M" footers. Safari and Firefox ignore
 * those margin boxes entirely. To get the same printed output in those
 * browsers, this hook injects absolutely-positioned per-page header and
 * footer DOM elements on `beforeprint`, then removes them on `afterprint`.
 *
 * Because `position: absolute` elements appear on whichever printed page
 * contains their Y coordinate, placing one element at body Y = p * pageH
 * lands it on page p. Page count is estimated by measuring an offscreen
 * clone rendered at the print width and font size, with forced page
 * breaks at `.print-part-heading` accounted for.
 *
 * To stay in lockstep with Chrome's `@page @bottom-right` content
 * (`var(--print-date) "Page " counter(page) " of " counter(pages)`),
 * the injected footers compute a fresh `Generated YYYY-MM-DD \u00B7 `
 * prefix at print time using the same `formatGeneratedDate` helper that
 * `usePrintDate` uses for the Chrome path.
 *
 * Chrome remains on the existing `@page` margin-box rules and is not
 * touched by this hook (the listeners early-return for Chromium).
 */
function useCrossBrowserPrintMargins(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const ua = navigator.userAgent;
    const isFirefox = /Firefox\//.test(ua);
    const isSafari = /Safari\//.test(ua) && !/Chrom(e|ium)\//.test(ua);
    if (!isFirefox && !isSafari) return;

    const HEADER_TEXT = "Modern Cents CPP Calculator — Methodology";
    // Letter page geometry, in CSS pixels at 96 DPI:
    //   page outer:    11in   = 1056 px
    //   @page margin:  0.7in top + 0.8in bottom  (matches @media print rule)
    //   body content:  9.5in  = 912 px per printed page
    const PAGE_CONTENT_PX = 9.5 * 96;
    // Printable width inside @page margins (8.5in - 0.6in - 0.6in)
    const PRINT_WIDTH_PX = 7.3 * 96;

    let injected: HTMLElement[] = [];
    let active = false;

    function cleanup(): void {
      for (const node of injected) node.remove();
      injected = [];
      if (active) {
        document.body.classList.remove("cross-browser-print-active");
        active = false;
      }
    }

    function estimatePageCount(rootEl: HTMLElement): number {
      // Geometry constants live next to this hook so the snapshot guard
      // in `whitePaperPrintEstimator.test.ts` can see them; the actual
      // estimator logic is in `./whitePaperPrintEstimator` so the
      // cross-browser e2e test can call exactly the same function.
      return estimateWhitePaperPageCount(rootEl, {
        pageContentPx: PAGE_CONTENT_PX,
        printWidthPx: PRINT_WIDTH_PX,
      });
    }

    function injectMargins(totalPages: number, datePrefix: string): void {
      // Per-page footer (every page) and header (skip cover = page 1).
      // Absolute positioning relative to the document root: a div at
      // body Y = p * PAGE_CONTENT_PX sits at the bottom of page p's
      // content area, so it prints on page p.
      for (let p = 1; p <= totalPages; p++) {
        const footer = document.createElement("div");
        footer.className = "cross-browser-print-footer";
        footer.setAttribute("data-page", String(p));
        footer.textContent = `${datePrefix}Page ${p} of ${totalPages}`;
        Object.assign(footer.style, {
          position: "absolute",
          left: "0",
          right: "0",
          top: `${p * PAGE_CONTENT_PX - 18}px`,
          paddingRight: "0.6in",
          textAlign: "right",
          fontFamily: "Inter, sans-serif",
          fontSize: "9pt",
          color: "#555",
          background: "#fff",
          zIndex: "100",
        } as CSSStyleDeclaration);
        document.body.appendChild(footer);
        injected.push(footer);

        if (p > 1) {
          const header = document.createElement("div");
          header.className = "cross-browser-print-header";
          header.setAttribute("data-page", String(p));
          header.textContent = HEADER_TEXT;
          Object.assign(header.style, {
            position: "absolute",
            left: "0",
            right: "0",
            top: `${(p - 1) * PAGE_CONTENT_PX}px`,
            paddingLeft: "0.6in",
            textAlign: "left",
            fontFamily: "Inter, sans-serif",
            fontSize: "9pt",
            fontWeight: "500",
            // Brand-tinted running header to match Chrome's @page @top-left
            // color in src/index.css. Keep the page-number footer neutral
            // grey so the brand accent appears only at the top of the page.
            color: "#5a4dd0",
            background: "#fff",
            zIndex: "100",
          } as CSSStyleDeclaration);
          document.body.appendChild(header);
          injected.push(header);
        }
      }
    }

    function setup(): void {
      cleanup();
      const root = document.querySelector<HTMLElement>(".print-paper");
      if (!root) return;
      const totalPages = estimatePageCount(root);
      if (totalPages < 1) return;
      // Match Chrome's `--print-date` value: "Generated YYYY-MM-DD \u00B7 ".
      const datePrefix = `Generated ${formatGeneratedDate(new Date())} \u00B7 `;
      document.body.classList.add("cross-browser-print-active");
      active = true;
      injectMargins(totalPages, datePrefix);
    }

    window.addEventListener("beforeprint", setup);
    window.addEventListener("afterprint", cleanup);

    // Safari historically did not always fire `beforeprint` reliably;
    // a `matchMedia('print')` change listener is the standard fallback.
    const mq = window.matchMedia("print");
    const mqHandler = (e: MediaQueryListEvent | MediaQueryList): void => {
      if (e.matches) setup();
      else cleanup();
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", mqHandler as (e: MediaQueryListEvent) => void);
    } else if (typeof (mq as { addListener?: unknown }).addListener === "function") {
      (mq as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(
        mqHandler as (e: MediaQueryListEvent) => void,
      );
    }

    return () => {
      window.removeEventListener("beforeprint", setup);
      window.removeEventListener("afterprint", cleanup);
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener(
          "change",
          mqHandler as (e: MediaQueryListEvent) => void,
        );
      } else if (
        typeof (mq as { removeListener?: unknown }).removeListener === "function"
      ) {
        (
          mq as unknown as {
            removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }
        ).removeListener(mqHandler as (e: MediaQueryListEvent) => void);
      }
      cleanup();
    };
  }, []);
}

function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 1] },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-print-formula
      className="print-formula my-4 overflow-x-auto rounded-lg border border-border/60 bg-slate-50/80 px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-800 shadow-inner"
    >
      {children}
    </div>
  );
}

function Example({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="my-4 rounded-lg border-l-4 border-primary/40 bg-primary/5 px-4 py-3 text-sm text-foreground/90">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80">
        <Lightbulb className="h-3.5 w-3.5" />
        Worked example — {label ?? ex.profile.label}
      </div>
      <div className="space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

function ExampleLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[12.5px] text-slate-700">
      {children}
    </div>
  );
}

function InlineMath({ children }: { children: React.ReactNode }) {
  return (
    <span className="print-inline-math rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800">
      {children}
    </span>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  icon,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  icon?: React.ReactNode;
}) {
  return (
    <div id={id} className="print-section-heading scroll-mt-24 space-y-2">
      {eyebrow && (
        <div className="print-eyebrow text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
          {eyebrow}
        </div>
      )}
      <h3 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {icon && <span className="text-primary print:hidden">{icon}</span>}
        {title}
      </h3>
    </div>
  );
}

function PartHeading({
  id,
  number,
  title,
  blurb,
  icon,
}: {
  id: string;
  number: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
}) {
  return (
    <div id={id} className="print-part-heading scroll-mt-24">
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-white/90 to-[hsl(215_85%_97%)]/80 p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(215_85%_92%)] to-[hsl(248_75%_94%)] text-primary shadow-sm print:hidden">
            {icon}
          </div>
          <div className="print-eyebrow text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
            {number}
          </div>
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{title}</h2>
        <p className="max-w-3xl text-base text-muted-foreground sm:text-lg">{blurb}</p>
      </div>
    </div>
  );
}

/**
 * Sections collapse by default (chevron click expands them). When the user
 * prints the white paper we want every section open so the printed output
 * matches what it has always been. This hook saves each section's open
 * state on `beforeprint`, opens them all, and restores the previous state
 * on `afterprint`.
 *
 * MUST run before `useCrossBrowserPrintMargins` in the component body so
 * that this hook's `beforeprint` listener is registered first and fires
 * first — otherwise the cross-browser page-count estimator measures the
 * collapsed DOM and produces an incorrect "Page N of M" footer.
 *
 * Also subscribes to `matchMedia('print')` like the cross-browser print
 * margins hook, because Safari does not always fire `beforeprint` reliably.
 */
function useExpandSectionsForPrint(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let saved: Array<{ el: HTMLDetailsElement; wasOpen: boolean }> = [];
    const expand = () => {
      // Re-entrant safety: if a previous expand already saved state and
      // restore hasn't happened yet (overlapping events from Safari /
      // matchMedia + beforeprint), don't overwrite the original state.
      if (saved.length > 0) return;
      const nodes = document.querySelectorAll<HTMLDetailsElement>(
        "details.wp-section",
      );
      saved = Array.from(nodes).map((el) => ({ el, wasOpen: el.open }));
      saved.forEach(({ el }) => {
        el.open = true;
      });
    };
    const restore = () => {
      saved.forEach(({ el, wasOpen }) => {
        el.open = wasOpen;
      });
      saved = [];
    };

    window.addEventListener("beforeprint", expand);
    window.addEventListener("afterprint", restore);

    const mq = window.matchMedia("print");
    const mqHandler = (e: MediaQueryListEvent | MediaQueryList): void => {
      if (e.matches) expand();
      else restore();
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", mqHandler as (e: MediaQueryListEvent) => void);
    } else if (typeof (mq as { addListener?: unknown }).addListener === "function") {
      (mq as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(
        mqHandler as (e: MediaQueryListEvent) => void,
      );
    }

    return () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", restore);
      if (typeof mq.removeEventListener === "function") {
        mq.removeEventListener(
          "change",
          mqHandler as (e: MediaQueryListEvent) => void,
        );
      } else if (
        typeof (mq as { removeListener?: unknown }).removeListener === "function"
      ) {
        (
          mq as unknown as {
            removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }
        ).removeListener(mqHandler as (e: MediaQueryListEvent) => void);
      }
      restore();
    };
  }, []);
}

export function WhitePaper() {
  // Order matters: expand sections FIRST so the cross-browser margins
  // hook's page-count estimator measures the fully-expanded DOM.
  useExpandSectionsForPrint();
  useCrossBrowserPrintMargins();
  const activeId = useActiveSection(TOC.map((t) => t.id));
  const generatedOn = usePrintDate();

  const part1 = TOC.filter((t) => t.part === 1);
  const part2 = TOC.filter((t) => t.part === 2);

  return (
    <section className="print-paper relative border-t border-border/40 bg-gradient-to-b from-white/40 via-white/70 to-white/90 py-16 sm:py-24 print:border-0 print:bg-none print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 print:max-w-none print:px-0">
        <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-14 print:mb-8 print:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur print:hidden">
            <ScrollText className="h-3.5 w-3.5" />
            White Paper
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Inside the Modern Cents CPP Calculator
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            A reference document for financial advisors covering what the Modern Cents CPP
            Calculator is, how it differs from public CPP calculators, and the full math behind
            every dollar it produces.
          </p>
          <p
            className="mt-6 hidden text-sm font-semibold tracking-wide text-foreground/80 print:block"
            data-testid="text-prepared-on"
          >
            Prepared on {generatedOn}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[260px,1fr] lg:gap-14 print:!block print:gap-0">
          <aside className="lg:sticky lg:top-24 lg:self-start print:hidden">
            <nav
              aria-label="White paper sections"
              className="rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm backdrop-blur"
            >
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                Contents
              </div>
              <TocList title="Part 1 — Positioning" items={part1} activeId={activeId} />
              <div className="my-3 h-px bg-border/60" />
              <TocList title="Part 2 — Methodology" items={part2} activeId={activeId} />
            </nav>
          </aside>

          <article className="min-w-0 space-y-12">
            <PartHeading
              id="wp-part-1"
              number="Part 1"
              title="Product positioning"
              blurb="What the Modern Cents CPP Calculator is, who it's for, and why advisors need a planner-grade CPP tool."
              icon={<Target className="h-5 w-5" />}
            />

            <Section>
              <SectionHeading
                id="wp-overview"
                eyebrow="What it is"
                title="The Modern Cents CPP Calculator in one paragraph"
                icon={<FileText className="h-5 w-5" />}
              />
              <p>
                The Modern Cents CPP Calculator is a planner-grade Canada Pension Plan calculator
                built for financial advisors. It models a client's CPP retirement pension from
                their actual contributory
                record, computing base CPP, the 2019 first additional (Tier 1) enhancement, and the
                2024 second additional (Tier 2) enhancement; applies the general 17% drop-out, the
                Child Rearing Drop-Out (CRDO), and disability drop-out; runs the early/late take-up
                adjustment from age 60 to 70 with monthly precision; projects Post-Retirement
                Benefits (PRB) for clients still working; and models the survivor's pension,
                children's benefit, and $2,500 death benefit — including the combined-benefit cap.
                Every component is exposed as an auditable line item rather than a single headline
                number.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-problem"
                eyebrow="The problem"
                title="Why public CPP calculators fall short for advisors"
                icon={<ClipboardList className="h-5 w-5" />}
              />
              <p>
                Public CPP calculators were built to give Canadians a rough estimate of their
                retirement income. They generally:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>Output a single monthly number with no breakdown of base, Tier 1, or Tier 2.</li>
                <li>
                  Hide the contributory period, indexing, drop-outs, and adjustment factor — leaving
                  no audit trail to defend the result to a client.
                </li>
                <li>
                  Ignore or simplify the 2019 and 2024 enhancements, the Child Rearing Drop-Out, and
                  the disability drop-out.
                </li>
                <li>
                  Provide no way to model survivor's pension, the combined-benefit cap, or the
                  $2,500 death benefit alongside the contributor's own retirement.
                </li>
                <li>
                  Cannot compare scenarios (start at 60 vs 65 vs 70), show breakeven, or be shared
                  with a client as a documented analysis.
                </li>
              </ul>
              <p>
                For an advisor preparing a retirement plan, those gaps mean the CPP figure on a net
                worth statement can't be defended line by line — and that is exactly the figure
                clients ask the most questions about.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-difference"
                eyebrow="The difference"
                title="How the Modern Cents CPP Calculator is different"
                icon={<ShieldCheck className="h-5 w-5" />}
              />
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Audit-ready breakdown.</strong> Every result splits into base CPP, Tier 1
                  enhancement, and Tier 2 enhancement, with the contributory period, AMPE, drop-out
                  counts, accrual factors, and adjustment factor exposed as diagnostics.
                </li>
                <li>
                  <strong>Tiered enhancements modelled correctly.</strong> Tier 1 phases in from
                  2019 (15%) to 2023 (100%) of an 8⅓% replacement on YMPE-band earnings; Tier 2
                  applies a 33⅓% replacement on the YMPE→YAMPE band from 2024 onward.
                </li>
                <li>
                  <strong>Drop-outs handled explicitly.</strong> CRDO and disability periods are
                  removed from the contributory period before the general 17% drop-out is applied.
                </li>
                <li>
                  <strong>Survivor + PRB built in.</strong> Survivor's pension (with the
                  combined-benefit cap), children's benefit, $2,500 death benefit, and the
                  Post-Retirement Benefit for clients still working are first-class outputs.
                </li>
                <li>
                  <strong>Scenario comparison and breakeven.</strong> Run multiple start ages
                  side-by-side, see lifetime cumulative benefit projections, and compare scenarios
                  in a single view.
                </li>
                <li>
                  <strong>SOC import.</strong> Paste a Service Canada Statement of Contributions
                  directly to populate the earnings history without retyping years of data.
                </li>
                <li>
                  <strong>Shareable client links.</strong> Issue a public read-only link so a client
                  can review the analysis without needing an account.
                </li>
              </ul>
            </Section>

            <Section>
              <SectionHeading
                id="wp-audience"
                eyebrow="Who it's for"
                title="Audience and typical use cases"
                icon={<Users className="h-5 w-5" />}
              />
              <p>
                The Modern Cents CPP Calculator is built for financial planners, advisors, and retirement specialists
                who need to defend a CPP number to a client, a compliance reviewer, or an estate
                lawyer. Typical use cases include:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>
                  Producing a planner-grade CPP figure for a retirement projection or net worth
                  statement.
                </li>
                <li>
                  Comparing a client's after-tax outcomes when starting CPP at 60, 65, and 70 and
                  walking through the breakeven age.
                </li>
                <li>
                  Modelling the impact of CRDO eligibility for a parent who took years out of the
                  workforce.
                </li>
                <li>
                  Estimating a survivor's pension for an estate plan, including the combined-benefit
                  cap that clients almost never anticipate.
                </li>
                <li>
                  Showing a client how continuing to work past their CPP start date generates
                  Post-Retirement Benefits.
                </li>
              </ul>
            </Section>

            <PartHeading
              id="wp-part-2"
              number="Part 2"
              title="Technical methodology"
              blurb="The exact formulas, constants, and rules that the Modern Cents CPP Calculator engine implements."
              icon={<Calculator className="h-5 w-5" />}
            />

            <Section>
              <SectionHeading
                id="wp-methodology"
                eyebrow="Overview"
                title="How a CPP figure is built"
                icon={<Layers className="h-5 w-5" />}
              />
              <p>
                A monthly CPP retirement pension in the Modern Cents CPP Calculator is the sum of three components,
                each computed from the same earnings record but with different rules:
              </p>
              <Formula>
                Total monthly CPP = Base CPP + Tier 1 enhancement + Tier 2 enhancement
              </Formula>
              <Example>
                <ExampleLine>
                  Representative client at 65: {fmt2(ex.total.base)} (Base) +{" "}
                  {fmt2(ex.total.tier1)} (Tier 1) + {fmt2(ex.total.tier2)} (Tier 2)
                </ExampleLine>
                <ExampleLine>
                  = {fmt2(ex.total.monthly)} / month before the take-up adjustment
                </ExampleLine>
              </Example>
              <p>
                Each component is calculated at age 65 in start-year dollars and then multiplied by
                an adjustment factor for the chosen take-up age (60–70). If the client continues
                working after starting CPP, a Post-Retirement Benefit accrues each year and is added
                to the indexed payment stream.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-contributory"
                eyebrow="Reference values"
                title="Contributory period, YMPE & YAMPE"
                icon={<ScrollText className="h-5 w-5" />}
              />
              <p>
                The <em>contributory period</em> runs month-by-month from the later of age 18 or
                January 1966 (when CPP began) to the month before CPP starts, capped at age 70. The
                engine carries the period at monthly granularity so partial-year work, mid-year
                start dates, and CRDO/disability windows can be removed precisely.
              </p>
              <p>
                Two reference earnings ceilings drive the math:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>
                  <strong>YMPE</strong> — the Year's Maximum Pensionable Earnings. The base + Tier 1
                  ceiling. Published values 1966–2026 are stored in the engine; later years are
                  projected at the user's YMPE growth rate (default 3.1%).
                </li>
                <li>
                  <strong>YAMPE</strong> — the Year's Additional Maximum Pensionable Earnings.
                  Introduced in 2024 as the upper ceiling for Tier 2 contributions. Published values
                  for 2024–2026 are stored; later years are projected at the YAMPE growth rate.
                </li>
                <li>
                  <strong>YBE</strong> — the Year's Basic Exemption, a flat <InlineMath>$3,500</InlineMath>{" "}
                  that is subtracted from earnings when computing Tier 1 contributory amounts.
                </li>
              </ul>
              <p>
                The engine also computes <strong>AYMPE</strong> (5-year average YMPE ending in the
                start year) and <strong>AYAMPE</strong> (the equivalent for YAMPE). These are the
                indexes used to translate historical earnings into start-year dollars.
              </p>
              <Formula>
                AYMPE(start) = ( YMPE(start) + YMPE(start−1) + … + YMPE(start−4) ) / 5
              </Formula>
              <Example>
                <ExampleLine>
                  AYMPE({ex.profile.startYear}) = (
                  {ex.aympeYears.map((y) => fmt0(y.ympe)).join(" + ")}
                  ) / 5
                </ExampleLine>
                <ExampleLine>= {fmt0(ex.aympeStart)}</ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Years past 2026 use the user's YMPE growth rate (default 3.1%) to project
                  forward.
                </div>
              </Example>
            </Section>

            <Section>
              <SectionHeading
                id="wp-ampe"
                eyebrow="Indexing"
                title="Average Monthly Pensionable Earnings (AMPE)"
                icon={<Sigma className="h-5 w-5" />}
              />
              <p>
                Each month in the contributory period is allocated{" "}
                <InlineMath>annual earnings ÷ 12</InlineMath> and capped at{" "}
                <InlineMath>YMPE(year) ÷ 12</InlineMath>. The capped monthly amount is then indexed
                to start-year dollars using the AYMPE ratio:
              </p>
              <Formula>
                indexed monthly(year) = capped monthly(year) × AYMPE(start) / YMPE(year)
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Take a single month from {ex.ampeIndex.year} (a YMPE-max year). YMPE(
                  {ex.ampeIndex.year}) = {fmt0(ex.ampeIndex.ympe)}, so:
                </div>
                <ExampleLine>
                  capped monthly = {fmt0(ex.ampeIndex.ympe)} / 12 = {fmt2(ex.ampeIndex.cappedMonthly)}
                </ExampleLine>
                <ExampleLine>
                  indexed monthly = {fmt2(ex.ampeIndex.cappedMonthly)} × {fmt0(ex.aympeStart)} /{" "}
                  {fmt0(ex.ampeIndex.ympe)} = {fmt2(ex.ampeIndex.indexedMonthly)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Indexing translates the {ex.ampeIndex.year} earning into {ex.profile.startYear}{" "}
                  dollars. For any YMPE-max year the result equals AYMPE(start) ÷ 12.
                </div>
              </Example>
              <p>
                After CRDO, disability, and the general 17% drop-out are applied (see below), AMPE
                is the simple average of the indexed monthly earnings that remain:
              </p>
              <Formula>
                AMPE = ( Σ indexed monthly earnings of retained months ) / (number of retained
                months)
              </Formula>
              <p>
                AMPE is then capped at <InlineMath>AYMPE(start) ÷ 12</InlineMath> — a maximum
                contributor cannot exceed the program's own ceiling.
              </p>
              <Example>
                <ExampleLine>
                  contributory months = {ex.base.contribMonths.toLocaleString()} (June {ex.profile.birthYear + 18}
                  → May {ex.profile.startYear}); retained after 17% drop-out ={" "}
                  {ex.base.monthsRetained.toLocaleString()}
                </ExampleLine>
                <ExampleLine>AMPE ≈ {fmt2(ex.ampe)} / month</ExampleLine>
                <ExampleLine>AMPE cap = AYMPE / 12 = {fmt2(ex.ampeCap)} / month</ExampleLine>
                <div className="text-xs text-muted-foreground">
                  This client never exceeds the AMPE cap. The 13 zero-earning years from age 18 to
                  30 keep AMPE just below the ceiling even with the drop-out applied.
                </div>
              </Example>
            </Section>

            <Section>
              <SectionHeading
                id="wp-base"
                eyebrow="Component 1"
                title="Base CPP (pre-2019 design)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                Base CPP replaces 25% of AMPE at age 65. Take-up at any other age multiplies the
                result by the adjustment factor (see below):
              </p>
              <Formula>
                Base monthly = AMPE × 0.25 × adjustment factor(start age)
              </Formula>
              <Example>
                <ExampleLine>
                  Base monthly at 65 = {fmt2(ex.ampe)} × 0.25 × 1.000 ={" "}
                  {fmt2(ex.base.monthlyAt65)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  At age 65 the adjustment factor is exactly 1.0; early/late take-up is shown
                  further below.
                </div>
              </Example>
              <p>
                Base CPP applies to the entire contributory period back to 1966 and continues to
                exist alongside the Tier 1 and Tier 2 enhancements — it is not replaced by them.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-tier1"
                eyebrow="Component 2"
                title="Tier 1 enhancement (post-2018)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                The 2019 first additional contribution adds an additional 8⅓% replacement on
                YMPE-band earnings (above the YBE). Each year between 2019 and 2023 phases in a
                share of the full 8⅓% rate:
              </p>
              <ul className="ml-5 list-disc space-y-1 text-muted-foreground">
                <li>2019 = 15% × 8⅓%</li>
                <li>2020 = 30% × 8⅓%</li>
                <li>2021 = 50% × 8⅓%</li>
                <li>2022 = 75% × 8⅓%</li>
                <li>2023 and later = 100% × 8⅓%</li>
              </ul>
              <p>For each contribution year:</p>
              <Formula>
                tier 1 earnings(year) = min(earnings, YMPE(year)) − YBE
                <br />
                indexed(year) = tier 1 earnings(year) × AYMPE(start) / YMPE(year)
                <br />
                weighted(year) = indexed(year) × phase-in(year)
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Phase-in year {ex.tier1.phaseExample.year} (factor{" "}
                  {pct1(ex.tier1.phaseExample.phaseFactor)} of full rate):
                </div>
                <ExampleLine>
                  tier 1 earnings = min({fmt0(ex.tier1.phaseExample.ympe)},{" "}
                  {fmt0(ex.tier1.phaseExample.ympe)}) − $3,500 ={" "}
                  {fmt0(ex.tier1.phaseExample.tier1Earn)}
                </ExampleLine>
                <ExampleLine>
                  indexed = {fmt0(ex.tier1.phaseExample.tier1Earn)} × {fmt0(ex.aympeStart)} /{" "}
                  {fmt0(ex.tier1.phaseExample.ympe)} = {fmt0(ex.tier1.phaseExample.indexed)}
                </ExampleLine>
                <ExampleLine>
                  weighted = {fmt0(ex.tier1.phaseExample.indexed)} ×{" "}
                  {pct1(ex.tier1.phaseExample.phaseFactor)} ={" "}
                  {fmt0(ex.tier1.phaseExample.weighted)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Fully phased-in year {ex.tier1.fullExample.year} (factor 100%):
                </div>
                <ExampleLine>
                  weighted = ({fmt0(ex.tier1.fullExample.ympe)} − $3,500) × {fmt0(ex.aympeStart)} /{" "}
                  {fmt0(ex.tier1.fullExample.ympe)} × 100% ={" "}
                  {fmt0(ex.tier1.fullExample.weighted)}
                </ExampleLine>
              </Example>
              <p>
                The annual benefit at 65 is the average weighted amount times the full replacement
                rate, multiplied by an accrual factor that reaches 1.0 only after{" "}
                <InlineMath>40</InlineMath> years of contributions:
              </p>
              <Formula>
                accrual = min(1, contribution years / 40)
                <br />
                tier 1 annual at 65 = ( Σ weighted / years ) × 8⅓% × accrual
                <br />
                tier 1 monthly = tier 1 annual at 65 × adjustment factor / 12
              </Formula>
              <Example>
                <ExampleLine>
                  contribution years (2019 → {ex.profile.startYear - 1}) ={" "}
                  {ex.tier1.contributionYears}
                </ExampleLine>
                <ExampleLine>
                  accrual = min(1, {ex.tier1.contributionYears} / {ex.tier1.enhancementFullYears})
                  = {ex.tier1.accrualFactor.toFixed(3)}
                </ExampleLine>
                <ExampleLine>
                  tier 1 monthly at 65 ≈ {fmt2(ex.tier1.monthlyAt65)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  This client only has {ex.tier1.contributionYears} years inside the Tier 1 window,
                  so the accrual factor of {ex.tier1.accrualFactor.toFixed(3)} keeps the Tier 1
                  contribution well below its eventual ceiling.
                </div>
              </Example>
            </Section>

            <Section>
              <SectionHeading
                id="wp-tier2"
                eyebrow="Component 3"
                title="Tier 2 enhancement (post-2023)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                The 2024 second additional contribution applies a 33⅓% replacement to earnings
                between YMPE and YAMPE. There is no phase-in: the rate is fully effective from 2024
                onward.
              </p>
              <Formula>
                tier 2 earnings(year) = min(earnings, YAMPE(year)) − YMPE(year)
                <br />
                indexed(year) = tier 2 earnings(year) × AYAMPE(start) / YAMPE(year)
                <br />
                accrual = min(1, contribution years / 40)
                <br />
                tier 2 annual at 65 = ( Σ indexed / years ) × 33⅓% × accrual
                <br />
                tier 2 monthly = tier 2 annual at 65 × adjustment factor / 12
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Our 35-year YMPE-max client never crosses YMPE, so their Tier 2 = $0. To
                  illustrate the band, take {ex.tier2.yearExample.year} (the first Tier 2 year):
                </div>
                <ExampleLine>
                  tier 2 earnings = min(YAMPE, earnings) − YMPE = {fmt0(ex.tier2.yearExample.yampe)} −{" "}
                  {fmt0(ex.tier2.yearExample.ympe)} = {fmt0(ex.tier2.yearExample.tier2Earn)}
                </ExampleLine>
                <ExampleLine>
                  indexed = {fmt0(ex.tier2.yearExample.tier2Earn)} × {fmt0(ex.ayampeStart)} /{" "}
                  {fmt0(ex.tier2.yearExample.yampe)} = {fmt0(ex.tier2.yearExample.indexed)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  If that client instead earned the YAMPE-max every year from 2024 onward (
                  {ex.tier2.altScenarioContributionYears} years, accrual{" "}
                  {ex.tier2.altScenarioAccrualFactor.toFixed(3)}), tier 2 monthly at 65 ≈{" "}
                  {fmt2(ex.tier2.altScenarioMonthlyAt65)}.
                </div>
              </Example>
              <p>
                Tier 2 only contributes to the result when the client has earnings above the YMPE
                ceiling in 2024 or later.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-dropouts"
                eyebrow="Drop-outs"
                title="Drop-out provisions"
                icon={<Layers className="h-5 w-5" />}
              />
              <p>
                Drop-outs remove low- or zero-earning months from the contributory period before AMPE
                is averaged. The order matters: CRDO and disability windows are removed first, then
                the general drop-out is applied to whatever is left.
              </p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Child Rearing Drop-Out (CRDO).</strong> Months while a parent was the
                  primary caregiver of a child under age 7 are excluded entirely. The user enters
                  the start and end month of each CRDO window; the engine drops every month in that
                  window.
                </li>
                <li>
                  <strong>Disability drop-out.</strong> Months during a CPP disability period are
                  excluded the same way as CRDO. Months that overlap both a CRDO and a disability
                  period are counted once (CRDO takes precedence in the diagnostics).
                </li>
                <li>
                  <strong>General 17% drop-out.</strong> After CRDO and disability windows are
                  removed, the engine drops the lowest{" "}
                  <InlineMath>floor(0.17 × remaining months)</InlineMath> indexed monthly amounts —
                  in practice the worst earning years for the contributor.
                </li>
              </ul>
              <Example>
                <ExampleLine>
                  contributory months = {ex.base.contribMonths.toLocaleString()}; dropped = floor(
                  {pct1(ex.base.dropoutRate)} × {ex.base.contribMonths.toLocaleString()}) ={" "}
                  {ex.base.generalDropoutMonths.toLocaleString()}; retained ={" "}
                  {ex.base.monthsRetained.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  base monthly with drop-out = {fmt2(ex.base.monthlyWithDropout)}
                </ExampleLine>
                <ExampleLine>
                  base monthly without drop-out (dilute by zero years) ≈{" "}
                  {fmt2(ex.base.monthlyNoDropout)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  The drop-out lifts this client's base CPP by ≈ {fmt2(ex.base.dropoutLift)} / month
                  by removing the worst-earning months (their 1980s zero-earning years before
                  starting work).
                </div>
              </Example>

              <Example
                label={`Parent client, born June ${ex.profile.birthYear}, ${ex.crdoExample.yearsOff} years out of the workforce raising young children`}
              >
                <div className="text-xs text-muted-foreground">
                  Same June {ex.profile.birthYear} birth and start age (65 in {ex.profile.startYear}
                  ), but this parent worked at YMPE-max from {ex.crdoExample.workStartYear} onward
                  except for {ex.crdoExample.gapStartYear}–{ex.crdoExample.gapEndYear} (
                  {ex.crdoExample.monthsOff} months at home with young children, zero pensionable
                  earnings). Both numbers below are produced by running the engine with vs without
                  a CRDO claim covering that window.
                </div>
                <ExampleLine>
                  without CRDO: contributory months ={" "}
                  {ex.crdoExample.contribMonths.toLocaleString()}, general drop-out removes{" "}
                  {ex.crdoExample.generalDropoutMonthsWithout.toLocaleString()}, retained ={" "}
                  {ex.crdoExample.monthsRetainedWithout.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.crdoExample.ampeWithout)} / mo, base CPP ≈{" "}
                  {fmt2(ex.crdoExample.baseMonthlyWithout)} / mo, total CPP ≈{" "}
                  {fmt2(ex.crdoExample.totalMonthlyWithout)} / mo
                </ExampleLine>
                <ExampleLine>
                  with CRDO: {ex.crdoExample.crdoMonthsDropped.toLocaleString()} months removed
                  first, then general drop-out removes{" "}
                  {ex.crdoExample.generalDropoutMonthsWith.toLocaleString()}, retained ={" "}
                  {ex.crdoExample.monthsRetainedWith.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.crdoExample.ampeWith)} / mo, base CPP ≈{" "}
                  {fmt2(ex.crdoExample.baseMonthlyWith)} / mo, total CPP ≈{" "}
                  {fmt2(ex.crdoExample.totalMonthlyWith)} / mo
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Claiming the CRDO lifts this parent's base CPP by ≈{" "}
                  {fmt2(ex.crdoExample.baseLift)} / month (≈ {fmt2(ex.crdoExample.totalLift)} / mo
                  on the total) — the parental window is removed before the 17% drop-out is
                  computed, so more low-earning months get caught by the drop-out instead of
                  pulling AMPE down.
                </div>
              </Example>

              <Example
                label={`Worker client, born June ${ex.profile.birthYear}, ${ex.disabilityExample.yearsOff}-year disability window mid-career`}
              >
                <div className="text-xs text-muted-foreground">
                  Same birth and start age, started YMPE-max work in{" "}
                  {ex.disabilityExample.workStartYear}, then a{" "}
                  {ex.disabilityExample.yearsOff}-year disability window from{" "}
                  {ex.disabilityExample.gapStartYear} to {ex.disabilityExample.gapEndYear} (
                  {ex.disabilityExample.monthsOff} months, zero pensionable earnings). Compared
                  with vs without a disability drop-out claim covering that window.
                </div>
                <ExampleLine>
                  without claim: contributory months ={" "}
                  {ex.disabilityExample.contribMonths.toLocaleString()}, general drop-out removes{" "}
                  {ex.disabilityExample.generalDropoutMonthsWithout.toLocaleString()}, retained ={" "}
                  {ex.disabilityExample.monthsRetainedWithout.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.disabilityExample.ampeWithout)} / mo, base CPP ≈{" "}
                  {fmt2(ex.disabilityExample.baseMonthlyWithout)} / mo, total CPP ≈{" "}
                  {fmt2(ex.disabilityExample.totalMonthlyWithout)} / mo
                </ExampleLine>
                <ExampleLine>
                  with claim:{" "}
                  {ex.disabilityExample.disabilityMonthsDropped.toLocaleString()} months removed
                  first, then general drop-out removes{" "}
                  {ex.disabilityExample.generalDropoutMonthsWith.toLocaleString()}, retained ={" "}
                  {ex.disabilityExample.monthsRetainedWith.toLocaleString()}
                </ExampleLine>
                <ExampleLine>
                  → AMPE ≈ {fmt2(ex.disabilityExample.ampeWith)} / mo, base CPP ≈{" "}
                  {fmt2(ex.disabilityExample.baseMonthlyWith)} / mo, total CPP ≈{" "}
                  {fmt2(ex.disabilityExample.totalMonthlyWith)} / mo
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Claiming the disability drop-out lifts base CPP by ≈{" "}
                  {fmt2(ex.disabilityExample.baseLift)} / month (≈{" "}
                  {fmt2(ex.disabilityExample.totalLift)} / mo on the total) for the same earnings
                  history — a meaningful uplift advisors should make sure clients who qualified for
                  CPP-D apply for.
                </div>
              </Example>
            </Section>

            <Section>
              <SectionHeading
                id="wp-adjustments"
                eyebrow="Take-up age"
                title="Early / late start adjustments (60–70, monthly)"
                icon={<Sigma className="h-5 w-5" />}
              />
              <p>
                CPP can begin as early as age 60 and as late as age 70. The engine applies the
                statutory monthly adjustment factor at monthly precision (so age 64 + 7 months is
                priced precisely, not rounded to 64):
              </p>
              <ul className="ml-5 list-disc space-y-1 text-muted-foreground">
                <li>Before 65: −0.6% per month early (max −36% at age 60).</li>
                <li>At 65: 1.00 (no adjustment).</li>
                <li>After 65: +0.7% per month late (max +42% at age 70).</li>
              </ul>
              <Formula>
                if start &lt; 65: factor = 1 − 0.006 × months early
                <br />
                if start &gt; 65: factor = 1 + 0.007 × months late
              </Formula>
              <Example>
                <ExampleLine>
                  age 60 → factor = 1 − 0.006 × 60 = {ex.adjustment.factor60.toFixed(3)} → total
                  monthly = {fmt2(ex.adjustment.total60)}
                </ExampleLine>
                <ExampleLine>
                  age 65 → factor = {ex.adjustment.factor65.toFixed(3)} → total monthly ={" "}
                  {fmt2(ex.adjustment.total65)}
                </ExampleLine>
                <ExampleLine>
                  age 70 → factor = 1 + 0.007 × 60 = {ex.adjustment.factor70.toFixed(3)} → total
                  monthly = {fmt2(ex.adjustment.total70)}
                </ExampleLine>
                <div className="text-xs text-muted-foreground">
                  Same client, same earnings record — only the take-up age differs. The factor
                  scales the base, Tier 1, and Tier 2 portions together.
                </div>
              </Example>
            </Section>

            <Section>
              <SectionHeading
                id="wp-percent-of-maximum"
                eyebrow="Benchmarking"
                title="Percent of the maximum CPP retirement pension"
                icon={<Target className="h-5 w-5" />}
              />
              <p>
                The result cards show each start age as a percentage of the maximum CPP retirement
                pension a person taking up at that same age in that same year could receive. To make
                the ratio meaningful, both numerator and denominator must be in the same year's
                dollars — so the engine projects the maximum forward to the chosen start year and
                applies the actuarial adjustment for the start age before dividing.
              </p>
              <p>
                The CPP maximum is{" "}
                <strong>wage-indexed (it grows with the YMPE) before take-up</strong>, then
                CPI-indexed once the benefit is in payment. The engine therefore projects the
                published max-at-65 forward using <InlineMath>ympeGrowthRate</InlineMath> (≈ 3.1%
                by default), <em>not</em> <InlineMath>indexingRate</InlineMath> (CPI ≈ 2.1%). This
                matches how Service Canada re-bases the maximum each January using the same wage
                growth that drives YMPE.
              </p>
              <Formula>
                max at 65 (start year) = max at 65 (latest published) × (1 + ympeGrowthRate)^(years
                forward)
                <br />
                max at start age = max at 65 (start year) × adjustment factor(start age)
                <br />
                % of maximum = total monthly ÷ max at start age
              </Formula>
              <Example>
                <div className="text-xs text-muted-foreground">
                  Same {ex.profile.label.toLowerCase()}. Each take-up age has its own start year
                  ({ex.maximum.startYear60}, {ex.maximum.startYear65}, {ex.maximum.startYear70}),
                  so the max-at-65 is re-projected for each age at the default{" "}
                  {pct1(ex.maximum.ympeGrowthRate)} YMPE growth before the actuarial factor is
                  applied.
                </div>
                <ExampleLine>
                  age 60 → max at 65 in {ex.maximum.startYear60} ={" "}
                  {fmt2(ex.maximum.maxAt65InStartYear60)} → ×{" "}
                  {ex.adjustment.factor60.toFixed(3)} = {fmt2(ex.maximum.maxAt60)} / mo →{" "}
                  {fmt2(ex.adjustment.total60)} ÷ {fmt2(ex.maximum.maxAt60)} ={" "}
                  {pct1(ex.maximum.pctOf60)}
                </ExampleLine>
                <ExampleLine>
                  age 65 → max at 65 in {ex.maximum.startYear65} ={" "}
                  {fmt2(ex.maximum.maxAt65InStartYear65)} → × 1.000 ={" "}
                  {fmt2(ex.maximum.maxAt65)} / mo → {fmt2(ex.adjustment.total65)} ÷{" "}
                  {fmt2(ex.maximum.maxAt65)} = {pct1(ex.maximum.pctOf65)}
                </ExampleLine>
                <ExampleLine>
                  age 70 → max at 65 in {ex.maximum.startYear70} ={" "}
                  {fmt2(ex.maximum.maxAt65InStartYear70)} → ×{" "}
                  {ex.adjustment.factor70.toFixed(3)} = {fmt2(ex.maximum.maxAt70)} / mo →{" "}
                  {fmt2(ex.adjustment.total70)} ÷ {fmt2(ex.maximum.maxAt70)} ={" "}
                  {pct1(ex.maximum.pctOf70)}
                </ExampleLine>
              </Example>
              <p className="text-sm text-muted-foreground">
                The figure can occasionally exceed <InlineMath>100%</InlineMath> for high earners
                with a long Tier 1 / Tier 2 contribution history — the published "maximum" reflects
                the transitional ceiling for someone with a complete career under the pre-2019
                design, while the engine computes the actual amount a fully-enhanced contributor
                would accrue. The progress bar on the result cards visually clamps at 100%, but the
                numeric value shown is the true ratio.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-prb"
                eyebrow="Continuing to work"
                title="Post-Retirement Benefit (PRB)"
                icon={<Calculator className="h-5 w-5" />}
              />
              <p>
                A client who continues to make pensionable contributions after starting CPP earns a
                Post-Retirement Benefit each year. The engine adds the PRB on top of the indexed
                payment stream until the client's chosen stop-work age. For each year of continued
                work:
              </p>
              <Formula>
                ratio = min(1, annual earnings / YMPE(year))
                <br />
                annual PRB(year) ≈ (starting CPP at take-up × 12) / 40 × ratio
              </Formula>
              <Example>
                <ExampleLine>
                  Same client starts CPP at 65 ({fmt2(ex.prb.startMonthly)} / month) and keeps
                  working at {fmt0(ex.prb.annualEarnings)} / year through age {ex.prb.stopAge}.
                </ExampleLine>
                <ExampleLine>
                  Year 1 ratio = min(1, {fmt0(ex.prb.annualEarnings)} /{" "}
                  {fmt0(ex.prb.ympeAtStart)}) = {pct1(ex.prb.ratio)}
                </ExampleLine>
                <ExampleLine>
                  Year 1 PRB = ({fmt2(ex.prb.startMonthly)} × 12) / 40 × {pct1(ex.prb.ratio)} ={" "}
                  {fmt0(ex.prb.firstYearAnnual)} / yr ≈ {fmt2(ex.prb.firstYearMonthly)} / month
                </ExampleLine>
                <ExampleLine>
                  After 5 years of accrual the engine reports an extra ≈{" "}
                  {fmt0(ex.prb.annualUpliftAt70)} / yr added to the indexed payment stream at age{" "}
                  {ex.prb.stopAge}.
                </ExampleLine>
              </Example>
              <p>
                The base used is the client's own starting CPP at take-up (base + Tier 1 + Tier 2,
                annualized) — i.e. the engine treats one additional year of contributions as
                accruing roughly 1/40 of the contributor's calculated retirement pension, scaled by
                how close that year's earnings are to the YMPE ceiling. PRB amounts accumulate year
                over year and are themselves indexed forward at the same CPI rate as the rest of
                the benefit stream.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-survivor"
                eyebrow="Survivor side"
                title="Survivor pension, combined cap, children's benefit, death benefit"
                icon={<ShieldCheck className="h-5 w-5" />}
              />
              <p>The survivor module models four distinct payouts:</p>
              <ul className="ml-5 list-disc space-y-2">
                <li>
                  <strong>Survivor's pension — base + Tier 1 portion.</strong>{" "}
                  <InlineMath>60%</InlineMath> of the deceased's calculated retirement pension if
                  the survivor is 65 or older; <InlineMath>37.5%</InlineMath> if under 65 (paid with
                  a flat-rate top-up).
                </li>
                <li>
                  <strong>Under-45 reduction.</strong> Survivors aged 35–44 with no dependent
                  children and not disabled have the under-65 base reduced by{" "}
                  <InlineMath>1/120</InlineMath> per month under age 45. Survivors under 35 with no
                  children and not disabled are deferred to age 65.
                </li>
                <li>
                  <strong>Survivor's pension — Tier 2 portion.</strong> A flat{" "}
                  <InlineMath>37.5%</InlineMath> of the deceased's enhanced (Tier 2) amount,
                  regardless of survivor age, with the same under-45 reduction but no combined-cap
                  treatment.
                </li>
                <li>
                  <strong>Combined-benefit cap.</strong> If the survivor is also collecting their
                  own CPP retirement, the sum of (own base + Tier 1) and (survivor base + Tier 1)
                  cannot exceed the maximum CPP retirement pension at 65 for the start year. Any
                  excess is clawed back from the survivor's portion.
                  <Example>
                    <div className="text-xs text-muted-foreground">
                      Same client dies at 65 in {ex.profile.startYear}; surviving spouse is also 65
                      and already collects an identical max retirement pension.
                    </div>
                    <ExampleLine>
                      combined cap (max retirement at 65 in {ex.profile.startYear}) ={" "}
                      {fmt2(ex.survivor.cap)} / mo
                    </ExampleLine>
                    <ExampleLine>
                      survivor pension (base + Tier 1, uncapped) = 60% × {fmt2(ex.survivor.deceasedBaseTier1)} ={" "}
                      {fmt2(ex.survivor.pensionUncapped)} / mo
                    </ExampleLine>
                    <ExampleLine>
                      allowed = max(0, {fmt2(ex.survivor.cap)} −{" "}
                      {fmt2(ex.survivor.survivorOwnBaseTier1)}) ={" "}
                      {fmt2(Math.max(0, ex.survivor.cap - ex.survivor.survivorOwnBaseTier1))} / mo
                    </ExampleLine>
                    <ExampleLine>
                      after cap = {fmt2(ex.survivor.pensionAfterCap)} / mo (clawed back ≈{" "}
                      {fmt2(ex.survivor.capReduction)} / mo)
                    </ExampleLine>
                    <div className="text-xs text-muted-foreground">
                      The Tier 2 portion ({fmt2(ex.survivor.pensionTier2)} / mo) is not subject to
                      the cap, so the survivor still receives a small enhancement on top.
                    </div>
                  </Example>
                </li>
                <li>
                  <strong>Children's benefit.</strong> A flat monthly amount per eligible dependent
                  child, indexed to CPI; the engine carries the published amounts and projects
                  forward.
                </li>
                <li>
                  <strong>Death benefit.</strong> A one-time lump sum of{" "}
                  <InlineMath>$2,500</InlineMath>, fixed since 2019.
                </li>
              </ul>
              <p className="text-sm text-muted-foreground">
                The survivor module reuses the main engine to compute the deceased's calculated
                retirement pension at 65, truncating earnings at the death year so no future
                contributions are projected.
              </p>
            </Section>

            <Section>
              <SectionHeading
                id="wp-soc"
                eyebrow="Data ingestion"
                title="SOC import"
                icon={<ClipboardList className="h-5 w-5" />}
              />
              <p>
                The Statement of Contributions parser accepts pasted text from the Service Canada
                SOC web page, tab-separated PDF rows, or a simple{" "}
                <InlineMath>year, earnings</InlineMath> CSV. For each line it:
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>Strips currency symbols and thousands-separator commas inside numbers.</li>
                <li>
                  Tokenizes on tabs, commas, or runs of whitespace, then identifies the year as the
                  first integer in the valid CPP range (1966 through next year).
                </li>
                <li>
                  Picks the largest non-year, sub-$1,000,000 number on the row as the pensionable
                  earnings figure — the SOC PDF lists several smaller contribution sub-totals on
                  each row and pensionable earnings is always the largest.
                </li>
                <li>
                  De-duplicates by year (keeping the latest occurrence) and counts every line that
                  could not be interpreted as a "skipped" line.
                </li>
                <li>
                  Returns a summary of parsed and skipped line counts; a single warning is raised
                  only when the parser cannot detect any (year, earnings) pair at all, telling the
                  user to fall back to a simple <InlineMath>year, earnings</InlineMath> CSV.
                </li>
              </ul>
              <p>
                The result is a sorted list of <InlineMath>{`{year, pensionableEarnings}`}</InlineMath>{" "}
                records that drops directly into the scenario's earnings history.
              </p>
            </Section>
          </article>
        </div>
      </div>

      <div className="mx-auto mt-16 w-full max-w-7xl px-4 sm:mt-20 sm:px-6 print:hidden">
        <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-[hsl(215_85%_96%)] via-[hsl(248_75%_97%)] to-[hsl(28_90%_96%)] p-8 text-center shadow-sm sm:p-12">
          <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[hsl(190_80%_85%)] opacity-40 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[hsl(28_90%_85%)] opacity-40 blur-3xl" />
          <div className="relative">
            <h3 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Ready to see it on a real scenario?
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Create an account, paste a Statement of Contributions, and walk through the
              breakdown line by line.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/sign-up">
                <Button size="lg" className="w-full sm:w-auto px-8 shadow-md">
                  Start Calculating
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8">
                  Sign In
                </Button>
              </Link>
              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
                className="w-full sm:w-auto px-8"
                data-testid="button-print-white-paper"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print white paper
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  // If the target heading lives inside a collapsed <details.wp-section>,
  // open it first so the body becomes visible. We scroll on the next frame
  // so the browser has time to lay out the now-expanded section before we
  // compute the final scroll position.
  const details = el.closest<HTMLDetailsElement>("details.wp-section");
  const wasClosed = !!details && !details.open;
  if (details && !details.open) {
    details.open = true;
  }
  const doScroll = () => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof history !== "undefined" && history.replaceState) {
      history.replaceState(null, "", `#${id}`);
    }
  };
  if (wasClosed && typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(doScroll);
  } else {
    doScroll();
  }
}

function TocList({
  title,
  items,
  activeId,
}: {
  title: string;
  items: TocItem[];
  activeId: string | null;
}) {
  return (
    <div>
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/80">
        {title}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  smoothScrollTo(item.id);
                }}
                className={`block rounded-md px-2 py-1.5 text-sm leading-snug transition-colors ${
                  isActive
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  // Each <Section> call site starts with a <SectionHeading> followed by
  // body content. Splitting the first child off lets us put the heading
  // inside the <summary> (the click target) and the rest inside a
  // collapsible body. Defaults to closed.
  const arr = Children.toArray(children);
  const [head, ...body] = arr;
  return (
    <details className="wp-section group rounded-xl print:rounded-none">
      <summary
        className="wp-section-summary -mx-2 flex cursor-pointer list-none items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/40 print:mx-0 print:rounded-none print:p-0 print:hover:bg-transparent"
      >
        <ChevronRight
          aria-hidden="true"
          className="wp-chevron mt-1.5 h-5 w-5 shrink-0 text-primary transition-transform duration-200 group-open:rotate-90 print:hidden"
        />
        <div className="min-w-0 flex-1">{head}</div>
      </summary>
      <div className="wp-section-body space-y-4 pl-8 pt-4 text-base leading-relaxed text-foreground/90 [&>p]:text-muted-foreground [&>p]:leading-relaxed print:pl-0 print:pt-4">
        {body}
      </div>
    </details>
  );
}
