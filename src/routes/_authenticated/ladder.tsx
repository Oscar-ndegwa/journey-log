import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { squares, type Square, type StepSquare, stepDbNumber } from "@/data/squares";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ladder")({
  head: () => ({
    meta: [
      { title: "Your Ladder — Agape Career" },
      { name: "description", content: "Track your progress through the Agape Career Ladder." },
    ],
  }),
  component: LadderPage,
});

interface ProgressRow {
  step_number: number;
  completed: boolean;
  notes: string;
  completed_at: string | null;
}

function LadderPage() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const { data: progress = [] } = useQuery({
    queryKey: ["progress", user.id],
    queryFn: async (): Promise<ProgressRow[]> => {
      const { data, error } = await supabase
        .from("step_progress")
        .select("step_number, completed, notes, completed_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const progressMap = useMemo(() => {
    const m = new Map<number, ProgressRow>();
    for (const r of progress) m.set(r.step_number, r);
    return m;
  }, [progress]);

  const stepEntries = useMemo(
    () =>
      squares
        .map((sq, i) => ({ sq, i }))
        .filter((x): x is { sq: StepSquare; i: number } => x.sq.type !== "header"),
    [],
  );
  const totalSteps = stepEntries.length;
  const completedSteps = stepEntries.filter(({ sq, i }) => progressMap.get(stepDbNumber(sq, i))?.completed).length;

  // Index of the next step that still needs completing (the only unlocked one beyond completed ones).
  const nextUnlockedOrder = stepEntries.findIndex(
    ({ sq, i }) => !progressMap.get(stepDbNumber(sq, i))?.completed,
  );
  // Map: squares array index -> locked?
  const lockedByIdx = useMemo(() => {
    const m = new Map<number, boolean>();
    stepEntries.forEach((entry, order) => {
      const done = !!progressMap.get(stepDbNumber(entry.sq, entry.i))?.completed;
      // unlocked if already done OR it is the next-in-line step
      const unlocked = done || order === nextUnlockedOrder;
      m.set(entry.i, !unlocked);
    });
    return m;
  }, [stepEntries, progressMap, nextUnlockedOrder]);
  const percent = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const saveStep = useMutation({
    mutationFn: async (payload: { step_number: number; completed: boolean; notes: string }) => {
      const { error } = await supabase.from("step_progress").upsert(
        {
          user_id: user.id,
          step_number: payload.step_number,
          completed: payload.completed,
          notes: payload.notes,
          completed_at: payload.completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,step_number" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["progress", user.id] });
      toast.success("Progress saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen p-3 md:p-6">
      <div className="mx-auto max-w-6xl rounded-3xl bg-card shadow-2xl p-4 md:p-8">
        <header className="text-center mb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-primary drop-shadow-sm">
            🪜 Agape Career Ladder
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            Your path to professional growth & success
          </p>
          <div className="mt-5 max-w-md mx-auto">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{completedSteps} / {totalSteps} steps complete</span>
              <span className="font-semibold text-primary">{percent}%</span>
            </div>
            <Progress value={percent} className="h-3" />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Signed in as {user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="h-7 px-2">
              <LogOut className="h-3.5 w-3.5 mr-1" /> Sign out
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {squares.map((sq, i) => {
            if (sq.type === "header") {
              return (
                <div
                  key={`h-${i}`}
                  className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-6 rounded-2xl text-center text-primary-foreground p-4 md:p-5 shadow-md"
                  style={{ background: "var(--gradient-header)" }}
                >
                  <div className="text-base md:text-xl font-bold leading-tight">{sq.title}</div>
                  <div className="text-xs md:text-sm opacity-90 mt-1 font-normal">{sq.desc}</div>
                </div>
              );
            }
            const dbNum = stepDbNumber(sq, i);
            const row = progressMap.get(dbNum);
            const done = !!row?.completed;
            const locked = lockedByIdx.get(i) ?? true;
            return (
              <SquareTile
                key={`s-${i}`}
                square={sq}
                done={done}
                locked={locked}
                onClick={() => {
                  if (locked) {
                    toast.info("Finish the previous step to unlock this one.");
                    return;
                  }
                  setOpenIdx(i);
                }}
              />
            );
          })}
        </div>
      </div>

      <StepDialog
        idx={openIdx}
        onClose={() => setOpenIdx(null)}
        progressMap={progressMap}
        onSave={(payload) => saveStep.mutate(payload)}
        saving={saveStep.isPending}
      />
    </main>
  );
}

function SquareTile({
  square,
  done,
  locked,
  onClick,
}: {
  square: StepSquare;
  done: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const gradientVar =
    square.type === "bronze" ? "var(--gradient-bronze)" :
    square.type === "silver" ? "var(--gradient-silver)" :
    square.type === "gold" ? "var(--gradient-gold)" :
    "var(--gradient-milestone)";

  const fg =
    square.type === "silver" ? "var(--silver-foreground)" :
    square.type === "gold" ? "var(--gold-foreground)" :
    "var(--bronze-foreground)";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={locked}
      className={`group relative min-h-[140px] md:min-h-[160px] rounded-2xl p-3 md:p-4 text-left transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-ring ${
        locked
          ? "opacity-50 grayscale cursor-not-allowed"
          : "hover:-translate-y-1 hover:shadow-[var(--shadow-square-hover)]"
      }`}
      style={{
        background: gradientVar,
        color: fg,
        boxShadow: "var(--shadow-square)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="inline-flex h-9 min-w-9 px-2 items-center justify-center rounded-full bg-white/30 backdrop-blur-sm font-bold text-lg"
        >
          {square.number}
        </div>
        {done ? (
          <span className="rounded-full bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 shadow">
            ✓ DONE
          </span>
        ) : locked ? (
          <span className="rounded-full bg-black/40 text-white text-[10px] font-bold px-2 py-0.5 shadow">
            🔒 LOCKED
          </span>
        ) : (
          <span className="rounded-full bg-white/80 text-black text-[10px] font-bold px-2 py-0.5 shadow">
            ▶ START
          </span>
        )}
      </div>
      <div className="mt-3 font-bold text-sm md:text-base leading-snug">{square.title}</div>
      <div className="mt-1 text-xs md:text-[13px] opacity-90 leading-snug">{square.desc}</div>
    </button>
  );
}

function StepDialog({
  idx,
  onClose,
  progressMap,
  onSave,
  saving,
}: {
  idx: number | null;
  onClose: () => void;
  progressMap: Map<number, ProgressRow>;
  onSave: (p: { step_number: number; completed: boolean; notes: string }) => void;
  saving: boolean;
}) {
  const square = idx != null ? (squares[idx] as Square) : null;
  const stepSq = square && square.type !== "header" ? (square as StepSquare) : null;
  const dbNum = stepSq && idx != null ? stepDbNumber(stepSq, idx) : null;
  const existing = dbNum != null ? progressMap.get(dbNum) : undefined;

  const [completed, setCompleted] = useState(false);
  const [notes, setNotes] = useState("");

  // reset state when opening
  useEffect(() => {
    setCompleted(!!existing?.completed);
    setNotes(existing?.notes ?? "");
  }, [existing, idx]);

  if (!stepSq || dbNum == null) return null;

  return (
    <Dialog open={idx != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span
              className="inline-flex h-10 min-w-10 px-2 items-center justify-center rounded-full font-bold text-lg"
              style={{
                background:
                  stepSq.type === "bronze" ? "var(--gradient-bronze)" :
                  stepSq.type === "silver" ? "var(--gradient-silver)" :
                  stepSq.type === "gold" ? "var(--gradient-gold)" :
                  "var(--gradient-milestone)",
                color:
                  stepSq.type === "silver" ? "var(--silver-foreground)" :
                  stepSq.type === "gold" ? "var(--gold-foreground)" :
                  "white",
              }}
            >
              {stepSq.number}
            </span>
            <span>{stepSq.title}</span>
          </DialogTitle>
          <DialogDescription>{stepSq.desc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold mb-2">Requirements</div>
            <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
              {stepSq.criteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/40">
            <Checkbox
              id="completed"
              checked={completed}
              onCheckedChange={(v) => setCompleted(v === true)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="completed" className="font-semibold cursor-pointer">
                Mark this step as complete
              </Label>
              {existing?.completed_at && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Last marked: {new Date(existing.completed_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes / reflection</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              placeholder="What did you learn? Any evidence to remember?"
              rows={4}
              maxLength={2000}
            />
            <div className="text-[11px] text-muted-foreground text-right">{notes.length} / 2000</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => {
              onSave({ step_number: dbNum, completed, notes });
              onClose();
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save progress"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
