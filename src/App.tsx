import { useState } from "react";
import type { Swipe } from "./data/api";
import Home from "./screens/Home";
import Intro from "./screens/Intro";
import Onboarding from "./screens/Onboarding";

type Screen =
  | { name: "intro" }
  | { name: "onboarding"; autoDemo: boolean; run: number }
  | { name: "home"; bubble: string[]; history: Swipe[] };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "intro" });
  const [run, setRun] = useState(0);
  const toOnboarding = (autoDemo: boolean) => { setRun(run + 1); setScreen({ name: "onboarding", autoDemo, run: run + 1 }); };

  switch (screen.name) {
    case "intro":
      return <Intro onStart={() => toOnboarding(false)} onDemo={() => toOnboarding(true)} />;
    case "onboarding":
      return <Onboarding key={screen.run} autoDemo={screen.autoDemo} onDone={(bubble, history) => setScreen({ name: "home", bubble, history })} />;
    case "home":
      return <Home initialBubble={screen.bubble} history={screen.history} onRedo={() => toOnboarding(false)} />;
  }
}
