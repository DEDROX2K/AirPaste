// @vitest-environment jsdom
//
// The real tile components (imported transitively through the registry)
// reference `window`/`document` at module scope via lib/desktop.js, so this
// file alone runs under jsdom rather than the project's default node
// environment.
import { describe, expect, it } from "vitest";
import { getTileRegistration } from "@/tiles/tileRegistry.js";
import FileTile from "@/components/tiles/FileTile";
import LinkTile from "@/components/tiles/LinkTile";
import AmazonProductTile from "@/components/tiles/AmazonProductTile";
import GitHubRepoTile from "@/components/tiles/GitHubRepoTile";
import CalendarTile from "@/components/tiles/CalendarTile";
import ChecklistTile from "@/components/tiles/ChecklistTile";
import CodeSnippetTile from "@/components/tiles/CodeSnippetTile";
import CounterTile from "@/components/tiles/CounterTile";
import DeadlineTile from "@/components/tiles/DeadlineTile";
import CanvasTextTile from "@/components/tiles/CanvasTextTile";
import ProgressTile from "@/components/tiles/ProgressTile";
import TableTile from "@/components/tiles/TableTile";
import RackTile from "@/components/tiles/RackTile";
import PaperNoteTile from "@/components/tiles/PaperNoteTile";
import StickyNoteTile from "@/components/tiles/StickyNoteTile";
import TextBoxTile from "@/components/tiles/TextBoxTile";
import WeatherTile from "@/components/tiles/WeatherTile";

describe("getTileRegistration (the dispatch Card.jsx uses for every rendered tile)", () => {
  it.each([
    ["file", FileTile],
    ["link", LinkTile],
    ["amazon-product", AmazonProductTile],
    ["github-repo", GitHubRepoTile],
    ["weather", WeatherTile],
    ["calendar", CalendarTile],
    ["checklist", ChecklistTile],
    ["code", CodeSnippetTile],
    ["counter", CounterTile],
    ["deadline", DeadlineTile],
    ["progress", ProgressTile],
    ["table", TableTile],
    ["rack", RackTile],
    ["paper-note", PaperNoteTile],
  ])("resolves plain type \"%s\" to its component", (type, ExpectedComponent) => {
    expect(getTileRegistration({ type }).Component).toBe(ExpectedComponent);
    expect(getTileRegistration(type).Component).toBe(ExpectedComponent);
  });

  it("resolves a default canvas-text card to CanvasTextTile", () => {
    const registration = getTileRegistration({ type: "canvas-text", variant: "default", format: "markdown" });
    expect(registration.Component).toBe(CanvasTextTile);
  });

  it("resolves a file-backed sticky-variant canvas-text card to StickyNoteTile, not CanvasTextTile", () => {
    const registration = getTileRegistration({ type: "canvas-text", variant: "sticky", source: "file" });
    expect(registration.Component).toBe(StickyNoteTile);
  });

  it("resolves a plain-format, non-file-source canvas-text card to TextBoxTile", () => {
    const registration = getTileRegistration({
      type: "canvas-text",
      variant: "default",
      format: "plain",
      source: "local",
    });
    expect(registration.Component).toBe(TextBoxTile);
  });

  it("does not misroute a plain-format card that came from a file to TextBoxTile", () => {
    const registration = getTileRegistration({
      type: "canvas-text",
      variant: "default",
      format: "plain",
      source: "file",
    });
    expect(registration.Component).toBe(CanvasTextTile);
  });

  it("falls back to LinkTile for an unknown type", () => {
    expect(getTileRegistration({ type: "some-future-type-nobody-registered" }).Component).toBe(LinkTile);
  });

  it("renders nothing (not LinkTile) for a planned-but-unimplemented type", () => {
    const registration = getTileRegistration({ type: "game" });
    expect(registration.Component).not.toBe(LinkTile);
    expect(registration.Component.displayName).toBe("GameTile");
  });
});
