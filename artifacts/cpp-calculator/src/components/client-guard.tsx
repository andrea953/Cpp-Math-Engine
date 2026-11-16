import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, EyeOff, ShieldCheck, Users } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isEditorDirty, setActiveAnchor, setEditorDirty, useActiveAnchor } from "@/lib/client-session";

export function ConfirmAllClientsDialog({
  open,
  onOpenChange,
  onConfirm,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  returnFocusTo?: RefObject<HTMLButtonElement | null>;
}) {
  const dirty = open && isEditorDirty();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-testid="dialog-confirm-all-clients"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.current) {
            event.preventDefault();
            returnFocusTo.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-primary" aria-hidden="true" /> Show all clients?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This leaves the current client workspace and displays your full client list, including other
            clients' names. If you are sharing your screen, stop sharing first.
            {dirty && " Unsaved changes in this scenario will be discarded."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-all-clients">Stay with this client</AlertDialogCancel>
          <AlertDialogAction data-testid="button-confirm-all-clients" onClick={onConfirm}>
            Show all clients
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Deliberate, confirmed exit from the client workspace to the full index. */
export function AllClientsExitButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [, setLocation] = useLocation();
  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="button-all-clients-exit"
        aria-label="All clients (shows other clients)"
        className="border-dashed"
      >
        <Users className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
        <span className={compact ? "sr-only" : "hidden sm:inline"}>All clients</span>
      </Button>
      <ConfirmAllClientsDialog
        returnFocusTo={triggerRef}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => {
          setEditorDirty(false);
          setActiveAnchor(null);
          setLocation("/scenarios");
        }}
      />
    </>
  );
}

/**
 * Route-level gate for the all-clients index. While a client workspace is
 * active in this tab, the index is never mounted until the planner confirms.
 */
export function ClientIndexGate({ children }: { children: ReactNode }) {
  const anchor = useActiveAnchor();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!anchor) return <>{children}</>;
  return (
    <div className="container mx-auto flex min-h-[60dvh] items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 text-center sm:p-8" data-testid="panel-client-index-gate">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Client workspace is still open</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The full client list is hidden to keep other clients private while you present.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => setLocation(`/clients/${anchor}`)} data-testid="button-gate-return">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Return to client
          </Button>
          <Button ref={triggerRef} variant="outline" onClick={() => setOpen(true)} data-testid="button-gate-show-all">
            Show all clients
          </Button>
        </div>
      </Card>
      <ConfirmAllClientsDialog
        returnFocusTo={triggerRef}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => {
          setEditorDirty(false);
          setActiveAnchor(null);
        }}
      />
    </div>
  );
}
