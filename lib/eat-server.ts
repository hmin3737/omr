// Eat 서버 전용 헬퍼

import { prisma } from "./prisma";
import type { RestaurantInput } from "./eat";

/** DB에 실제로 있는 음식 종류만 남긴다 */
export async function keepKnownCategories(input: RestaurantInput): Promise<void> {
  if (!input.categories.length) return;
  const known = await prisma.foodCategory.findMany({
    where: { name: { in: input.categories } },
    select: { name: true },
  });
  const names = new Set(known.map((c) => c.name));
  input.categories = input.categories.filter((c) => names.has(c));
}
