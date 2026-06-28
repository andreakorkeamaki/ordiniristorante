import { describe, expect, it } from "vitest";
import { getHostRedirect } from "@/lib/host-routing";

const config = {
  menuOrigin: "https://menu.example.it",
  appOrigin: "https://ordini.example.it",
};

describe("host routing", () => {
  it("sposta l'area staff dal dominio menu al dominio applicazione", () => {
    const destination = getHostRedirect(
      new URL("https://menu.example.it/staff/table/123?from=qr"),
      config,
    );

    expect(destination?.toString()).toBe(
      "https://ordini.example.it/staff/table/123?from=qr",
    );
  });

  it("sposta il menu pubblico dal dominio applicazione al dominio menu", () => {
    const destination = getHostRedirect(
      new URL("https://ordini.example.it/menu"),
      config,
    );

    expect(destination?.toString()).toBe("https://menu.example.it/menu");
  });

  it("apre l'accesso staff dalla radice del dominio applicazione", () => {
    const destination = getHostRedirect(
      new URL("https://ordini.example.it/"),
      config,
    );

    expect(destination?.toString()).toBe("https://ordini.example.it/staff");
  });

  it("non altera preview e localhost", () => {
    expect(
      getHostRedirect(new URL("http://127.0.0.1:3000/staff"), config),
    ).toBeNull();
    expect(
      getHostRedirect(new URL("https://preview.vercel.app/menu"), config),
    ).toBeNull();
  });
});
