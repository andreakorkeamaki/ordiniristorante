const STAFF_PATH_PREFIXES = ["/staff", "/cassa", "/admin", "/auth"];

export interface HostRoutingConfig {
  menuOrigin?: string;
  appOrigin?: string;
}

function parseOrigin(value?: string) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

function isStaffPath(pathname: string) {
  return STAFF_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function copyPath(source: URL, destinationOrigin: URL, pathname = source.pathname) {
  const destination = new URL(destinationOrigin);
  destination.pathname = pathname;
  destination.search = source.search;
  destination.hash = source.hash;
  return destination;
}

export function getHostRedirect(
  requestUrl: URL,
  { menuOrigin, appOrigin }: HostRoutingConfig,
) {
  const menu = parseOrigin(menuOrigin);
  const app = parseOrigin(appOrigin);
  if (!menu || !app || menu.origin === app.origin) return null;

  if (requestUrl.origin === menu.origin && isStaffPath(requestUrl.pathname)) {
    return copyPath(requestUrl, app);
  }

  if (requestUrl.origin === app.origin) {
    if (requestUrl.pathname === "/") {
      return copyPath(requestUrl, app, "/staff");
    }
    if (requestUrl.pathname === "/menu" || requestUrl.pathname.startsWith("/menu/")) {
      return copyPath(requestUrl, menu);
    }
  }

  return null;
}

export function getHostRoutingConfig(): HostRoutingConfig {
  return {
    menuOrigin: process.env.NEXT_PUBLIC_MENU_ORIGIN,
    appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN,
  };
}

export function getPublicMenuHref() {
  const menu = parseOrigin(process.env.NEXT_PUBLIC_MENU_ORIGIN);
  return menu ? new URL("/menu", menu).toString() : "/menu";
}
