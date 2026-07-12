// 패치 노트. 최신 버전이 배열 맨 앞에 오도록 관리한다.
// 새 기능/변경이 생기면 맨 위에 항목을 추가하면 배너와 패치 노트에 자동 반영된다.

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  changes: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "1.2.0",
    date: "2026-07-12",
    title: "명단 표시 · 메모 · 패치 노트",
    changes: [
      "100점(만점) 학생 명단을 통계와 xlsx에 표시 (선택과목 분리 시 과목별로 구분)",
      "무보정 백분위 · 표준점수 · 등급은 기본값을 '선택 해제'로 변경",
      "각 시험에 메모를 작성·저장할 수 있는 기능 추가",
      "상단 배너와 패치 노트로 업데이트 내역 확인 가능",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-11",
    title: "선택과목 문항 표기 개선",
    changes: [
      "선택과목 문항(기본 23번 이후)을 '미적30'처럼 과목 이름과 함께 표기",
      "해당 문항을 응시하지 않은 타 선택과목은 0%가 아니라 '-'로 표시",
      "선택과목 시작 문항 번호를 직접 설정 가능",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-11",
    title: "시험 저장 기능",
    changes: [
      "시험을 저장하고 언제든 통계를 다시 생성하거나 원본 파일을 내려받는 기능",
      "저장된 시험의 이름 변경 · 파일 교체 · 삭제 지원",
      "데이터를 서버 데이터베이스(Prisma · Postgres)에 보관",
    ],
  },
];

export const LATEST = CHANGELOG[0];
