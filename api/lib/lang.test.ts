import { describe, expect, it } from "vitest";
import { detectLang, replyLanguage } from "@contracts/lang";
import { systemPrompt } from "../assistant-router";

describe("the assistant answers in one language: the one they wrote in, English by default", () => {
  it("tells Spanish from English, Spanglish counts as Spanish", () => {
    expect(detectLang("¿Cómo pongo un presupuesto?")).toBe("es");
    expect(detectLang("hazlo por mí")).toBe("es");
    expect(detectLang("cuanto pague en los biles")).toBe("es");
    expect(detectLang("Hazme un tour de la app")).toBe("es");
    expect(detectLang("How do I set a budget?")).toBe("en");
    expect(detectLang("Set a gas budget of 120, do it for me")).toBe("en");
    expect(detectLang("show me the app")).toBe("en");
    expect(detectLang("ok")).toBeNull();
    expect(detectLang("300")).toBeNull();
  });

  it("when a message doesn't show it, the conversation's language; else English", () => {
    expect(replyLanguage("300", ["¿Cuánto gasto en comida?"])).toBe("es");
    expect(replyLanguage("ok", ["What did I spend on food?"])).toBe("en");
    expect(replyLanguage("ok", [])).toBe("en");
    expect(replyLanguage("¿y el mes pasado?", ["What did I spend?"])).toBe("es");
  });

  it("the prompt asks for that language only, never mixed", () => {
    expect(systemPrompt("personal", "2026-11-24", false, "es")).toMatch(/Answer ONLY in Spanish.*never mix/);
    expect(systemPrompt("business", "2026-11-24", true, "en")).toMatch(/Answer ONLY in English.*never mix/);
  });
});
