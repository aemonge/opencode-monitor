import { useEffect, useState } from "react";
import { Row } from "./primitives";
import type { Theme } from "../themes";

export default function Spinner({
  isBusy,
  theme,
}: {
  isBusy: boolean;
  theme?: Theme;
}) {
  const [frame, setFrame] = useState(0);
  const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    if (!isBusy) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % 10), 100);
    return () => clearInterval(timer);
  }, [isBusy]);

  if (!isBusy) return <Row width={2} />;
  return (
    <Row width={2}>
      <text fg={theme?.warning ?? "yellow"}>
        {SPINNER_FRAMES[frame] ?? "⠋"}
      </text>
    </Row>
  );
}
