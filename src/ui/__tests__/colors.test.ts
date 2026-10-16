import { phaseColor } from "../colors";

test("each phase has its own full-screen color", () => {
  expect(phaseColor("recording")).toBe("#d42a2a");
  expect(phaseColor("sending")).toBe("#d42a2a");
  expect(phaseColor("waiting")).toBe("#1f4fd1");
  expect(phaseColor("speaking")).toBe("#13804a");
  expect(phaseColor("failed")).toBe("#5b6170");
});
