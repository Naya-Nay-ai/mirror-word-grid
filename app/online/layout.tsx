import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "オンライン対戦 | MIRROR WORD GRID",
  description: "使い捨ての対戦部屋で、プレイヤー同士も、それぞれのAIパートナー同士も遊べます。",
};

export default function OnlineLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
