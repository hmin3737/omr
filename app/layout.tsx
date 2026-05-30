import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMR 통계 생성기",
  description: "채점결과 파일로 시험 통계 자료(xlsx·pdf)를 생성합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
