import * as React from "react";
import { ensureSchema } from "@/db/client";
import { BibliaPanel } from "../biblia/BibliaPanel";
import { BibleSettings } from "../biblia/BibleSettings";
import { FundoPanel } from "../fundo/FundoPanel";
import { LetrasPanel } from "../letras/LetrasPanel";
import { FotosPanel } from "../media/FotosPanel";
import { VideosPanel } from "../media/VideosPanel";
import { MediaSettings } from "../media/MediaSettings";
import { UpdateCard } from "../system/UpdateCard";
import { MonitorManager } from "../stage/MonitorManager";
import { LyricsSettings } from "../letras/LyricsSettings";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export { BibliaPanel, LetrasPanel, FotosPanel, VideosPanel, FundoPanel };

function StageOutputsCard() {
  return <MonitorManager />;
}

function DatabaseCard() {
  const [dbStatus, setDbStatus] = React.useState<
    "checking" | "ready" | "unavailable"
  >("checking");

  React.useEffect(() => {
    ensureSchema().then((ok) => setDbStatus(ok ? "ready" : "unavailable"));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banco de dados local</CardTitle>
        <CardDescription>
          {dbStatus === "checking"
            ? "Verificando SQLite…"
            : dbStatus === "ready"
              ? "SQLite pronto (proge.db)."
              : "SQLite indisponível — rode via `npm run tauri dev` (no browser o plugin-sql não existe)."}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function ConfigPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 lg:px-6">
      <Tabs defaultValue="biblia" className="flex min-h-0 flex-1">
        <TabsList className="shrink-0">
          <TabsTrigger value="biblia">Bíblia</TabsTrigger>
          <TabsTrigger value="letras">Letras</TabsTrigger>
          <TabsTrigger value="midia">Mídia</TabsTrigger>
          <TabsTrigger value="teloes">Telões</TabsTrigger>
          <TabsTrigger value="sistema">Sistema</TabsTrigger>
        </TabsList>
        <TabsContent value="biblia" className="flex min-h-0 flex-1 flex-col">
          <BibleSettings />
        </TabsContent>
        <TabsContent value="letras" className="flex min-h-0 flex-1 flex-col">
          <LyricsSettings />
        </TabsContent>
        <TabsContent value="midia" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <MediaSettings />
        </TabsContent>
        <TabsContent value="teloes" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <StageOutputsCard />
        </TabsContent>
        <TabsContent value="sistema" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <UpdateCard />
          <DatabaseCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
