export function contextFor(tab, focused, browser) {
  if (!focused || !tab?.active || tab.incognito)
    return {
      url: "",
      title: "",
      browser,
      active: false,
      incognito: !!tab?.incognito,
    };
  try {
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol))
      return { url: "", title: "", browser, active: false };
    return {
      url: url.origin,
      title: (tab.title ?? "").slice(0, 512),
      browser,
      active: true,
      incognito: false,
    };
  } catch {
    return { url: "", title: "", browser, active: false };
  }
}
