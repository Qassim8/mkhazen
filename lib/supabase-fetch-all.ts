import "server-only";

/**
 * Supabase بيرجّع 1000 صف كحد أقصى في الاستعلام الواحد (حتى لو حطيت limit أكبر).
 * أي مجموع على جدول بيكبر مع الوقت (القيود، الطلبات، المنتجات) لازم يتجاب على دفعات،
 * وإلا الأرقام بتطلع ناقصة من غير أي خطأ ظاهر.
 *
 * الاستعلام لازم يكون فيه order ثابت عشان الصفحات ما تتداخلش.
 */

const PAGE_SIZE = 1000;

type PageResult = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

export async function fetchAll<T>(
  build: (from: number, to: number) => PageResult,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

/** نفس fetchAll لكن بيرجّع { data, error } زي استعلام Supabase العادي */
export async function fetchAllResult<T>(
  build: (from: number, to: number) => PageResult,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  try {
    return { data: await fetchAll<T>(build), error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * استعلام .in() على قائمة IDs طويلة: بنقسمها مجموعات (طول الرابط له حد)،
 * وكل مجموعة بتتجاب على دفعات (نتايج المجموعة نفسها ممكن تعدّي 1000 صف).
 */
const IN_CHUNK_SIZE = 150;

export async function fetchIn<T>(
  ids: string[],
  build: (chunk: string[], from: number, to: number) => PageResult,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];

  for (let i = 0; i < unique.length; i += IN_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + IN_CHUNK_SIZE);
    rows.push(...(await fetchAll<T>((from, to) => build(chunk, from, to))));
  }

  return rows;
}

/**
 * صفحة من نتايج فلتر بيتحسب في الكود (حالة الدفع، حالة المخزون، البحث في الباركود…).
 *
 * قائمة الـ IDs المطابقة ممكن تبقى آلاف، وحطها في .in("id", …) بيطوّل الرابط ويفشل.
 * بدل كده:
 *   1. نجيب IDs الصفوف المطابقة لباقي الفلاتر بالترتيب المطلوب (عمود id بس، على دفعات)
 *   2. نسيب منها اللي في القائمة المسموحة
 *   3. ناخد الصفحة المطلوبة، ونجيب صفوفها الكاملة (عدد IDs = limit بس)
 */
export async function pageByAllowedIds<T extends { id: string }>(options: {
  orderedIds: (from: number, to: number) => PageResult;
  allowed: Set<string>;
  page: number;
  limit: number;
  fetchRows: (ids: string[]) => PageResult;
}): Promise<{ rows: T[]; total: number }> {
  const ordered = await fetchAll<{ id: string }>(options.orderedIds);
  const matching = ordered.map((row) => row.id).filter((id) => options.allowed.has(id));

  const start = (options.page - 1) * options.limit;
  const pageIds = matching.slice(start, start + options.limit);

  if (pageIds.length === 0) {
    return { rows: [], total: matching.length };
  }

  const { data, error } = await options.fetchRows(pageIds);
  if (error) throw new Error(error.message);

  const byId = new Map(((data ?? []) as T[]).map((row) => [row.id, row]));
  const rows = pageIds.map((id) => byId.get(id)).filter((row): row is T => Boolean(row));

  return { rows, total: matching.length };
}
