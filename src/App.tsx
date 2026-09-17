import "./App.css";
import Page from "./app/dashboard/page";
import { StageView } from "./features/stage/StageView";
import { isStageRoute } from "./features/stage/stage-window";
import { RemoteView } from "./features/remote/RemoteView";
import { isRemoteRoute } from "./features/remote/route";

function App() {
  // Janela de saída (telão): mesma bundle, rota por hash (#/stage).
  if (isStageRoute()) {
    return <StageView />;
  }
  // Controle remoto no celular, servido pelo Axum na LAN (#/remote).
  if (isRemoteRoute()) {
    return <RemoteView />;
  }
  return (
    <main >
      <Page />
    </main>
  );
}

export default App;
