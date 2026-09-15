import * as React from "react";
import { isTauri } from "@/lib/tauri";
import {
  applyLayout,
  autoOutputs,
  currentMonitorKey,
  listMonitors,
  loadLayout,
  saveLayout,
  type MonitorInfo,
} from "./monitors";
import { STAGE_LABELS } from "./stage-window";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "cn";
import { closeAllStages } from "./stage-window";

type Role = { kind: "operator" } | { kind: "output"; index: number } | null;

function roleOf(
  operator: string | null,
  outputs: MonitorInfo[],
  key: string,
): Role {
  if (operator === key) return { kind: "operator" };
  const index = outputs.findIndex((m) => m.key === key);
  return index >= 0 ? { kind: "output", index } : null;
}

function RoleBadge({ role }: { role: Role }) {
  if (!role) return <Badge variant="outline">sem função</Badge>;
  if (role.kind === "operator") return <Badge variant="default">Operador</Badge>;
  return <Badge variant="secondary">Saída {role.index + 1}</Badge>;
}

function Specs({ m }: { m: MonitorInfo }) {
  return (
    <span className="text-muted-foreground">
      {" "}
      · {m.width}×{m.height} · {m.aspect}
    </span>
  );
}

/** Mapa em escala dos monitores conforme posição real (arranjo do SO). */
function MonitorMap({
  monitors,
  operator,
  outputs,
  selected,
  onSelect,
}: {
  monitors: MonitorInfo[];
  operator: string | null;
  outputs: MonitorInfo[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  if (monitors.length === 0) return null;
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const maxX = Math.max(...monitors.map((m) => m.x + m.width));
  const maxY = Math.max(...monitors.map((m) => m.y + m.height));
  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);
  const fontSize = Math.min(totalW, totalH) * 0.09;

  return (
    <svg
      viewBox={`${minX} ${minY} ${totalW} ${totalH}`}
      className="h-52 w-full shrink-0 rounded-md border bg-muted/30"
      role="img"
      aria-label="Mapa dos monitores"
    >
      {monitors.map((m, i) => {
        const role = roleOf(operator, outputs, m.key);
        const fill = !role
          ? "fill-muted stroke-border"
          : role.kind === "operator"
            ? "fill-primary/25 stroke-primary"
            : "fill-green-700/25 stroke-green-700";
        return (
          <g
            key={m.key}
            onClick={() => onSelect(m.key)}
            className="cursor-pointer"
          >
            <rect
              x={m.x}
              y={m.y}
              width={m.width}
              height={m.height}
              rx={totalW * 0.008}
              className={cn(
                fill,
                "stroke-2 transition",
                selected === m.key && "stroke-[6]",
              )}
            />
            <text
              x={m.x + m.width / 2}
              y={m.y + m.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              className="fill-foreground font-semibold"
              pointerEvents="none"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MonitorManager() {
  const [monitors, setMonitors] = React.useState<MonitorInfo[]>([]);
  const [operator, setOperator] = React.useState<string | null>(null);
  const [operatorAuto, setOperatorAuto] = React.useState(true);
  const [currentKey, setCurrentKey] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      const [found, saved, current] = await Promise.all([
        listMonitors(),
        loadLayout(),
        currentMonitorKey(),
      ]);
      const keys = new Set(found.map((m) => m.key));
      setMonitors(found);
      setCurrentKey(current);
      if (saved.operator && keys.has(saved.operator)) {
        setOperator(saved.operator);
        setOperatorAuto(false);
      } else {
        // Sem escolha salva: operador é o monitor atual (onde o app está).
        setOperator(current && keys.has(current) ? current : null);
        setOperatorAuto(true);
      }
      setSelected((prev) =>
        prev && keys.has(prev) ? prev : (found[0]?.key ?? null),
      );
      setLoading(false);
    })();
  }, []);

  // Saídas automáticas: todos os conectados menos o operador,
  // da esquerda para a direita (o operador não define a quantidade).
  const outputs = React.useMemo(
    () => autoOutputs(monitors, operator),
    [monitors, operator],
  );

  const selectedMonitor = monitors.find((m) => m.key === selected) ?? null;
  const selectedRole = selected ? roleOf(operator, outputs, selected) : null;

  const chooseOperator = (key: string) => {
    setOperator(key);
    setOperatorAuto(false);
  };

  const useCurrentAsOperator = () => {
    if (currentKey) {
      setOperator(currentKey);
      setOperatorAuto(false);
      setSelected(currentKey);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError("");
    try {
      const layout = {
        operator,
        outputs: outputs.map((m) => m.key),
      };
      await saveLayout(layout);
      await applyLayout(layout, monitors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aplicar o layout.");
    } finally {
      setApplying(false);
    }
  };

  const operatorMonitor = monitors.find((m) => m.key === operator) ?? null;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4">
      <div className="shrink-0">
        <h2 className="font-heading font-medium text-foreground">
          Monitores e telões
        </h2>
        <p className="text-sm text-balance text-muted-foreground">
          {monitors.length} monitor(es) conectado(s). As saídas são automáticas:
          tudo menos o monitor do operador, da esquerda para a direita.{" "}
          {!isTauri() && "Posicionamento real exige `npm run tauri dev`."}
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Detectando monitores…</p>
      ) : monitors.length === 0 ? (
        <p className="text-sm text-destructive">Nenhum monitor detectado.</p>
      ) : (
        <ScrollArea className="h-full min-h-0 w-full flex-1">
          <div className="flex flex-col gap-4 pr-3">
            <MonitorMap
              monitors={monitors}
              operator={operator}
              outputs={outputs}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="flex flex-col gap-1">
              {monitors.map((m, i) => {
                const role = roleOf(operator, outputs, m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setSelected(m.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
                      selected === m.key
                        ? "border-primary bg-accent"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <span className="font-semibold">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">
                      {m.name}
                      <Specs m={m} />
                    </span>
                    <RoleBadge role={role} />
                  </button>
                );
              })}
            </div>
            {selectedMonitor ? (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <p className="text-sm font-semibold">
                  {selectedMonitor.name}
                  <span className="font-normal text-muted-foreground">
                    <Specs m={selectedMonitor} /> em ({selectedMonitor.x},{" "}
                    {selectedMonitor.y})
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={
                      selectedRole?.kind === "operator" ? "default" : "secondary"
                    }
                    onClick={() => chooseOperator(selectedMonitor.key)}
                  >
                    Tornar operador
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!currentKey || currentKey === operator}
                    onClick={useCurrentAsOperator}
                  >
                    Operador é esta tela
                  </Button>
                </div>
                {operatorAuto ? (
                  <p className="text-xs text-muted-foreground">
                    Operador detectado automaticamente
                    {operatorMonitor ? ` (${operatorMonitor.name})` : ""} —
                    escolha outro acima se precisar.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">
                Saídas detectadas ({outputs.length})
              </p>
              {outputs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma saída além do operador — “Aplicar” abre o telão
                  padrão.
                </p>
              ) : (
                outputs.map((m, i) => (
                  <div
                    key={m.key}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">
                      Saída {i + 1} ({STAGE_LABELS[i] ?? `extra-${i + 1}`})
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {m.name}
                      <Specs m={m} />
                    </span>
                  </div>
                ))
              )}
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>
        </ScrollArea>
      )}
      <div className="flex shrink-0 flex-wrap gap-2 border-t pt-3">
        <Button
          className="bg-green-700 hover:bg-green-800"
          disabled={loading || applying || monitors.length === 0}
          onClick={handleApply}
        >
          {applying ? "Aplicando…" : "Aplicar e posicionar"}
        </Button>
        <Button variant="destructive" onClick={() => closeAllStages()}>
          Fechar telões
        </Button>
      </div>
    </div>
  );
}
