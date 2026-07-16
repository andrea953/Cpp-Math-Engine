import { Router, type IRouter } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, scenariosTable, type ScenarioRow } from "@workspace/db";
import {
  CreateScenarioBody,
  UpdateScenarioBody,
  GetScenarioParams,
  UpdateScenarioParams,
  DeleteScenarioParams,
  DuplicateScenarioParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function toScenarioResponse(row: ScenarioRow) {
  return {
    id: row.id,
    title: row.title,
    clientName: row.clientName ?? undefined,
    notes: row.notes ?? undefined,
    inputs: row.inputs as Record<string, unknown>,
    shareToken: row.shareToken ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

router.get("/scenarios", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const rows = await db
    .select()
    .from(scenariosTable)
    .where(eq(scenariosTable.userId, userId))
    .orderBy(desc(scenariosTable.updatedAt));
  res.json(rows.map(toScenarioResponse));
});

router.post("/scenarios", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const parsed = CreateScenarioBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid create body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(scenariosTable)
    .values({
      userId,
      title: parsed.data.title,
      clientName: parsed.data.clientName?.trim() || null,
      notes: parsed.data.notes ?? null,
      inputs: parsed.data.inputs,
    })
    .returning();

  res.status(201).json(toScenarioResponse(row));
});

router.get("/scenarios/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const params = GetScenarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(scenariosTable)
    .where(and(eq(scenariosTable.id, params.data.id), eq(scenariosTable.userId, userId)));
  if (!row) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  res.json(toScenarioResponse(row));
});

router.put("/scenarios/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const params = UpdateScenarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateScenarioBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(scenariosTable)
    .set({
      title: body.data.title,
      clientName: body.data.clientName?.trim() || null,
      notes: body.data.notes ?? null,
      inputs: body.data.inputs,
      updatedAt: new Date(),
    })
    .where(and(eq(scenariosTable.id, params.data.id), eq(scenariosTable.userId, userId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  res.json(toScenarioResponse(row));
});

router.delete("/scenarios/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const params = DeleteScenarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(scenariosTable)
    .where(and(eq(scenariosTable.id, params.data.id), eq(scenariosTable.userId, userId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/scenarios/:id/duplicate", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const params = DuplicateScenarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [src] = await db
    .select()
    .from(scenariosTable)
    .where(and(eq(scenariosTable.id, params.data.id), eq(scenariosTable.userId, userId)));
  if (!src) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  const [row] = await db
    .insert(scenariosTable)
    .values({
      userId,
      title: `${src.title} (Copy)`,
      clientName: src.clientName,
      notes: src.notes,
      inputs: src.inputs,
    })
    .returning();

  res.status(201).json(toScenarioResponse(row));
});

router.post("/scenarios/:id/share", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const params = GetScenarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Atomic + idempotent: only sets share_token if currently NULL, so concurrent
  // POSTs by the same owner cannot rotate each other's tokens.
  const candidate = generateShareToken();
  const [row] = await db
    .update(scenariosTable)
    .set({ shareToken: sql`COALESCE(${scenariosTable.shareToken}, ${candidate})` })
    .where(and(eq(scenariosTable.id, params.data.id), eq(scenariosTable.userId, userId)))
    .returning({ shareToken: scenariosTable.shareToken });

  if (!row || !row.shareToken) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }

  res.json({
    shareToken: row.shareToken,
    sharePath: `/shared/${row.shareToken}`,
  });
});

router.delete("/scenarios/:id/share", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const params = GetScenarioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .update(scenariosTable)
    .set({ shareToken: null })
    .where(and(eq(scenariosTable.id, params.data.id), eq(scenariosTable.userId, userId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Scenario not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/shared/:token", async (req, res): Promise<void> => {
  const token = req.params.token;
  if (!token || typeof token !== "string" || token.length < 8 || token.length > 128) {
    res.status(404).json({ error: "Shared scenario not found" });
    return;
  }

  const [row] = await db
    .select()
    .from(scenariosTable)
    .where(eq(scenariosTable.shareToken, token));
  if (!row) {
    res.status(404).json({ error: "Shared scenario not found" });
    return;
  }

  res.json({
    title: row.title,
    notes: row.notes ?? undefined,
    inputs: row.inputs as Record<string, unknown>,
    sharedAt: row.updatedAt.toISOString(),
  });
});

export default router;
