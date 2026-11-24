import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_API_URL, TEST_USER_ID } from "../../tests/env";
import { apiClient } from "./client";
import { ApiError } from "./errors";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

describe("apiClient", () => {
    it("returns the parsed JSON body on success", async () => {
        fetchMock.mockResolvedValue(Response.json([{ id: 1 }]));

        await expect(apiClient("groups/")).resolves.toEqual([{ id: 1 }]);
    });

    it("sends the body as JSON with the acting user's id and cookies", async () => {
        fetchMock.mockResolvedValue(Response.json({}));

        await apiClient("groups/1/settlements", { method: "POST", body: { amountCents: 500 } });

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`${TEST_API_URL}/groups/1/settlements`);
        expect(init).toMatchObject({
            method: "POST",
            body: JSON.stringify({ amountCents: 500 }),
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-User-Id": String(TEST_USER_ID) },
        });
    });

    it("throws an ApiError carrying the server's status and message", async () => {
        fetchMock.mockResolvedValue(Response.json({ error: "Group not found" }, { status: 404 }));

        const error = await apiClient("groups/1").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 404, message: "Group not found" });
    });

    it("falls back to a generic message when the error body is not JSON", async () => {
        fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

        const error = await apiClient("groups/1").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 502, message: "Request failed" });
    });
});
