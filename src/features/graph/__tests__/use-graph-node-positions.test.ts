import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useGraphNodePositions } from "../use-graph-node-positions";

const KEY = "apivault:graph:nodePositions";

describe("useGraphNodePositions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("초기에는 빈 맵을 반환한다", () => {
    const { result } = renderHook(() => useGraphNodePositions());
    expect(result.current.positions).toEqual({});
  });

  it("setPosition 은 맵과 localStorage 양쪽을 업데이트한다", () => {
    const { result } = renderHook(() => useGraphNodePositions());
    act(() => {
      result.current.setPosition("n1", { x: 100, y: 200 });
    });
    expect(result.current.positions).toEqual({ n1: { x: 100, y: 200 } });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      n1: { x: 100, y: 200 },
    });
  });

  it("setPosition 을 여러 번 호출하면 병합된다", () => {
    const { result } = renderHook(() => useGraphNodePositions());
    act(() => {
      result.current.setPosition("n1", { x: 1, y: 2 });
      result.current.setPosition("n2", { x: 3, y: 4 });
    });
    expect(result.current.positions).toEqual({
      n1: { x: 1, y: 2 },
      n2: { x: 3, y: 4 },
    });
  });

  it("같은 id 를 다시 setPosition 하면 덮어쓴다", () => {
    const { result } = renderHook(() => useGraphNodePositions());
    act(() => {
      result.current.setPosition("n1", { x: 1, y: 2 });
      result.current.setPosition("n1", { x: 9, y: 9 });
    });
    expect(result.current.positions).toEqual({ n1: { x: 9, y: 9 } });
  });

  it("clear 는 맵과 localStorage 를 비운다", () => {
    localStorage.setItem(KEY, JSON.stringify({ n1: { x: 1, y: 2 } }));
    const { result } = renderHook(() => useGraphNodePositions());
    expect(result.current.positions).toEqual({ n1: { x: 1, y: 2 } });
    act(() => {
      result.current.clear();
    });
    expect(result.current.positions).toEqual({});
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("pruneStale 은 validIds 에 없는 entry 를 제거한다", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        keep1: { x: 1, y: 1 },
        drop1: { x: 2, y: 2 },
        keep2: { x: 3, y: 3 },
        drop2: { x: 4, y: 4 },
      }),
    );
    const { result } = renderHook(() => useGraphNodePositions());
    act(() => {
      result.current.pruneStale(["keep1", "keep2"]);
    });
    expect(result.current.positions).toEqual({
      keep1: { x: 1, y: 1 },
      keep2: { x: 3, y: 3 },
    });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      keep1: { x: 1, y: 1 },
      keep2: { x: 3, y: 3 },
    });
  });

  it("pruneStale 은 변경이 없으면 state reference 를 유지한다", () => {
    localStorage.setItem(KEY, JSON.stringify({ n1: { x: 1, y: 1 } }));
    const { result } = renderHook(() => useGraphNodePositions());
    const before = result.current.positions;
    act(() => {
      result.current.pruneStale(["n1"]);
    });
    expect(result.current.positions).toBe(before);
  });

  it("localStorage 초기값이 유효한 JSON 이면 로드한다", () => {
    localStorage.setItem(KEY, JSON.stringify({ n1: { x: 5, y: 6 } }));
    const { result } = renderHook(() => useGraphNodePositions());
    expect(result.current.positions).toEqual({ n1: { x: 5, y: 6 } });
  });

  it("localStorage 가 손상됐으면 빈 맵으로 fallback", () => {
    localStorage.setItem(KEY, "not-json");
    const { result } = renderHook(() => useGraphNodePositions());
    expect(result.current.positions).toEqual({});
  });

  it("localStorage 가 배열이면 빈 맵으로 fallback", () => {
    localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useGraphNodePositions());
    expect(result.current.positions).toEqual({});
  });

  it("localStorage 에 잘못된 shape 이 섞여 있어도 유효한 entry 만 로드", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        good: { x: 1, y: 2 },
        bad1: { x: 1 }, // missing y
        bad2: { x: "str", y: 0 }, // wrong type
        bad3: null,
        bad4: { x: NaN, y: 0 }, // NaN not finite
      }),
    );
    const { result } = renderHook(() => useGraphNodePositions());
    expect(result.current.positions).toEqual({ good: { x: 1, y: 2 } });
  });

  it("빈 맵을 저장하면 localStorage key 를 삭제한다", () => {
    const { result } = renderHook(() => useGraphNodePositions());
    act(() => {
      result.current.setPosition("n1", { x: 1, y: 1 });
    });
    expect(localStorage.getItem(KEY)).not.toBeNull();
    act(() => {
      result.current.pruneStale([]);
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
