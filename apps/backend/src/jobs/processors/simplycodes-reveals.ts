import { Page, Request } from 'playwright';

export function isSimplyCodesStore(url: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'simplycodes.com' &&
    /^\/store\/[^/]+\/?$/.test(parsed.pathname)
  );
}

function sameStore(url: string, source: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(source);
    return (
      actual.origin === expected.origin &&
      actual.pathname.replace(/\/$/, '') ===
        expected.pathname.replace(/\/$/, '')
    );
  } catch {
    return false;
  }
}

export function codeFromRevealUrl(url: string, source: string): string | null {
  if (!sameStore(url, source)) return null;
  const params = new URL(url).searchParams;
  const code = params.get('sc_code');
  // Preserve case; URLSearchParams decodes exactly once. Reject whitespace and prose.
  return params.get('sc_modal') === '1' &&
    code &&
    /^[A-Za-z0-9_-]{3,64}$/.test(code)
    ? code
    : null;
}

// Prefer site-provided identities. Do not use list position: offers can reorder between loads.
function offerIdentities(elements: Element[]): string[] {
  return elements.map((element) => {
    const attributes = [
      'data-offer-id',
      'data-code-id',
      'data-id',
      'id',
      'onclick',
      'href',
    ];
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (value && value !== '#' && !value.startsWith('javascript:'))
        return `${attribute}:${value}`;
    }
    return `markup:${element.outerHTML}`;
  });
}

export async function collectSimplyCodesReveals(
  listing: Page,
  sourceUrl: string,
  config: { revealSelector: string; codeSelector: string },
  log: (message: string) => void,
  timeoutMs = 10_000,
): Promise<{ codes: string[]; failures: string[] }> {
  const codes = new Set<string>();
  const failures: string[] = [];
  const started = Date.now();
  const cleanUrl = new URL(sourceUrl);
  for (const key of ['sc_code', 'sc_modal', 'sc_title'])
    cleanUrl.searchParams.delete(key);
  sourceUrl = cleanUrl.href;
  // No buttons is ambiguous (empty listing vs broken selector/hydration). Fail visibly.
  await listing
    .locator(config.revealSelector)
    .first()
    .waitFor({ timeout: timeoutMs });
  const identities = await listing
    .locator(config.revealSelector)
    .evaluateAll(offerIdentities);
  const offers = [...new Set(identities)].slice(0, 25);
  if (offers.length !== Math.min(identities.length, 25)) {
    throw new Error('SimplyCodes reveal buttons do not have unique identities');
  }

  for (const [index, identity] of offers.entries()) {
    if (Date.now() - started > 120_000) {
      failures.push('Run deadline reached before all offers were processed');
      break;
    }
    // Keep the discovery page untouched. Each offer gets an isolated page, so affiliate
    // navigation and modal overlays cannot corrupt the next reveal's document or identity.
    let work: Page;
    try {
      work = await listing.context().newPage();
    } catch (error) {
      failures.push(`Could not open offer page: ${String(error)}`);
      break;
    }
    const pages = new Set<Page>();
    let revealed: string | null = null;
    let accepting = true;
    const observe = (url: string) => {
      revealed = codeFromRevealUrl(url, sourceUrl) ?? revealed;
    };
    const watch = (page: Page) => {
      if (pages.has(page)) return;
      pages.add(page);
      observe(page.url());
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) observe(frame.url());
      });
      page.on('popup', watch);
    };
    watch(work);
    // A popup's initial request can precede its page event, and the site can remove
    // query parameters before its DOM loads. Capture the navigation payload as well.
    const requestListener = (request: Request) => {
      if (!request.isNavigationRequest()) return;
      const code = codeFromRevealUrl(request.url(), sourceUrl);
      if (!code) return;
      void (async () => {
        const frame = request.frame();
        if (frame.parentFrame()) return;
        const owner = frame.page();
        const belongs = pages.has(owner) || (await owner.opener()) === work;
        if (accepting && belongs) {
          watch(owner);
          revealed = code;
        }
      })().catch(() => {});
    };
    listing.context().on('request', requestListener);
    try {
      await work.goto(sourceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      await work
        .locator(config.revealSelector)
        .first()
        .waitFor({ timeout: timeoutMs });
      const buttons = work.locator(config.revealSelector);
      const currentIdentities = await buttons.evaluateAll(offerIdentities);
      const matches = currentIdentities
        .map((value, i) => (value === identity ? i : -1))
        .filter((i) => i >= 0);
      if (matches.length !== 1)
        throw new Error('Offer disappeared or its identity is ambiguous');
      const deadline = Date.now() + timeoutMs;
      // Observers are already installed. A click can time out waiting for the affiliate
      // navigation even though its reveal succeeded; decide success from the captured result.
      const click = buttons
        .nth(matches[0])
        .click({ timeout: Math.min(timeoutMs, 5_000), noWaitAfter: true })
        .catch(() => undefined);
      while (!revealed && Date.now() < deadline) {
        for (const candidate of pages) {
          observe(candidate.url());
          if (revealed) break;
          if (!sameStore(candidate.url(), sourceUrl)) continue;
          const value = await candidate
            .waitForFunction(
              (selector) =>
                [...document.querySelectorAll(selector)]
                  .map((element) => element.textContent?.trim() ?? '')
                  .find((text) => /^[A-Za-z0-9_-]{3,64}$/.test(text)),
              config.codeSelector,
              { timeout: Math.max(1, Math.min(250, deadline - Date.now())) },
            )
            .catch(() => null);
          if (value) {
            const text = await value.jsonValue().catch(() => null);
            revealed = revealed ?? (typeof text === 'string' ? text : null);
            await value.dispose().catch(() => {});
          }
          if (revealed) break;
        }
        if (!revealed) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await click;
      if (!revealed)
        throw new Error(
          'Reveal produced neither a code URL nor nonempty code text',
        );
      codes.add(revealed);
      log(
        `offer=${index + 1}/${offers.length} result=captured elapsedMs=${Date.now() - started}`,
      );
    } catch (error) {
      failures.push(
        `offer=${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
      log(
        `offer=${index + 1}/${offers.length} result=failed elapsedMs=${Date.now() - started}`,
      );
    } finally {
      accepting = false;
      listing.context().off('request', requestListener);
      await work.close().catch(() => {});
      await Promise.all([...pages].map((page) => page.close().catch(() => {})));
    }
  }
  return { codes: [...codes], failures };
}
