import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("App", () => {
  it("shows the prompt gallery title", () => {
    render(<App />);

    expect(screen.getByText("Prompt Gallery Studio")).toBeVisible();
  });
});
