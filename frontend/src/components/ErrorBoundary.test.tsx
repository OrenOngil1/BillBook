import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function Thrower(): never {
    throw new Error("boom");
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
    it("renders its children when nothing throws", () => {
        render(<ErrorBoundary fallback={<div>Something went wrong</div>}><p>Content</p></ErrorBoundary>);

        expect(screen.getByText("Content")).toBeInTheDocument();
        expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    });

    it("renders the fallback when a child throws during render", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        render(<ErrorBoundary fallback={<p>Something went wrong</p>}><Thrower /></ErrorBoundary>);

        expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
});
