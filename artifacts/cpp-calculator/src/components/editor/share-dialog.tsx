import { useEffect, useState } from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import {
  useCreateScenarioShare,
  useRevokeScenarioShare,
  getGetScenarioQueryKey,
  getListScenariosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioId: string;
  scenarioTitle: string;
  currentToken: string | null;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function buildShareUrl(token: string): string {
  if (typeof window === "undefined") return `${basePath}/shared/${token}`;
  return `${window.location.origin}${basePath}/shared/${token}`;
}

export function ShareDialog({
  open,
  onOpenChange,
  scenarioId,
  scenarioTitle,
  currentToken,
}: ShareDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(currentToken);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setToken(currentToken);
  }, [currentToken, open]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const createMutation = useCreateScenarioShare();
  const revokeMutation = useRevokeScenarioShare();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetScenarioQueryKey(scenarioId) });
    queryClient.invalidateQueries({ queryKey: getListScenariosQueryKey() });
  }

  function handleCreate() {
    createMutation.mutate(
      { id: scenarioId },
      {
        onSuccess: (resp) => {
          setToken(resp.shareToken);
          invalidate();
          toast({ title: "Share link ready" });
        },
        onError: () =>
          toast({ title: "Could not create share link", variant: "destructive" }),
      },
    );
  }

  function handleRevoke() {
    if (!confirm("Revoke this share link? Anyone with the link will lose access.")) return;
    revokeMutation.mutate(
      { id: scenarioId },
      {
        onSuccess: () => {
          setToken(null);
          invalidate();
          toast({ title: "Share link revoked" });
        },
        onError: () =>
          toast({ title: "Could not revoke share link", variant: "destructive" }),
      },
    );
  }

  async function handleCopy() {
    if (!token) return;
    const url = buildShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast({ title: "Copy failed — please copy the link manually", variant: "destructive" });
    }
  }

  const url = token ? buildShareUrl(token) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with a client</DialogTitle>
          <DialogDescription>
            Send "{scenarioTitle}" to a client as a read-only link. The link shows
            inputs and projected results, with no sign-in required and no editing.
            You can revoke the link at any time.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={url}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                data-testid="input-share-url"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopy}
                data-testid="button-copy-share"
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view the scenario. Updates you save are
              reflected automatically — the client always sees the latest version.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Link2 className="h-4 w-4" /> No share link yet
            </div>
            <p className="mt-1.5">
              Create a private link to share this scenario with a client.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {token ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
              className="text-destructive hover:text-destructive"
              data-testid="button-revoke-share"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {revokeMutation.isPending ? "Revoking…" : "Revoke link"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-create-share"
            >
              <Link2 className="mr-2 h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create share link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
