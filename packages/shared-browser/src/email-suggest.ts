/**
 * Подсказка по опечаткам в email-адресе. Чистая JS-функция без зависимостей,
 * безопасна для клиентского бандла (web + webapp).
 *
 * Идея: список популярных провайдеров → если пользователь ввёл домен,
 * который "похож" (дистанция Левенштейна 1, или 2 для длинных доменов)
 * на известный — возвращаем исправленный адрес.
 *
 * Используется в onBlur поля email, чтобы показать
 * «Возможно, вы имели в виду user@gmail.com?» до отправки формы.
 */

const KNOWN_DOMAINS: readonly string[] = [
  // Россия / СНГ
  "yandex.ru",
  "yandex.com",
  "ya.ru",
  "mail.ru",
  "list.ru",
  "bk.ru",
  "inbox.ru",
  "internet.ru",
  "rambler.ru",
  // Международные
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "yahoo.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Если email похож на опечатку известного провайдера — вернуть исправленный.
 * Иначе null.
 */
export function suggestEmailTypo(email: string): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".")) return null;

  if (KNOWN_DOMAINS.includes(domain)) return null;

  let bestDomain: string | null = null;
  let bestDist = Infinity;
  for (const known of KNOWN_DOMAINS) {
    const d = levenshtein(domain, known);
    if (d < bestDist) {
      bestDist = d;
      bestDomain = known;
    }
  }
  if (!bestDomain) return null;

  const allow = bestDist === 1 || (bestDist === 2 && bestDomain.length >= 7);
  if (!allow) return null;

  return `${local}@${bestDomain}`;
}
