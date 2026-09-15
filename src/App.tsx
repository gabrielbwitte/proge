import "./App.css";
import Page from "./app/dashboard/page";
import { StageView } from "./features/stage/StageView";
import { isStageRoute } from "./features/stage/stage-window";

function App() {
  // Janela de saída (telão): mesma bundle, rota por hash (#/stage).
  if (isStageRoute()) {
    return <StageView />;
  }
  return (
    <main >
      <Page />
    </main>
  );
}

export default App;
