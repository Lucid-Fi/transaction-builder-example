import { describe, expect, it } from "vitest";
import { groupByRequest, listCalls, record, redact, type RecordedCall } from "./recorder";

describe("redact", () => {
  it("masks secrets and phone numbers and leaves other fields intact", () => {
    const { headers, body } = redact(
      {
        authorization: "Bearer pactlabs_pub_abcdefghijklmnop1234",
        "x-pact-user-token": "eyJhbGciOiJFUzI1NiJ9.payload.signature",
        "content-type": "application/json",
      },
      {
        access_token: "eyJhbGciOiJFUzI1NiJ9.access.signature",
        nested: { refresh_token: "eyJhbGciOiJFUzI1NiJ9.refresh.signature" },
        Code: "123456",
        To: "+15551234567",
        identifiers: [{ identifier_type: "phone_number", value: "+15551234567" }],
        amount: "10.5",
      },
    );
    expect(headers).toEqual({
      authorization: "Bearer pactlabs_pub_…1234",
      "x-pact-user-token": "eyJhbGciOiJFUzI1…",
      "content-type": "application/json",
    });
    expect(body).toEqual({
      access_token: "eyJhbGciOiJFUzI1…",
      nested: { refresh_token: "eyJhbGciOiJFUzI1…" },
      Code: "***",
      To: "+…4567",
      identifiers: [{ identifier_type: "phone_number", value: "+…4567" }],
      amount: "10.5",
    });
  });

  it("masks secret keys and Basic auth", () => {
    expect(redact({ authorization: "Bearer pactlabs_secretsecret9876" }, null).headers).toEqual({
      authorization: "Bearer pactlabs_…9876",
    });
    expect(redact({ Authorization: "Basic U0s6c2VjcmV0" }, null).headers).toEqual({
      Authorization: "Basic ***",
    });
  });
});

describe("record", () => {
  it("keeps the newest 200 calls, newest first", () => {
    for (let i = 0; i < 205; i++) {
      record({
        requestId: "r", at: "", label: `call ${i}`, service: "test", method: "GET", url: "",
        requestHeaders: {}, requestBody: null, status: 200, responseBody: null, ms: 0,
      });
    }
    const calls = listCalls();
    expect(calls).toHaveLength(200);
    expect(calls[0].label).toBe("call 204");
  });

  it("lists only the given browser's calls", () => {
    const base = {
      requestId: "r", at: "", service: "test", method: "GET", url: "",
      requestHeaders: {}, requestBody: null, status: 200, responseBody: null, ms: 0,
    };
    record({ ...base, label: "a", inspectorId: "a" });
    record({ ...base, label: "b", inspectorId: "b" });
    record({ ...base, label: "none" });
    expect(listCalls("a").map((c) => c.label)).toEqual(["a"]);
    expect(listCalls("b").map((c) => c.label)).toEqual(["b"]);
    // The log is shared with the test above, so look only at this test's labels.
    const mine = listCalls().filter((c) => ["a", "b", "none"].includes(c.label));
    expect(mine.map((c) => c.label)).toEqual(["none"]);
  });
});

describe("groupByRequest", () => {
  it("groups interleaved calls by request, newest request first, calls in order", () => {
    const call = (requestId: string, label: string, at = ""): RecordedCall => ({
      id: label, requestId, path: `/${requestId}`, at, label, service: "test", method: "GET",
      url: "", requestHeaders: {}, requestBody: null, status: 200, responseBody: null, ms: 0,
    });
    // Newest first, as listCalls returns them: a1, b1, a2, b2 happened in that order.
    const groups = groupByRequest([
      call("b", "b2"), call("a", "a2"), call("b", "b1"), call("a", "a1", "first"),
    ]);
    expect(groups.map((g) => [g.path, g.calls.map((c) => c.label)])).toEqual([
      ["/b", ["b1", "b2"]],
      ["/a", ["a1", "a2"]],
    ]);
    expect(groups[1].at).toBe("first");
  });
});
