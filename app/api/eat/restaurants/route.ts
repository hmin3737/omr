import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isEatAdmin } from "@/lib/eat-admin";
import { sanitizeRestaurantInput } from "@/lib/eat";
import { keepKnownCategories } from "@/lib/eat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 목록: 추천 가게 먼저, 그다음 이름순
export async function GET() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: [{ recommended: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(restaurants);
}

// 등록: 누구나 가능. 추천 지정은 관리자만.
export async function POST(req: Request) {
  try {
    const input = sanitizeRestaurantInput(await req.json());
    if (!input) return NextResponse.json({ error: "가게 이름이 필요합니다." }, { status: 400 });
    if (!(await isEatAdmin())) input.recommended = false;
    await keepKnownCategories(input);
    const created = await prisma.restaurant.create({ data: { ...input, menus: input.menus.map(({ name, price }) => ({ name, price })) } });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "등록 실패" },
      { status: 500 }
    );
  }
}
