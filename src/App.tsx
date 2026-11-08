import { useState } from "react";
import type { Swipe } from "./data/api";
import { clearBubble, loadBubble, saveBubble, saveStart } from "./lib/bubbleStore";
import Home from "./screens/Home";
import Intro from "./screens/Intro";
import Onboarding from "./screens/Onboarding";
import RedoOnboarding from "./screens/RedoOnboarding";

type Screen =
  | { name: "intro" }
  | { name: "onboarding"; autoDemo: boolean; run: number }
  | { name: "home"; bubble: string[]; history: Swipe[] };

export default function App() {
  // A saved bubble skips Intro and Onboarding.
  const [screen, setScreen] = useState<Screen>(() => {
    const saved = loadBubble();
    // Swipe history isn't stored; Home pins the restored bubble, so POST /bubble keeps it.
    return saved ? { name: "home", bubble: saved, history: [] } : { name: "intro" };
  });
  const [run, setRun] = useState(0);
  const toOnboarding = (autoDemo: boolean) => { setRun(run + 1); setScreen({ name: "onboarding", autoDemo, run: run + 1 }); };

  switch (screen.name) {
    case "intro":
      return <Intro onStart={() => toOnboarding(false)} />;
    case "onboarding":
      return (
        <Onboarding key={screen.run} autoDemo={screen.autoDemo}
          onDone={(bubble, history) => { saveStart(bubble); saveBubble(bubble); setScreen({ name: "home", bubble, history }); }} />
      );
    case "home":
      return (
        <>
          <Home initialBubble={screen.bubble} history={screen.history} onRedo={() => toOnboarding(false)} />
          <RedoOnboarding onConfirm={() => { clearBubble(); toOnboarding(false); }} />
        </>
      );
  }
}
