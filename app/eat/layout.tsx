import type { Metadata } from "next";
import "./eat.css";

export const metadata: Metadata = {
  title: "Eat · 오늘 뭐 먹지",
  description: "만나서 결제·가게배달 가능한 배달 맛집 모음과 랜덤 뽑기",
};

export default function EatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
